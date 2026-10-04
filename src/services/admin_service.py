from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, false, func, or_, select
from sqlalchemy.orm import Session

from src.config import get_settings
from src.db.models import AiSession, User, UserRole
from src.models.admin_schemas import (
    AdminCostReport,
    AdminCostReportRow,
    AdminModelUsageRow,
    AdminOverviewResponse,
    AdminRecentUserRow,
    AdminUsageSummary,
    AdminUserModelPreferenceRow,
    AdminUserRow,
    AdminUserUsage,
    LlmGlobalConfigResponse,
    LlmGlobalDefaults,
    LlmLimits,
    LlmModelOption,
    LlmProviderStatus,
)
from src.services.auth_service import is_god_admin, user_to_dict
from src.services.llm import list_provider_catalog
from src.services.llm_policy import (
    cost_rate_per_token,
    get_llm_limits_from_profile,
    read_global_defaults,
    set_llm_limits_on_profile,
    write_global_defaults,
)
from src.services.usage_tracking import effective_tokens_expr, resolved_user_id_expr


def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat()


def _meaningful_session_filter():
    """Ignore empty placeholder sessions created at paper init.

    ``col <> ''`` is equivalent to ``coalesce(length(col), 0) > 0`` in a WHERE clause but does not count the
    characters of every (possibly 50 KB) ``ai_output`` row.
    """
    return or_(
        AiSession.tokens_used > 0,
        AiSession.ai_output != "",
        AiSession.user_input != "",
    )


def _json_text(column, key: str):
    """``str(json.get(key) or "").strip()`` in SQL — ``->>`` on PostgreSQL, ``json_extract`` on SQLite."""
    return func.trim(func.coalesce(column[key].as_string(), ""))


def _json_text_or(column, key: str, default: str):
    """``str(json.get(key) or default).strip()`` in SQL."""
    return func.trim(func.coalesce(func.nullif(column[key].as_string(), ""), default))


def _today_month_windows() -> tuple[datetime, datetime, datetime, datetime]:
    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_end = (
        datetime(now.year + 1, 1, 1, tzinfo=UTC)
        if now.month == 12
        else datetime(now.year, now.month + 1, 1, tzinfo=UTC)
    )
    return day_start, day_end, month_start, month_end


def _usage_owner_filter(user_id: uuid.UUID | None):
    """Rows owned by ``user_id`` (or by anyone); usage rows always carry the owner — no join to papers."""
    owner = resolved_user_id_expr()
    return owner == user_id if user_id is not None else owner.isnot(None)


def _tokens_by_user_window(
    db: Session, start: datetime, end: datetime, *, user_id: uuid.UUID | None = None
) -> dict[str, int]:
    """Return {user_id: token_count} for sessions within [start, end)."""
    token_expr = effective_tokens_expr()
    rows = (
        db.query(
            resolved_user_id_expr().label("uid"),
            func.coalesce(func.sum(token_expr), 0),
        )
        .filter(_usage_owner_filter(user_id))
        .filter(_meaningful_session_filter())
        .filter(AiSession.created_at >= start, AiSession.created_at < end)
        .group_by(resolved_user_id_expr())
        .all()
    )
    return {str(uid): int(tok or 0) for uid, tok in rows if uid}


