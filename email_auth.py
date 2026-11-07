import os, time, secrets, sqlite3, hashlib, hmac
from contextlib import contextmanager
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from security import rate_limit

router = APIRouter()

DB_PATH = os.environ.get("AUTH_DB", "auth.db")
OTP_TTL = 600
SESSION_TTL = 30 * 86400
RESEND_COOLDOWN = 60          # حداقل فاصله بین دو کد برای یک ایمیل (ثانیه)
SEND_MODE = os.environ.get("EMAIL_SEND_MODE", "console").strip().lower()

# اگر OTP_SECRET تنظیم نشود، یک راز تصادفی برای همین اجرا ساخته می‌شود (کدهای ارسال‌شده بعد از ری‌استارت معتبر نیستند).
# اگر چند worker دارید حتماً OTP_SECRET را در محیط تنظیم کنید.
_env_secret = os.environ.get("OTP_SECRET", "").strip()
OTP_SECRET = _env_secret if _env_secret and _env_secret != "change-me-in-production" else secrets.token_hex(32)

OPENROUTER_AUTH_URL = "https://openrouter.ai/auth"
# اگر خالی باشد از آدرس همین سایت ساخته می‌شود (ریشهٔ سایت، چون main.js بازگشت ?code= را همان‌جا می‌گیرد)
OAUTH_REDIRECT = os.environ.get("OAUTH_REDIRECT_URI", "").strip()

_last_sent: dict = {}


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes")


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("""CREATE TABLE IF NOT EXISTS otps (
        email TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        expires REAL NOT NULL,
        attempts INTEGER DEFAULT 0
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        email TEXT,
        api_key TEXT,
        kind TEXT NOT NULL,
        created REAL NOT NULL,
        expires REAL NOT NULL
    )""")
    return conn


@contextmanager
def _conn():
    """اتصال با commit/rollback خودکار و بسته‌شدن مطمئن."""
    conn = _db()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _hash_code(email: str, code: str) -> str:
    return hmac.new(
        OTP_SECRET.encode(), f"{email}:{code}".encode(), hashlib.sha256
    ).hexdigest()


async def _send_email(email: str, code: str):
    if SEND_MODE == "console":
        print(f"[DEV] کد ورود برای {email}: {code}")
        return
    if SEND_MODE == "resend":
        key = os.environ.get("RESEND_API_KEY", "").strip()
        if not key:
            raise HTTPException(500, "RESEND_API_KEY تنظیم نشده است")
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "from": os.environ.get("RESEND_FROM", "noreply@example.com"),
                        "to": email,
                        "subject": "کد ورود به هوش پرو",
                        "text": f"کد ورود شما: {code}\nاعتبار: ۱۰ دقیقه",
                    },
                )
        except httpx.HTTPError:
            raise HTTPException(502, "ارسال ایمیل ناموفق بود")
        if r.status_code >= 300:
            raise HTTPException(502, "ارسال ایمیل ناموفق بود")
        return
    # قبلاً مقدار ناشناخته بی‌صدا هیچ کاری نمی‌کرد و کاربر هرگز کدی نمی‌گرفت
    raise HTTPException(500, "EMAIL_SEND_MODE نامعتبر است (console یا resend)")


# =========================================================
#                      ایمیل + OTP
# =========================================================
class EmailStart(BaseModel):
    email: EmailStr


class EmailVerify(BaseModel):
    email: EmailStr
    code: str


