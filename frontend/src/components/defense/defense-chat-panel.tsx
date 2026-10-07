import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  GraduationCap,
  ArrowUp,
  Square,
  RotateCcw,
  ArrowRight,
  Clock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DefenseCopy } from "@/lib/defense-i18n";
import type { DefenseQuota } from "@/lib/api/defense-api";
import { DEFENSE_QUOTA_ENABLED } from "@/lib/api/defense-api";
import type { DefensePdfCitation } from "@/lib/defense-pdf-links";
import { DefenseCouncilMarkdown } from "@/components/defense/defense-council-markdown";
import { DefenseQuotaResetTimer } from "@/components/defense/defense-quota-reset-timer";
import type { UiLanguage } from "@/lib/locale-store";
import { countCompletedCouncilTurns, type DefenseMessage } from "@/lib/defense-conversation";

type Props = {
  copy: DefenseCopy["chat"];
  quota: DefenseQuota | null;
  quotaLoadFailed?: boolean;
  messages: DefenseMessage[];
  input: string;
  isStreaming: boolean;
  activityText: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onReset: () => void;
  onResume?: () => void;
  onQuotaRetry?: () => void;
  savedMessages?: DefenseMessage[];
  hasStarted: boolean;
  paperName?: string;
  latexContent?: string;
  onPdfCitation?: (citation: DefensePdfCitation) => void;
  locale: UiLanguage;
  onQuotaRefresh?: () => void;
};

function MessageRow({
  message,
  turnIndex,
  turnLabel,
  userLabel,
  activityText,
  thinkingDefault,
  stopCancelledLabel,
  latexContent,
  onPdfCitation,
}: {
  message: DefenseMessage;
  turnIndex: number;
  turnLabel: (n: number) => string;
  userLabel: string;
  activityText?: string;
  thinkingDefault: string;
  stopCancelledLabel: string;
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

  if (message.isError) {
    return (
      <article className="defense-msg defense-msg--error">
        <div className="defense-msg-error-body">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <p>{message.content}</p>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`defense-msg defense-msg--council${message.isCancelled ? " defense-msg--cancelled" : ""}`}
    >
      <header className="defense-msg-council-head">
        <GraduationCap className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        {turnIndex >= 0 && (
          <span className="defense-msg-council-tag">{turnLabel(turnIndex + 1)}</span>
        )}
      </header>
      {message.isStreaming && !message.content ? (
        <p className="defense-msg-council-body defense-msg-council-body--typing">
          <span className="defense-typing-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="defense-msg-council-status">{activityText || thinkingDefault}</span>
        </p>
      ) : (
        <>
          {message.content && (
            <DefenseCouncilMarkdown
              content={message.content}
              latexContent={latexContent}
              isStreaming={message.isStreaming}
              onPdfCitation={onPdfCitation}
            />
          )}
          {message.isCancelled && (
            <p className="defense-msg-cancelled-label">{stopCancelledLabel}</p>
          )}
        </>
      )}
    </article>
  );
}

export function DefenseQuotaBadge({
  copy,
  quota,
  displayUsed,
  exhausted = false,
  showPeriod = false,
  className,
}: {
  copy: DefenseCopy["chat"];
  quota: DefenseQuota;
  displayUsed: number;
  exhausted?: boolean;
  showPeriod?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`defense-quota-pill${exhausted ? " defense-quota-pill--full" : ""}${quota.plan === "pro" ? " defense-quota-pill--pro" : ""}${className ? ` ${className}` : ""}`}
      title={copy.turnsUsed(displayUsed, quota.limit)}
    >
      <span className="defense-quota-pill-plan">
        {quota.plan === "pro" ? copy.quotaPro : copy.quotaFree}
      </span>
      <span className="defense-quota-pill-count">
        {displayUsed}/{quota.limit}
      </span>
      {showPeriod ? (
        <span className="defense-quota-pill-period">{copy.quotaPeriodDaily}</span>
      ) : null}
    </span>
  );
}

