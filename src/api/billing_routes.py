"""Billing API — subscription status, QR checkout, and upgrade endpoints.

V1: QR-based mock payment — POST /billing/checkout creates a short-lived
    token; GET /billing/confirm/{id} validates it and flips the tier.
V2 path: replace checkout body with Stripe Checkout Session creation;
    replace confirm with Stripe webhook signature verification.
"""
from __future__ import annotations

import json
import logging
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.config import get_settings
from src.db.models import User
from src.models.billing_schemas import (
    BillingStatusResponse,
    CheckoutRequest,
    CheckoutResponse,
    UpgradeRequest,
    UpgradeResponse,
)
from src.services.billing_service import (
    CHECKOUT_TTL_MINUTES,
    _generate_qr_png_b64,
    confirm_checkout,
    create_checkout_session,
    get_billing_status,
    upgrade_to_pro,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _origin_base(url: str) -> str | None:
    parsed = urlparse(url.strip())
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _checkout_confirm_url(
    settings,
    request: Request,
    checkout_id: str,
    client_origin: str | None = None,
) -> str:
    """URL embedded in QR — must be the frontend origin, not the API proxy host."""
    path = f"/billing/confirm/{checkout_id}"
    candidates: list[str] = []

    if client_origin:
        candidates.append(client_origin)
    if origin := request.headers.get("origin"):
        candidates.append(origin)
    if referer := request.headers.get("referer"):
        if base := _origin_base(referer):
            candidates.append(base)
    if forwarded := request.headers.get("x-forwarded-host"):
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
        host = forwarded.split(",")[0].strip()
        if host:
            candidates.append(f"{scheme}://{host}")
    candidates.append(settings.frontend_base_url.rstrip("/"))

    for candidate in candidates:
        base = _origin_base(candidate) if "://" in candidate else None
        if not base:
            continue
        host = urlparse(base).hostname
        # Never embed API loopback (e.g. 127.0.0.1:8000 from a mis-forwarded Host header).
        if host in _LOOPBACK_HOSTS and urlparse(base).port == 8000:
            continue
        return f"{base}{path}"

    return f"{settings.frontend_base_url.rstrip('/')}{path}"


@router.get("/status", response_model=BillingStatusResponse)
def billing_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> BillingStatusResponse:
    """Return current subscription tier and defense-turn quota for the caller."""
    data = get_billing_status(db, user)
    return BillingStatusResponse.model_validate(data)


@router.post("/checkout", response_model=CheckoutResponse)
def billing_checkout(
    request: Request,
    payload: CheckoutRequest = CheckoutRequest(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> CheckoutResponse:
    """Create a QR checkout session for Pro upgrade.

    Returns a QR-encoded PNG (base64) pointing to a one-time confirm URL.
    The client should poll GET /billing/status to detect completion.

    V2 path: replace body with stripe.checkout.sessions.create() and
    return the Stripe-hosted URL as confirm_url.
    """
    settings = get_settings()

    status = get_billing_status(db, user)
    if status["tier"] == "pro":
        raise HTTPException(status_code=400, detail="Your account is already on the Pro plan.")

    checkout_id = create_checkout_session(user)
    client_origin = payload.client_origin
    confirm_url = _checkout_confirm_url(settings, request, checkout_id, client_origin)
    qr_b64 = _generate_qr_png_b64(confirm_url)

    return CheckoutResponse(
        checkout_id=checkout_id,
        confirm_url=confirm_url,
        qr_png_b64=qr_b64,
        expires_in_minutes=CHECKOUT_TTL_MINUTES,
    )


@router.get("/confirm/{checkout_id}", response_class=HTMLResponse, include_in_schema=False)
def billing_confirm(
    checkout_id: str,
    db: Session = Depends(get_db_session),
) -> HTMLResponse:
    """Validate a QR token and upgrade the user to Pro.

    No auth required — the opaque token IS the credential.
    Returns a styled HTML page shown on the user's phone after scanning.

    V2 path: becomes a Stripe webhook POST handler with signature verification.
    """
    result = confirm_checkout(db, checkout_id)
    if result is None:
        return HTMLResponse(
            content=_checkout_html(success=False),
            status_code=404,
            media_type="text/html; charset=utf-8",
        )
    if result.get("already_confirmed"):
        return HTMLResponse(
            content=_checkout_html(success=True, already_done=True),
            media_type="text/html; charset=utf-8",
        )
    return HTMLResponse(
        content=_checkout_html(success=True, already_done=False),
        media_type="text/html; charset=utf-8",
    )


@router.post("/upgrade", response_model=UpgradeResponse)
def billing_upgrade(
    payload: UpgradeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> UpgradeResponse:
    """Direct upgrade — kept for admin/testing use only.

    Normal clients should use POST /billing/checkout → scan QR → auto-upgrade.
    V2: remove this endpoint once Stripe webhooks are in place.
    """
    if payload.plan != "pro":
        raise HTTPException(status_code=400, detail="Only 'pro' upgrades are supported.")

    billing_data = upgrade_to_pro(db, user)
    db.commit()

    return UpgradeResponse(
        ok=True,
        message="Account upgraded to Pro. Enjoy 50 defense turns per day!",
        billing=BillingStatusResponse.model_validate(billing_data),
    )


# ─── HTML pages served to the phone browser ──────────────────────────────────

_CHECKOUT_FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600'
    "&family=Lora:wght@400;600;700&display=swap\" rel=\"stylesheet\">"
)

_CHECKOUT_STYLES = """
*{box-sizing:border-box}
body{
  margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  padding:24px 16px;
  background:#f5f2ea;color:#1c1917;
  font-family:'Lora',Georgia,'Noto Serif','Times New Roman',serif;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
.shell{max-width:420px;width:100%}
.brand{
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
  font-size:10px;letter-spacing:.2em;text-transform:uppercase;
  color:#78716c;margin-bottom:12px;
}
.card{
  border:1px solid #1c1917;background:#f5f2ea;padding:32px 28px;
  box-shadow:4px 4px 0 0 #1c1917;
}
.icon{
  width:52px;height:52px;border:1px solid #1c1917;
  display:flex;align-items:center;justify-content:center;margin:0 auto 20px;
}
.icon svg{width:26px;height:26px;stroke:#c43232;fill:none;stroke-width:2}
.icon.muted svg{stroke:#78716c}
.eyebrow{
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
  font-size:10px;letter-spacing:.18em;text-transform:uppercase;
  color:#c43232;text-align:center;margin:0 0 8px;
}
h1{
  margin:0 0 16px;font-size:1.75rem;font-weight:700;
  font-family:'Lora',Georgia,'Noto Serif',serif;
  letter-spacing:-.02em;line-height:1.15;text-align:center;
}
.badge{
  display:inline-block;
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
  font-size:10px;letter-spacing:.15em;text-transform:uppercase;
  background:#c43232;color:#f5f2ea;padding:4px 10px;
  margin:0 auto 20px;
}
.badge-wrap{text-align:center}
p{
  margin:0 0 10px;font-size:15px;line-height:1.6;
  color:#57534e;text-align:center;
}
p strong{color:#1c1917;font-weight:600}
.hint{
  margin-top:20px;padding-top:16px;border-top:1px solid rgba(28,25,23,.15);
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
  font-size:11px;letter-spacing:.08em;
  color:#78716c;text-align:center;
}
a.btn{
  display:block;margin-top:20px;padding:12px 16px;
  border:1px solid #1c1917;background:#1c1917;color:#f5f2ea;
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
  font-size:11px;letter-spacing:.12em;text-transform:uppercase;
  text-decoration:none;text-align:center;
}
a.btn:hover{background:#f5f2ea;color:#1c1917}
"""

_CHECK_SVG = (
    '<svg viewBox="0 0 24 24" aria-hidden="true">'
    '<path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
)
_CLOCK_SVG = (
    '<svg viewBox="0 0 24 24" aria-hidden="true">'
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3" stroke-linecap="round"/></svg>'
)
_X_SVG = (
    '<svg viewBox="0 0 24 24" aria-hidden="true">'
    '<path d="M7 7l10 10M17 7L7 17" stroke-linecap="round"/></svg>'
)

_REDIRECT_SCRIPT = """
<script>
(function () {
  var target = __PLAN_URL__;
  var seconds = 3;
  var el = document.getElementById('redirect-seconds');
  var tick = setInterval(function () {
    seconds -= 1;
    if (el) el.textContent = String(seconds);
    if (seconds <= 0) {
      clearInterval(tick);
      window.location.replace(target);
    }
  }, 1000);
})();
</script>
"""


def _plan_page_url() -> str:
    return f"{get_settings().frontend_base_url.rstrip('/')}/plan"


def _checkout_page(
    *,
    page_title: str,
    brand: str,
    eyebrow: str,
    heading: str,
    paragraphs: list[str],
    icon_svg: str,
    icon_muted: bool = False,
    show_pro_badge: bool = False,
    hint: str | None = None,
    redirect_pricing: bool = False,
    show_pricing_link: bool = False,
) -> str:
    icon_class = "icon muted" if icon_muted else "icon"
    paras = "".join(f"<p>{p}</p>" for p in paragraphs)
    badge = '<div class="badge-wrap"><span class="badge">Pro</span></div>' if show_pro_badge else ""
    hint_html = f'<p class="hint">{hint}</p>' if hint else ""
    plan_url = _plan_page_url()
    link = f'<a class="btn" href="{plan_url}">Về trang gói</a>' if show_pricing_link else ""
    redirect = _REDIRECT_SCRIPT.replace("__PLAN_URL__", json.dumps(plan_url)) if redirect_pricing else ""

    return f"""<!DOCTYPE html>
<html lang="vi"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{page_title} — Arionear</title>
{_CHECKOUT_FONTS}
<style>{_CHECKOUT_STYLES}</style>
</head>
<body>
  <div class="shell">
    <div class="brand">{brand}</div>
    <div class="card">
      <div class="{icon_class}">{icon_svg}</div>
      <p class="eyebrow">{eyebrow}</p>
      <h1>{heading}</h1>
      {badge}
      {paras}
      {hint_html}
      {link}
    </div>
  </div>
{redirect}
</body></html>"""


def _checkout_html(*, success: bool, already_done: bool = False) -> str:
    if not success:
        return _checkout_page(
            page_title="Lỗi thanh toán",
            brand="Arionear · Billing",
            eyebrow="Không hợp lệ",
            heading="Mã QR không dùng được",
            paragraphs=[
                "Mã QR đã hết hạn hoặc không tồn tại.",
                "Quay lại ứng dụng và tạo mã mới từ trang <strong>bảng giá</strong>.",
            ],
            icon_svg=_X_SVG,
            icon_muted=True,
            show_pricing_link=True,
        )

    if already_done:
        return _checkout_page(
            page_title="Đã kích hoạt",
            brand="Arionear · Billing",
            eyebrow="Gói Pro",
            heading="Đã kích hoạt trước đó",
            paragraphs=[
                "Tài khoản của bạn đã ở gói <strong>Pro</strong>.",
                "Bạn có thể tiếp tục dùng các tính năng cao cấp.",
            ],
            icon_svg=_CHECK_SVG,
            show_pro_badge=True,
            hint="Tự động về bảng giá sau <span id=\"redirect-seconds\">3</span> giây…",
            redirect_pricing=True,
        )

    return _checkout_page(
        page_title="Nâng cấp thành công",
        brand="Arionear · Billing",
        eyebrow="Thanh toán xác nhận",
        heading="Nâng cấp Pro thành công",
        paragraphs=[
            "Tài khoản của bạn đã được kích hoạt gói <strong>Pro</strong>.",
            "Quay lại ứng dụng để dùng <strong>50 lượt phản biện</strong> mỗi ngày và các tính năng cao cấp.",
        ],
        icon_svg=_CHECK_SVG,
        show_pro_badge=True,
        hint="Tự động về bảng giá sau <span id=\"redirect-seconds\">3</span> giây…",
        redirect_pricing=True,
    )
