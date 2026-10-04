import type React from "react";
import { FileOutput, FileText, GraduationCap, Redo2, Share2, Undo2, Wrench } from "lucide-react";
import { useLocale } from "@/components/locale-context";
import { ChatOverlay, type ChatMessage } from "@/components/chat-overlay";
import { EditorSelectionToolbar } from "@/components/editor-selection-toolbar";
import { ProjectAssetPreview } from "@/components/editor/project-asset-preview";
import { SuggestionPanel } from "@/components/suggestion-panel";
import type { LatexCodeEditorHandle } from "@/components/latex-code-editor";
import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";
import type { ChatStreamProgressSnapshot } from "@/lib/chat-stream-progress";
import { editorCopy } from "@/lib/editor-i18n";
import type { EditorSelectionContext, SelectionAnchor } from "@/lib/editor-selection-anchor";
import type { ProjectAsset } from "@/lib/project-store";
import type { SynctexWordHighlight } from "@/lib/synctex-highlight";
import type { PendingEdit, PendingSuggestion } from "../types";
import { toInlineSuggestion } from "../lib/editor-inline-suggestion";
import { LatexEditor } from "./LatexEditor";
import { PendingEditsPanel } from "./PendingEditsPanel";

export function CenterPanel({
  latex,
  activeFile,
  activeAsset = null,
  viewingAsset = false,
  highlightLine = null,
  synctexHighlight = null,
  editorRef,
  onLatexChange,
  onSelectionChange,
  onSelectionContextChange,
  selectionPick,
  onAddSelectionToChat,
  onQuickEditSelection,
  onDismissSelectionToolbar,
  onQuickEditRequest,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  onStop,
  chatOpen,
  onCloseChat,
  onOpenChat,
  toolsOpen,
  onToggleTools,
  onShare,
  onExport,
  onDefense,
  exportEnabled = false,
  shareEnabled = false,
  chatEndRef,
  chatLoading,
  streamProgress,
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onNewChat,
  pendingSuggestion,
  pendingEdits,
  activeEditId,
  onSelectEdit,
  onAcceptEdit,
  onRejectEdit,
  onAcceptAllEdits,
  onRejectAllEdits,
  onAcceptSuggestion,
  onRejectSuggestion,
  mainFile = "main.tex",
  resolveFileContent,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isDirty = false,
  chatComposerMode = "normal",
  chatSelectionContext = null,
  onClearChatSelectionContext,
}: {
  latex: string;
  activeFile: string;
  activeAsset?: ProjectAsset | null;
  viewingAsset?: boolean;
  highlightLine?: number | null;
  synctexHighlight?: SynctexWordHighlight | null;
  editorRef?: React.Ref<LatexCodeEditorHandle>;
  onLatexChange: (v: string) => void;
  onSelectionChange?: (v: string) => void;
  onSelectionContextChange?: (
    payload: { context: EditorSelectionContext; anchor: SelectionAnchor } | null,
  ) => void;
  selectionPick?: { context: EditorSelectionContext; anchor: SelectionAnchor } | null;
  onAddSelectionToChat?: () => void;
  onQuickEditSelection?: () => void;
  onDismissSelectionToolbar?: () => void;
  onQuickEditRequest?: (payload: {
    context: EditorSelectionContext;
    anchor: SelectionAnchor;
  }) => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  chatOpen: boolean;
  onCloseChat: () => void;
  onOpenChat: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  onShare?: () => void;
  onExport?: () => void;
  onDefense?: () => void;
  exportEnabled?: boolean;
  shareEnabled?: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  streamProgress?: ChatStreamProgressSnapshot;
  isDirty?: boolean;
  providers?: ProviderInfo[];
  llmProvider?: LLMProvider;
  llmModel?: string;
  onProviderChange?: (p: LLMProvider) => void;
  onModelChange?: (m: string) => void;
  onNewChat?: () => void;
  pendingSuggestion?: PendingSuggestion | null;
  pendingEdits?: PendingEdit[] | null;
  activeEditId?: string | null;
  onSelectEdit?: (id: string) => void;
  onAcceptEdit?: (id: string) => void;
  onRejectEdit?: (id: string) => void;
  onAcceptAllEdits?: () => void;
  onRejectAllEdits?: () => void;
  onAcceptSuggestion?: () => void;
  onRejectSuggestion?: () => void;
  mainFile?: string;
  resolveFileContent?: (filePath: string) => string;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  chatComposerMode?: "normal" | "quick-edit";
  chatSelectionContext?: EditorSelectionContext | null;
  onClearChatSelectionContext?: () => void;
}) {
  const { locale } = useLocale();
  const t = editorCopy(locale);

  return (
    <section className="editor-code-panel flex h-full min-h-0 flex-col overflow-hidden min-w-0">
      <div className="editor-toolbar-scroll h-11 shrink-0 border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm">
        <div className="flex h-full w-max min-w-full items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <div className="editor-file-tab flex items-center gap-2 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium whitespace-nowrap text-foreground shadow-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{activeFile}</span>
              {isDirty && !viewingAsset ? <span className="file-dirty-mark">*</span> : null}
            </div>
            {!viewingAsset ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="editor-history-btn"
                  aria-label="Undo (Ctrl+Z)"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="editor-history-btn"
                  aria-label="Redo (Ctrl+Shift+Z)"
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="editor-toolbar-actions flex">
              {onExport ? (
                <button
                  type="button"
                  onClick={onExport}
                  disabled={!exportEnabled}
                  className="editor-toolbar-action"
                  title={exportEnabled ? t.toolbar.exportPdf : t.toolbar.compileBeforeExport}
                >
                  <FileOutput className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{t.toolbar.score}</span>
                </button>
              ) : null}
              {onShare ? (
                <button
                  type="button"
                  onClick={onShare}
                  className={`editor-toolbar-action${shareEnabled ? " editor-toolbar-action-active" : ""}`}
                  title={t.toolbar.share}
                >
                  <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{t.toolbar.share}</span>
                </button>
              ) : null}
              {onDefense ? (
                <button
                  type="button"
                  onClick={onDefense}
                  className="editor-toolbar-action"
                  title={t.toolbar.defense}
                >
                  <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{t.toolbar.defense}</span>
                </button>
              ) : null}
            </div>
            <button
              onClick={onToggleTools}
              className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition ${
                toolsOpen
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/20"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              <Wrench className="h-3 w-3" />
              {t.toolbar.tools}
            </button>
          </div>
        </div>
      </div>

      <div className="editor-workspace flex min-h-0 flex-1 flex-col overflow-hidden w-full">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden w-full min-w-0">
          {viewingAsset ? (
            activeAsset ? (
              <ProjectAssetPreview path={activeFile} asset={activeAsset} />
            ) : (
              <div className="project-asset-preview-missing">{t.assetPreview.missing}</div>
            )
          ) : (
            <>
              <LatexEditor
                editorRef={editorRef}
                latex={latex}
                onLatexChange={onLatexChange}
                onSelectionChange={onSelectionChange}
                onSelectionContextChange={onSelectionContextChange}
                onQuickEditRequest={onQuickEditRequest}
                fullHeight
                highlightLine={highlightLine}
                synctexHighlight={synctexHighlight}
                inlineSuggestion={toInlineSuggestion(pendingEdits, activeEditId, pendingSuggestion)}
              />
              {selectionPick &&
                onAddSelectionToChat &&
                onQuickEditSelection &&
                onDismissSelectionToolbar && (
                  <EditorSelectionToolbar
                    context={selectionPick.context}
                    anchor={selectionPick.anchor}
                    copy={t.selectionToolbar}
                    onAskSelection={onAddSelectionToChat}
                    onEditSelection={onQuickEditSelection}
                    onDismiss={onDismissSelectionToolbar}
                  />
                )}
            </>
          )}
        </div>

        {pendingEdits?.length ? (
          <PendingEditsPanel
            pendingEdits={pendingEdits}
            activeEditId={activeEditId}
            mainFile={mainFile}
            resolveFileContent={resolveFileContent}
            onSelectEdit={onSelectEdit}
            onAcceptEdit={onAcceptEdit}
            onRejectEdit={onRejectEdit}
            onAcceptAll={onAcceptAllEdits}
            onRejectAll={onRejectAllEdits}
          />
        ) : pendingSuggestion && onAcceptSuggestion && onRejectSuggestion ? (
          <SuggestionPanel
            originalText={pendingSuggestion.originalText}
            suggestion={pendingSuggestion.suggestion}
            diff={pendingSuggestion.diff}
            flags={pendingSuggestion.flags}
            applyMode={pendingSuggestion.applyMode}
            onAccept={onAcceptSuggestion}
            onReject={onRejectSuggestion}
          />
        ) : null}

        <ChatOverlay
          open={chatOpen}
          onClose={onCloseChat}
          onOpen={onOpenChat}
          messages={messages}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
          onSend={onSend}
          onStop={onStop}
          chatEndRef={chatEndRef}
          chatLoading={chatLoading}
          streamProgress={streamProgress}
          providers={providers}
          llmProvider={llmProvider}
          llmModel={llmModel}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onNewChat={onNewChat}
          composerMode={chatComposerMode}
          selectionContext={chatSelectionContext}
          onClearSelectionContext={onClearChatSelectionContext}
        />
      </div>
    </section>
  );
}