function QuotaEmptyState({
  copy,
  quota,
  locale,
  onQuotaRefresh,
}: {
  copy: DefenseCopy["chat"];
  quota: DefenseQuota;
  locale: UiLanguage;
  onQuotaRefresh?: () => void;
}) {
  const isFree = quota.plan === "free";
  return (
    <div className="defense-empty">
      <div className="defense-empty-card">
        <div className="defense-empty-icon" aria-hidden>
          <Clock className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <h2 className="defense-empty-title">
          {isFree ? copy.quotaExceededDaily : copy.quotaExceededPro}
        </h2>
        <p className="defense-empty-desc">
          {isFree ? copy.quotaWaitTomorrow : copy.quotaWaitReset}
        </p>
        <DefenseQuotaResetTimer
          locale={locale}
          resetTimeLabel={copy.quotaResetAt("23:59:59")}
          countdownLabel={copy.quotaResetCountdown}
          resetsAt={quota.resets_at}
          onElapsed={onQuotaRefresh}
          className="defense-empty-reset-timer"
        />
        <p className="defense-empty-meta font-mono-data">
          {copy.turnsUsed(quota.limit, quota.limit)}
        </p>
        {isFree && (
          <Link to="/plan" className="defense-empty-cta">
            {copy.quotaUpgradeCta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function truncatePreview(text: string, max = 72): string {
  const first = text.split("\n")[0].trim();
  return first.length > max ? first.slice(0, max - 1) + "…" : first;
}

function WelcomeScreen({
  copy,
  paperName,
  quotaExhausted,
  quotaLoadFailed,
  isStreaming,
  savedMessages,
  onSend,
  onResume,
}: {
  copy: DefenseCopy["chat"];
  paperName?: string;
  quotaExhausted: boolean;
  quotaLoadFailed: boolean;
  isStreaming: boolean;
  savedMessages?: DefenseMessage[];
  onSend: () => void;
  onResume?: () => void;
}) {
  const councilTurns = savedMessages
    ? savedMessages.filter((m) => m.role === "assistant" && !m.isCancelled && m.content.trim())
    : [];
  const hasHistory = councilTurns.length > 0;
  const SHOW_MAX = 5;

  return (
    <div className="defense-setup">
      <div className="defense-setup-inner">
        {paperName && (
          <div className="defense-setup-paper">
            <span className="defense-setup-eyebrow">{copy.paperLabel}</span>
            <h2 className="defense-setup-paper-name">{paperName}</h2>
          </div>
        )}

        {hasHistory ? (
          <>
            <div className="defense-history">
              <div className="defense-history-header">
                <span className="defense-setup-eyebrow">{copy.previousSession}</span>
                <span className="defense-history-count">
                  {copy.previousSessionTurns(councilTurns.length)}
                </span>
              </div>
              <ul className="defense-history-list">
                {councilTurns.slice(0, SHOW_MAX).map((msg, i) => (
                  <li key={i} className="defense-history-item">
                    <span className="defense-history-turn">{copy.turnLabel(i + 1)}</span>
                    <span className="defense-history-preview">{truncatePreview(msg.content)}</span>
                  </li>
                ))}
                {councilTurns.length > SHOW_MAX && (
                  <li className="defense-history-item defense-history-more">
                    +{councilTurns.length - SHOW_MAX}
                  </li>
                )}
              </ul>
            </div>

            <div className="defense-setup-actions">
              <button
                type="button"
                className="defense-setup-start"
                onClick={onResume}
                disabled={isStreaming || quotaExhausted || quotaLoadFailed}
              >
                {copy.resumeSession}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="defense-setup-start-secondary"
                onClick={onSend}
                disabled={isStreaming || quotaExhausted || quotaLoadFailed}
              >
                {copy.newSession}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="defense-setup-section">
              <div className="defense-setup-mode-info">
                <p className="defense-setup-mode-title">{copy.proactiveTitle}</p>
                <p className="defense-setup-mode-desc">{copy.proactiveDesc}</p>
              </div>
            </div>

            <div className="defense-setup-start-slot">
              <button
                type="button"
                className="defense-setup-start"
                onClick={onSend}
                disabled={isStreaming || quotaExhausted || quotaLoadFailed}
              >
                {copy.startButton}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        <p className="defense-setup-footnote">
          {copy.footnoteLine1}
          <br />
          {copy.footnoteLine2}
        </p>
      </div>
    </div>
  );
}

export function DefenseChatPanel({
  copy,
  quota,
  quotaLoadFailed = false,
  messages,
  input,
  isStreaming,
  activityText,
  onInputChange,
  onSend,
  onStop,
  onReset,
  onResume,
  onQuotaRetry,
  savedMessages,
  hasStarted,
  paperName,
  latexContent,
  onPdfCitation,
  locale,
  onQuotaRefresh,
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
    const next = Math.min(Math.max(el.scrollHeight, COMPOSER_LINE_HEIGHT), COMPOSER_MAX_HEIGHT);
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
  const showComposer = hasStarted && !quotaExhausted;

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
    // IME composition (Vietnamese, CJK…): Enter picks the candidate, it must not submit.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim()) onSend();
    }
  };

  const canSend = !isStreaming && !quotaExhausted && !quotaLoadFailed && input.trim().length > 0;

  return (
    <TooltipProvider>
      <div className="defense-panel">
        <header className="defense-panel-head">
          <div className="defense-panel-head-brand">
            <h1 className="defense-panel-head-title">
              <span className="defense-panel-head-dico">{copy.councilBrand}</span>
              <span className="defense-panel-head-mode">{copy.councilTitle}</span>
            </h1>
            <p className="defense-panel-head-sub">{copy.councilSubtitle}</p>
          </div>
          <div className="defense-panel-head-actions">
            {quota && (
              <DefenseQuotaBadge
                copy={copy}
                quota={quota}
                displayUsed={displayUsed}
                exhausted={quotaExhausted}
              />
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

        {quotaLoadFailed && (
          <div className="defense-quota-error-banner">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{copy.quotaLoadError}</span>
            {onQuotaRetry && (
              <button type="button" onClick={onQuotaRetry} className="defense-quota-error-retry">
                <RefreshCw className="h-3 w-3" />
                {copy.quotaLoadRetry}
              </button>
            )}
          </div>
        )}

        {showQuotaEmpty && quota && (
          <QuotaEmptyState
            copy={copy}
            quota={quota}
            locale={locale}
            onQuotaRefresh={onQuotaRefresh}
          />
        )}

        {showWelcomeContent && (
          <WelcomeScreen
            copy={copy}
            paperName={paperName}
            quotaExhausted={quotaExhausted}
            quotaLoadFailed={quotaLoadFailed}
            isStreaming={isStreaming}
            savedMessages={savedMessages}
            onSend={onSend}
            onResume={onResume}
          />
        )}

        {showMessages && (
          <div className="defense-thread soft-scrollbar">
            {messages.map((msg, i) => {
              const idx = msg.role === "assistant" ? councilTurnIdx++ : -1;
              const isActiveStream =
                isStreaming &&
                i === messages.length - 1 &&
                msg.role === "assistant" &&
                msg.isStreaming;
              return (
                <MessageRow
                  key={i}
                  message={msg}
                  turnIndex={idx}
                  turnLabel={copy.turnLabel}
                  userLabel={copy.userLabel}
                  activityText={isActiveStream ? activityText : undefined}
                  thinkingDefault={copy.thinkingDefault}
                  stopCancelledLabel={copy.stopCancelled}
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
            <p>{quota.plan === "free" ? copy.quotaExceededDaily : copy.quotaExceededPro}</p>
            <DefenseQuotaResetTimer
              locale={locale}
              resetTimeLabel={copy.quotaResetAt("23:59:59")}
              countdownLabel={copy.quotaResetCountdown}
              resetsAt={quota.resets_at}
              onElapsed={onQuotaRefresh}
            />
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
                placeholder={copy.composerPlaceholder}
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

        {showWelcomeContent && <div className="defense-compose-reserve" aria-hidden />}
      </div>
    </TooltipProvider>
  );
}
