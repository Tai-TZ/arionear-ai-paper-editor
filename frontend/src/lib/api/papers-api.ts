import { getAccessToken, logoutUser } from "@/lib/auth-store";
import { resolveApiBase } from "@/lib/api/base-url";
import { mapApiHttpError, networkErrorMsg } from "@/lib/api/api-errors";
import { fetchDedupe, invalidateFetchPrefix } from "@/lib/api/fetch-dedupe";
import type { LatexCompiler, ProjectAsset, ProjectFile, StoredProject } from "@/lib/project-store";
import { parseDefenseSession } from "@/lib/defense-session-storage";
import type { LatexImportResult } from "@/lib/latex-import";
import type { LogicAuditReport } from "@/lib/api/academic";

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

function parseLogicAuditReport(value: unknown): LogicAuditReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const sections = (value as LogicAuditReport).sections;
  if (!Array.isArray(sections)) return undefined;
  return value as LogicAuditReport;
}

function toStoredProject(paper: PaperResponse): StoredProject {
  const metadata = paper.metadata ?? {};
  const assets = Array.isArray(metadata.assets) ? (metadata.assets as ProjectAsset[]) : [];
  const files = Array.isArray(metadata.files) ? (metadata.files as ProjectFile[]) : undefined;
  const mainFile = typeof metadata.mainFile === "string" ? metadata.mainFile : undefined;
  const compiler =
    typeof metadata.compiler === "string" ? (metadata.compiler as LatexCompiler) : undefined;
  const legacyReport = parseLogicAuditReport(metadata.logic_audit_report);
  const gateFromDedicated = parseLogicAuditReport(metadata.logic_gate_audit_report);
  let gateAuditReport = gateFromDedicated;
  let logicAuditReport: LogicAuditReport | undefined;
  if (legacyReport) {
    const isGate = (legacyReport as { meta?: Record<string, unknown> }).meta?.audit_mode === "gate";
    if (isGate) {
      gateAuditReport = gateAuditReport ?? legacyReport;
    } else {
      logicAuditReport = legacyReport;
    }
  }
  const chatThreads = Array.isArray(metadata.chat_threads)
    ? (metadata.chat_threads as import("@/lib/project-store").ChatThread[])
    : undefined;
  const defenseSession = parseDefenseSession(metadata.defense_session);
  const gateAuditFingerprint =
    typeof metadata.logic_gate_audit_fingerprint === "string"
      ? metadata.logic_gate_audit_fingerprint
      : undefined;
  return {
    id: paper.id,
    name: paper.name,
    latex: paper.latex,
    assets,
    files,
    mainFile,
    compiler,
    logicAuditReport,
    gateAuditReport,
    gateAuditFingerprint,
    chatThreads,
    defenseSession,
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

/** Request failure; `status` is the HTTP status, absent for network errors. */
class PapersRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
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
    throw new PapersRequestError(networkErrorMsg());
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
      throw new PapersRequestError("Not authenticated.", res.status);
    }
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new PapersRequestError(mapApiHttpError(res.status, detail), res.status);
  }

  return res.json() as Promise<T>;
}

export async function fetchPapers(): Promise<StoredProject[]> {
  const data = await fetchDedupe(
    "papers:list",
    () => papersFetch<PaperSummaryResponse[]>("/papers"),
    30_000,
  );
  return data.map(toStoredSummary);
}

