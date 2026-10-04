import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";

/** User supplies their own API key — no platform billing gate for chat. */
const BYOK_PROVIDERS: ReadonlySet<LLMProvider> = new Set(["google", "openai", "anthropic"]);

function isByokProvider(provider: LLMProvider): boolean {
  return BYOK_PROVIDERS.has(provider);
}

export function parseModelLabel(label: string): { name: string; tier: string | null } {
  const sep = label.indexOf(" · ");
  if (sep === -1) return { name: label, tier: null };
  return { name: label.slice(0, sep), tier: label.slice(sep + 3) };
}

export function isFreeModel(modelId: string, tier: string | null): boolean {
  if (modelId.includes(":free")) return true;
  return tier != null && /free|miễn phí/i.test(tier);
}

function isPaidModel(modelId: string, label?: string | null): boolean {
  const tier = label ? parseModelLabel(label).tier : null;
  return !isFreeModel(modelId, tier);
}

export function isModelPaidForProvider(
  provider: LLMProvider,
  modelId: string,
  label?: string | null,
): boolean {
  if (isByokProvider(provider)) return false;
  return isPaidModel(modelId, label);
}

/** First non-paid model for platform-billed providers; falls back to default_model. */
export function pickFirstFreeModel(provider: ProviderInfo): string {
  const free = provider.models.find(
    (m) => !isModelPaidForProvider(provider.id, m.id, m.label),
  );
  return free?.id ?? provider.default_model;
}
