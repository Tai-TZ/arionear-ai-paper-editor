import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireAdmin, verifyGodAdmin } from "@/lib/require-auth";
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import {
  AlertCircle,
  Brain,
  Coins,
  Gauge,
  Loader2,
  Save,
  Search,
  Shield,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { getSession, signOut } from "@/lib/auth-store";
import { authToast } from "@/lib/auth-toast";
import { WorkspacePanelSkeleton } from "@/components/workspace/workspace-content-skeleton";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminMonthPicker } from "@/components/admin/admin-month-picker";
import { AdminTemplatesPanel } from "@/components/admin/admin-templates-panel";
import { AdminProviderKeysPanel } from "@/components/admin/admin-provider-keys-panel";
import type { AdminNavTab } from "@/components/admin/admin-sidebar";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchAdminCostReport,
  fetchAdminLlmConfig,
  fetchAdminOverview,
  AdminApiError,
  fetchAdminUsers,
  patchAdminLlmDefaults,
  patchAdminUser,
  type AdminCostReport,
  type AdminOverviewResponse,
  type AdminUserRow,
  type AdminUsageSummary,
  type LlmGlobalConfig,
  type LlmGlobalDefaults,
  type LlmLimits,
} from "@/lib/api/admin-api";
import { toast } from "sonner";
import { useLocale } from "@/components/locale-context";
import { adminCopy, adminLocaleTag } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    await requireAdmin();
  },
  head: () => ({
    meta: [
      { title: "Admin Console — Edico" },
      {
        name: "description",
        content: "Manage users, LLM quotas, token limits, and platform usage.",
      },
    ],
  }),
  component: AdminPage,
});

type AdminTab = AdminNavTab;

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatAdminNumber(n: number, localeTag = "en-US") {
  return new Intl.NumberFormat(localeTag).format(n);
}

function formatAdminUsd(n: number, localeTag = "en-US") {
  return new Intl.NumberFormat(localeTag, { style: "currency", currency: "USD" }).format(n);
}

