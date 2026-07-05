import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";

import {
  fetchCitationRegistry,
  fetchRevisions,
  type LLMProvider,
  type LogicAuditReport,
  type ProviderInfo,
  type RevisionRecord,
} from "@/lib/api/academic";
import { editorCopy } from "@/lib/editor-i18n";
import { findCiteKeyLine } from "@/lib/citation-prompts";
import { resolveLogicIssueLine } from "@/lib/logic-audit";
import {
  formatPaperScoreGateError,
  logicAuditFingerprint,
  needsScoreGateAudit,
  runQuickLogicAuditForScore,
  SCORE_GATE_AUDIT_TIMEOUT_MS,
} from "@/lib/paper-score-audit";
import {
  buildStructureEditMessage,
  findSectionOutlineLine,
  type StructureSuggestion,
} from "@/lib/structure-suggestions";
import type { UiLanguage, ResearcherProfile } from "@/lib/researcher-profile";
import type { ToolsTab } from "../types";
import type { EditorChatSideEffects } from "./useEditorChat";

export type EditorToolsChatBridge = {
  queueChatFollowUp: (prefill: string) => void;
  runAgentEdit: (message: string, userDisplay?: string) => void;
  openChatPanel: () => void;
};

export type UseEditorToolsOptions = {
  projectId: string | undefined;
  locale: UiLanguage;
  mainLatexSource: string;
  mainFile: string;
  activeFile: string;
  integrityStrictness: ResearcherProfile["integrity_strictness"];
  llmProvider: LLMProvider;
  llmModel: string;
  providers: ProviderInfo[];
  switchActiveFile: (path: string) => void;
  jumpToOutlineLine: (line: number) => void;
  exportOpen: boolean;
  chatBridgeRef: MutableRefObject<
    Pick<EditorToolsChatBridge, "queueChatFollowUp" | "runAgentEdit" | "openChatPanel">
  >;
  setMobileToolsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  panelAuditFingerprintFromBoot?: string | null;
  gateAuditFingerprintFromBoot?: string | null;
  bootLogicAuditReport?: LogicAuditReport | null;
  bootGateAuditReport?: LogicAuditReport | null;
};

const SCORE_AUDIT_TIMEOUT_MS = SCORE_GATE_AUDIT_TIMEOUT_MS;

