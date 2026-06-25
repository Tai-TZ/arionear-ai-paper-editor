from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from src.config import get_settings
from src.db.models import AiSession, Paper, User, UserRole
from src.models.admin_schemas import (
    AdminCostReport,
    AdminCostReportRow,
    AdminUsageSummary,
    AdminUserRow,
    AdminUserUsage,
    LlmGlobalConfigResponse,
    LlmGlobalDefaults,
    LlmLimits,
    LlmProviderStatus,
)
from src.services.auth_service import is_god_admin, user_to_dict
from src.services.llm_policy import (
    cost_rate_per_token,
    get_llm_limits_from_profile,
    read_global_defaults,
    set_llm_limits_on_profile,
    write_global_defaults,
)
from src.services.usage_tracking import effective_tokens_expr, resolved_user_id_expr

PROVIDER_LABELS = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "openrouter": "OpenRouter",
    "zai": "Z.AI",
}


def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat()


def _meaningful_session_filter():
    """Ignore empty placeholder sessions created at paper init."""
    return or_(
        AiSession.tokens_used > 0,
        func.coalesce(func.length(AiSession.ai_output), 0) > 0,
        func.coalesce(func.length(AiSession.user_input), 0) > 0,
    )


def _usage_by_user(db: Session, *, month_start=None, month_end=None) -> dict[str, AdminUserUsage]:
    token_expr = effective_tokens_expr()
    query = (
        db.query(
            resolved_user_id_expr().label("uid"),
            func.coalesce(func.sum(token_expr), 0),
            func.count(AiSession.id),
        )
        .outerjoin(Paper, AiSession.paper_id == Paper.id)
        .filter(resolved_user_id_expr().isnot(None))
        .filter(_meaningful_session_filter())
    )
    if month_start is not None and month_end is not None:
        query = query.filter(
            AiSession.created_at >= month_start,
            AiSession.created_at < month_end,
        )
    rows = query.group_by(resolved_user_id_expr()).all()
    rate = cost_rate_per_token()
    out: dict[str, AdminUserUsage] = {}
    for user_id, tokens, count in rows:
        if not user_id:
            continue
        token_int = int(tokens or 0)
        out[str(user_id)] = AdminUserUsage(
            total_tokens=token_int,
            session_count=int(count or 0),
            estimated_cost_usd=round(token_int * rate, 4),
        )
    return out


def list_admin_users(db: Session) -> list[AdminUserRow]:
    usage_map = _usage_by_user(db)
    users = db.query(User).order_by(User.created_at.desc()).all()
    rows: list[AdminUserRow] = []
    for user in users:
        base = user_to_dict(user)
        uid = str(user.id)
        usage = usage_map.get(uid, AdminUserUsage())
        rows.append(
            AdminUserRow(
                id=uid,
                email=user.email,
                name=user.full_name,
                role=user.role.value if isinstance(user.role, UserRole) else str(user.role),
                is_active=bool(user.is_active),
                is_god_admin=is_god_admin(user),
                provider=base["provider"],
                affiliation=user.institution,
                created_at=_iso(user.created_at),
                last_active_at=_iso(user.last_active_at),
                llm_limits=get_llm_limits_from_profile(user.profile_settings),
                usage=usage,
            )
        )
    return rows


def update_admin_user(
    db: Session,
    user_id: str,
    *,
    role: str | None = None,
    is_active: bool | None = None,
    llm_limits: LlmLimits | None = None,
) -> AdminUserRow | None:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return None
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        return None

    if is_god_admin(user):
        if role is not None and role != UserRole.ADMIN.value:
            raise ValueError("The god admin account cannot be demoted.")
        if is_active is False:
            raise ValueError("The god admin account cannot be deactivated.")

    if role is not None:
        user.role = UserRole(role)
    if is_active is not None:
        user.is_active = is_active
    if llm_limits is not None:
        user.profile_settings = set_llm_limits_on_profile(user.profile_settings, llm_limits)

    db.commit()
    db.refresh(user)
    return _user_row(db, user)


def _user_row(db: Session, user: User) -> AdminUserRow:
    usage_map = _usage_by_user(db)
    base = user_to_dict(user)
    uid = str(user.id)
    return AdminUserRow(
        id=uid,
        email=user.email,
        name=user.full_name,
        role=user.role.value if isinstance(user.role, UserRole) else str(user.role),
        is_active=bool(user.is_active),
        is_god_admin=is_god_admin(user),
        provider=base["provider"],
        affiliation=user.institution,
        created_at=_iso(user.created_at),
        last_active_at=_iso(user.last_active_at),
        llm_limits=get_llm_limits_from_profile(user.profile_settings),
        usage=usage_map.get(uid, AdminUserUsage()),
    )


