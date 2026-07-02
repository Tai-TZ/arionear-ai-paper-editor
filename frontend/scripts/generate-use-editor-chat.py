#!/usr/bin/env python3
"""Generate useEditorChat.ts from EditorWorkspace chat sections (one-time scaffold)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WS = ROOT / "frontend/src/features/editor/EditorWorkspace.tsx"
OUT = ROOT / "frontend/src/features/editor/state/useEditorChat.ts"

HEADER = r'''import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ChatMessage } from "@/components/chat-overlay";
import { editorCopy } from "@/lib/editor-i18n";
import {
  appendImportantFeedLine,
  applyAiState,
  filterDisplaySteps,
  isImportantFeedEvent,
  isProgressNoiseActivity,
  isProgressNoiseStep,
  revisionAction,
  streamChat,
  type ChatAiStatePayload,
  type LLMProvider,
  type LogicAuditReport,
  type ProviderInfo,
} from "@/lib/api/academic";
import { llmUserErrorMsg } from "@/lib/api/api-errors";
import { parseChatSlashCommand } from "@/lib/chat-commands";
import { buildConversationHistory } from "@/lib/chat-history";
import {
  finishChatStreamProgress,
  getChatStreamProgressSnapshot,
  pushChatStreamActivity,
  pushChatStreamState,
  resetChatStreamProgress,
  type ChatStreamProgressSnapshot,
} from "@/lib/chat-stream-progress";
import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";
import { clampSelectionReplacement } from "@/lib/inline-suggestion";
import { isSelectedModelPaid } from "@/lib/llm-model-tier";
import { canApplyPendingEdit, contentFingerprint } from "@/lib/pending-edit-utils";
import { hasBlockingIntegrityFlags } from "@/lib/integrity-flags";
import { mergeLogicSectionReport } from "@/lib/logic-audit";
import { buildEditRedoPrompt, type StructureSuggestion } from "@/lib/structure-suggestions";
import { logicAuditFingerprint } from "@/lib/paper-score-audit";
import type { ChatThread, ProjectFile, StoredChatMessage } from "@/lib/project-store";
import type { UiLanguage } from "@/lib/researcher-profile";
import type { LogicAuditMode, LogicAuditScope } from "@/lib/logic-audit";
import { createSmoothStream, type SmoothStreamController } from "@/lib/smooth-stream";
import { toast } from "sonner";
import type { PendingEdit, PendingSuggestion, ToolsTab } from "../types";
import { applySingleEdit } from "../lib/editor-edit-apply";
import {
  getPersistedThreads,
  isPersistedThread,
  makeInitialMessages,
  persistChatThreads,
  snapshotActiveThread,
  stripMessagesForStorage,
  threadHasUserMessages,
} from "../lib/editor-thread-storage";

export type EditorChatSideEffects = {
  setToolsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setToolsTab: React.Dispatch<React.SetStateAction<ToolsTab>>;
  setLogicAuditReport: React.Dispatch<React.SetStateAction<LogicAuditReport | null>>;
  setCitationResults: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>;
  setCitationSummary: React.Dispatch<React.SetStateAction<string>>;
  setStructureSuggestions: React.Dispatch<React.SetStateAction<StructureSuggestion[]>>;
  lastAuditFingerprintRef: React.MutableRefObject<string | null>;
};

export type UseEditorChatOptions = {
  projectId: string | undefined;
  locale: UiLanguage;
  latex: string;
  mainFile: string;
  activeFile: string;
  mainLatexSource: string;
  projectFiles: ProjectFile[];
  selection: string;
  setSelection: React.Dispatch<React.SetStateAction<string>>;
  integrityStrictness: string;
  llmProvider: LLMProvider;
  llmModel: string;
  providers: ProviderInfo[];
  setLlmProvider: (p: LLMProvider) => void;
  setLlmModel: (m: string) => void;
  autoCompile: boolean;
  isDirty: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  recordNow: (latex: string) => void;
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFile[]>>;
  persistActiveFile: (content: string, files: ProjectFile[], currentActive: string) => ProjectFile[];
  refreshRevisions: () => void;
  handleCompile: (latexOverride?: string) => Promise<void>;
  setMobileChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sideEffects: EditorChatSideEffects;
};

export function useEditorChat(options: UseEditorChatOptions) {
  const {
    projectId,
    locale,
    latex,
    mainFile,
    activeFile,
    mainLatexSource,
    projectFiles,
    selection,
    setSelection,
    integrityStrictness,
    llmProvider,
    llmModel,
    providers,
    setLlmProvider,
    setLlmModel,
    autoCompile,
    isDirty,
    undo,
    redo,
    canUndo,
    canRedo,
    recordNow,
    setProjectFiles,
    persistActiveFile,
    refreshRevisions,
    handleCompile,
    setMobileChatOpen,
    sideEffects,
  } = options;

  const t = useMemo(() => editorCopy(locale), [locale]);

'''

FOOTER = r'''
  return {
    messages,
    setMessages,
    chatThreads,
    activeChatId,
    chatInput,
    setChatInput,
    chatOpen,
    setChatOpen,
    chatLoading,
    chatStreamProgress,
    chatEndRef,
    chatSelectionContext,
    setChatSelectionContext,
    chatComposerMode,
    setChatComposerMode,
    pendingEdits,
    pendingSuggestion,
    activeEditId,
    handleNewChat,
    handleSwitchChat,
    handleRenameChat,
    handleDeleteChat,
    handleSend,
    handleStopChat,
    openChatPanel,
    queueChatFollowUp,
    handleClearChatSelectionContext,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleAcceptEdit,
    handleRejectEdit,
    handleAcceptAllEdits,
    handleRejectAllEdits,
    runLogicAuditFromPanel,
    hydrateChatFromProject,
    chatProps,
  };
}
'''

def extract_block(text: str, start_marker: str, end_marker: str) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end]

def main() -> None:
    ws = WS.read_text(encoding="utf-8")

    # Thread helpers block (inside component, before boot effect)
    thread_block = extract_block(
        ws,
        "  // ── Chat thread helpers",
        "  // ────────────────────────────────────────────────────────────────────────",
    )

    # Replace function declarations with const inside hook - already fine as functions

    # openChatPanel through handleRejectAllEdits - need to find range
    chat_handlers = extract_block(
        ws,
        "  const openChatPanel = useCallback(() => {",
        "  const handleRejectAllEdits = useCallback(() => {",
    )
    reject_all = extract_block(
        ws,
        "  const handleRejectAllEdits = useCallback(() => {",
        "  useEffect(() => {\n    if (!pendingSuggestion) return;",
    )

    # State declarations - manual in header section after hook open
    state_block = extract_block(
        ws,
        "  const [messages, setMessages] = useState<ChatMessage[]>(() => makeInitialMessages(\"vi\"));",
        "  const [activeEditId, setActiveEditId] = useState<string | null>(null);",
    )
    state_block = state_block.replace(
        'makeInitialMessages("vi")',
        "makeInitialMessages(locale)",
    )

    refs_block = """  const chatEndRef = useRef<HTMLDivElement>(null);
  const logicAuditLaunchRef = useRef<{
    mode: LogicAuditMode;
    scope: LogicAuditScope;
    sections: string[];
    userDisplay: string;
    message: string;
  } | null>(null);
