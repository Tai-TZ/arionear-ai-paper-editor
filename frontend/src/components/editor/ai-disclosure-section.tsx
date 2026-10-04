import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { useLocale } from "@/components/locale-context";
import { fetchAiDisclosureReport, type AiDisclosureReport } from "@/lib/api/ai-disclosure-api";
import {
  acceptedTotal,
  aiDisclosureFilename,
  disclosureText,
  downloadTextFile,
  formatDisclosurePeriod,
  serializeAiDisclosureReport,
} from "@/lib/ai-disclosure";
import { aiDisclosureCopy, type AiDisclosureCopy } from "@/lib/ai-disclosure-i18n";
import type { UiLanguage } from "@/lib/researcher-profile";

type CopyTarget = "statement" | "latex";

const LANGUAGES: UiLanguage[] = ["en", "vi"];

const ACTION_BTN =
  "inline-flex items-center justify-center gap-1.5 border border-foreground/30 px-3 py-2 font-sans-ui text-[10px] uppercase tracking-[0.14em] text-foreground transition hover:border-foreground hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50";

function StatTile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="font-sans-ui text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg tabular-nums leading-none text-foreground">{value}</p>
      {note ? <p className="mt-1 text-[10px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function DisclosureBody({
  report,
  t,
  locale,
  shownLang,
  onLangChange,
  copied,
  onCopy,
  onDownload,
}: {
  report: AiDisclosureReport;
  t: AiDisclosureCopy;
  locale: UiLanguage;
  shownLang: UiLanguage;
  onLangChange: (lang: UiLanguage) => void;
  copied: CopyTarget | null;
  onCopy: (target: CopyTarget) => void;
  onDownload: () => void;
}) {
  const { totals } = report;
  const text = disclosureText(report, shownLang);
  const period = formatDisclosurePeriod(report.period, locale);
  const modelNames = report.models
    .map((m) => [m.model, m.provider_label].filter(Boolean).join(" · "))
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {report.has_ai_usage ? (
        <>
          <div
            className={`grid grid-cols-2 gap-px overflow-hidden rounded border border-border/70 bg-border/70 ${
              totals.pending > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4"
            }`}
          >
            <StatTile label={t.stats.interactions} value={totals.interactions} />
            <StatTile label={t.stats.proposed} value={totals.proposed} />
            <StatTile
              label={t.stats.accepted}
              value={acceptedTotal(totals)}
              note={totals.modified > 0 ? t.modifiedNote(totals.modified) : undefined}
            />
            <StatTile label={t.stats.rejected} value={totals.rejected} />
            {totals.pending > 0 ? (
              <StatTile label={t.stats.pending} value={totals.pending} />
            ) : null}
          </div>

          <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
            {period ? (
              <>
                <dt className="text-muted-foreground">{t.period}</dt>
                <dd className="text-foreground/85">{period}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{t.models}</dt>
            <dd className="break-words text-foreground/85">
              {modelNames.length ? modelNames.join(", ") : t.noModels}
            </dd>
          </dl>

          {report.by_task.length > 0 ? (
            <div>
              <p className="mb-1.5 font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t.byTask}
              </p>
              <ul className="divide-y divide-border/60 border-y border-border/60">
                {report.by_task.map((row) => (
                  <li
                    key={row.task}
                    className="flex flex-col gap-0.5 py-1.5 text-xs sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <span className="font-medium text-foreground">
                      {t.tasks[row.task] ?? row.task}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {t.taskSummary(
                        row.interactions,
                        row.proposed,
                        acceptedTotal(row),
                        row.rejected,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {report.attribution.inferred > 0 ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {t.inferred(report.attribution.inferred)}
                </p>
              ) : null}
              {report.unattributed.proposed > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t.unattributed(report.unattributed.proposed)}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-foreground/80">{t.noUsage}</p>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t.statementLabel}
          </p>
          <div
            role="group"
            aria-label={t.languageGroup}
            className="inline-flex items-stretch border border-foreground/30"
          >
            {LANGUAGES.map((lang) => {
              const active = shownLang === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={active}
                  title={t.languageNames[lang]}
                  onClick={() => onLangChange(lang)}
                  className={`px-2.5 py-1 font-sans-ui text-[10px] uppercase tracking-widest transition-colors ${
                    active ? "bg-foreground text-background" : "hover:bg-foreground/10"
                  }`}
                >
                  {t.languages[lang]}
                </button>
              );
            })}
          </div>
        </div>
        <blockquote
          lang={shownLang}
          className="border-l-2 border-foreground/60 bg-muted/30 px-3 py-2.5 text-[13px] leading-relaxed text-foreground/90"
        >
          {text.statement}
        </blockquote>
        <details className="mt-2">
          <summary className="cursor-pointer font-sans-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">
            {t.latexLabel}
          </summary>
          <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words border border-border/70 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/85">
            {text.latex}
          </pre>
        </details>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={ACTION_BTN} onClick={() => onCopy("statement")}>
          {copied === "statement" ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied === "statement" ? t.copied : t.copyStatement}
        </button>
        <button type="button" className={ACTION_BTN} onClick={() => onCopy("latex")}>
          {copied === "latex" ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied === "latex" ? t.copied : t.copyLatex}
        </button>
        <button type="button" className={ACTION_BTN} onClick={onDownload}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {t.downloadJson}
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        {t.humanGate}
      </p>
    </div>
  );
}

/**
 * AI Contribution Report for the export flow. Loads on demand, shows the statement in the UI
 * language (toggle for the other one) and offers copy/download actions only — it never edits
 * the manuscript (Human Gate).
 */
export function AiDisclosureSection({ paperId }: { paperId: string }) {
  const { locale } = useLocale();
  const t = aiDisclosureCopy(locale);
  const [report, setReport] = useState<AiDisclosureReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<UiLanguage | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  const shownLang = lang ?? locale;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchAiDisclosureReport(paperId, locale));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.loadError);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (target: CopyTarget) => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(disclosureText(report, shownLang)[target]);
      setCopied(target);
      window.setTimeout(() => setCopied((current) => (current === target ? null : current)), 1800);
    } catch {
      setError(t.copyError);
    }
  };

  const handleDownload = () => {
    if (!report) return;
    downloadTextFile(
      aiDisclosureFilename(report.paper_title, report.generated_at),
      serializeAiDisclosureReport(report),
      "application/json",
    );
  };

  return (
    <section
      aria-labelledby="ai-disclosure-title"
      className="mt-5 rounded border border-border/70 bg-card"
    >
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t.eyebrow}
          </p>
          <h3
            id="ai-disclosure-title"
            className="mt-1 font-serif-display text-lg font-bold tracking-tight text-foreground"
          >
            {t.title}
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            {t.description}
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className={`${ACTION_BTN} shrink-0 self-start`}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : report ? (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          )}
          {loading ? t.loading : report ? t.refresh : t.generate}
        </button>
      </div>

      {error || report ? (
        <div className="space-y-3 border-t border-border/60 px-4 py-3" aria-live="polite">
          {error ? (
            <div className="flex items-start gap-2 border border-[color:var(--editorial-red)]/35 bg-[color:var(--editorial-red)]/5 px-3 py-2 text-xs text-[color:var(--editorial-red)]">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{error}</span>
              {!report && !loading ? (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="shrink-0 font-sans-ui text-[10px] uppercase tracking-[0.14em] underline underline-offset-2 hover:no-underline"
                >
                  {t.retry}
                </button>
              ) : null}
            </div>
          ) : null}
          {report ? (
            <DisclosureBody
              report={report}
              t={t}
              locale={locale}
              shownLang={shownLang}
              onLangChange={setLang}
              copied={copied}
              onCopy={(target) => void handleCopy(target)}
              onDownload={handleDownload}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
