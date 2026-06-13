import { ChevronDown, RefreshCw } from "lucide-react";

import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";

type LlmSelectorProps = {
  providers: ProviderInfo[];
  llmProvider: LLMProvider;
  llmModel: string;
  onProviderChange: (p: LLMProvider) => void;
  onModelChange: (m: string) => void;
  onRefresh?: () => void;
  compact?: boolean;
  variant?: "light" | "dark";
};

export function LlmSelector({
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onRefresh,
  compact = false,
  variant = "light",
}: LlmSelectorProps) {
  const current = providers.find((p) => p.id === llmProvider);
  const models = current?.models ?? [];

  if (!providers.length) return null;

  return (
    <div
      className={`llm-selector ${compact ? "llm-selector-compact" : ""} ${variant === "dark" ? "llm-selector-dark" : ""}`}
    >
      <div className="llm-selector-field">
        <label className="sr-only">Provider</label>
        <select
          value={llmProvider}
          onChange={(e) => onProviderChange(e.target.value as LLMProvider)}
          className="llm-selector-trigger"
          aria-label="LLM provider"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="llm-selector-chevron pointer-events-none" aria-hidden />
      </div>

      <div className="llm-selector-divider" aria-hidden />

      <div className="llm-selector-field llm-selector-field-model">
        <label className="sr-only">Model</label>
        <select
          value={llmModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="llm-selector-trigger"
          aria-label="LLM model"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m.split("/").pop() ?? m}
            </option>
          ))}
        </select>
        <ChevronDown className="llm-selector-chevron pointer-events-none" aria-hidden />
      </div>

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="llm-selector-refresh"
          aria-label="Refresh providers"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