"""

    scroll_effect = extract_block(
        ws,
        "  useEffect(() => {\n    if (chatLoading) {",
        "  }, [messages, chatLoading]);",
    )

    suggestion_key_effect = extract_block(
        ws,
        "  useEffect(() => {\n    if (!pendingSuggestion) return;",
        "  }, [pendingSuggestion]);",
    )

    # Fix i18n in extracted handlers
    chat_handlers = chat_handlers.replace(
        'content: msg.content.trim() || "Đã dừng xử lý."',
        "content: msg.content.trim() || t.chatStream.stopped",
    )
    chat_handlers = chat_handlers.replace(
        'streamLabel: "Đang xử lý"',
        "streamLabel: t.chatStream.processing",
    )
    chat_handlers = chat_handlers.replace(
        ': "Đã dừng xử lý."',
        ": t.chatStream.stopped",
    )

    reject_all_body = reject_all
    # handleAcceptSuggestion i18n in reject block area - fix in full handlers

    run_logic = extract_block(
        ws,
        "  const runLogicAuditFromPanel = (",
        "  const SCORE_AUDIT_TIMEOUT_MS = 90_000;",
    )

    # hydrate helper - new
    hydrate = """
  const hydrateChatFromProject = useCallback(
    (rawThreads: ChatThread[] | undefined): ChatThread[] => {
      const persisted = (rawThreads ?? []).filter(isPersistedThread);
      if (persisted.length) {
        setChatThreads(persisted);
        const first = persisted[0];
        setActiveChatId(first.id);
        setMessages(restoreMessages(first));
        return persisted;
      }
      const initial = makeThread(editorCopy(locale).sidebar.defaultChatTitle);
      setChatThreads([initial]);
      setActiveChatId(initial.id);
      setMessages(makeInitialMessages(locale));
      return [];
    },
    [locale],
  );