def _usage_by_user(
    db: Session, *, month_start=None, month_end=None, user_id: uuid.UUID | None = None
) -> dict[str, AdminUserUsage]:
    """All-time (or bounded) usage — for cost report and overview totals."""
    token_expr = effective_tokens_expr()
    query = (
        db.query(
            resolved_user_id_expr().label("uid"),
            func.coalesce(func.sum(token_expr), 0),
            func.count(AiSession.id),
        )
        .filter(_usage_owner_filter(user_id))
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
    day_start, day_end, month_start, month_end = _today_month_windows()
    usage_map = _usage_by_user(db)
    today_map = _tokens_by_user_window(db, day_start, day_end)
    month_map = _tokens_by_user_window(db, month_start, month_end)
    rate = cost_rate_per_token()
    users = db.query(User).order_by(User.created_at.desc()).all()
    rows: list[AdminUserRow] = []
    for user in users:
        base = user_to_dict(user)
        uid = str(user.id)
        alltime = usage_map.get(uid, AdminUserUsage())
        month_tok = month_map.get(uid, 0)
        usage = AdminUserUsage(
            total_tokens=alltime.total_tokens,
            session_count=alltime.session_count,
            estimated_cost_usd=alltime.estimated_cost_usd,
            today_tokens=today_map.get(uid, 0),
            month_tokens=month_tok,
            month_cost_usd=round(month_tok * rate, 4),
        )
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
    day_start, day_end, month_start, month_end = _today_month_windows()
    usage_map = _usage_by_user(db, user_id=user.id)
    today_map = _tokens_by_user_window(db, day_start, day_end, user_id=user.id)
    month_map = _tokens_by_user_window(db, month_start, month_end, user_id=user.id)
    rate = cost_rate_per_token()
    base = user_to_dict(user)
    uid = str(user.id)
    alltime = usage_map.get(uid, AdminUserUsage())
    month_tok = month_map.get(uid, 0)
    usage = AdminUserUsage(
        total_tokens=alltime.total_tokens,
        session_count=alltime.session_count,
        estimated_cost_usd=alltime.estimated_cost_usd,
        today_tokens=today_map.get(uid, 0),
        month_tokens=month_tok,
        month_cost_usd=round(month_tok * rate, 4),
    )
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
        usage=usage,
    )


def get_usage_summary(db: Session) -> AdminUsageSummary:
    day_start, day_end, month_start, month_end = _today_month_windows()
    total_users, active_users, admin_users = db.query(
        func.count(User.id),
        func.count(case((User.is_active.is_(True), 1))),
        func.count(case((User.role == UserRole.ADMIN, 1))),
    ).one()
    usage_map = _usage_by_user(db)
    today_map = _tokens_by_user_window(db, day_start, day_end)
    month_map = _tokens_by_user_window(db, month_start, month_end)
    rate = cost_rate_per_token()

    total_tokens = sum(u.total_tokens for u in usage_map.values())
    total_sessions = sum(u.session_count for u in usage_map.values())
    total_cost = sum(u.estimated_cost_usd for u in usage_map.values())
    today_total = sum(today_map.values())
    month_total = sum(month_map.values())
    month_cost = round(month_total * rate, 4)

    # Quota alerts — compare correct windows against limits. Limits come from each profile merged with the
    # global defaults (and may be 0), so every user is checked — but only (id, profile_settings) is loaded.
    over_token = 0  # today's tokens > daily cap
    over_cost = 0  # this month's cost > monthly cap
    for user_id, profile_settings in db.query(User.id, User.profile_settings):
        limits = get_llm_limits_from_profile(profile_settings)
        uid = str(user_id)
        if today_map.get(uid, 0) >= limits.daily_token_max:
            over_token += 1
        if round(month_map.get(uid, 0) * rate, 4) >= limits.monthly_cost_cap_usd:
            over_cost += 1

    return AdminUsageSummary(
        total_users=int(total_users or 0),
        active_users=int(active_users or 0),
        admin_users=int(admin_users or 0),
        total_tokens=total_tokens,
        total_sessions=total_sessions,
        estimated_total_cost_usd=round(total_cost, 4),
        today_tokens=today_total,
        month_cost_usd=month_cost,
        users_over_token_cap=over_token,
        users_over_cost_cap=over_cost,
    )


def _aggregate_session_model_usage(db: Session) -> list[AdminModelUsageRow]:
    """Sessions + tokens per (provider, model) from usage metadata, grouped in SQL (not row by row)."""
    per_row = (
        select(
            _json_text(AiSession.metadata_, "llm_provider").label("provider"),
            _json_text(AiSession.metadata_, "llm_model").label("model"),
            effective_tokens_expr().label("tokens"),
        )
        .where(_meaningful_session_filter())
        .subquery()
    )
    rows = (
        db.query(per_row.c.provider, per_row.c.model, func.count(), func.coalesce(func.sum(per_row.c.tokens), 0))
        .filter(or_(per_row.c.provider != "", per_row.c.model != ""))
        .group_by(per_row.c.provider, per_row.c.model)
        .all()
    )
    agg: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"sessions": 0, "tokens": 0})
    for provider, model, sessions, tokens in rows:
        key = (provider or "—", model or "—")
        agg[key]["sessions"] += int(sessions or 0)
        agg[key]["tokens"] += int(tokens or 0)
    return sorted(
        [
            AdminModelUsageRow(
                provider=provider,
                model=model,
                session_count=counts["sessions"],
                tokens=counts["tokens"],
            )
            for (provider, model), counts in agg.items()
        ],
        key=lambda row: (-row.session_count, -row.tokens),
    )


