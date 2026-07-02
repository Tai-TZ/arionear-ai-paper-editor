"""One-shot: prepend missing imports to split editor components."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src/features/editor/components"

HEADERS: dict[str, str] = {
    "IconBtn.tsx": 'import type React from "react";\n\n',
    "StatusBar.tsx": """import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";

""",
    "ArionearMasthead.tsx": """import { Link } from "@tanstack/react-router";
import { useLocale } from "@/components/locale-provider";
import { editorCopy, formatMastheadDate } from "@/lib/editor-i18n";
import { getSession } from "@/lib/auth-store";
import { DefenseMastheadPrefs } from "@/components/defense/defense-masthead-prefs";
import type { ResearcherProfile } from "@/lib/researcher-profile";

""",
    "MobileHeader.tsx": """import { Link } from "@tanstack/react-router";
import { FileOutput, Settings } from "lucide-react";
import { SHOW_EDITOR_IMPORT } from "@/components/workspace/workspace-layout";

""",
    "MobileTabBar.tsx": """import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";
import type { MobileTab } from "../types";

""",
    "MobileBottomBar.tsx": """import { ChevronUp, FileText, MoreHorizontal } from "lucide-react";
import { arioAvatar } from "@/components/chat-overlay";

""",
    "MobileFilesPanel.tsx": """import { ShieldCheck } from "lucide-react";
import { EditableProjectName } from "@/components/editable-project-name";
import { SidebarFileOutlineSplit } from "@/components/editor/sidebar-file-outline-split";
import type { ProjectAsset, ProjectFile } from "@/lib/project-store";

""",
    "MobileChatSheet.tsx": """import { useEffect, useRef } from "react";
import type React from "react";
import { Sparkles } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { ChatInput, ChatMessages, type ChatMessage } from "@/components/chat-overlay";
import { LlmSelector } from "@/components/llm-selector";
import { editorCopy } from "@/lib/editor-i18n";
import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";
import type { ChatStreamProgressSnapshot } from "@/lib/chat-stream-progress";
import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";
import { isSelectedModelPaid } from "@/lib/llm-model-tier";

""",
    "ChatThreadList.tsx": """import { useRef, useState } from "react";
import { Check, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { editorCopy } from "@/lib/editor-i18n";
import type { ChatThread } from "@/lib/project-store";

""",
    "LeftSidebar.tsx": """import { ChevronLeft, ChevronRight, Folder, MessageSquare, ShieldCheck } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { EditableProjectName } from "@/components/editable-project-name";
import { SidebarFileOutlineSplit } from "@/components/editor/sidebar-file-outline-split";
import { editorCopy } from "@/lib/editor-i18n";
import type { ChatThread, ProjectAsset, ProjectFile } from "@/lib/project-store";
import { ChatThreadList } from "./ChatThreadList";

""",
    "LatexEditor.tsx": """import type React from "react";
import { LatexCodeEditor, type LatexCodeEditorHandle } from "@/components/latex-code-editor";
import type { EditorSelectionContext, SelectionAnchor } from "@/lib/editor-selection-anchor";
import type { SynctexWordHighlight } from "@/lib/synctex-highlight";
import type { PendingSuggestion } from "../types";

""",
    "CenterPanel.tsx": """import type React from "react";
import {
  FileOutput,
  FileText,
  GraduationCap,
  Redo2,
  Share2,
  Undo2,
  Wrench,
} from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { ChatOverlay, type ChatMessage } from "@/components/chat-overlay";
import { EditorSelectionToolbar } from "@/components/editor-selection-toolbar";
import { ProjectAssetPreview } from "@/components/editor/project-asset-preview";
import { SuggestionPanel } from "@/components/suggestion-panel";
import type { LatexCodeEditorHandle } from "@/components/latex-code-editor";
import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";
import type { ChatStreamProgressSnapshot } from "@/lib/chat-stream-progress";
import { editorCopy } from "@/lib/editor-i18n";
import type { EditorSelectionContext, SelectionAnchor } from "@/lib/editor-selection-anchor";
import { hasBlockingIntegrityFlags } from "@/lib/integrity-flags";
import { isPendingEditStale } from "@/lib/pending-edit-utils";
import type { ProjectAsset } from "@/lib/project-store";
import type { SynctexWordHighlight } from "@/lib/synctex-highlight";
import type { PendingEdit, PendingSuggestion } from "../types";
import { LatexEditor } from "./LatexEditor";

""",
    "ToolsPanel.tsx": """import { useEffect, useMemo, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import { LogicAuditPanel } from "@/components/editor/logic-audit-panel";
import { StructureSuggestionsPanel } from "@/components/editor/structure-suggestions-panel";
import { Switch } from "@/components/ui/switch";
import { verifyCitations, type LogicAuditReport, type RevisionRecord } from "@/lib/api/academic";
import { editorCopy, revisionActionLabel, translateCitationSummary } from "@/lib/editor-i18n";
import { buildCitationFixPrompt } from "@/lib/citation-prompts";
import { formatTimeAgo } from "@/lib/project-store";
import type { LogicAuditMode, LogicAuditScope } from "@/lib/logic-audit";
import type { StructureSuggestion } from "@/lib/structure-suggestions";
import { computeProjectStats } from "../lib/editor-project-stats";
import type { ToolsTab } from "../types";

""",
}


def main() -> None:
    for name, header in HEADERS.items():
        path = ROOT / name
        body = path.read_text(encoding="utf-8")
        if body.startswith("import"):
            continue
        path.write_text(header + body, encoding="utf-8")
        print("patched", name)


if __name__ == "__main__":
    main()
