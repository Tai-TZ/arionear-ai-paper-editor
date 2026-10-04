import { useCallback, useEffect, useState } from "react";

import {
  fetchProviders,
  normalizeLlmProvider,
  type LLMProvider,
  type ProviderInfo,
} from "@/lib/api/academic";
import { pickFirstFreeModel } from "@/lib/llm-model-tier";

export function useEditorProviders() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("google");
  const [llmModel, setLlmModel] = useState("gemini-3.1-flash-lite");

  const loadProviders = useCallback(() => {
    fetchProviders()
      .then((data) => {
        setProviders(data.providers);
        const preferred = data.providers.some((p) => p.id === "google")
          ? "google"
          : normalizeLlmProvider(data.default_provider);
        setLlmProvider(preferred);
        const providerInfo = data.providers.find((p) => p.id === preferred);
        if (providerInfo) {
          const googleDefault = "gemini-3.1-flash-lite";
          if (preferred === "google" && providerInfo.models.some((m) => m.id === googleDefault)) {
            setLlmModel(googleDefault);
          } else {
            setLlmModel(pickFirstFreeModel(providerInfo));
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  return {
    providers,
    llmProvider,
    llmModel,
    setLlmProvider,
    setLlmModel,
  };
}
