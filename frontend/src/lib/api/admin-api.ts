import { getAccessToken } from "@/lib/auth-store";
import { resolveApiBase } from "@/lib/api/base-url";
import { mapApiHttpError } from "@/lib/api/api-errors";
import { fetchDedupe, invalidateFetchPrefix } from "@/lib/api/fetch-dedupe";

const API_BASE = resolveApiBase();

export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

export type LlmLimits = {
  daily_token_max: number;
  monthly_cost_cap_usd: number;
  rate_limit_per_min: number;
  llm_enabled: boolean;
};

export type AdminUserUsage = {
  total_tokens: number;
  session_count: number;
  estimated_cost_usd: number;
  today_tokens: number;
  month_tokens: number;
  month_cost_usd: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: "RESEARCHER" | "ADMIN";
  is_active: boolean;
  is_god_admin?: boolean;
  provider: string;
  affiliation?: string | null;
  created_at?: string | null;
  last_active_at?: string | null;
  llm_limits: LlmLimits;
  usage: AdminUserUsage;
};

export type AdminUsageSummary = {
  total_users: number;
  active_users: number;
  admin_users: number;
  total_tokens: number;
  total_sessions: number;
  estimated_total_cost_usd: number;
  today_tokens: number;
  month_cost_usd: number;
  users_over_token_cap: number;
  users_over_cost_cap: number;
};

export type AdminRecentUserRow = {
  id: string;
  name: string;
  email: string;
  provider: string;
  role: string;
  created_at?: string | null;
  last_active_at?: string | null;
};

export type AdminModelUsageRow = {
  provider: string;
  model: string;
  session_count: number;
  tokens: number;
};

export type AdminUserModelPreferenceRow = {
  provider: string;
  model: string;
  user_count: number;
};

export type AdminOverviewResponse = {
  summary: AdminUsageSummary;
  new_users_1d: number;
  new_users_7d: number;
  new_users_30d: number;
  recent_users: AdminRecentUserRow[];
  session_model_usage: AdminModelUsageRow[];
  user_model_preferences: AdminUserModelPreferenceRow[];
};

export type AdminCostReportRow = {
  user_id: string;
  name: string;
  email: string;
  tokens: number;
  sessions: number;
  estimated_cost_usd: number;
  monthly_cost_cap_usd: number;
  pct_of_cap: number;
};

export type AdminCostReport = {
  month: string;
  rate_per_1k_tokens_usd: number;
  total_tokens: number;
  total_cost_usd: number;
  active_users_with_usage: number;
  rows: AdminCostReportRow[];
};

export type LlmModelOption = {
  id: string;
  label: string;
};

export type LlmProviderStatus = {
  id: string;
  label: string;
  configured: boolean;
  default_model: string;
  models: LlmModelOption[];
};

export type LlmGlobalDefaults = {
  daily_token_max: number;
  monthly_cost_cap_usd: number;
  rate_limit_per_min: number;
  min_temperature: number;
  max_temperature: number;
  default_temperature: number;
  estimated_cost_per_1k_tokens_usd: number;
};

export type LlmGlobalConfig = {
  default_provider: string;
  default_model: string;
  temperature: number;
  integrity_strictness: string;
  max_style_retries: number;
  providers: LlmProviderStatus[];
  defaults: LlmGlobalDefaults;
};

export type ProviderKeyRow = {
  id: string;
  provider: string;
  priority: number;
  label?: string | null;
  key_hint: string;
  is_active: boolean;
  source: string;
  last_verified_at?: string | null;
  last_error?: string | null;
  updated_at?: string | null;
};

export type ProviderKeyListResponse = {
  keys: ProviderKeyRow[];
  env_fallback_configured: Record<string, boolean>;
  providers: LlmProviderStatus[];
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running.");
  }

  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new AdminApiError(mapApiHttpError(res.status, detail), res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const data = await fetchDedupe("admin:users", () =>
    adminFetch<{ users: AdminUserRow[] }>("/admin/users"),
  );
  return data.users;
}

export async function fetchAdminOverview(): Promise<AdminOverviewResponse> {
  return fetchDedupe("admin:overview", () => adminFetch<AdminOverviewResponse>("/admin/overview"));
}

export async function fetchAdminCostReport(
  year: number,
  month: number,
  includeUnused = false,
): Promise<AdminCostReport> {
  const key = `admin:cost:${year}-${month}:${includeUnused ? "all" : "used"}`;
  return fetchDedupe(key, () =>
    adminFetch<AdminCostReport>(
      `/admin/usage/cost-report?year=${year}&month=${month}&include_unused=${includeUnused}`,
    ),
  );
}

export async function fetchAdminLlmConfig(): Promise<LlmGlobalConfig> {
  return fetchDedupe("admin:llm", () => adminFetch<LlmGlobalConfig>("/admin/llm/config"));
}

export async function patchAdminUser(
  userId: string,
  patch: {
    role?: AdminUserRow["role"];
    is_active?: boolean;
    llm_limits?: LlmLimits;
  },
): Promise<AdminUserRow> {
  const user = await adminFetch<AdminUserRow>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  invalidateFetchPrefix("admin:");
  return user;
}

export async function patchAdminLlmDefaults(
  defaults: LlmGlobalDefaults,
): Promise<LlmGlobalDefaults> {
  const data = await adminFetch<LlmGlobalDefaults>("/admin/llm/defaults", {
    method: "PATCH",
    body: JSON.stringify({ defaults }),
  });
  invalidateFetchPrefix("admin:");
  return data;
}

export async function fetchAdminProviderKeys(provider?: string): Promise<ProviderKeyListResponse> {
  const qs = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  return fetchDedupe(`admin:llm-keys${qs}`, () =>
    adminFetch<ProviderKeyListResponse>(`/admin/llm/keys${qs}`),
  );
}

export async function saveAdminProviderKey(
  provider: string,
  body: { api_key: string; priority?: number; label?: string; is_active?: boolean },
): Promise<ProviderKeyRow> {
  const row = await adminFetch<ProviderKeyRow>(`/admin/llm/keys/${provider}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  invalidateFetchPrefix("admin:");
  return row;
}

export async function deleteAdminProviderKey(keyId: string): Promise<void> {
  await adminFetch<void>(`/admin/llm/keys/${keyId}`, { method: "DELETE" });
  invalidateFetchPrefix("admin:");
}

export async function clearAdminProviderKeys(provider: string): Promise<void> {
  await adminFetch<void>(`/admin/llm/keys/provider/${provider}`, { method: "DELETE" });
  invalidateFetchPrefix("admin:");
}

export async function testAdminProviderKey(
  provider: string,
  body: { api_key?: string; key_id?: string; model?: string },
): Promise<{
  ok: boolean;
  message: string;
  latency_ms?: number | null;
  provider: string;
  key_hint?: string | null;
}> {
  return adminFetch(`/admin/llm/keys/${provider}/test`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