"""

    # chatProps with useMemo
    chat_props = """
  const chatProps = useMemo(
    () => ({
      messages,
      chatInput,
      onChatInputChange: setChatInput,
      onSend: handleSend,
      onStop: handleStopChat,
      chatEndRef,
      chatLoading,
      streamProgress: chatStreamProgress,
      providers,
      llmProvider,
      llmModel,
      onProviderChange: (p: LLMProvider) => {
        setLlmProvider(p);
        const info = providers.find((x) => x.id === p);
        if (info) setLlmModel(info.default_model);
      },
      onModelChange: setLlmModel,
      onNewChat: handleNewChat,
      onOpenChat: () => setChatOpen(true),
      onCloseChat: () => setChatOpen(false),
      chatComposerMode,
      chatSelectionContext,
      onClearChatSelectionContext: handleClearChatSelectionContext,
      onUndo: undo,
      onRedo: redo,
      canUndo,
      canRedo,
      pendingSuggestion,
      onAcceptSuggestion: handleAcceptSuggestion,
      onRejectSuggestion: handleRejectSuggestion,
      isDirty,
    }),
    [
      messages,
      chatInput,
      handleSend,
      handleStopChat,
      chatLoading,
      chatStreamProgress,
      providers,
      llmProvider,
      llmModel,
      setLlmProvider,
      setLlmModel,
      handleNewChat,
      chatComposerMode,
      chatSelectionContext,
      handleClearChatSelectionContext,
      undo,
      redo,
      canUndo,
      canRedo,
      pendingSuggestion,
      handleAcceptSuggestion,
      handleRejectSuggestion,
      isDirty,
    ],
  );

"""

    # Patch handleSend to use sideEffects destructuring
    # Replace direct setLogicAuditReport etc with sideEffects.
    full_handlers = chat_handlers + reject_all_body

    replacements = [
        ("setToolsOpen(", "sideEffects.setToolsOpen("),
        ("setToolsTab(", "sideEffects.setToolsTab("),
        ("setLogicAuditReport(", "sideEffects.setLogicAuditReport("),
        ("setCitationResults(", "sideEffects.setCitationResults("),
        ("setCitationSummary(", "sideEffects.setCitationSummary("),
        ("setStructureSuggestions(", "sideEffects.setStructureSuggestions("),
        ("lastAuditFingerprintRef.current", "sideEffects.lastAuditFingerprintRef.current"),
        ("const applySingleEdit = useCallback((base: string, edit: PendingEdit): string => {", "REMOVE_APPLY_SINGLE"),
    ]
    for old, new in replacements:
        full_handlers = full_handlers.replace(old, new)

    # Remove applySingleEdit definition from extracted code if present
    import re
    full_handlers = re.sub(
        r"  const applySingleEdit = useCallback\([^;]+;\n\n  const applyEditToProject",
        "  const applyEditToProject",
        full_handlers,
        flags=re.DOTALL,
    )

    # Fix accept suggestion i18n
    full_handlers = full_handlers.replace(
        """        content: autoCompile
          ? "Đã áp dụng thay đổi vào bản thảo. Đang compile PDF…"
          : "Đã áp dụng thay đổi vào bản thảo. Nhấn Ctrl+S để lưu file.",""",
        """        content: autoCompile
          ? t.chatStream.acceptAppliedCompile
          : t.chatStream.acceptApplied,""",
    )
    full_handlers = full_handlers.replace(
        """        content:
          "Đã từ chối gợi ý. Mình đã gợi ý câu lệnh trong ô chat — bổ sung yêu cầu rồi gửi lại nhé.",""",
        "        content: t.chatStream.rejectSuggestionHint,",
    )

    # handleStopChat needs t in deps
    full_handlers = full_handlers.replace(
        "  }, []);\n\n  const syncChatStreamProgress",
        "  }, [t.chatStream.stopped]);\n\n  const syncChatStreamProgress",
    )

    # locale effect for welcome message when no user messages
    locale_effect = """
  useEffect(() => {
    if (!threadHasUserMessages(messages)) {
      setMessages(makeInitialMessages(locale));
    }
  // Only sync welcome copy when locale changes on a fresh thread
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

"""

    body = (
        state_block
        + "\n"
        + refs_block
        + "\n"
        + thread_block
        + "\n"
        + locale_effect
        + scroll_effect
        + "\n"
        + full_handlers
        + "\n"
        + run_logic
        + "\n"
        + hydrate
        + suggestion_key_effect
        + "\n"
        + chat_props
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(HEADER + body + FOOTER, encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
