import { ChevronDown, Cpu, MessageSquarePlus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/components/locale-provider";
import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";
import { editorCopy } from "@/lib/editor-i18n";
import { isFreeModel, isModelPaidForProvider, parseModelLabel } from "@/lib/llm-model-tier";
import { cn } from "@/lib/utils";

import googleIconUrl from "../../assets/google-color-icon.svg?url";
import openrouterIconUrl from "../../assets/openrouter-icon.svg?url";
import zaiIconUrl from "../../assets/z-ai-logo.svg?url";

type LlmSelectorProps = {
  providers: ProviderInfo[];
  llmProvider: LLMProvider;
  llmModel: string;
  onProviderChange: (p: LLMProvider) => void;
  onModelChange: (m: string) => void;
  onNewChat?: () => void;
  compact?: boolean;
  variant?: "light" | "dark";
};

function providerIconUrl(provider: LLMProvider): string | null {
  if (provider === "google") return googleIconUrl;
  if (provider === "openrouter") return openrouterIconUrl;
  if (provider === "zai") return zaiIconUrl;
  return null;
}

function ProviderAvatar({ provider }: { provider: LLMProvider }) {
  const url = providerIconUrl(provider);
  if (!url) {
    return <span className="llm-selector-dot" data-provider={provider} aria-hidden />;
  }
  return (
    <img
      className="llm-provider-avatar"
      data-provider={provider}
      src={url}
      alt=""
      aria-hidden
      loading="lazy"
    />
  );
}

export function LlmSelector({
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onNewChat,
  compact = false,
  variant = "light",
}: LlmSelectorProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const current = providers.find((p) => p.id === llmProvider);
  const models = current?.models ?? [];
  const selectedModel = models.find((m) => m.id === llmModel);
  const selectedLabel = selectedModel?.label ?? llmModel.split("/").pop() ?? llmModel;
  const { name: modelName, tier: modelTier } = parseModelLabel(selectedLabel);
  const freeModel = isFreeModel(llmModel, modelTier);
  const paidModel = isModelPaidForProvider(llmProvider, llmModel, selectedLabel);

  if (!providers.length) return null;

  return (
    <div
      className={cn(
        "llm-selector",
        compact && "llm-selector-compact",
        variant === "dark" && "llm-selector-dark",
      )}
    >
      <div className="llm-selector-shell">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="llm-selector-segment llm-selector-segment-provider"
              aria-label="Chọn nhà cung cấp LLM"
            >
              <ProviderAvatar provider={llmProvider} />
              <span className="llm-selector-provider-name">{current?.name ?? llmProvider}</span>
              <span className="llm-selector-spacer" aria-hidden />
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
                  <span className="mr-2 inline-flex items-center justify-center">
                    <ProviderAvatar provider={p.id} />
                  </span>
                  {p.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="llm-selector-divider" aria-hidden />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="llm-selector-segment llm-selector-segment-model"
              aria-label="Chọn model LLM"
            >
              <Cpu className="llm-selector-model-icon" aria-hidden />
              <span className="llm-selector-model-name">{modelName}</span>
              {paidModel ? (
                <span className="llm-selector-tier llm-selector-tier-paid">{t.llm.paidBadge}</span>
              ) : modelTier ? (
                <span className={cn("llm-selector-tier", freeModel && "llm-selector-tier-free")}>
                  {modelTier}
                </span>
              ) : null}
              <span className="llm-selector-spacer" aria-hidden />
              <ChevronDown className="llm-selector-chevron" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="llm-selector-menu w-72 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Model</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={llmModel} onValueChange={onModelChange}>
              {models.map((m) => {
                const parsed = parseModelLabel(m.label);
                const free = isFreeModel(m.id, parsed.tier);
                const paid = isModelPaidForProvider(llmProvider, m.id, m.label);
                return (
                  <DropdownMenuRadioItem
                    key={m.id}
                    value={m.id}
                    disabled={paid}
                    title={paid ? t.llm.paidChatHint : undefined}
                    className="text-sm py-2"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-medium leading-tight">{parsed.name}</span>
                        {paid ? (
                          <span className="llm-selector-tier llm-selector-tier-paid shrink-0">
                            {t.llm.paidBadge}
                          </span>
                        ) : null}
                      </span>
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
      </div>

      {onNewChat && (
        <button
          type="button"
          onClick={onNewChat}
          className="llm-selector-new-chat"
          aria-label="Chat mới"
          title="Chat mới"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
