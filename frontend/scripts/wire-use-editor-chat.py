#!/usr/bin/env python3
"""Wire useEditorChat into EditorWorkspace — remove duplicated chat block."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WS = ROOT / "frontend/src/features/editor/EditorWorkspace.tsx"

HOOK_CALL = '''
  const chatSideEffects = useMemo<EditorChatSideEffects>(
    () => ({
      setToolsOpen,
      setToolsTab,
      setLogicAuditReport,
      setCitationResults,
      setCitationSummary,
      setStructureSuggestions,
      lastAuditFingerprintRef,
    }),
    [],
  );

  const chat = useEditorChat({
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
    sideEffects: chatSideEffects,
  });

  const {
    messages,
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
    handleAcceptEdit,
    handleRejectEdit,
    handleAcceptAllEdits,
    handleRejectAllEdits,
    runLogicAuditFromPanel,
    hydrateChatFromProject,
    chatProps,
  } = chat;

  useEffect(() => {
    if (bootState !== "ready" || bootChatThreadsRef.current === undefined) return;
    const raw = bootChatThreadsRef.current;
    bootChatThreadsRef.current = undefined;
    const persisted = hydrateChatFromProject(raw);
    if (projectId && persisted.length && persisted.length < (raw?.length ?? 0)) {
      persistChatThreads(projectId, persisted);
    }
  }, [bootState, hydrateChatFromProject, projectId]);

'''

def main() -> None:
    text = WS.read_text(encoding="utf-8")

    # Remove chat state block
    start = text.index('  const [messages, setMessages]')
    end = text.index('  const [revisionHistory, setRevisionHistory]')
    text = text[:start] + text[end:]

    # Remove thread helpers
    start = text.index('  // ── Chat thread helpers')
    end = text.index('  // ────────────────────────────────────────────────────────────────────────')
    end = text.index('\n', end) + 1
    text = text[:start] + text[end:]

    # Insert hook after handleCompile block
    marker = "  }, [latex, assets, projectFiles, activeFile, mainFile, compiler, projectId, projectName, persistActiveFile, persistableFile]);\n\n  const handleSave"
    if marker not in text:
        raise SystemExit("handleCompile marker not found")
    text = text.replace(
        marker,
        "  }, [latex, assets, projectFiles, activeFile, mainFile, compiler, projectId, projectName, persistActiveFile, persistableFile]);\n"
        + HOOK_CALL
        + "\n  const handleSave",
    )

    # Remove scroll effect for chat
    scroll = """  useEffect(() => {
    if (chatLoading) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatLoading]);

"""
    text = text.replace(scroll, "")

    # Remove duplicate openChatPanel / queueChatFollowUp (provided by hook)
    dup_open = """  const openChatPanel = useCallback(() => {
    setChatOpen(true);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setMobileChatOpen(true);
    }
  }, []);

  const queueChatFollowUp = useCallback(
    (prefill: string) => {
      setChatComposerMode("normal");
      setChatInput(prefill);
      openChatPanel();
    },
    [openChatPanel],
  );

"""
    text = text.replace(dup_open, "")

    # Remove handleStopChat through pending-suggestion keyboard effect (keep selection/jump helpers)
    start = text.index("  const handleStopChat = useCallback(() => {")
    end = text.index("  return (\n    <div className=\"editor-shell")
    text = text[:start] + text[end:]

    # Boot: defer chat hydration until hook is available
    text = text.replace(
        "  const refreshRevisions = useCallback(() => {",
        "  const bootChatThreadsRef = useRef<ChatThread[] | undefined>(undefined);\n\n  const refreshRevisions = useCallback(() => {",
    )

    old_boot = """        const tCopy = editorCopy(locale);
        const persisted = (project.chatThreads ?? []).filter(isPersistedThread);
        if (persisted.length) {
          setChatThreads(persisted);
          const first = persisted[0];
          setActiveChatId(first.id);
          setMessages(restoreMessages(first));
          if (persisted.length < (project.chatThreads?.length ?? 0)) {
            persistChatThreads(projectId, persisted);
          }
        } else {
          const initial = makeThread(tCopy.sidebar.defaultChatTitle);
          setChatThreads([initial]);
          setActiveChatId(initial.id);
        }
        setBootState("ready");"""
    new_boot = """        bootChatThreadsRef.current = project.chatThreads;
        setBootState("ready");"""
    text = text.replace(old_boot, new_boot)

    # Selection handlers use chat setters — fix openQuickEditFromPick deps already use setters from destructuring

    # Remove applySingleEdit local function if still present
    import re
    text = re.sub(
        r"\n  const applySingleEdit = useCallback\(\(base: string, edit: PendingEdit\): string => \{.*?\n  \}, \[\]\);\n",
        "\n",
        text,
        flags=re.DOTALL,
    )

    WS.write_text(text, encoding="utf-8")
    print("Patched EditorWorkspace.tsx")


if __name__ == "__main__":
    main()