def _aggregate_user_model_preferences(db: Session) -> list[AdminUserModelPreferenceRow]:
    """Users per preferred (provider, model), falling back to the server default — grouped in SQL."""
    settings = get_settings()
    per_user = select(
        _json_text_or(User.profile_settings, "default_llm_provider", settings.llm_provider).label("provider"),
        _json_text_or(User.profile_settings, "default_llm_model", settings.model_name).label("model"),
    ).subquery()
    rows = db.query(per_user.c.provider, per_user.c.model, func.count()).group_by(per_user.c.provider, per_user.c.model)
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for provider, model, user_count in rows:
        counts[(provider, model)] += int(user_count or 0)
    return sorted(
        [
            AdminUserModelPreferenceRow(provider=provider, model=model, user_count=count)
            for (provider, model), count in counts.items()
        ],
        key=lambda row: (-row.user_count, row.provider, row.model),
    )


def get_admin_overview(db: Session) -> AdminOverviewResponse:
    summary = get_usage_summary(db)
    now = datetime.now(UTC)
    cutoff_1d = now - timedelta(days=1)
    cutoff_7d = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    new_users_1d, new_users_7d, new_users_30d = db.query(
        func.count(case((User.created_at >= cutoff_1d, 1))),
        func.count(case((User.created_at >= cutoff_7d, 1))),
        func.count(case((User.created_at >= cutoff_30d, 1))),
    ).one()

    recent_users: list[AdminRecentUserRow] = []
    for user in db.query(User).order_by(User.created_at.desc()).limit(8):
        base = user_to_dict(user)
        recent_users.append(
            AdminRecentUserRow(
                id=str(user.id),
                email=user.email,
                name=user.full_name,
                role=user.role.value if isinstance(user.role, UserRole) else str(user.role),
                provider=base["provider"],
                created_at=_iso(user.created_at),
                last_active_at=_iso(user.last_active_at),
            )
        )

    return AdminOverviewResponse(
        summary=summary,
        new_users_1d=int(new_users_1d or 0),
        new_users_7d=int(new_users_7d or 0),
        new_users_30d=int(new_users_30d or 0),
        recent_users=recent_users,
        session_model_usage=_aggregate_session_model_usage(db),
        user_model_preferences=_aggregate_user_model_preferences(db),
    )


def get_global_llm_config() -> LlmGlobalConfigResponse:
    settings = get_settings()
    providers: list[LlmProviderStatus] = [
        LlmProviderStatus(
            id=entry["id"],
            label=entry["name"],
            configured=entry["configured"],
            default_model=entry["default_model"],
            models=[LlmModelOption(**model) for model in entry["models"]],
        )
        for entry in list_provider_catalog()
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


def get_cost_report(
    db: Session,
    *,
    year: int,
    month: int,
    include_unused: bool = False,
) -> AdminCostReport:
    if month < 1 or month > 12:
        raise ValueError("month must be between 1 and 12.")

    start = datetime(year, month, 1, tzinfo=UTC)
    end = datetime(year + 1, 1, 1, tzinfo=UTC) if month == 12 else datetime(year, month + 1, 1, tzinfo=UTC)
    defaults = read_global_defaults()
    rate_per_1k = defaults.estimated_cost_per_1k_tokens_usd
    usage_map = _usage_by_user(db, month_start=start, month_end=end)
    users_query = db.query(User).order_by(User.full_name.asc())
    if not include_unused:
        # Rows without usage are skipped below anyway — only load the users that have some.
        if not usage_map:
            users_query = users_query.filter(false())
        else:
            users_query = users_query.filter(User.id.in_([uuid.UUID(uid) for uid in usage_map]))
    users = users_query.all()

    rows: list[AdminCostReportRow] = []
    for user in users:
        uid = str(user.id)
        usage = usage_map.get(uid, AdminUserUsage())
        if not include_unused and usage.session_count == 0 and usage.total_tokens == 0:
            continue
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
