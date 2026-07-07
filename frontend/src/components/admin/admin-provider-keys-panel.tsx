import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, KeyRound, Loader2, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useLocale } from "@/components/locale-provider";
import { adminCopy } from "@/lib/admin-i18n";
import {
  clearAdminProviderKeys,
  deleteAdminProviderKey,
  fetchAdminProviderKeys,
  saveAdminProviderKey,
  testAdminProviderKey,
  type LlmProviderStatus,
  type ProviderKeyRow,
} from "@/lib/api/admin-api";
import { normalizeLlmProvider, type LLMProvider } from "@/lib/api/academic";
import { modelIconUrl, providerIconUrl } from "@/lib/llm-model-icons";

type DraftState = Record<
  string,
  { apiKey: string; priority: number; label: string; testModel: string }
>;

function ProviderIcon({ providerId }: { providerId: string }) {
  const icon = providerIconUrl(normalizeLlmProvider(providerId));
  if (!icon) {
    return <KeyRound className="h-5 w-5 text-[color:var(--editorial-red)]" strokeWidth={1.5} />;
  }
  return (
    <img
      src={icon}
      alt=""
      className="h-5 w-5 shrink-0 object-contain"
      width={20}
      height={20}
    />
  );
}

function ModelChip({ modelId, providerId }: { modelId: string; providerId: string }) {
  const icon = modelIconUrl(modelId, normalizeLlmProvider(providerId) as LLMProvider);
  return (
    <span className="admin-model-chip" title={modelId}>
      {icon ? (
        <img src={icon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" width={14} height={14} />
      ) : null}
      <span className="truncate">{modelId.split("/").pop()}</span>
    </span>
  );
}

export function AdminProviderKeysPanel({ onKeysChanged }: { onKeysChanged?: () => void }) {
  const { locale } = useLocale();
  const t = useMemo(() => adminCopy(locale).llmKeys, [locale]);

  const [providers, setProviders] = useState<LlmProviderStatus[]>([]);
  const [keys, setKeys] = useState<ProviderKeyRow[]>([]);
  const [envFallback, setEnvFallback] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [working, setWorking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const refreshKeys = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const data = await fetchAdminProviderKeys();
      setKeys(data.keys);
      setEnvFallback(data.env_fallback_configured);
      setProviders(data.providers);
      if (!silent) {
        setExpanded((prev) => {
          const next = { ...prev };
          for (const p of data.providers) {
            if (!(p.id in next)) next[p.id] = !p.configured;
          }
          return next;
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.loadError);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [t.loadError]);

  useEffect(() => {
    void refreshKeys();
  }, [refreshKeys]);

  const keysByProvider = useMemo(() => {
    const map = new Map<string, ProviderKeyRow[]>();
    for (const row of keys) {
      const list = map.get(row.provider) ?? [];
      list.push(row);
      map.set(row.provider, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.priority - b.priority);
    }
    return map;
  }, [keys]);

  const configuredCount = useMemo(
    () => providers.filter((p) => p.configured).length,
    [providers],
  );

  const setDraft = (provider: string, patch: Partial<DraftState[string]>) => {
    setDrafts((prev) => ({
      ...prev,
      [provider]: {
        apiKey: prev[provider]?.apiKey ?? "",
        priority: prev[provider]?.priority ?? 0,
        label: prev[provider]?.label ?? "",
        testModel: prev[provider]?.testModel ?? "",
        ...patch,
      },
    }));
  };

  const mergeSavedKey = (row: ProviderKeyRow) => {
    setKeys((prev) => {
      const without = prev.filter((k) => k.id !== row.id && !(k.provider === row.provider && k.priority === row.priority));
      return [...without, row];
    });
    setProviders((prev) =>
      prev.map((p) => (p.id === row.provider ? { ...p, configured: true } : p)),
    );
  };

  const patchKeyVerification = (keyId: string, ok: boolean, message: string) => {
    setKeys((prev) =>
      prev.map((k) =>
        k.id === keyId
          ? {
              ...k,
              last_verified_at: new Date().toISOString(),
              last_error: ok ? null : message.slice(0, 240),
            }
          : k,
      ),
    );
  };

  const notifyKeysChanged = () => {
    onKeysChanged?.();
  };

  const handleSave = async (provider: string) => {
    const draft = drafts[provider];
    if (!draft?.apiKey.trim()) {
      toast.error(t.keyRequired);
      return;
    }
    setWorking(`save:${provider}`);
    try {
      const row = await saveAdminProviderKey(provider, {
        api_key: draft.apiKey.trim(),
        priority: draft.priority,
        label: draft.label.trim() || undefined,
      });
      toast.success(t.saved);
      setDraft(provider, {
        apiKey: "",
        priority: draft.priority,
        label: "",
        testModel: draft.testModel,
      });
      mergeSavedKey(row);
      notifyKeysChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.saveError);
    } finally {
      setWorking(null);
    }
  };

  const handleTest = async (provider: string, providerMeta: LlmProviderStatus, keyId?: string) => {
    const draft = drafts[provider];
    const rows = keysByProvider.get(provider) ?? [];
    const model = draft?.testModel || providerMeta.default_model;
    const draftKey = draft?.apiKey.trim() || undefined;
    const effectiveKeyId = keyId ?? (!draftKey && rows.length > 0 ? rows[0].id : undefined);

    setWorking(effectiveKeyId ? `test:${effectiveKeyId}` : `test:${provider}`);
    try {
      const result = await testAdminProviderKey(provider, {
        api_key: effectiveKeyId ? undefined : draftKey,
        key_id: effectiveKeyId,
        model: model || undefined,
      });
      if (result.ok) {
        toast.success(t.testOk(result.latency_ms ?? 0));
        const hasSaved = rows.length > 0;
        if (!effectiveKeyId && draftKey && !hasSaved) {
          toast.info(t.testSavedHint);
        }
      } else {
        toast.error(t.testFail, { description: result.message });
      }
      if (effectiveKeyId) {
        patchKeyVerification(effectiveKeyId, result.ok, result.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.testError);
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (keyId: string) => {
    setWorking(`delete:${keyId}`);
    try {
      await deleteAdminProviderKey(keyId);
      toast.success(t.deleted);
      await refreshKeys({ silent: true });
      notifyKeysChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.deleteError);
    } finally {
      setWorking(null);
    }
  };

  const handleClear = async (provider: string) => {
    setWorking(`clear:${provider}`);
    try {
      await clearAdminProviderKeys(provider);
      toast.success(t.cleared);
      await refreshKeys({ silent: true });
      notifyKeysChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.clearError);
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <div className="admin-panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t.loading}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="admin-panel">
        <div className="admin-panel-body space-y-2">
          <p className="admin-data-note">{t.intro}</p>
          <p className="text-sm font-medium">
            {t.summary(configuredCount, providers.length)}
          </p>
        </div>
      </div>

      {providers.map((providerMeta) => {
        const providerId = providerMeta.id;
        const rows = keysByProvider.get(providerId) ?? [];
        const draft = drafts[providerId] ?? {
          apiKey: "",
          priority: rows.length,
          label: "",
          testModel: providerMeta.default_model,
        };
        const envOk = envFallback[providerId];
        const busy = working?.includes(providerId) || working?.startsWith(`save:${providerId}`);
        const isOpen = expanded[providerId] ?? true;

        return (
          <div key={providerId} className="admin-panel">
            <button
              type="button"
              className="admin-panel-head w-full text-left"
              onClick={() => setExpanded((e) => ({ ...e, [providerId]: !isOpen }))}
            >
              <ProviderIcon providerId={providerId} />
              <div className="min-w-0 flex-1">
                <h2>{providerMeta.label}</h2>
                <p className="font-mono-data text-[11px] text-muted-foreground">
                  {t.modelsCount(providerMeta.models.length)} · {providerMeta.default_model}
                </p>
              </div>
              <span
                className={`admin-badge ${providerMeta.configured ? "admin-badge-active" : "admin-badge-inactive"}`}
              >
                {providerMeta.configured ? t.configured : t.missingKey}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform${isOpen ? " rotate-180" : ""}`}
                strokeWidth={1.5}
              />
            </button>

            {isOpen ? (
              <div className="admin-panel-body space-y-4">
              {envOk && rows.length ? (
                <p className="text-xs text-muted-foreground">{t.envFallbackHint}</p>
              ) : null}
              {envOk && !rows.length ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">{t.saveBeforeChat}</p>
              ) : null}

              {providerId === "google" ? (
                <p className="text-xs text-muted-foreground">{t.googleTestHint}</p>
              ) : null}

                <div>
                  <p className="admin-field-label mb-2">{t.supportedModels}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {providerMeta.models.map((m) => (
                      <ModelChip key={m.id} modelId={m.id} providerId={providerId} />
                    ))}
                  </div>
                </div>

                {rows.length ? (
                  <ul className="space-y-2">
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                      >
                        <span className="font-mono-data text-xs">
                          P{row.priority} · {row.key_hint}
                        </span>
                        {row.label ? (
                          <span className="text-xs text-muted-foreground">{row.label}</span>
                        ) : null}
                        {!row.is_active ? (
                          <span className="admin-badge admin-badge-inactive">{t.inactive}</span>
                        ) : null}
                        {row.last_verified_at ? (
                          <span className="text-[10px] text-muted-foreground">{t.lastVerified}</span>
                        ) : null}
                        {row.last_error ? (
                          <span className="text-xs text-destructive truncate max-w-[240px]">
                            {row.last_error}
                          </span>
                        ) : null}
                        <span className="ml-auto flex gap-1">
                          <button
                            type="button"
                            className="admin-inline-btn"
                            disabled={Boolean(working)}
                            onClick={() => void handleTest(providerId, providerMeta, row.id)}
                          >
                            {working === `test:${row.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PlugZap className="h-3.5 w-3.5" />
                            )}
                            {t.test}
                          </button>
                          <button
                            type="button"
                            className="admin-inline-btn text-destructive"
                            disabled={Boolean(working)}
                            onClick={() => void handleDelete(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">{t.noAdminKeys}</p>
                )}

                <div className="admin-limits-grid">
                  <label className="admin-field md:col-span-2">
                    <span className="admin-field-label">{t.newKey}</span>
                    <input
                      type="password"
                      className="profile-input font-mono-data text-xs"
                      placeholder={t.newKeyPlaceholder}
                      value={draft.apiKey}
                      onChange={(e) => setDraft(providerId, { apiKey: e.target.value })}
                      autoComplete="off"
                    />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">{t.priority}</span>
                    <input
                      type="number"
                      min={0}
                      max={9}
                      className="profile-input"
                      value={draft.priority}
                      onChange={(e) =>
                        setDraft(providerId, { priority: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">{t.labelOptional}</span>
                    <input
                      type="text"
                      className="profile-input"
                      placeholder={t.labelPlaceholder}
                      value={draft.label}
                      onChange={(e) => setDraft(providerId, { label: e.target.value })}
                    />
                  </label>
                  <label className="admin-field md:col-span-2">
                    <span className="admin-field-label">{t.testModel}</span>
                    <select
                      className="profile-input font-mono-data text-xs"
                      value={draft.testModel || providerMeta.default_model}
                      onChange={(e) => setDraft(providerId, { testModel: e.target.value })}
                    >
                      {providerMeta.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p className="text-[11px] text-muted-foreground">{t.priorityHint}</p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="admin-primary-btn"
                    disabled={Boolean(busy)}
                    onClick={() => void handleSave(providerId)}
                  >
                    {working === `save:${providerId}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {t.saveKey}
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-btn"
                    disabled={Boolean(busy) || (!draft.apiKey.trim() && !providerMeta.configured)}
                    onClick={() => void handleTest(providerId, providerMeta)}
                  >
                    {working === `test:${providerId}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlugZap className="h-3.5 w-3.5" />
                    )}
                    {draft.apiKey.trim() ? t.testDraft : t.testActive}
                  </button>
                  {rows.length ? (
                    <button
                      type="button"
                      className="admin-secondary-btn text-destructive"
                      disabled={Boolean(busy)}
                      onClick={() => void handleClear(providerId)}
                    >
                      {t.clearAdminKeys}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