function formatDate(iso: string | null | undefined, localeTag: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(localeTag, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function CapMeter({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const tone = pct >= 100 ? "warn" : pct >= 75 ? "high" : "ok";
  return (
    <div className="admin-cap-meter">
      <div className="admin-cap-meter-track" aria-hidden>
        <div className={`admin-cap-meter-fill is-${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className={`admin-cap-meter-label${pct >= 100 ? " is-warn" : ""}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function formatRoleLabel(role: string, t: ReturnType<typeof adminCopy>) {
  if (role === "ADMIN") return t.roleAdmin;
  if (role === "RESEARCHER") return t.roleResearcher;
  return role;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent?: boolean;
}) {
  return (
    <article className={`admin-stat-card${accent ? " admin-stat-card-accent" : ""}`}>
      <div className="admin-stat-icon">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </div>
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {hint ? <p className="admin-stat-hint">{hint}</p> : null}
    </article>
  );
}

function isAdminAccessDenied(error: unknown): boolean {
  return error instanceof AdminApiError && (error.status === 401 || error.status === 403);
}

function AdminPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => adminCopy(locale), [locale]);
  const localeTag = useMemo(() => adminLocaleTag(locale), [locale]);
  const tRef = useRef(t);
  tRef.current = t;
  const fmtNum = useCallback((n: number) => formatAdminNumber(n, localeTag), [localeTag]);
  const fmtUsd = useCallback((n: number) => formatAdminUsd(n, localeTag), [localeTag]);
  const [sessionUser, setSessionUser] = useState(() => getSession());
  const [accessDenied, setAccessDenied] = useState(false);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [summary, setSummary] = useState<AdminUsageSummary | null>(null);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [llmConfig, setLlmConfig] = useState<LlmGlobalConfig | null>(null);
  const [defaultsDraft, setDefaultsDraft] = useState<LlmGlobalDefaults | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [limitsDraft, setLimitsDraft] = useState<LlmLimits | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [costMonth, setCostMonth] = useState(currentMonthValue);
  const [costReport, setCostReport] = useState<AdminCostReport | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [hideCostZero, setHideCostZero] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{
    user: AdminUserRow;
    kind: "disable" | "enable" | "promote" | "demote";
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userRows, usageOverview, config] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminOverview(),
        fetchAdminLlmConfig(),
      ]);
      setUsers(userRows);
      setOverview(usageOverview);
      setSummary(usageOverview.summary);
      setLlmConfig(config);
      setDefaultsDraft({ ...config.defaults });
      setLoadError(null);
    } catch (e) {
      if (isAdminAccessDenied(e)) {
        setAccessDenied(true);
        return;
      }
      setLoadError(e instanceof Error ? e.message : tRef.current.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCostReport = useCallback(async (monthValue: string, includeUnused: boolean) => {
    const [yearStr, monthStr] = monthValue.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return;

    setCostLoading(true);
    try {
      const report = await fetchAdminCostReport(year, month, includeUnused);
      setCostReport(report);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tRef.current.costLoadError);
    } finally {
      setCostLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void verifyGodAdmin().then((user) => {
      if (cancelled) return;
      if (!user) {
        setAccessDenied(true);
        return;
      }
      setSessionUser(user);
      void loadData();
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  useEffect(() => {
    if (!accessDenied) return;
    void navigate({ to: "/projects", replace: true });
  }, [accessDenied, navigate]);

  useEffect(() => {
    if (tab === "cost") {
      void loadCostReport(costMonth, !hideCostZero);
    }
  }, [tab, costMonth, hideCostZero, loadCostReport]);

  const defaultsDirty = useMemo(() => {
    if (!llmConfig || !defaultsDraft) return false;
    return JSON.stringify(defaultsDraft) !== JSON.stringify(llmConfig.defaults);
  }, [defaultsDraft, llmConfig]);

  const reloadLlmConfig = useCallback(async () => {
    try {
      const config = await fetchAdminLlmConfig();
      setLlmConfig(config);
    } catch {
      /* overview still valid */
    }
  }, []);

  const handleSignOut = () => {
    signOut();
    authToast.signOutSuccess();
    navigate({ to: "/signin" });
  };

  const handleToggleActive = async (user: AdminUserRow) => {
    setConfirmAction(null);
    setSavingUserId(user.id);
    try {
      const updated = await patchAdminUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(updated.is_active ? t.users.toastEnabled : t.users.toastDisabled);
      void fetchAdminOverview()
        .then((data) => {
          setOverview(data);
          setSummary(data.summary);
        })
        .catch(() => null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.updateFailed);
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleRole = async (user: AdminUserRow) => {
    setConfirmAction(null);
    const nextRole = user.role === "ADMIN" ? "RESEARCHER" : "ADMIN";
    setSavingUserId(user.id);
    try {
      const updated = await patchAdminUser(user.id, { role: nextRole });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(t.users.toastRole(nextRole));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.updateFailed);
    } finally {
      setSavingUserId(null);
    }
  };

  const openLimitsEditor = (user: AdminUserRow) => {
    setEditingUserId(user.id);
    setLimitsDraft({ ...user.llm_limits });
  };

  const saveUserLimits = async () => {
    if (!editingUserId || !limitsDraft) return;
    setSavingUserId(editingUserId);
    try {
      const updated = await patchAdminUser(editingUserId, { llm_limits: limitsDraft });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingUserId(null);
      setLimitsDraft(null);
      toast.success(t.users.limitsSaved);
      void fetchAdminOverview()
        .then((data) => {
          setOverview(data);
          setSummary(data.summary);
        })
        .catch(() => null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.updateFailed);
    } finally {
      setSavingUserId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const saveDefaults = async () => {
    if (!defaultsDraft) return;
    setSavingDefaults(true);
    try {
      const saved = await patchAdminLlmDefaults(defaultsDraft);
      setDefaultsDraft({ ...saved });
      setLlmConfig((prev) => (prev ? { ...prev, defaults: saved } : prev));
      toast.success(t.defaultsSaved);
      void loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.saveFailed);
    } finally {
      setSavingDefaults(false);
    }
  };

  if (accessDenied) {
    return null;
  }

  return (
    <AdminLayout activeTab={tab} onTabChange={setTab} user={sessionUser} onSignOut={handleSignOut}>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="admin-page-header flex shrink-0 items-center justify-between gap-3 px-4 md:px-8">
          <div className="min-w-0">
            <p className="admin-eyebrow">{t.platformControl}</p>
            <h1 className="admin-page-title truncate">{t.tabs[tab]}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {defaultsDirty && tab === "llm" ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {t.unsavedDefaults}
              </span>
            ) : null}
            {tab === "llm" ? (
              <button
                type="button"
                onClick={() => void saveDefaults()}
                disabled={!defaultsDirty || savingDefaults}
                className="admin-primary-btn"
              >
                {savingDefaults ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t.saveDefaults}
              </button>
            ) : null}
            <LanguageToggle compact className="admin-language-toggle" />
            <ThemeToggle compact className="admin-theme-toggle" />
          </div>
        </header>

        {loading ? (
          <WorkspacePanelSkeleton className="flex-1" rows={6} label={t.loading} />
        ) : loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="max-w-md text-center text-sm text-muted-foreground">{loadError}</p>
            <button type="button" className="admin-secondary-btn" onClick={() => void loadData()}>
              {t.retry}
            </button>
          </div>
        ) : (
          <div className="admin-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:px-8 md:py-6">
            {tab === "overview" && summary && overview ? (
              <section className="admin-overview space-y-5">
                <div className="admin-stat-grid">
                  <StatCard
                    label={t.overview.totalUsers}
                    value={fmtNum(summary.total_users)}
                    hint={t.overview.totalUsersHint(summary.active_users, summary.admin_users)}
                    icon={Users}
                  />
                  <StatCard
                    label={t.overview.tokensToday}
                    value={fmtNum(summary.today_tokens)}
                    hint={t.overview.tokensTodayHint(summary.total_tokens, summary.total_sessions)}
                    icon={Zap}
                    accent
                  />
                  <StatCard
                    label={t.overview.monthCost}
                    value={fmtUsd(summary.month_cost_usd)}
                    hint={t.overview.monthCostHint(fmtUsd(summary.estimated_total_cost_usd))}
                    icon={TrendingUp}
                  />
                  <StatCard
                    label={t.overview.quotaWarnings}
                    value={fmtNum(summary.users_over_token_cap + summary.users_over_cost_cap)}
                    hint={t.overview.quotaWarningsHint(
                      summary.users_over_token_cap,
                      summary.users_over_cost_cap,
                    )}
                    icon={Shield}
                  />
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-head">
                    <UserPlus
                      className="h-4 w-4 text-[color:var(--editorial-accent)]"
                      strokeWidth={1.5}
                    />
                    <h2>{t.overview.newUsersTitle}</h2>
                  </div>
                  <div className="admin-panel-body space-y-4">
                    <div className="admin-overview-metrics">
                      <div className="admin-overview-metric">
                        <span className="admin-overview-metric-label">
                          {t.overview.newUsersRecent}
                        </span>
                        <span className="admin-overview-metric-value">
                          {fmtNum(overview.new_users_1d)}
                        </span>
                      </div>
                      <div className="admin-overview-metric">
                        <span className="admin-overview-metric-label">{t.overview.newUsers7d}</span>
                        <span className="admin-overview-metric-value">
                          {fmtNum(overview.new_users_7d)}
                        </span>
                      </div>
                      <div className="admin-overview-metric">
                        <span className="admin-overview-metric-label">
                          {t.overview.newUsers30d}
                        </span>
                        <span className="admin-overview-metric-value">
                          {fmtNum(overview.new_users_30d)}
                        </span>
                      </div>
                    </div>

                    {overview.recent_users.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t.overview.noRecentUsers}</p>
                    ) : (
                      <div className="admin-table-wrap">
                        <Table>
                          <TableHeader>
                            <TableRow className="admin-table-head-row">
                              <TableHead>{t.overview.colUser}</TableHead>
                              <TableHead>{t.overview.colRole}</TableHead>
                              <TableHead>{t.overview.colJoined}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {overview.recent_users.map((user) => (
                              <TableRow key={user.id} className="admin-table-row">
                                <TableCell>
                                  <div className="admin-user-cell">
                                    <span className="admin-user-name">{user.name}</span>
                                    <span className="admin-user-email">{user.email}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="admin-badge admin-badge-researcher">
                                    {formatRoleLabel(user.role, t)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDate(user.created_at, localeTag)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>

                {llmConfig ? (
                  <div className="admin-panel">
                    <div className="admin-panel-head">
                      <Brain
                        className="h-4 w-4 text-[color:var(--editorial-accent)]"
                        strokeWidth={1.5}
                      />
                      <h2>{t.overview.llmStackTitle}</h2>
                    </div>
                    <div className="admin-panel-body space-y-5">
                      <div className="admin-kv-strip">
                        <div className="admin-kv-item">
                          <span className="admin-field-label">{t.overview.defaultProvider}</span>
                          <span className="admin-field-value">{llmConfig.default_provider}</span>
                        </div>
                        <div className="admin-kv-item">
                          <span className="admin-field-label">{t.overview.defaultModel}</span>
                          <span className="admin-field-value font-mono-data text-sm">
                            {llmConfig.default_model}
                          </span>
                        </div>
                        <div className="admin-kv-item">
                          <span className="admin-field-label">{t.overview.temperature}</span>
                          <span className="admin-field-value">{llmConfig.temperature}</span>
                        </div>
                        <div className="admin-kv-item">
                          <span className="admin-field-label">{t.overview.integrity}</span>
                          <span className="admin-field-value">
                            {llmConfig.integrity_strictness}
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="admin-section-label">{t.overview.providersTitle}</p>
                        <div className="admin-llm-provider-grid">
                          {llmConfig.providers.map((provider) => (
                            <article
                              key={provider.id}
                              className={`admin-llm-provider-card${provider.configured ? " is-configured" : ""}`}
                            >
                              <div className="admin-llm-provider-head">
                                <h3 className="admin-llm-provider-name">{provider.label}</h3>
                                <span
                                  className={`admin-badge${provider.configured ? " admin-badge-active" : " admin-badge-inactive"}`}
                                >
                                  {provider.configured
                                    ? t.overview.configured
                                    : t.overview.notConfigured}
                                </span>
                              </div>
                              <p className="admin-llm-provider-default font-mono-data text-xs">
                                {provider.default_model}
                              </p>
                              <p className="admin-llm-models-label">{t.overview.modelsAvailable}</p>
                              <ul className="admin-model-list">
                                {provider.models.map((model) => {
                                  const isDefault = model.id === provider.default_model;
                                  return (
                                    <li
                                      key={model.id}
                                      className={`admin-model-item${isDefault ? " is-default" : ""}`}
                                    >
                                      <span className="admin-model-id font-mono-data">
                                        {model.id}
                                      </span>
                                      <span className="admin-model-label">{model.label}</span>
                                      {isDefault ? (
                                        <span className="admin-model-default-tag">
                                          {t.overview.defaultBadge}
                                        </span>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {tab === "users" ? (
              <section className="admin-users-section space-y-4">
                <p className="admin-data-note">{t.users.intro}</p>

                <div className="admin-users-toolbar">
                  <label className="admin-search">
                    <Search className="admin-search-icon" strokeWidth={1.5} aria-hidden />
                    <input
                      type="search"
                      placeholder={t.users.searchPlaceholder}
                      aria-label={t.users.searchAria}
                      className="admin-search-input"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </label>
                  <span className="admin-users-count">
                    {t.users.count(filteredUsers.length, users.length)}
                  </span>
                </div>

                {confirmAction ? (
                  <div className="admin-confirm-bar">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="text-sm">
                      {confirmAction.kind === "disable"
                        ? t.users.confirmDisable(confirmAction.user.name)
                        : confirmAction.kind === "enable"
                          ? t.users.confirmEnable(confirmAction.user.name)
                          : confirmAction.kind === "demote"
                            ? t.users.confirmDemote(confirmAction.user.name)
                            : t.users.confirmPromote(confirmAction.user.name)}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        className="admin-secondary-btn"
                        onClick={() => setConfirmAction(null)}
                      >
                        {t.cancel}
                      </button>
                      <button
                        type="button"
                        className="admin-primary-btn"
                        onClick={() => {
                          if (confirmAction.kind === "disable" || confirmAction.kind === "enable") {
                            void handleToggleActive(confirmAction.user);
                          } else {
                            void handleToggleRole(confirmAction.user);
                          }
                        }}
                      >
                        {t.confirm}
                      </button>
                    </div>
                  </div>
                ) : null}

                {filteredUsers.length === 0 ? (
                  <div className="admin-empty-state">
                    <Users className="h-8 w-8 opacity-30" strokeWidth={1.5} />
                    <p className="font-medium">{t.users.emptyTitle}</p>
                    <p className="text-sm text-muted-foreground">{t.users.emptyHint}</p>
                  </div>
                ) : (
                  <div className="admin-table-wrap admin-users-table">
                    <Table>
                      <TableHeader>
                        <TableRow className="admin-table-head-row">
                          <TableHead>{t.users.colResearcher}</TableHead>
                          <TableHead>{t.users.colRole}</TableHead>
                          <TableHead>{t.users.colToday}</TableHead>
                          <TableHead>{t.users.colMonth}</TableHead>
                          <TableHead>{t.users.colStatus}</TableHead>
                          <TableHead className="text-right">{t.users.colActions}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => {
                          const overTokens =
                            (user.usage.today_tokens ?? 0) >= user.llm_limits.daily_token_max;
                          const overCost =
                            (user.usage.month_cost_usd ?? 0) >=
                            user.llm_limits.monthly_cost_cap_usd;
                          const isEditing = editingUserId === user.id;
                          const busy = savingUserId === user.id;

                          return (
                            <Fragment key={user.id}>
                              <TableRow className="admin-table-row">
                                <TableCell>
                                  <div className="admin-user-cell min-w-0">
                                    <p className="truncate font-medium">{user.name}</p>
                                    <p className="truncate font-mono-data text-[10px] text-muted-foreground">
                                      {user.email}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`admin-badge ${user.is_god_admin ? "admin-badge-god" : `admin-badge-${user.role.toLowerCase()}`}`}
                                  >
                                    {user.is_god_admin ? t.godAdmin : formatRoleLabel(user.role, t)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="admin-metric-cell">
                                    <p
                                      className={`font-mono-data text-sm font-medium${overTokens ? " text-amber-600 dark:text-amber-400" : ""}`}
                                    >
                                      {fmtNum(user.usage.today_tokens ?? 0)}
                                      <span className="text-[10px] font-normal text-muted-foreground">
                                        {" "}
                                        tok
                                      </span>
                                    </p>
                                    <p className="admin-metric-cap">
                                      {t.users.dailyCap(fmtNum(user.llm_limits.daily_token_max))}
                                    </p>
                                    {overTokens ? (
                                      <span className="admin-badge admin-badge-warn mt-1">
                                        {t.users.overDaily}
                                      </span>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="admin-metric-cell">
                                    <p
                                      className={`font-mono-data text-sm font-medium${overCost ? " text-amber-600 dark:text-amber-400" : ""}`}
                                    >
                                      {fmtUsd(user.usage.month_cost_usd ?? 0)}
                                    </p>
                                    <p className="admin-metric-cap">
                                      {t.users.monthlyCap(
                                        fmtUsd(user.llm_limits.monthly_cost_cap_usd),
                                      )}
                                    </p>
                                    {overCost ? (
                                      <span className="admin-badge admin-badge-warn mt-1">
                                        {t.users.overMonthly}
                                      </span>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`admin-badge ${user.is_active ? "admin-badge-active" : "admin-badge-inactive"}`}
                                  >
                                    {user.is_active ? t.users.active : t.users.inactive}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="admin-row-actions">
                                    <button
                                      type="button"
                                      className="admin-action-chip"
                                      disabled={busy}
                                      onClick={() => openLimitsEditor(user)}
                                    >
                                      {t.users.limits}
                                    </button>
                                    {!user.is_god_admin ? (
                                      <>
                                        <button
                                          type="button"
                                          className="admin-action-chip"
                                          disabled={busy}
                                          onClick={() =>
                                            setConfirmAction({
                                              user,
                                              kind: user.role === "ADMIN" ? "demote" : "promote",
                                            })
                                          }
                                        >
                                          {user.role === "ADMIN" ? t.users.demote : t.users.promote}
                                        </button>
                                        <button
                                          type="button"
                                          className={`admin-action-chip${user.is_active ? " is-danger" : ""}`}
                                          disabled={busy}
                                          onClick={() =>
                                            setConfirmAction({
                                              user,
                                              kind: user.is_active ? "disable" : "enable",
                                            })
                                          }
                                        >
                                          {user.is_active ? t.users.disable : t.users.enable}
                                        </button>
                                      </>
                                    ) : (
                                      <span className="admin-protected-label">
                                        {t.protectedAccount}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                              {isEditing && limitsDraft ? (
                                <TableRow className="admin-limits-edit-row">
                                  <TableCell colSpan={6}>
                                    <div className="admin-limits-editor">
                                      <p className="admin-limits-title">
                                        {t.users.editLimits} — {user.name}
                                      </p>
                                      <div className="admin-limits-grid">
                                        <label className="admin-field">
                                          <span className="admin-field-label">
                                            {t.users.dailyTokenMax}
                                          </span>
                                          <input
                                            type="number"
                                            className="profile-input"
                                            min={0}
                                            value={limitsDraft.daily_token_max}
                                            onChange={(e) =>
                                              setLimitsDraft((d) =>
                                                d
                                                  ? {
                                                      ...d,
                                                      daily_token_max: Number(e.target.value),
                                                    }
                                                  : d,
                                              )
                                            }
                                          />
                                        </label>
                                        <label className="admin-field">
                                          <span className="admin-field-label">
                                            {t.users.monthlyCostCap}
                                          </span>
                                          <input
                                            type="number"
                                            className="profile-input"
                                            min={0}
                                            step={0.01}
                                            value={limitsDraft.monthly_cost_cap_usd}
                                            onChange={(e) =>
                                              setLimitsDraft((d) =>
                                                d
                                                  ? {
                                                      ...d,
                                                      monthly_cost_cap_usd: Number(e.target.value),
                                                    }
                                                  : d,
                                              )
                                            }
                                          />
                                        </label>
                                        <label className="admin-field">
                                          <span className="admin-field-label">
                                            {t.users.rateLimit}
                                          </span>
                                          <input
                                            type="number"
                                            className="profile-input"
                                            min={1}
                                            value={limitsDraft.rate_limit_per_min}
                                            onChange={(e) =>
                                              setLimitsDraft((d) =>
                                                d
                                                  ? {
                                                      ...d,
                                                      rate_limit_per_min: Number(e.target.value),
                                                    }
                                                  : d,
                                              )
                                            }
                                          />
                                        </label>
                                        <label className="admin-field admin-field-switch">
                                          <span className="admin-field-label">
                                            {t.users.llmEnabled}
                                          </span>
                                          <Switch
                                            checked={limitsDraft.llm_enabled}
                                            onCheckedChange={(checked) =>
                                              setLimitsDraft((d) =>
                                                d ? { ...d, llm_enabled: checked } : d,
                                              )
                                            }
                                          />
                                        </label>
                                      </div>
                                      <div className="admin-limits-actions">
                                        <button
                                          type="button"
                                          className="admin-secondary-btn"
                                          onClick={() => {
                                            setEditingUserId(null);
                                            setLimitsDraft(null);
                                          }}
                                        >
                                          {t.cancel}
                                        </button>
                                        <button
                                          type="button"
                                          className="admin-primary-btn"
                                          disabled={busy}
                                          onClick={() => void saveUserLimits()}
                                        >
                                          {busy ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Save className="h-4 w-4" />
                                          )}
                                          {t.users.saveLimits}
                                        </button>
                                      </div>
                                      <p className="admin-field-hint">
                                        {t.users.lastActive}:{" "}
                                        {formatDate(user.last_active_at, localeTag)} ·{" "}
                                        {t.users.joined}: {formatDate(user.created_at, localeTag)}
                                      </p>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            ) : null}

            {tab === "cost" ? (
              <section className="admin-cost-section space-y-5">
                <p className="admin-data-note">{t.cost.intro}</p>

                {costReport ? (
                  <div className="admin-cost-hero">
                    <article className="admin-cost-stat">
                      <p className="admin-cost-stat-label">{t.cost.totalCost}</p>
                      <p className="admin-cost-stat-value">{fmtUsd(costReport.total_cost_usd)}</p>
                    </article>
                    <article className="admin-cost-stat">
                      <p className="admin-cost-stat-label">{t.cost.totalTokens}</p>
                      <p className="admin-cost-stat-value font-mono-data">
                        {fmtNum(costReport.total_tokens)}
                      </p>
                    </article>
                    <article className="admin-cost-stat">
                      <p className="admin-cost-stat-label">{t.cost.activeUsers}</p>
                      <p className="admin-cost-stat-value">
                        {fmtNum(costReport.active_users_with_usage)}
                      </p>
                      <p className="admin-cost-stat-hint">
                        {t.cost.usersWithUsage(costReport.active_users_with_usage)}
                      </p>
                    </article>
                    <article className="admin-cost-stat">
                      <p className="admin-cost-stat-label">{t.cost.rateLabel}</p>
                      <p className="admin-cost-stat-value font-mono-data">
                        ${costReport.rate_per_1k_tokens_usd}/1k
                      </p>
                    </article>
                  </div>
                ) : null}

                <div className="admin-cost-controls">
                  <label className="admin-field admin-cost-month-field">
                    <span className="admin-field-label">{t.cost.reportMonth}</span>
                    <AdminMonthPicker
                      value={costMonth}
                      onChange={setCostMonth}
                      localeTag={localeTag}
                      ariaLabel={t.cost.monthSelectAria}
                      placeholder={t.cost.pickMonth}
                    />
                  </label>
                  <label className="admin-cost-toggle">
                    <Switch checked={hideCostZero} onCheckedChange={setHideCostZero} />
                    <span>{t.cost.hideUnused}</span>
                  </label>
                </div>

                {costLoading ? (
                  <WorkspacePanelSkeleton className="py-4" rows={4} label={t.cost.loading} />
                ) : costReport ? (
                  costReport.rows.length === 0 ? (
                    <div className="admin-empty-state">
                      <Coins className="h-8 w-8 opacity-30" strokeWidth={1.5} />
                      <p className="font-medium">{t.cost.emptyTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        {hideCostZero ? t.cost.emptyHintNoUsage : t.cost.emptyHintFiltered}
                      </p>
                    </div>
                  ) : (
                    <div className="admin-table-wrap admin-cost-table">
                      <Table>
                        <TableHeader>
                          <TableRow className="admin-table-head-row">
                            <TableHead>{t.cost.colResearcher}</TableHead>
                            <TableHead className="text-right">{t.cost.colSessions}</TableHead>
                            <TableHead className="text-right">{t.cost.colTokens}</TableHead>
                            <TableHead className="text-right">{t.cost.colCost}</TableHead>
                            <TableHead className="text-right">{t.cost.colMonthlyCap}</TableHead>
                            <TableHead>{t.cost.colPctCap}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {costReport.rows.map((row) => (
                            <TableRow
                              key={row.user_id}
                              className={`admin-table-row${row.pct_of_cap >= 100 ? " admin-table-row-warn" : ""}`}
                            >
                              <TableCell>
                                <div className="admin-user-cell min-w-0">
                                  <p className="truncate font-medium">{row.name}</p>
                                  <p className="truncate font-mono-data text-[10px] text-muted-foreground">
                                    {row.email}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono-data text-sm">
                                {fmtNum(row.sessions)}
                              </TableCell>
                              <TableCell className="text-right font-mono-data text-sm">
                                {fmtNum(row.tokens)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {fmtUsd(row.estimated_cost_usd)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {fmtUsd(row.monthly_cost_cap_usd)}
                              </TableCell>
                              <TableCell className="min-w-[8.5rem]">
                                <CapMeter pct={row.pct_of_cap} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                ) : null}
              </section>
            ) : null}

            {tab === "llmKeys" ? (
              <AdminProviderKeysPanel onKeysChanged={() => void reloadLlmConfig()} />
            ) : null}

            {tab === "llm" && llmConfig && defaultsDraft ? (
              <section className="space-y-6">
                <p className="admin-data-note">{t.llm.intro}</p>

                <div className="admin-panel">
                  <div className="admin-panel-head">
                    <Brain
                      className="h-4 w-4 text-[color:var(--editorial-accent)]"
                      strokeWidth={1.5}
                    />
                    <h2>{t.llm.providerStatusTitle}</h2>
                  </div>
                  <div className="admin-provider-list">
                    {llmConfig.providers.map((p) => (
                      <div key={p.id} className="admin-provider-card">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{p.label}</p>
                          <span
                            className={`admin-badge ${p.configured ? "admin-badge-active" : "admin-badge-inactive"}`}
                          >
                            {p.configured ? t.llm.configured : t.llm.missingKey}
                          </span>
                        </div>
                        <p className="mt-1 font-mono-data text-[11px] text-muted-foreground">
                          {p.default_model}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-head">
                    <Gauge
                      className="h-4 w-4 text-[color:var(--editorial-accent)]"
                      strokeWidth={1.5}
                    />
                    <h2>{t.llm.globalDefaultsTitle}</h2>
                  </div>
                  <div className="admin-panel-body admin-limits-grid">
                    <label className="admin-field">
                      <span className="admin-field-label">{t.llm.dailyTokenMax}</span>
                      <input
                        type="number"
                        className="profile-input"
                        value={defaultsDraft.daily_token_max}
                        onChange={(e) =>
                          setDefaultsDraft((d) =>
                            d ? { ...d, daily_token_max: Number(e.target.value) } : d,
                          )
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field-label">{t.llm.monthlyCostCap}</span>
                      <input
                        type="number"
                        className="profile-input"
                        step={0.01}
                        value={defaultsDraft.monthly_cost_cap_usd}
                        onChange={(e) =>
                          setDefaultsDraft((d) =>
                            d ? { ...d, monthly_cost_cap_usd: Number(e.target.value) } : d,
                          )
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field-label">{t.llm.rateLimit}</span>
                      <input
                        type="number"
                        className="profile-input"
                        value={defaultsDraft.rate_limit_per_min}
                        onChange={(e) =>
                          setDefaultsDraft((d) =>
                            d ? { ...d, rate_limit_per_min: Number(e.target.value) } : d,
                          )
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field-label">{t.llm.costPer1k}</span>
                      <input
                        type="number"
                        className="profile-input"
                        step={0.0001}
                        value={defaultsDraft.estimated_cost_per_1k_tokens_usd}
                        onChange={(e) =>
                          setDefaultsDraft((d) =>
                            d
                              ? { ...d, estimated_cost_per_1k_tokens_usd: Number(e.target.value) }
                              : d,
                          )
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field-label">{t.llm.minTemperature}</span>
                      <input
                        type="number"
                        className="profile-input"
                        step={0.1}
                        min={0}
                        max={2}
                        value={defaultsDraft.min_temperature}
                        onChange={(e) =>
                          setDefaultsDraft((d) =>
                            d ? { ...d, min_temperature: Number(e.target.value) } : d,
                          )
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field-label">{t.llm.maxTemperature}</span>
                      <input
                        type="number"
                        className="profile-input"
                        step={0.1}
                        min={0}
                        max={2}
                        value={defaultsDraft.max_temperature}
                        onChange={(e) =>
                          setDefaultsDraft((d) =>
                            d ? { ...d, max_temperature: Number(e.target.value) } : d,
                          )
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span className="admin-field-label">{t.llm.defaultTemperature}</span>
                      <input
                        type="number"
                        className="profile-input"
                        step={0.1}
                        min={defaultsDraft.min_temperature}
                        max={defaultsDraft.max_temperature}
                        value={defaultsDraft.default_temperature}
                        onChange={(e) =>
                          setDefaultsDraft((d) =>
                            d ? { ...d, default_temperature: Number(e.target.value) } : d,
                          )
                        }
                      />
                    </label>
                  </div>
                  <p className="admin-panel-foot">
                    {t.llm.serverEnvFoot(llmConfig.default_provider, llmConfig.max_style_retries)}
                  </p>
                </div>
              </section>
            ) : null}

            {tab === "templates" ? <AdminTemplatesPanel /> : null}
          </div>
        )}
      </main>
    </AdminLayout>
  );
}
