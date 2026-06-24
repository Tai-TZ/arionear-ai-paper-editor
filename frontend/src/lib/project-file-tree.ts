import {
  isImageAssetFile,
  isLatexSupportAssetFile,
  isTexFile,
  normalizeAssetName,
} from "@/lib/project-store";

export type ProjectTreeFileKind = "folder" | "tex" | "bib" | "image" | "support" | "other";

export type ProjectTreeNode = {
  id: string;
  name: string;
  path: string;
  kind: ProjectTreeFileKind;
  editable: boolean;
  children?: ProjectTreeNode[];
};

function classifyPath(path: string): { kind: ProjectTreeFileKind; editable: boolean } {
  if (isTexFile(path)) return { kind: "tex", editable: true };
  if (path.toLowerCase().endsWith(".bib")) return { kind: "bib", editable: false };
  if (isImageAssetFile(path)) return { kind: "image", editable: false };
  if (isLatexSupportAssetFile(path)) return { kind: "support", editable: false };
  return { kind: "other", editable: false };
}

function sortTree(nodes: ProjectTreeNode[]): ProjectTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (a.kind === "folder" && b.kind !== "folder") return -1;
    if (a.kind !== "folder" && b.kind === "folder") return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return sorted.map((node) =>
    node.children ? { ...node, children: sortTree(node.children) } : node,
  );
}

export function buildProjectFileTree(
  files: { path: string }[],
  assets: { name: string }[],
): ProjectTreeNode[] {
  const paths = new Map<string, { kind: ProjectTreeFileKind; editable: boolean }>();

  for (const file of files) {
    const normalized = normalizeAssetName(file.path);
    if (normalized) paths.set(normalized, classifyPath(normalized));
  }
  for (const asset of assets) {
    const normalized = normalizeAssetName(asset.name);
    if (normalized && !paths.has(normalized)) {
      paths.set(normalized, classifyPath(normalized));
    }
  }

  const root: ProjectTreeNode[] = [];

  for (const [path, meta] of [...paths.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
  )) {
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) continue;

    let level = root;
    let built = "";

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      const isLast = index === parts.length - 1;
      built = built ? `${built}/${part}` : part;

      if (isLast) {
        if (part === ".gitkeep") break;
        level.push({
          id: path,
          name: part,
          path,
          kind: meta.kind,
          editable: meta.editable,
        });
        break;
      }

      let folder = level.find((node) => node.kind === "folder" && node.name === part);
      if (!folder) {
        folder = {
          id: `folder:${built}`,
          name: part,
          path: built,
          kind: "folder",
          editable: false,
          children: [],
        };
        level.push(folder);
      }
      if (!folder.children) folder.children = [];
      level = folder.children;
    }
  }

  return sortTree(root);
}

export function collectFolderIds(nodes: ProjectTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === "folder") {
      ids.push(node.id);
      if (node.children?.length) ids.push(...collectFolderIds(node.children));
    }
  }
  return ids;
}

export function countTreeFiles(nodes: ProjectTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === "folder") {
      count += countTreeFiles(node.children ?? []);
    } else {
      count += 1;
    }
  }
  return count;
}
