"""ابزارهای امنیتی: محدودیت نرخ، سقف حجم درخواست و هدرهای امنیتی."""
import json
import os
import time
from typing import Optional
from collections import defaultdict, deque

from starlette.exceptions import HTTPException  # همان کلاسی که FastAPI استفاده می‌کند
from starlette.requests import Request


# ---------------------------------------------------------------- محدودیت نرخ
# شمارنده در حافظه است (برای یک نمونه سرور کافی است). با RATE_LIMIT_PER_MIN=0 خاموش می‌شود.
_hits = defaultdict(deque)
_state = {"last_prune": 0.0}
WINDOW = 60.0


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


def client_ip(request: Request) -> str:
    """آی‌پی کاربر. پشت پراکسی (مثل Render) از X-Forwarded-For استفاده می‌شود.

    مقدارهای ابتدای این هدر را خود کاربر می‌تواند جعل کند؛ پس از انتها می‌شماریم.
    TRUSTED_PROXY_HOPS = تعداد پراکسی‌های مورد اعتماد جلوی برنامه (پیش‌فرض ۱).
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        hops = max(1, _env_int("TRUSTED_PROXY_HOPS", 1))
        if parts:
            return parts[-hops] if len(parts) >= hops else parts[0]
    return request.client.host if request.client else "unknown"


def _prune(now: float) -> None:
    if now - _state["last_prune"] < WINDOW:
        return
    _state["last_prune"] = now
    for key in [k for k, dq in _hits.items() if not dq or now - dq[-1] > WINDOW]:
        _hits.pop(key, None)


def rate_limit(bucket: str, factor: float = 1.0):
    """وابستگی FastAPI. سقف هر آی‌پی در دقیقه = RATE_LIMIT_PER_MIN (پیش‌فرض ۳۰) × factor."""

    async def dependency(request: Request):
        base = _env_int("RATE_LIMIT_PER_MIN", 30)
        if base <= 0:
            return
        limit = max(1, int(base * factor))
        now = time.monotonic()
        _prune(now)
        dq = _hits[(bucket, client_ip(request))]
        while dq and now - dq[0] > WINDOW:
            dq.popleft()
        if len(dq) >= limit:
            retry = max(1, int(WINDOW - (now - dq[0])))
            raise HTTPException(
                status_code=429,
                detail=f"تعداد درخواست‌ها زیاد است. {retry} ثانیه دیگر دوباره تلاش کنید.",
                headers={"Retry-After": str(retry)},
            )
        dq.append(now)

    return dependency


# ---------------------------------------------------------------- سقف حجم بدنهٔ درخواست
class _TooLarge(Exception):
    pass


class BodyLimitMiddleware:
    """درخواست‌های POST بزرگ‌تر از سقف هر مسیر را با ۴۱۳ رد می‌کند (هم با Content-Length، هم هنگام دریافت)."""

    def __init__(self, app, default_limit: int = 300_000, limits: Optional[dict] = None):
        self.app = app
        self.default_limit = default_limit
        self.limits = limits or {}

    @staticmethod
    async def _reject(send, status: int = 413, detail: str = "حجم درخواست زیاد است"):
        body = json.dumps({"detail": detail}, ensure_ascii=False).encode("utf-8")
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json; charset=utf-8"),
                                (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH"):
            return await self.app(scope, receive, send)

        limit = self.limits.get(scope["path"], self.default_limit)
        for k, v in scope["headers"]:
            if k == b"content-length":
                try:
                    if int(v) > limit:
                        return await self._reject(send)
                except ValueError:
                    return await self._reject(send, 400, "Content-Length نامعتبر")

        received = 0
        started = False

        async def limited_receive():
            nonlocal received
            msg = await receive()
            if msg["type"] == "http.request":
                received += len(msg.get("body", b""))
                if received > limit:
                    raise _TooLarge()
            return msg

        async def tracking_send(msg):
            nonlocal started
            if msg["type"] == "http.response.start":
                started = True
            await send(msg)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _TooLarge:
            if not started:
                await self._reject(send)


# ---------------------------------------------------------------- هدرهای امنیتی
# CSP عمداً گذاشته نشده: پیش‌نمایش HTML (iframe با srcdoc) CSP صفحهٔ اصلی را به ارث می‌برد و خراب می‌شد.
SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy", b"camera=(), geolocation=(), microphone=(self)"),
]


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_headers(msg):
            if msg["type"] == "http.response.start":
                existing = {k.lower() for k, _ in msg.get("headers", [])}
                msg = dict(msg)
                msg["headers"] = list(msg.get("headers", [])) + [h for h in SECURITY_HEADERS if h[0] not in existing]
            await send(msg)

        await self.app(scope, receive, send_with_headers)
