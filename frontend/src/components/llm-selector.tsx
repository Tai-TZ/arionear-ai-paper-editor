import { ChevronDown, Cpu, RefreshCw } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";
import { cn } from "@/lib/utils";

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

function parseModelLabel(label: string): { name: string; tier: string | null } {
  const sep = label.indexOf(" · ");
  if (sep === -1) return { name: label, tier: null };
  return { name: label.slice(0, sep), tier: label.slice(sep + 3) };
}

function isFreeModel(modelId: string, tier: string | null): boolean {
  if (modelId.includes(":free")) return true;
  return tier != null && /free|miễn phí/i.test(tier);
}

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
  const selectedModel = models.find((m) => m.id === llmModel);
  const { name: modelName, tier: modelTier } = parseModelLabel(
    selectedModel?.label ?? llmModel.split("/").pop() ?? llmModel,
  );
  const freeModel = isFreeModel(llmModel, modelTier);

  if (!providers.length) return null;

  return (
    <div
      className={cn(
        "llm-selector",
        compact && "llm-selector-compact",
        variant === "dark" && "llm-selector-dark",
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="llm-selector-chip llm-selector-chip-provider"
            aria-label="Chọn nhà cung cấp LLM"
          >
            <span className="llm-selector-dot" data-provider={llmProvider} aria-hidden />
            <span className="llm-selector-provider-name">{current?.name ?? llmProvider}</span>
            <ChevronDown className="llm-selector-chevron" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="llm-selector-menu w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Provider</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={llmProvider}
            onValueChange={(v) => onProviderChange(v as LLMProvider)}
          >
            {providers.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id} className="text-sm">
                <span className="llm-selector-dot mr-2" data-provider={p.id} aria-hidden />
                {p.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="llm-selector-chip llm-selector-chip-model"
            aria-label="Chọn model LLM"
          >
            <Cpu className="llm-selector-model-icon" aria-hidden />
            <span className="llm-selector-model-name">{modelName}</span>
            {modelTier && (
              <span
                className={cn(
                  "llm-selector-tier",
                  freeModel && "llm-selector-tier-free",
                )}
              >
                {modelTier}
              </span>
            )}
            <ChevronDown className="llm-selector-chevron ml-auto shrink-0" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="llm-selector-menu w-72 max-h-80 overflow-y-auto">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Model</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={llmModel} onValueChange={onModelChange}>
            {models.map((m) => {
              const parsed = parseModelLabel(m.label);
              const free = isFreeModel(m.id, parsed.tier);
              return (
                <DropdownMenuRadioItem key={m.id} value={m.id} className="text-sm py-2">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium leading-tight">{parsed.name}</span>
                    {parsed.tier && (
                      <span
                        className={cn(
                          "text-xs text-muted-foreground leading-tight",
                          free && "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {parsed.tier}
                      </span>
                    )}
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="llm-selector-refresh"
          aria-label="Tải lại danh sách provider"
          title="Tải lại providers"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
