import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  GraduationCap,
  ArrowUp,
  Square,
  RotateCcw,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DefenseCopy } from "@/lib/defense-i18n";
import type { DefenseMode, DefenseQuota } from "@/lib/api/defense-api";
import { DEFENSE_QUOTA_ENABLED } from "@/lib/api/defense-api";
import type { DefensePdfCitation } from "@/lib/defense-pdf-links";
import { DefenseCouncilMarkdown } from "@/components/defense/defense-council-markdown";

export type DefenseMessage = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

export function countCompletedCouncilTurns(messages: DefenseMessage[]): number {
  return messages.filter(
    (m) => m.role === "assistant" && !m.isStreaming && m.content.trim().length > 0,
  ).length;
}

type Props = {
  copy: DefenseCopy["chat"];
  quota: DefenseQuota | null;
  messages: DefenseMessage[];
  input: string;
  mode: DefenseMode;
  isStreaming: boolean;
  activityText: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onModeChange: (m: DefenseMode) => void;
  onReset: () => void;
  hasStarted: boolean;
  paperName?: string;
  latexContent?: string;
  onPdfCitation?: (citation: DefensePdfCitation) => void;
};

function MessageRow({
  message,
  turnIndex,
  turnLabel,
  userLabel,
  activityText,
  thinkingDefault,
  latexContent,
  onPdfCitation,
}: {
  message: DefenseMessage;
  turnIndex: number;
  turnLabel: (n: number) => string;
  userLabel: string;
  activityText?: string;
  thinkingDefault: string;
  latexContent?: string;
  onPdfCitation?: (citation: DefensePdfCitation) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="defense-msg defense-msg--user">
        <div className="defense-msg-user-wrap">
          <span className="defense-msg-user-tag">{userLabel}</span>
          <div className="defense-msg-user">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <article className="defense-msg defense-msg--council">
      <header className="defense-msg-council-head">
        <GraduationCap className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        {turnIndex >= 0 && <span className="defense-msg-council-tag">{turnLabel(turnIndex + 1)}</span>}
      </header>
      {message.isStreaming && !message.content ? (
        <p className="defense-msg-council-body defense-msg-council-body--typing">
          <span className="defense-typing-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="defense-msg-council-status">
            {activityText || thinkingDefault}
          </span>
        </p>
      ) : (
        <DefenseCouncilMarkdown
          content={message.content}
          latexContent={latexContent}
          isStreaming={message.isStreaming}
          onPdfCitation={onPdfCitation}
        />
      )}
    </article>
  );
}

