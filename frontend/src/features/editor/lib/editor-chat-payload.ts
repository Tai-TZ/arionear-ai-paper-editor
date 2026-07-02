import { contentFingerprint } from "@/lib/pending-edit-utils";

export type ChatLatexPayload = {
  latexContent: string;
  latexContentHash?: string;
  activeFileContent?: string;
  activeFileContentHash?: string;
  skipMainBody: boolean;
  skipActiveBody: boolean;
};

export type ChatLatexSyncState = {
  mainHash: string | null;
  activeHash: string | null;
  activeFile: string | null;
};

export function buildChatLatexPayload(
  mainLatex: string,
  activeLatex: string,
  activeFile: string,
  mainFile: string,
  sync: ChatLatexSyncState,
): ChatLatexPayload {
  const mainHash = contentFingerprint(mainLatex);
  const activeHash = contentFingerprint(activeLatex);
  const sameFile = activeFile === mainFile;
  const skipMainBody = sync.mainHash === mainHash;
  const skipActiveBody = sameFile
    ? skipMainBody
    : sync.activeFile === activeFile && sync.activeHash === activeHash;

  return {
    latexContent: skipMainBody ? "" : mainLatex,
    latexContentHash: mainHash,
    activeFileContent: skipActiveBody
      ? undefined
      : sameFile
        ? skipMainBody
          ? undefined
          : activeLatex
        : activeLatex,
    activeFileContentHash: sameFile ? undefined : activeHash,
    skipMainBody,
    skipActiveBody,
  };
}

export function nextChatLatexSync(
  sync: ChatLatexSyncState,
  mainHash: string,
  activeHash: string,
  activeFile: string,
  payload: ChatLatexPayload,
): ChatLatexSyncState {
  return {
    mainHash: payload.skipMainBody ? sync.mainHash : mainHash,
    activeHash: payload.skipActiveBody ? sync.activeHash : activeHash,
    activeFile,
  };
}

export function resetChatLatexSync(): ChatLatexSyncState {
  return { mainHash: null, activeHash: null, activeFile: null };
}
