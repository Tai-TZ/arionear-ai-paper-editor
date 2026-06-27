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


class LlmProviderStatus(BaseModel):
    id: str
    label: str
    configured: bool
    default_model: str


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
