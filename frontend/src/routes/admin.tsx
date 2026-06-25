import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/require-auth";
import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import {
  AlertCircle,
  Brain,
  Coins,
  Gauge,
  Loader2,
  Save,
  Shield,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { getSession, refreshSession, signOut } from "@/lib/auth-store";
import { authToast } from "@/lib/auth-toast";
import { WorkspacePanelSkeleton } from "@/components/workspace/workspace-content-skeleton";
import { AdminLayout } from "@/components/admin/admin-layout";
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
  fetchAdminUsageSummary,
  fetchAdminUsers,
  patchAdminLlmDefaults,
  patchAdminUser,
  type AdminCostReport,
  type AdminUserRow,
  type AdminUsageSummary,
  type LlmGlobalConfig,
  type LlmGlobalDefaults,
  type LlmLimits,
} from "@/lib/api/admin-api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: () => {
    requireAdmin();
  },
  head: () => ({
    meta: [
      { title: "Admin Console — Arionear" },
      {
        name: "description",
        content: "Manage users, LLM quotas, token limits, and platform usage.",
      },
    ],
  }),
  component: AdminPage,
});

type AdminTab = AdminNavTab;

const TAB_TITLES: Record<AdminTab, string> = {
  overview: "Overview",
  users: "Users & Quotas",
  cost: "Cost Report",
  llm: "LLM Policy",
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(n);
}