export async function fetchPaper(id: string): Promise<StoredProject> {
  const data = await fetchDedupe(`papers:${id}`, () => papersFetch<PaperResponse>(`/papers/${id}`));
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

type PaperPatch = Partial<
  Pick<StoredProject, "name" | "latex" | "files" | "mainFile" | "compiler" | "chatThreads">
> & {
  assets?: ProjectAsset[];
  metadata?: Record<string, unknown>;
};

type PaperPatchOptions = {
  /** Flush immediately (e.g. Ctrl+S) instead of debouncing. */
  immediate?: boolean;
};

type FlushWaiter = {
  resolve: (value: StoredProject) => void;
  reject: (reason?: unknown) => void;
};

type PaperQueue = {
  /** Changes not sent yet, merged in call order. */
  pending: PaperPatch;
  /** Callers whose changes are in `pending`; settled by the request that sends them. */
  pendingWaiters: FlushWaiter[];
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
};

const PAPER_PATCH_DEBOUNCE_MS = 400;
const paperQueues = new Map<string, PaperQueue>();

function mergePaperPatch(base: PaperPatch, next: PaperPatch): PaperPatch {
  const merged: PaperPatch = { ...base, ...next };
  if (base.metadata || next.metadata) {
    merged.metadata = { ...(base.metadata ?? {}), ...(next.metadata ?? {}) };
  }
  if (base.files?.length && next.files?.length) {
    const byPath = new Map(base.files.map((f) => [f.path, f]));
    for (const f of next.files) {
      byPath.set(f.path, f);
    }
    merged.files = Array.from(byPath.values());
  }
  // The server appends assets by name, so two queued uploads must both survive the merge.
  if (base.assets?.length && next.assets?.length) {
    const byName = new Map(base.assets.map((a) => [a.name, a]));
    for (const a of next.assets) {
      byName.set(a.name, a);
    }
    merged.assets = Array.from(byName.values());
  }
  return merged;
}

function buildPaperPatchBody(patch: PaperPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.latex !== undefined) body.latex = patch.latex;
  if (patch.assets !== undefined) body.assets = patch.assets;
  if (
    patch.metadata !== undefined ||
    patch.files !== undefined ||
    patch.mainFile !== undefined ||
    patch.compiler !== undefined ||
    patch.chatThreads !== undefined
  ) {
    // A queued patch can carry raw metadata and typed fields at once; send both.
    body.metadata = {
      ...(patch.metadata ?? {}),
      ...(patch.files !== undefined ? { files: patch.files } : {}),
      ...(patch.mainFile !== undefined ? { mainFile: patch.mainFile } : {}),
      ...(patch.compiler !== undefined ? { compiler: patch.compiler } : {}),
      ...(patch.chatThreads !== undefined ? { chat_threads: patch.chatThreads } : {}),
    };
  }
  return body;
}

async function executePaperPatch(
  id: string,
  patch: PaperPatch,
  attempt = 0,
): Promise<StoredProject> {
  try {
    const data = await papersFetch<PaperResponse>(`/papers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(buildPaperPatchBody(patch)),
    });
    invalidateFetchPrefix("papers:");
    return toStoredProject(data);
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      return executePaperPatch(id, patch, attempt + 1);
    }
    throw err;
  }
}

/** Client errors (bad input, auth) fail the same way again, so their patch is not kept. */
function isTransientSaveError(err: unknown): boolean {
  const status = err instanceof PapersRequestError ? err.status : undefined;
  return status === undefined || status >= 500 || status === 408 || status === 429;
}

function getPaperQueue(id: string): PaperQueue {
  let queue = paperQueues.get(id);
  if (!queue) {
    queue = { pending: {}, pendingWaiters: [], timer: null, inflight: null };
    paperQueues.set(id, queue);
  }
  return queue;
}

function schedulePaperFlush(id: string, immediate = false) {
  const queue = getPaperQueue(id);
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }

  const runFlush = () => {
    queue.timer = null;
    if (queue.inflight) {
      queue.timer = setTimeout(runFlush, 50);
      return;
    }
    // Nothing queued: every waiter was registered with a patch and is settled by the request that sent it.
    if (Object.keys(queue.pending).length === 0) return;

    // Snapshot the patch together with its callers: anything queued while this request is in
    // flight belongs to the next request and must not be settled by this one.
    const patch = queue.pending;
    const waiters = queue.pendingWaiters;
    queue.pending = {};
    queue.pendingWaiters = [];
    queue.inflight = executePaperPatch(id, patch).then(
      (result) => {
        queue.inflight = null;
        waiters.forEach((w) => w.resolve(result));
        if (Object.keys(queue.pending).length > 0) {
          schedulePaperFlush(id, true);
        }
      },
      (err: unknown) => {
        queue.inflight = null;
        // Keep the unsent changes so the next save retries them; newer queued fields win.
        if (isTransientSaveError(err)) {
          queue.pending = mergePaperPatch(patch, queue.pending);
        }
        waiters.forEach((w) => w.reject(err));
        // Retry right away only when newer saves are waiting; otherwise the next save carries it.
        if (queue.pendingWaiters.length > 0) {
          schedulePaperFlush(id, true);
        }
      },
    );
  };

  if (immediate) {
    runFlush();
  } else {
    queue.timer = setTimeout(runFlush, PAPER_PATCH_DEBOUNCE_MS);
  }
}

export async function updatePaper(
  id: string,
  patch: PaperPatch,
  options?: PaperPatchOptions,
): Promise<StoredProject> {
  const queue = getPaperQueue(id);
  queue.pending = mergePaperPatch(queue.pending, patch);
  return new Promise((resolve, reject) => {
    queue.pendingWaiters.push({ resolve, reject });
    schedulePaperFlush(id, options?.immediate ?? false);
  });
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