def get_usage_summary(db: Session) -> AdminUsageSummary:
    users = db.query(User).all()
    usage_map = _usage_by_user(db)
    total_tokens = sum(u.total_tokens for u in usage_map.values())
    total_sessions = sum(u.session_count for u in usage_map.values())
    total_cost = sum(u.estimated_cost_usd for u in usage_map.values())

    over_token = 0
    over_cost = 0
    for user in users:
        limits = get_llm_limits_from_profile(user.profile_settings)
        usage = usage_map.get(str(user.id), AdminUserUsage())
        if usage.total_tokens > limits.daily_token_max:
            over_token += 1
        if usage.estimated_cost_usd > limits.monthly_cost_cap_usd:
            over_cost += 1

    return AdminUsageSummary(
        total_users=len(users),
        active_users=sum(1 for u in users if u.is_active),
        admin_users=sum(
            1 for u in users if (u.role.value if isinstance(u.role, UserRole) else u.role) == "ADMIN"
        ),
        total_tokens=total_tokens,
        total_sessions=total_sessions,
        estimated_total_cost_usd=round(total_cost, 4),
        users_over_token_cap=over_token,
        users_over_cost_cap=over_cost,
    )


def get_global_llm_config() -> LlmGlobalConfigResponse:
    settings = get_settings()
    providers: list[LlmProviderStatus] = [
        LlmProviderStatus(
            id="openai",
            label=PROVIDER_LABELS["openai"],
            configured=bool(settings.openai_api_key.strip()),
            default_model=settings.openai_default_model,
        ),
        LlmProviderStatus(
            id="anthropic",
            label=PROVIDER_LABELS["anthropic"],
            configured=bool(settings.anthropic_api_key.strip()),
            default_model=settings.anthropic_default_model,
        ),
        LlmProviderStatus(
            id="openrouter",
            label=PROVIDER_LABELS["openrouter"],
            configured=bool(settings.openrouter_api_key.strip()),
            default_model=settings.openrouter_default_model,
        ),
        LlmProviderStatus(
            id="zai",
            label=PROVIDER_LABELS["zai"],
            configured=bool(settings.zai_api_key.strip()),
            default_model=settings.zai_default_model,
        ),
    ]
    return LlmGlobalConfigResponse(
        default_provider=settings.llm_provider,
        default_model=settings.model_name,
        temperature=settings.llm_temperature,
        integrity_strictness=settings.integrity_strictness,
        max_style_retries=settings.max_style_retries,
        providers=providers,
        defaults=read_global_defaults(),
    )


def update_global_llm_defaults(defaults: LlmGlobalDefaults) -> LlmGlobalDefaults:
    if defaults.min_temperature > defaults.max_temperature:
        raise ValueError("min_temperature cannot exceed max_temperature.")
    if not (defaults.min_temperature <= defaults.default_temperature <= defaults.max_temperature):
        raise ValueError("default_temperature must be between min and max.")
    return write_global_defaults(defaults)


def get_cost_report(db: Session, *, year: int, month: int) -> AdminCostReport:
    if month < 1 or month > 12:
        raise ValueError("month must be between 1 and 12.")

    start = datetime(year, month, 1, tzinfo=UTC)
    end = datetime(year + 1, 1, 1, tzinfo=UTC) if month == 12 else datetime(year, month + 1, 1, tzinfo=UTC)
    defaults = read_global_defaults()
    rate_per_1k = defaults.estimated_cost_per_1k_tokens_usd
    usage_map = _usage_by_user(db, month_start=start, month_end=end)
    users = db.query(User).order_by(User.full_name.asc()).all()

    rows: list[AdminCostReportRow] = []
    for user in users:
        uid = str(user.id)
        usage = usage_map.get(uid, AdminUserUsage())
        limits = get_llm_limits_from_profile(user.profile_settings)
        cap = limits.monthly_cost_cap_usd
        pct = round((usage.estimated_cost_usd / cap) * 100, 1) if cap > 0 else 0.0
        rows.append(
            AdminCostReportRow(
                user_id=uid,
                name=user.full_name,
                email=user.email,
                tokens=usage.total_tokens,
                sessions=usage.session_count,
                estimated_cost_usd=usage.estimated_cost_usd,
                monthly_cost_cap_usd=cap,
                pct_of_cap=pct,
            )
        )

    rows.sort(key=lambda r: r.estimated_cost_usd, reverse=True)
    total_tokens = sum(r.tokens for r in rows)
    total_cost = sum(r.estimated_cost_usd for r in rows)

    return AdminCostReport(
        month=f"{year:04d}-{month:02d}",
        rate_per_1k_tokens_usd=rate_per_1k,
        total_tokens=total_tokens,
        total_cost_usd=round(total_cost, 4),
        active_users_with_usage=sum(1 for r in rows if r.tokens > 0),
        rows=rows,
    )
