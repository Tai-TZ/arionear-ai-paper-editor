import type { LLMProvider } from "@/lib/api/academic";

import googleIconUrl from "../../assets/google-color-icon.svg?url";
import openrouterIconUrl from "../../assets/openrouter-icon.svg?url";
import zaiIconUrl from "../../assets/z-ai-logo.svg?url";

export type ModelVendor =
  | "nvidia"
  | "deepseek"
  | "meta"
  | "gemma"
  | "gemini"
  | "google"
  | "openai"
  | "anthropic"
  | "qwen"
  | "zai"
  | "openrouter"
  | "unknown";

type KnownModelVendor = Exclude<ModelVendor, "unknown">;

const LOGO_MODEL_BASE = "/assets/logoModel";

const VENDOR_ICON_URL: Record<KnownModelVendor, string> = {
  nvidia: `${LOGO_MODEL_BASE}/NVIDIA.svg`,
  deepseek: `${LOGO_MODEL_BASE}/DEEPSEEK.svg`,
  meta: `${LOGO_MODEL_BASE}/LLAMA.svg`,
  gemma: `${LOGO_MODEL_BASE}/GEMMA.svg`,
  gemini: `${LOGO_MODEL_BASE}/Gemini.svg`,
  google: googleIconUrl,
  openai: `${LOGO_MODEL_BASE}/GPT.svg`,
  anthropic: `${LOGO_MODEL_BASE}/CLAUDE.svg`,
  qwen: `${LOGO_MODEL_BASE}/QWEN.svg`,
  zai: zaiIconUrl,
  openrouter: openrouterIconUrl,
};

const PROVIDER_VENDOR: Partial<Record<LLMProvider, KnownModelVendor>> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  zai: "zai",
  openrouter: "openrouter",
};

export function resolveModelVendor(modelId: string, provider?: LLMProvider): ModelVendor {
  const id = modelId.toLowerCase();

  if (id.includes("nemotron") || id.includes("nvidia")) return "nvidia";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("llama") || id.includes("meta-")) return "meta";
  if (id.includes("gemma")) return "gemma";
  if (id.includes("gemini")) return "gemini";
  if (id.includes("gpt") || /^o[134]/.test(id)) return "openai";
  if (id.includes("claude")) return "anthropic";
  if (id.includes("qwen")) return "qwen";
  if (id.includes("glm")) return "zai";

  if (provider && PROVIDER_VENDOR[provider]) {
    return PROVIDER_VENDOR[provider]!;
  }

  return "unknown";
}

export function modelIconUrl(modelId: string, provider?: LLMProvider): string | null {
  const vendor = resolveModelVendor(modelId, provider);
  if (vendor === "unknown") return null;
  return VENDOR_ICON_URL[vendor];
}

export function providerIconUrl(provider: LLMProvider): string | null {
  const vendor = PROVIDER_VENDOR[provider];
  if (!vendor) return null;
  return VENDOR_ICON_URL[vendor];
}