@router.post("/auth/email/start", dependencies=[Depends(rate_limit("auth", 0.3))])
async def email_start(req: EmailStart):
    email = req.email.lower()
    now = time.time()

    wait = RESEND_COOLDOWN - (now - _last_sent.get(email, 0))
    if wait > 0:
        raise HTTPException(429, f"{int(wait) + 1} ثانیه دیگر دوباره درخواست دهید")
    if len(_last_sent) > 5000:
        for k in [k for k, t in _last_sent.items() if now - t > RESEND_COOLDOWN]:
            _last_sent.pop(k, None)
    _last_sent[email] = now

    code = f"{secrets.randbelow(1_000_000):06d}"
    with _conn() as conn:
        # پاک‌سازی ردیف‌های منقضی تا دیتابیس بی‌نهایت بزرگ نشود
        conn.execute("DELETE FROM otps WHERE expires < ?", (now,))
        conn.execute("DELETE FROM sessions WHERE expires < ?", (now,))
        conn.execute(
            "INSERT OR REPLACE INTO otps (email, code_hash, expires, attempts) VALUES (?, ?, ?, 0)",
            (email, _hash_code(email, code), now + OTP_TTL),
        )
    try:
        await _send_email(email, code)
    except HTTPException:
        _last_sent.pop(email, None)       # ارسال نشد؛ اجازهٔ تلاش دوباره
        raise
    return {"ok": True, "ttl": OTP_TTL}


@router.post("/auth/email/verify", dependencies=[Depends(rate_limit("auth", 0.3))])
async def email_verify(req: EmailVerify):
    email = req.email.lower()
    if not (req.code.isdigit() and len(req.code) == 6):
        raise HTTPException(400, "کد نامعتبر")
    with _conn() as conn:
        row = conn.execute(
            "SELECT code_hash, expires, attempts FROM otps WHERE email=?", (email,)
        ).fetchone()
        if not row:
            raise HTTPException(400, "کدی درخواست نشده")
        code_hash, expires, attempts = row
        if time.time() > expires:
            raise HTTPException(400, "کد منقضی شده")
        if attempts >= 5:
            raise HTTPException(429, "تلاش بیش از حد؛ دوباره درخواست دهید")
        if not hmac.compare_digest(code_hash, _hash_code(email, req.code)):
            conn.execute("UPDATE otps SET attempts=attempts+1 WHERE email=?", (email,))
            conn.commit()                 # شمارش تلاش با raise بعدی rollback نشود
            raise HTTPException(400, "کد اشتباه است")
        token = secrets.token_urlsafe(32)
        now = time.time()
        conn.execute("DELETE FROM otps WHERE email=?", (email,))
        conn.execute(
            "INSERT INTO sessions (token, email, kind, created, expires) VALUES (?, ?, 'otp', ?, ?)",
            (token, email, now, now + SESSION_TTL),
        )
    return {"session_token": token, "email": email, "expires": now + SESSION_TTL}


# =========================================================
#                      OAuth PKCE (OpenRouter)
# =========================================================
class PKCEInit(BaseModel):
    code_challenge: str
    code_challenge_method: str = "S256"


class PKCECallback(BaseModel):
    code: str
    code_verifier: str


def _callback_url(request: Request) -> str:
    if OAUTH_REDIRECT:
        return OAUTH_REDIRECT
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc).split(",")[0].strip()
    return f"{proto}://{host}/"


@router.post("/auth/oauth/pkce-init", dependencies=[Depends(rate_limit("auth", 0.3))])
async def pkce_init(req: PKCEInit, request: Request):
    if req.code_challenge_method != "S256" or not 43 <= len(req.code_challenge) <= 128:
        raise HTTPException(400, "code_challenge نامعتبر")
    # OpenRouter پارامترهای callback_url / code_challenge / code_challenge_method را می‌شناسد
    # (client_id، redirect_uri و response_type در این جریان وجود ندارند)
    params = {
        "callback_url": _callback_url(request),
        "code_challenge": req.code_challenge,
        "code_challenge_method": "S256",
    }
    return {"auth_url": f"{OPENROUTER_AUTH_URL}?{urlencode(params)}"}


