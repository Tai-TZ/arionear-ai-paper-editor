from __future__ import annotations

from pydantic import BaseModel, Field


class LlmLimits(BaseModel):
    daily_token_max: int = Field(default=100_000, ge=0, le=10_000_000)
    monthly_cost_cap_usd: float = Field(default=25.0, ge=0, le=10_000)
    rate_limit_per_min: int = Field(default=20, ge=1, le=500)
    llm_enabled: bool = True


class LlmGlobalDefaults(BaseModel):
    daily_token_max: int = Field(default=100_000, ge=0, le=10_000_000)
    monthly_cost_cap_usd: float = Field(default=25.0, ge=0, le=10_000)
    rate_limit_per_min: int = Field(default=20, ge=1, le=500)
    min_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    max_temperature: float = Field(default=2.0, ge=0.0, le=2.0)
    default_temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    estimated_cost_per_1k_tokens_usd: float = Field(default=0.002, ge=0, le=1.0)


class AdminUserUsage(BaseModel):
    total_tokens: int = 0
    session_count: int = 0
    estimated_cost_usd: float = 0.0
    # Windowed — used for accurate quota comparison
    today_tokens: int = 0
    month_tokens: int = 0
    month_cost_usd: float = 0.0


class AdminUserRow(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    is_god_admin: bool = False
    provider: str
    affiliation: str | None = None
    created_at: str | None = None
    last_active_at: str | None = None
    llm_limits: LlmLimits
    usage: AdminUserUsage


class AdminUserListResponse(BaseModel):
    users: list[AdminUserRow]
    total: int


class AdminUserPatch(BaseModel):
    role: str | None = Field(default=None, pattern=r"^(RESEARCHER|ADMIN)$")
    is_active: bool | None = None
    llm_limits: LlmLimits | None = None


class AdminUsageSummary(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_tokens: int
    total_sessions: int
    estimated_total_cost_usd: float
    # Windowed aggregates for dashboard cards
    today_tokens: int = 0
    month_cost_usd: float = 0.0
    # Quota alerts — counted against correct windows (today vs daily cap, month vs monthly cap)
    users_over_token_cap: int
    users_over_cost_cap: int


class AdminRecentUserRow(BaseModel):
    id: str
    name: str
    email: str
    provider: str
    role: str
    created_at: str | None = None
    last_active_at: str | None = None


class AdminModelUsageRow(BaseModel):
    provider: str
    model: str
    session_count: int
    tokens: int


class AdminUserModelPreferenceRow(BaseModel):
    provider: str
    model: str
    user_count: int


class AdminOverviewResponse(BaseModel):
    summary: AdminUsageSummary
    new_users_1d: int
    new_users_7d: int
    new_users_30d: int
    recent_users: list[AdminRecentUserRow]
    session_model_usage: list[AdminModelUsageRow]
    user_model_preferences: list[AdminUserModelPreferenceRow]


class AdminCostReportRow(BaseModel):
    user_id: str
    name: str
    email: str
    tokens: int
    sessions: int
    estimated_cost_usd: float
    monthly_cost_cap_usd: float
    pct_of_cap: float


class AdminCostReport(BaseModel):
    month: str
    rate_per_1k_tokens_usd: float
    total_tokens: int
    total_cost_usd: float
    active_users_with_usage: int
    rows: list[AdminCostReportRow]


class LlmModelOption(BaseModel):
    id: str
    label: str


class LlmProviderStatus(BaseModel):
    id: str
    label: str
    configured: bool
    default_model: str
    models: list[LlmModelOption] = Field(default_factory=list)


class LlmGlobalConfigResponse(BaseModel):
    default_provider: str
    default_model: str
    temperature: float
    integrity_strictness: str
    max_style_retries: int
    providers: list[LlmProviderStatus]
    defaults: LlmGlobalDefaults


class LlmGlobalDefaultsPatch(BaseModel):
    defaults: LlmGlobalDefaults


class ProviderKeyRow(BaseModel):
    id: str
    provider: str
    priority: int
    label: str | None = None
    key_hint: str
    is_active: bool
    source: str = "admin"
    last_verified_at: str | None = None
    last_error: str | None = None
    updated_at: str | None = None


class ProviderKeyListResponse(BaseModel):
    keys: list[ProviderKeyRow]
    env_fallback_configured: dict[str, bool] = Field(default_factory=dict)
    providers: list[LlmProviderStatus] = Field(default_factory=list)


class ProviderKeyUpsertRequest(BaseModel):
    api_key: str = Field(min_length=8, max_length=512)
    priority: int = Field(default=0, ge=0, le=9)
    label: str | None = Field(default=None, max_length=64)
    is_active: bool = True


class ProviderKeyTestRequest(BaseModel):
    api_key: str | None = Field(default=None, max_length=512)
    key_id: str | None = None
    model: str | None = None


class ProviderKeyTestResponse(BaseModel):
    ok: bool
    message: str
    latency_ms: int | None = None
    provider: str
    key_hint: str | None = None