function QuotaEmptyState({
  copy,
  quota,
}: {
  copy: DefenseCopy["chat"];
  quota: DefenseQuota;
}) {
  const isDaily = quota.period_type === "daily";
  return (
    <div className="defense-empty">
      <div className="defense-empty-card">
        <div className="defense-empty-icon" aria-hidden>
          <Clock className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <h2 className="defense-empty-title">
          {isDaily ? copy.quotaExceededDaily : copy.quotaExceededMonthly}
        </h2>
        <p className="defense-empty-desc">
          {isDaily ? copy.quotaWaitTomorrow : copy.upgradeHint}
        </p>
        <p className="defense-empty-meta font-mono-data">
          {copy.turnsUsed(quota.limit, quota.limit, quota.period_type)}
        </p>
        {quota.plan === "free" && (
          <Link to="/profile" className="defense-empty-cta">
            {copy.quotaUpgradeCta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function WelcomeScreen({
  copy,
  paperName,
  mode,
  quotaExhausted,
  isStreaming,
  onModeChange,
  onSend,
}: {
  copy: DefenseCopy["chat"];
  paperName?: string;
  mode: DefenseMode;
  quotaExhausted: boolean;
  isStreaming: boolean;
  onModeChange: (m: DefenseMode) => void;
  onSend: () => void;
}) {
  const modes: { id: DefenseMode; label: string; desc: string }[] = [
    { id: "proactive", label: copy.proactiveTitle, desc: copy.proactiveDesc },
    { id: "responsive", label: copy.responsiveTitle, desc: copy.responsiveDesc },
  ];

  return (
    <div className="defense-setup">
      <div className="defense-setup-inner">
        {paperName && (
          <div className="defense-setup-paper">
            <span className="defense-setup-eyebrow">{copy.paperLabel}</span>
            <h2 className="defense-setup-paper-name">{paperName}</h2>
          </div>
        )}

        <div className="defense-setup-section">
          <span className="defense-setup-eyebrow">{copy.modeSection}</span>
          <div className="defense-setup-modes" role="radiogroup" aria-label={copy.modeSection}>
            {modes.map(({ id, label, desc }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                className="defense-setup-mode"
                data-selected={mode === id}
                onClick={() => onModeChange(id)}
              >
                <span className="defense-setup-mode-radio" aria-hidden />
                <span className="defense-setup-mode-text">
                  <span className="defense-setup-mode-title">{label}</span>
                  <span className="defense-setup-mode-desc">{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="defense-setup-start-slot">
          {mode === "proactive" && (
            <button
              type="button"
              className="defense-setup-start"
              onClick={onSend}
              disabled={isStreaming || quotaExhausted}
            >
              {copy.startButton}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="defense-setup-footnote">
          {copy.footnoteLine1} {copy.footnoteLine2}
        </p>
      </div>
    </div>
  );
}

export function DefenseChatPanel({
  copy,
  quota,
  messages,
  input,
  mode,
  isStreaming,
  activityText,
  onInputChange,
  onSend,
  onStop,
  onModeChange,
  onReset,
  hasStarted,
  paperName,
  latexContent,
  onPdfCitation,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevShowComposerRef = useRef(false);
  const [composeAnimKey, setComposeAnimKey] = useState(0);

  const COMPOSER_LINE_HEIGHT = 22;
  const COMPOSER_MAX_HEIGHT = 160;

  const syncComposerHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(
      Math.max(el.scrollHeight, COMPOSER_LINE_HEIGHT),
      COMPOSER_MAX_HEIGHT,
    );
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  const completedCouncilTurns = countCompletedCouncilTurns(messages);
  const displayUsed = quota ? Math.max(quota.used, completedCouncilTurns) : completedCouncilTurns;
  const quotaExhausted =
    DEFENSE_QUOTA_ENABLED &&
    quota !== null &&
    (quota.remaining <= 0 || completedCouncilTurns >= quota.limit);
  const showWelcome = !hasStarted && messages.length === 0 && !isStreaming;
  const showQuotaEmpty = showWelcome && quotaExhausted && quota !== null;
  const showWelcomeContent = showWelcome && !quotaExhausted;
  const showMessages = messages.length > 0 || isStreaming;
  const showComposer =
    (hasStarted || (mode === "responsive" && showWelcomeContent)) && !quotaExhausted;

  useLayoutEffect(() => {
    if (showComposer) syncComposerHeight();
  }, [input, showComposer, syncComposerHeight]);

  useEffect(() => {
    if (showComposer && !prevShowComposerRef.current) {
      setComposeAnimKey((k) => k + 1);
    }
    prevShowComposerRef.current = showComposer;
  }, [showComposer]);

  let councilTurnIdx = 0;
  const lastMessage = messages[messages.length - 1];
  const streamContentLen = lastMessage?.role === "assistant" ? lastMessage.content.length : 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: isStreaming ? "auto" : "smooth",
      block: "end",
    });
  }, [messages.length, streamContentLen, isStreaming, activityText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim()) onSend();
    }
  };

  const canSend = !isStreaming && !quotaExhausted && input.trim().length > 0;
  const composerPlaceholder =
    mode === "proactive" ? copy.composerProactive : copy.composerResponsive;

  return (
    <TooltipProvider>
      <div className="defense-panel">
        <header className="defense-panel-head">
          <div className="defense-panel-head-brand">
            <h1 className="defense-panel-head-title">
              <span className="defense-panel-head-ario">{copy.councilBrand}</span>
              <span className="defense-panel-head-mode">{copy.councilTitle}</span>
            </h1>
            <p className="defense-panel-head-sub">{copy.councilSubtitle}</p>
          </div>
          <div className="defense-panel-head-actions">
            {DEFENSE_QUOTA_ENABLED && quota && (
              <span
                className={`defense-quota-pill${quotaExhausted ? " defense-quota-pill--full" : ""}`}
                title={copy.turnsUsed(displayUsed, quota.limit, quota.period_type)}
              >
                <span className="defense-quota-pill-plan">
                  {quota.plan === "pro" ? copy.quotaPro : copy.quotaFree}
                </span>
                <span className="defense-quota-pill-count">
                  {displayUsed}/{quota.limit}
                </span>
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onReset}
                  disabled={isStreaming}
                  className="defense-panel-head-btn"
                  aria-label={copy.resetSession}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {copy.resetTooltip}
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        {showQuotaEmpty && quota && <QuotaEmptyState copy={copy} quota={quota} />}

        {showWelcomeContent && (
          <WelcomeScreen
            copy={copy}
            paperName={paperName}
            mode={mode}
            quotaExhausted={quotaExhausted}
            isStreaming={isStreaming}
            onModeChange={onModeChange}
            onSend={onSend}
          />
        )}

        {showMessages && (
          <div className="defense-thread soft-scrollbar">
            {messages.map((msg, i) => {
              const idx = msg.role === "assistant" ? councilTurnIdx++ : -1;
              const isActiveStream =
                isStreaming && i === messages.length - 1 && msg.role === "assistant" && msg.isStreaming;
              return (
                <MessageRow
                  key={i}
                  message={msg}
                  turnIndex={idx}
                  turnLabel={copy.turnLabel}
                  userLabel={copy.userLabel}
                  activityText={isActiveStream ? activityText : undefined}
                  thinkingDefault={copy.thinkingDefault}
                  latexContent={latexContent}
                  onPdfCitation={onPdfCitation}
                />
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}

        {quotaExhausted && showMessages && quota && (
          <div className="defense-thread-limit">
            <p>
              {quota.period_type === "daily"
                ? copy.quotaExceededDaily
                : copy.quotaExceededMonthly}
            </p>
          </div>
        )}

        {showComposer && (
          <footer key={composeAnimKey} className="defense-compose defense-compose--appear">
            <div className="defense-compose-row">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={composerPlaceholder}
                disabled={isStreaming}
                className="defense-compose-input"
              />
              <button
                type="button"
                className={`defense-compose-send${isStreaming ? " is-stop" : ""}`}
                onClick={isStreaming ? onStop : onSend}
                disabled={!isStreaming && !canSend}
                aria-label={isStreaming ? copy.stop : copy.send}
              >
                {isStreaming ? (
                  <Square className="h-3 w-3 fill-current" />
                ) : (
                  <ArrowUp className="h-4 w-4" strokeWidth={2} />
                )}
              </button>
            </div>
            <p className="defense-compose-hint">{copy.composerHint}</p>
          </footer>
        )}

        {showWelcomeContent && mode === "proactive" && (
          <div className="defense-compose-reserve" aria-hidden />
        )}
      </div>
    </TooltipProvider>
  );
}