@router.post("/auth/oauth/pkce-callback", dependencies=[Depends(rate_limit("auth", 0.3))])
async def pkce_callback(req: PKCECallback):
    if not req.code or len(req.code) > 512 or not 43 <= len(req.code_verifier) <= 128:
        raise HTTPException(400, "ورودی نامعتبر")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                "https://openrouter.ai/api/v1/auth/keys",
                json={
                    "code": req.code,
                    "code_verifier": req.code_verifier,
                    "code_challenge_method": "S256",
                },
            )
    except httpx.HTTPError:
        raise HTTPException(502, "اتصال به OpenRouter ناموفق بود")
    if res.status_code != 200:
        raise HTTPException(400, "تبدیل کد ناموفق بود")
    try:
        api_key = res.json().get("key")
    except ValueError:
        api_key = None
    if not api_key:
        raise HTTPException(502, "پاسخ OpenRouter کلید نداشت")
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token, api_key, kind, created, expires) VALUES (?, ?, 'oauth', ?, ?)",
            (token, api_key, now, now + SESSION_TTL),
        )
    return {"session_token": token}


@router.get("/auth/callback")
async def oauth_callback(request: Request):
    """اگر OAUTH_REDIRECT_URI روی /auth/callback تنظیم شده باشد، به ریشهٔ سایت (جایی که main.js ?code= را می‌خواند) می‌فرستیم."""
    q = request.url.query
    return RedirectResponse("/?" + q if q else "/")


# =========================================================
#                  خروج و اطلاعات نشست
# =========================================================
def _bearer(request: Request) -> str:
    return request.headers.get("Authorization", "").removeprefix("Bearer ").strip()


@router.post("/auth/logout")
async def logout(request: Request):
    token = _bearer(request)
    if token:
        with _conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    token = _bearer(request)
    if not token:
        raise HTTPException(401, "نشستی وجود ندارد")
    with _conn() as conn:
        row = conn.execute(
            "SELECT email, kind, expires FROM sessions WHERE token=? AND expires>?",
            (token, time.time()),
        ).fetchone()
    if not row:
        raise HTTPException(401, "نشست منقضی شده")
    email, kind, expires = row
    return {"email": email, "kind": kind, "expires": expires}


# =========================================================
#              تابع مشترک برای استخراج کلید (نیاز api_routes)
# =========================================================
def _server_key():
    """کلید سرور فقط وقتی برمی‌گردد که ALLOW_SERVER_KEY روشن و OPENROUTER_API_KEY پر باشد."""
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    return key if (_flag("ALLOW_SERVER_KEY") and key) else ""


def _resolve_keys_ex(request: Request):
    """
    خروجی: (فهرست کلیدها, آیا کلید سرور استفاده می‌شود؟)
    ترتیب اولویت:
    ۱. کلید مستقیم در هدر X-Api-Key / X-Api-Key-2
    ۲. توکن نشست در Authorization (OAuth → کلید کاربر / OTP → کلید سرور)
    ۳. کلید سرور (اگر ALLOW_SERVER_KEY فعال باشد)
    """
    keys = [
        k.strip()
        for k in (request.headers.get("X-Api-Key"), request.headers.get("X-Api-Key-2"))
        if k and k.strip()
    ]
    if keys:
        return keys, False

    token = _bearer(request)
    if token:
        with _conn() as conn:
            row = conn.execute(
                "SELECT api_key, kind FROM sessions WHERE token=? AND expires>?",
                (token, time.time()),
            ).fetchone()
        if row:
            api_key, kind = row
            if kind == "oauth" and api_key:
                return [api_key], False

    server_key = _server_key()
    if server_key:
        return [server_key], True
    return [], False


def _resolve_keys(request: Request) -> list:
    return _resolve_keys_ex(request)[0]


def verify_session(request: Request):
    """ایمیل کاربر از session token."""
    token = _bearer(request)
    if not token:
        return None
    with _conn() as conn:
        row = conn.execute(
            "SELECT email, expires FROM sessions WHERE token=?", (token,)
        ).fetchone()
    if not row or time.time() > row[1]:
        return None
    return row[0]
