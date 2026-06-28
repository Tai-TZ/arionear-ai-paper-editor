import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";

export function parseModelLabel(label: string): { name: string; tier: string | null } {
  const sep = label.indexOf(" · ");
  if (sep === -1) return { name: label, tier: null };
  return { name: label.slice(0, sep), tier: label.slice(sep + 3) };
}

export function isFreeModel(modelId: string, tier: string | null): boolean {
  if (modelId.includes(":free")) return true;
  return tier != null && /free|miễn phí/i.test(tier);
}

export function isPaidModel(modelId: string, label?: string | null): boolean {
  const tier = label ? parseModelLabel(label).tier : null;
  return !isFreeModel(modelId, tier);
}

export function isSelectedModelPaid(
  providers: ProviderInfo[],
  llmProvider: LLMProvider,
  llmModel: string,
): boolean {
  const provider = providers.find((p) => p.id === llmProvider);
  const model = provider?.models.find((m) => m.id === llmModel);
  return isPaidModel(llmModel, model?.label ?? null);
}