function formatUsd(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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

function AdminPage() {
  const navigate = useNavigate();
  const [sessionUser, setSessionUser] = useState(() => getSession());
  const [tab, setTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [summary, setSummary] = useState<AdminUsageSummary | null>(null);
  const [llmConfig, setLlmConfig] = useState<LlmGlobalConfig | null>(null);
  const [defaultsDraft, setDefaultsDraft] = useState<LlmGlobalDefaults | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [limitsDraft, setLimitsDraft] = useState<LlmLimits | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [costMonth, setCostMonth] = useState(currentMonthValue);
  const [costReport, setCostReport] = useState<AdminCostReport | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userRows, usage, config] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminUsageSummary(),
        fetchAdminLlmConfig(),
      ]);
      setUsers(userRows);
      setSummary(usage);
      setLlmConfig(config);
      setDefaultsDraft({ ...config.defaults });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCostReport = useCallback(async (monthValue: string) => {
    const [yearStr, monthStr] = monthValue.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return;

    setCostLoading(true);
    try {
      const report = await fetchAdminCostReport(year, month);
      setCostReport(report);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load cost report.");
    } finally {
      setCostLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession().then((u) => {
      if (u) setSessionUser(u);
    });
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (tab === "cost") {
      void loadCostReport(costMonth);
    }
  }, [tab, costMonth, loadCostReport]);

  const defaultsDirty = useMemo(() => {
    if (!llmConfig || !defaultsDraft) return false;
    return JSON.stringify(defaultsDraft) !== JSON.stringify(llmConfig.defaults);
  }, [defaultsDraft, llmConfig]);

  const handleSignOut = () => {
    signOut();
    authToast.signOutSuccess();
    navigate({ to: "/signin" });
  };

  const handleToggleActive = async (user: AdminUserRow) => {
    setSavingUserId(user.id);
    try {
      const updated = await patchAdminUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(updated.is_active ? "User activated" : "User deactivated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleRole = async (user: AdminUserRow) => {
    const nextRole = user.role === "ADMIN" ? "RESEARCHER" : "ADMIN";
    setSavingUserId(user.id);
    try {
      const updated = await patchAdminUser(user.id, { role: nextRole });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`Role set to ${nextRole}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
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
      toast.success("LLM limits updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingUserId(null);
    }
  };

  const saveDefaults = async () => {
    if (!defaultsDraft) return;
    setSavingDefaults(true);
    try {
      const saved = await patchAdminLlmDefaults(defaultsDraft);
      setDefaultsDraft({ ...saved });
      setLlmConfig((prev) => (prev ? { ...prev, defaults: saved } : prev));
      toast.success("Global LLM defaults saved");
      void loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingDefaults(false);
    }
  };

  return (
    <AdminLayout
      activeTab={tab}
      onTabChange={setTab}
      user={sessionUser}
      onSignOut={handleSignOut}
    >
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="admin-page-header flex shrink-0 items-center justify-between gap-3 px-4 md:px-8">
          <div className="min-w-0">
            <p className="admin-eyebrow">Platform Control</p>
            <h1 className="admin-page-title truncate">{TAB_TITLES[tab]}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {defaultsDirty && tab === "llm" ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved defaults</span>
            ) : null}
            {tab === "llm" ? (
              <button
                type="button"
                onClick={() => void saveDefaults()}
                disabled={!defaultsDirty || savingDefaults}
                className="admin-primary-btn"
              >
                {savingDefaults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save defaults
              </button>
            ) : null}
            <LanguageToggle compact className="admin-language-toggle" />
            <ThemeToggle compact className="admin-theme-toggle" />
          </div>
        </header>

        {loading ? (
          <WorkspacePanelSkeleton className="flex-1" rows={6} label="Loading admin console…" />
        ) : loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="max-w-md text-center text-sm text-muted-foreground">{loadError}</p>
            <button type="button" className="admin-secondary-btn" onClick={() => void loadData()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="admin-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:px-8 md:py-6">
            {tab === "overview" && summary ? (
              <section className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Monitor platform usage, token consumption, and estimated LLM spend across all researchers.
                  Metrics come from the <code className="font-mono-data text-xs">ai_sessions</code> table — not
                  simulated.
                </p>
                {summary.total_sessions === 0 ? (
                  <p className="admin-data-note">
                    No AI sessions recorded yet. Usage and cost will populate after researchers use the editor chat.
                  </p>
                ) : null}
                <div className="admin-stat-grid">
                  <StatCard
                    label="Total users"
                    value={formatNumber(summary.total_users)}
                    hint={`${summary.active_users} active · ${summary.admin_users} admins`}
                    icon={Users}
                  />
                  <StatCard
                    label="Tokens consumed"
                    value={formatNumber(summary.total_tokens)}
                    hint={`${formatNumber(summary.total_sessions)} AI sessions`}
                    icon={Zap}
                    accent
                  />
                  <StatCard
                    label="Estimated cost"
                    value={formatUsd(summary.estimated_total_cost_usd)}
                    hint="Based on configured per-1k token rate"
                    icon={Coins}
                  />
                  <StatCard
                    label="Quota alerts"
                    value={formatNumber(summary.users_over_token_cap + summary.users_over_cost_cap)}
                    hint={`${summary.users_over_token_cap} over token cap · ${summary.users_over_cost_cap} over cost cap`}
                    icon={Shield}
                  />
                </div>

                {llmConfig ? (
                  <div className="admin-panel">
                    <div className="admin-panel-head">
                      <Sparkles className="h-4 w-4 text-[color:var(--editorial-red)]" strokeWidth={1.5} />
                      <h2>Active LLM stack</h2>
                    </div>
                    <div className="admin-panel-body admin-provider-grid">
                      <div>
                        <p className="admin-field-label">Default provider</p>
                        <p className="admin-field-value">{llmConfig.default_provider}</p>
                      </div>
                      <div>
                        <p className="admin-field-label">Default model</p>
                        <p className="admin-field-value font-mono-data text-sm">{llmConfig.default_model}</p>
                      </div>
                      <div>
                        <p className="admin-field-label">Temperature</p>
                        <p className="admin-field-value">{llmConfig.temperature}</p>
                      </div>
                      <div>
                        <p className="admin-field-label">Integrity</p>
                        <p className="admin-field-value">{llmConfig.integrity_strictness}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {tab === "users" ? (
              <section className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Manage researcher accounts, roles, and per-user LLM quotas. Usage totals aggregate{" "}
                  <code className="font-mono-data text-xs">ai_sessions</code>; limits come from each user&apos;s
                  profile settings (defaults: 100k tokens/day, $25/month).
                </p>
                <div className="admin-table-wrap">
                  <Table>
                    <TableHeader>
                      <TableRow className="admin-table-head-row">
                        <TableHead>Researcher</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Limits</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => {
                        const overTokens = user.usage.total_tokens > user.llm_limits.daily_token_max;
                        const overCost =
                          user.usage.estimated_cost_usd > user.llm_limits.monthly_cost_cap_usd;
                        const isEditing = editingUserId === user.id;
                        const busy = savingUserId === user.id;

                        return (
                          <Fragment key={user.id}>
                            <TableRow className="admin-table-row">
                              <TableCell>
                                <div className="min-w-0">
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
                                  {user.is_god_admin ? "GOD ADMIN" : user.role}
                                </span>
                              </TableCell>
                              <TableCell>
                                <p className="font-mono-data text-xs">
                                  {formatNumber(user.usage.total_tokens)} tok
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {formatUsd(user.usage.estimated_cost_usd)} est.
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-xs">
                                  {formatNumber(user.llm_limits.daily_token_max)} / day
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {formatUsd(user.llm_limits.monthly_cost_cap_usd)} cap
                                </p>
                                {(overTokens || overCost) && (
                                  <span className="admin-badge admin-badge-warn mt-1">Over quota</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`admin-badge ${user.is_active ? "admin-badge-active" : "admin-badge-inactive"}`}
                                >
                                  {user.is_active ? "Active" : "Inactive"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="admin-row-actions">
                                  <button
                                    type="button"
                                    className="admin-link-btn"
                                    disabled={busy}
                                    onClick={() => openLimitsEditor(user)}
                                  >
                                    Limits
                                  </button>
                                  {!user.is_god_admin ? (
                                    <>
                                      <button
                                        type="button"
                                        className="admin-link-btn"
                                        disabled={busy}
                                        onClick={() => void handleToggleRole(user)}
                                      >
                                        {user.role === "ADMIN" ? "Demote" : "Promote"}
                                      </button>
                                      <button
                                        type="button"
                                        className="admin-link-btn"
                                        disabled={busy}
                                        onClick={() => void handleToggleActive(user)}
                                      >
                                        {user.is_active ? "Disable" : "Enable"}
                                      </button>
                                    </>
                                  ) : (
                                    <span className="admin-protected-label">Protected</span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                            {isEditing && limitsDraft ? (
                              <TableRow className="admin-limits-edit-row">
                                <TableCell colSpan={6}>
                                  <div className="admin-limits-editor">
                                    <p className="admin-limits-title">
                                      LLM limits — {user.name}
                                    </p>
                                    <div className="admin-limits-grid">
                                      <label className="admin-field">
                                        <span className="admin-field-label">Daily token max</span>
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
                                        <span className="admin-field-label">Monthly cost cap (USD)</span>
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
                                        <span className="admin-field-label">Requests / minute max</span>
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
                                        <span className="admin-field-label">LLM access enabled</span>
                                        <Switch
                                          checked={limitsDraft.llm_enabled}
                                          onCheckedChange={(checked) =>
                                            setLimitsDraft((d) => (d ? { ...d, llm_enabled: checked } : d))
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
                                        Cancel
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
                                        Save limits
                                      </button>
                                    </div>
                                    <p className="admin-field-hint">
                                      Last active {formatDate(user.last_active_at)} · Joined{" "}
                                      {formatDate(user.created_at)}
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
              </section>
            ) : null}

            {tab === "cost" ? (
              <section className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Monthly estimated LLM spend per researcher. Cost = tokens × configured rate per 1k tokens (LLM
                  Policy tab).
                </p>
                <div className="admin-cost-toolbar">
                  <label className="admin-field admin-cost-month-field">
                    <span className="admin-field-label">Report month</span>
                    <input
                      type="month"
                      className="profile-input admin-month-input"
                      value={costMonth}
                      onChange={(e) => setCostMonth(e.target.value)}
                    />
                  </label>
                  {costReport ? (
                    <div className="admin-cost-summary-pills">
                      <span className="admin-cost-pill">
                        Total: {formatUsd(costReport.total_cost_usd)}
                      </span>
                      <span className="admin-cost-pill">
                        {formatNumber(costReport.total_tokens)} tokens
                      </span>
                      <span className="admin-cost-pill">
                        {costReport.active_users_with_usage} users with usage
                      </span>
                      <span className="admin-cost-pill admin-cost-pill-muted">
                        ${costReport.rate_per_1k_tokens_usd}/1k tok
                      </span>
                    </div>
                  ) : null}
                </div>

                {costLoading ? (
                  <WorkspacePanelSkeleton className="py-4" rows={4} label="Loading cost report…" />
                ) : costReport ? (
                  <div className="admin-table-wrap">
                    <Table>
                      <TableHeader>
                        <TableRow className="admin-table-head-row">
                          <TableHead>Researcher</TableHead>
                          <TableHead>Sessions</TableHead>
                          <TableHead>Tokens</TableHead>
                          <TableHead>Est. cost</TableHead>
                          <TableHead>Monthly cap</TableHead>
                          <TableHead>% of cap</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {costReport.rows.map((row) => (
                          <TableRow key={row.user_id} className="admin-table-row">
                            <TableCell>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{row.name}</p>
                                <p className="truncate font-mono-data text-[10px] text-muted-foreground">
                                  {row.email}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono-data text-sm">{formatNumber(row.sessions)}</TableCell>
                            <TableCell className="font-mono-data text-sm">{formatNumber(row.tokens)}</TableCell>
                            <TableCell className="font-medium">{formatUsd(row.estimated_cost_usd)}</TableCell>
                            <TableCell>{formatUsd(row.monthly_cost_cap_usd)}</TableCell>
                            <TableCell>
                              <span
                                className={`admin-badge ${row.pct_of_cap >= 100 ? "admin-badge-warn" : row.pct_of_cap >= 75 ? "admin-badge-admin" : ""}`}
                              >
                                {row.pct_of_cap.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </section>
            ) : null}

            {tab === "llm" && llmConfig && defaultsDraft ? (
              <section className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Global LLM policy defaults apply to all users without custom limits. Saved values
                  enforce quota on chat (daily tokens, monthly cost cap, rate limit) and set default
                  temperature. Provider API keys remain in server environment variables.
                </p>

                <div className="admin-panel">
                  <div className="admin-panel-head">
                    <Brain className="h-4 w-4 text-[color:var(--editorial-red)]" strokeWidth={1.5} />
                    <h2>Provider status</h2>
                  </div>
                  <div className="admin-provider-list">
                    {llmConfig.providers.map((p) => (
                      <div key={p.id} className="admin-provider-card">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{p.label}</p>
                          <span
                            className={`admin-badge ${p.configured ? "admin-badge-active" : "admin-badge-inactive"}`}
                          >
                            {p.configured ? "Configured" : "Missing key"}
                          </span>
                        </div>
                        <p className="mt-1 font-mono-data text-[11px] text-muted-foreground">{p.default_model}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-head">
                    <Gauge className="h-4 w-4 text-[color:var(--editorial-red)]" strokeWidth={1.5} />
                    <h2>Global defaults & cost model</h2>
                  </div>
                  <div className="admin-panel-body admin-limits-grid">
                    <label className="admin-field">
                      <span className="admin-field-label">Default daily token max</span>
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
                      <span className="admin-field-label">Default monthly cost cap (USD)</span>
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
                      <span className="admin-field-label">Default rate limit / min</span>
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
                      <span className="admin-field-label">Est. cost per 1k tokens (USD)</span>
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
                      <span className="admin-field-label">Min temperature</span>
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
                      <span className="admin-field-label">Max temperature</span>
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
                      <span className="admin-field-label">Default temperature</span>
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
                    Server env: <code className="font-mono-data text-[11px]">LLM_PROVIDER={llmConfig.default_provider}</code>
                    {" · "}
                    <code className="font-mono-data text-[11px]">max_style_retries={llmConfig.max_style_retries}</code>
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </AdminLayout>
  );
}