export function useEditorTools({
  projectId,
  locale,
  mainLatexSource,
  mainFile,
  activeFile,
  integrityStrictness,
  llmProvider,
  llmModel,
  providers,
  switchActiveFile,
  jumpToOutlineLine,
  exportOpen,
  chatBridgeRef,
  setMobileToolsOpen,
  panelAuditFingerprintFromBoot = null,
  gateAuditFingerprintFromBoot = null,
  bootLogicAuditReport = null,
  bootGateAuditReport = null,
}: UseEditorToolsOptions) {
  const t = useMemo(() => editorCopy(locale), [locale]);

  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<ToolsTab>("info");
  const [revisionHistory, setRevisionHistory] = useState<RevisionRecord[]>([]);
  const [citationResults, setCitationResults] = useState<Record<string, unknown>[]>([]);
  const [citationSummary, setCitationSummary] = useState("");
  const [logicAuditReport, setLogicAuditReport] = useState<LogicAuditReport | null>(
    bootLogicAuditReport,
  );
  const [gateAuditReport, setGateAuditReport] = useState<LogicAuditReport | null>(
    bootGateAuditReport,
  );
  const [structureSuggestions, setStructureSuggestions] = useState<StructureSuggestion[]>([]);
  const [scoreAuditLoading, setScoreAuditLoading] = useState(false);
  const [scoreAuditProgress, setScoreAuditProgress] = useState<string | null>(null);
  const [scoreAuditError, setScoreAuditError] = useState<string | null>(null);

  const scoreAuditAbortRef = useRef<AbortController | null>(null);
  const lastPanelAuditFingerprintRef = useRef<string | null>(panelAuditFingerprintFromBoot);
  const lastGateAuditFingerprintRef = useRef<string | null>(gateAuditFingerprintFromBoot);
  const scoreAuditAttemptedForRef = useRef<string | null>(null);

  const loadSessionAudit = useCallback(async (sessionId: string) => {
    const [revisions, citations] = await Promise.all([
      fetchRevisions(sessionId).catch(() => [] as RevisionRecord[]),
      fetchCitationRegistry(sessionId).catch(() => ({
        results: [] as Record<string, unknown>[],
        summary: "",
      })),
    ]);
    setRevisionHistory(revisions);
    setCitationResults(citations.results);
    setCitationSummary(citations.summary);
  }, []);

  const refreshRevisions = useCallback(() => {
    if (!projectId) return;
    void fetchRevisions(projectId)
      .then(setRevisionHistory)
      .catch(() => toast.error(t.errors.revisionFailed));
  }, [projectId, t.errors.revisionFailed]);

  useEffect(() => {
    if (!projectId || !toolsOpen) return;
    void loadSessionAudit(projectId);
  }, [projectId, toolsOpen, loadSessionAudit]);

  useEffect(() => {
    if (bootLogicAuditReport) {
      setLogicAuditReport(bootLogicAuditReport);
      lastPanelAuditFingerprintRef.current = panelAuditFingerprintFromBoot;
    }
    if (bootGateAuditReport) {
      setGateAuditReport(bootGateAuditReport);
      lastGateAuditFingerprintRef.current = gateAuditFingerprintFromBoot;
    }
  }, [
    bootLogicAuditReport,
    bootGateAuditReport,
    panelAuditFingerprintFromBoot,
    gateAuditFingerprintFromBoot,
  ]);

  const chatSideEffects = useMemo<EditorChatSideEffects>(
    () => ({
      setToolsOpen,
      setToolsTab,
      setLogicAuditReport,
      setCitationResults,
      setCitationSummary,
      setStructureSuggestions,
      lastPanelAuditFingerprintRef,
    }),
    [],
  );

  const auditReportStale = useMemo(
    () =>
      Boolean(
        logicAuditReport?.sections?.length &&
          lastPanelAuditFingerprintRef.current &&
          logicAuditFingerprint(mainLatexSource) !== lastPanelAuditFingerprintRef.current,
      ),
    [logicAuditReport, mainLatexSource],
  );

  const logicAuditProgressDetail = null;

  const logicAuditEngineAvailable = useMemo(
    () => providers.some((p) => p.id === "google"),
    [providers],
  );

  const runScoreGateAudit = useCallback(async () => {
    if (!projectId || scoreAuditLoading) return;

    if (!logicAuditEngineAvailable) {
      const fp = logicAuditFingerprint(mainLatexSource);
      scoreAuditAttemptedForRef.current = fp;
      setScoreAuditError(
        locale === "vi"
          ? "Cần Google AI provider — cấu hình trong Settings."
          : "Google AI provider required — configure in Settings.",
      );
      return;
    }

    scoreAuditAbortRef.current?.abort();
    const abort = new AbortController();
    scoreAuditAbortRef.current = abort;

    setScoreAuditLoading(true);
    setScoreAuditError(null);
    setScoreAuditProgress(t.scoreGate.hintLoading);

    const timeoutId = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        setScoreAuditLoading(false);
        setScoreAuditProgress(null);
        setScoreAuditError(
          locale === "vi"
            ? "Phản biện AI quá thời gian — thử lại hoặc chọn bài ngắn hơn."
            : "AI review timed out — try again or use a shorter manuscript.",
        );
      }
    }, SCORE_AUDIT_TIMEOUT_MS);

    try {
      const report = await runQuickLogicAuditForScore({
        latex: mainLatexSource,
        sessionId: projectId,
        integrityStrictness,
        llmProvider,
        llmModel,
        locale,
        signal: abort.signal,
        onProgress: (label) => setScoreAuditProgress(label),
      });
      if (abort.signal.aborted) return;
      const fp = logicAuditFingerprint(mainLatexSource);
      scoreAuditAttemptedForRef.current = fp;
      if (report?.sections?.length) {
        setGateAuditReport(report);
        lastGateAuditFingerprintRef.current = fp;
      } else {
        setGateAuditReport(null);
        setScoreAuditError(
          locale === "vi"
            ? "Không nhận được báo cáo phản biện — điểm dựa trên tiêu chí kỹ thuật."
            : "No peer review report — score uses technical criteria only.",
        );
      }
    } catch (error) {
      if (abort.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "Không thể chạy phản biện AI.";
      setGateAuditReport(null);
      setScoreAuditError(formatPaperScoreGateError(message, locale));
    } finally {
      clearTimeout(timeoutId);
      if (!abort.signal.aborted) {
        setScoreAuditLoading(false);
        setScoreAuditProgress(null);
      }
      scoreAuditAbortRef.current = null;
    }
  }, [
    projectId,
    scoreAuditLoading,
    mainLatexSource,
    integrityStrictness,
    llmProvider,
    llmModel,
    locale,
    logicAuditEngineAvailable,
    t.scoreGate.hintLoading,
  ]);

  const retryScoreGateAudit = useCallback(() => {
    scoreAuditAttemptedForRef.current = null;
    setScoreAuditError(null);
    void runScoreGateAudit();
  }, [runScoreGateAudit]);

  const tryStartScoreGateAudit = useCallback(() => {
    if (!exportOpen) {
      scoreAuditAbortRef.current?.abort();
      scoreAuditAbortRef.current = null;
      scoreAuditAttemptedForRef.current = null;
      setScoreAuditLoading(false);
      setScoreAuditProgress(null);
      return;
    }
    if (!projectId || scoreAuditLoading) return;

    const fingerprint = logicAuditFingerprint(mainLatexSource);
    if (scoreAuditAttemptedForRef.current === fingerprint) return;
    if (
      !needsScoreGateAudit(
        mainLatexSource,
        gateAuditReport,
        lastGateAuditFingerprintRef.current,
      )
    ) {
      return;
    }
    void runScoreGateAudit();
  }, [
    exportOpen,
    projectId,
    scoreAuditLoading,
    mainLatexSource,
    gateAuditReport,
    runScoreGateAudit,
  ]);

  const applyStructureFix = useCallback(
    (suggestion: StructureSuggestion) => {
      const bridge = chatBridgeRef.current;
      const section = (suggestion.section ?? "").trim();
      const message = buildStructureEditMessage(suggestion);
      const display = section
        ? locale === "vi"
          ? `/edit · Sửa ngay: ${section}`
          : `/edit · Apply fix: ${section}`
        : `/edit · ${message.slice(0, 56)}`;
      bridge.runAgentEdit(message, display);
      setMobileToolsOpen(false);
      bridge.openChatPanel();
    },
    [locale, setMobileToolsOpen, chatBridgeRef],
  );

  const jumpToStructureSection = useCallback(
    (sectionName: string) => {
      const line = findSectionOutlineLine(mainLatexSource, sectionName);
      if (mainFile !== activeFile) {
        switchActiveFile(mainFile);
      }
      if (line) jumpToOutlineLine(line);
    },
    [mainLatexSource, mainFile, activeFile, switchActiveFile, jumpToOutlineLine],
  );

  const jumpToCitation = useCallback(
    (citeKey: string) => {
      const line = findCiteKeyLine(mainLatexSource, citeKey);
      if (mainFile !== activeFile) {
        switchActiveFile(mainFile);
      }
      if (line) jumpToOutlineLine(line);
    },
    [mainLatexSource, mainFile, activeFile, switchActiveFile, jumpToOutlineLine],
  );

  const askArioCitation = useCallback(
    (prefill: string, citeKey?: string) => {
      if (citeKey?.trim()) {
        jumpToCitation(citeKey);
      }
      chatBridgeRef.current.queueChatFollowUp(prefill);
    },
    [jumpToCitation, chatBridgeRef],
  );

  const jumpToLogicIssue = useCallback(
    (sectionName: string, excerpt?: string) => {
      const line = resolveLogicIssueLine(mainLatexSource, sectionName, excerpt);
      if (mainFile !== activeFile) {
        switchActiveFile(mainFile);
      }
      if (line) jumpToOutlineLine(line);
    },
    [mainLatexSource, mainFile, activeFile, switchActiveFile, jumpToOutlineLine],
  );

  const canJumpToLogicIssue = useCallback(
    (sectionName: string, excerpt?: string) =>
      resolveLogicIssueLine(mainLatexSource, sectionName, excerpt) != null,
    [mainLatexSource],
  );

  const askArioLogicIssue = useCallback(
    (prefill: string, sectionName: string, excerpt?: string) => {
      jumpToLogicIssue(sectionName, excerpt);
      chatBridgeRef.current.queueChatFollowUp(prefill);
    },
    [jumpToLogicIssue, chatBridgeRef],
  );

  const canJumpToStructureSection = useCallback(
    (sectionName: string) => findSectionOutlineLine(mainLatexSource, sectionName) != null,
    [mainLatexSource],
  );

  const toolsPanelProps = useMemo(
    () => ({
      revisions: revisionHistory,
      citationResults,
      citationSummary,
      logicAuditReport,
      structureSuggestions,
      toolsTab,
      onToolsTabChange: setToolsTab,
      onJumpToStructureSection: jumpToStructureSection,
      canJumpToStructureSection,
      onAskArioStructure: (prefill: string) => chatBridgeRef.current.queueChatFollowUp(prefill),
      onApplyStructureFix: applyStructureFix,
      onAskArioCitation: askArioCitation,
      onJumpToLogicIssue: jumpToLogicIssue,
      onAskArioLogic: askArioLogicIssue,
      canJumpToLogicIssue,
      logicAuditReportStale: auditReportStale,
      logicAuditProgressDetail,
      logicAuditEngineAvailable,
      onCitationsUpdated: (results: Record<string, unknown>[], summary: string) => {
        setCitationResults(results);
        setCitationSummary(summary);
      },
    }),
    [
      revisionHistory,
      citationResults,
      citationSummary,
      logicAuditReport,
      structureSuggestions,
      toolsTab,
      jumpToStructureSection,
      canJumpToStructureSection,
      applyStructureFix,
      askArioCitation,
      jumpToLogicIssue,
      askArioLogicIssue,
      canJumpToLogicIssue,
      auditReportStale,
      logicAuditProgressDetail,
      logicAuditEngineAvailable,
    ],
  );

  const openCitationsTab = useCallback(() => {
    setToolsOpen(true);
    setToolsTab("citations");
    setMobileToolsOpen(false);
  }, [setMobileToolsOpen]);

  const exportDialogProps = useMemo(
    () => ({
      logicAuditReport: gateAuditReport,
      auditLoading: scoreAuditLoading,
      auditProgress: scoreAuditProgress,
      auditError: scoreAuditError,
      onRetryAudit: retryScoreGateAudit,
      onOpenCitationsTab: openCitationsTab,
    }),
    [
      gateAuditReport,
      scoreAuditLoading,
      scoreAuditProgress,
      scoreAuditError,
      retryScoreGateAudit,
      openCitationsTab,
    ],
  );

  return {
    toolsOpen,
    setToolsOpen,
    toolsTab,
    setToolsTab,
    scoreAuditLoading,
    chatSideEffects,
    refreshRevisions,
    loadSessionAudit,
    toolsPanelProps,
    exportDialogProps,
    tryStartScoreGateAudit,
    retryScoreGateAudit,
  };
}
