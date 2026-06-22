import { getAccessToken, logoutUser } from "@/lib/auth-store";
import { resolveApiBase } from "@/lib/api/base-url";
import { mapApiHttpError } from "@/lib/api/api-errors";
import { fetchDedupe, invalidateFetchPrefix } from "@/lib/api/fetch-dedupe";
import type { LatexCompiler, ProjectAsset, ProjectFile, StoredProject } from "@/lib/project-store";
import type { LatexImportResult } from "@/lib/latex-import";

const API_BASE = resolveApiBase();
const ASSET_UPLOAD_BATCH = 8;

type PaperSummaryResponse = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type PaperResponse = PaperSummaryResponse & {
  latex: string;
  metadata: Record<string, unknown>;
};

function parseApiDate(value: string): number {
  if (!value) return NaN;
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  return new Date(normalized).getTime();
}

function toStoredProject(paper: PaperResponse): StoredProject {
  const metadata = paper.metadata ?? {};
  const assets = Array.isArray(metadata.assets) ? (metadata.assets as ProjectAsset[]) : [];
  const files = Array.isArray(metadata.files) ? (metadata.files as ProjectFile[]) : undefined;
  const mainFile = typeof metadata.mainFile === "string" ? metadata.mainFile : undefined;
  const compiler =
    typeof metadata.compiler === "string" ? (metadata.compiler as LatexCompiler) : undefined;
  return {
    id: paper.id,
    name: paper.name,
    latex: paper.latex,
    assets,
    files,
    mainFile,
    compiler,
    createdAt: parseApiDate(paper.created_at),
    updatedAt: parseApiDate(paper.updated_at),
  };
}

function toStoredSummary(paper: PaperSummaryResponse): StoredProject {
  return {
    id: paper.id,
    name: paper.name,
    latex: "",
    createdAt: parseApiDate(paper.created_at),
    updatedAt: parseApiDate(paper.updated_at),
  };
}

async function papersFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      "Không kết nối được server. Kiểm tra backend đang chạy (uvicorn port 8000) rồi thử lại.",
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      logoutUser();
      if (typeof window !== "undefined") {
        window.location.assign("/signin");
      }
      throw new Error("Not authenticated.");
    }
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(mapApiHttpError(res.status, detail));
  }

  return res.json() as Promise<T>;
}

export async function fetchPapers(): Promise<StoredProject[]> {
  const data = await fetchDedupe("papers:list", () =>
    papersFetch<PaperSummaryResponse[]>("/papers"),
  );
  return data.map(toStoredSummary);
}

export async function fetchPaper(id: string): Promise<StoredProject> {
  const data = await fetchDedupe(`papers:${id}`, () =>
    papersFetch<PaperResponse>(`/papers/${id}`),
  );
  return toStoredProject(data);
}

export type CreatePaperMetadata = {
  files?: ProjectFile[];
  mainFile?: string;
  compiler?: LatexCompiler;
  assets?: ProjectAsset[];
};

export async function createPaper(
  name: string,
  latex: string,
  metadata: CreatePaperMetadata = {},
): Promise<StoredProject> {
  invalidateFetchPrefix("papers:");
  const data = await papersFetch<PaperResponse>("/papers", {
    method: "POST",
    body: JSON.stringify({ name, latex, metadata }),
  });
  return toStoredProject(data);
}

export async function updatePaper(
  id: string,
  patch: Partial<Pick<StoredProject, "name" | "latex" | "files" | "mainFile" | "compiler">> & {
    assets?: ProjectAsset[];
    metadata?: Record<string, unknown>;
  },
): Promise<StoredProject> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.latex !== undefined) body.latex = patch.latex;
  if (patch.assets !== undefined) body.assets = patch.assets;
  if (patch.metadata !== undefined) {
    body.metadata = patch.metadata;
  } else if (
    patch.files !== undefined ||
    patch.mainFile !== undefined ||
    patch.compiler !== undefined
  ) {
    body.metadata = {
      ...(patch.files !== undefined ? { files: patch.files } : {}),
      ...(patch.mainFile !== undefined ? { mainFile: patch.mainFile } : {}),
      ...(patch.compiler !== undefined ? { compiler: patch.compiler } : {}),
    };
  }

  const data = await papersFetch<PaperResponse>(`/papers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  invalidateFetchPrefix("papers:");
  return toStoredProject(data);
}

export async function deletePaper(id: string): Promise<void> {
  await papersFetch<void>(`/papers/${id}`, { method: "DELETE" });
  invalidateFetchPrefix("papers:");
}

export async function addPaperAssets(
  id: string,
  newAssets: ProjectAsset[],
): Promise<StoredProject> {
  return updatePaper(id, { assets: newAssets });
}

export async function createPaperFromImport(imported: LatexImportResult): Promise<StoredProject> {
  const mainContent =
    imported.files.find((f) => f.path === imported.mainFile)?.content ??
    imported.files[0]?.content ??
    "";

  let project = await createPaper(imported.name, mainContent, {
    files: imported.files,
    mainFile: imported.mainFile,
    compiler: imported.compiler,
  });

  const assets = imported.assets ?? [];
  for (let i = 0; i < assets.length; i += ASSET_UPLOAD_BATCH) {
    project = await addPaperAssets(project.id, assets.slice(i, i + ASSET_UPLOAD_BATCH));
  }

  invalidateFetchPrefix(`papers:${project.id}`);
  return project;
}
