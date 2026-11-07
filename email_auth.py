import os, time, secrets, sqlite3, hashlib, hmac
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr

from security import rate_limit

router = APIRouter()

DB_PATH = os.environ.get("AUTH_DB", "auth.db")
OTP_TTL = 600
SESSION_TTL = 30 * 86400
SEND_MODE = os.environ.get("EMAIL_SEND_MODE", "console")
OTP_SECRET = os.environ.get("OTP_SECRET", "change-me-in-production")

OPENROUTER_AUTH_URL = "https://openrouter.ai/auth"
OAUTH_REDIRECT = os.environ.get("OAUTH_REDIRECT_URI", "http://localhost:8000/auth/callback")


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes")


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
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


def _hash_code(email: str, code: str) -> str:
    return hmac.new(
        OTP_SECRET.encode(), f"{email}:{code}".encode(), hashlib.sha256
    ).hexdigest()


async def _send_email(email: str, code: str):
    if SEND_MODE == "console":
        print(f"[DEV] کد ورود برای {email}: {code}")
        return
    if SEND_MODE == "resend":
        key = os.environ.get("RESEND_API_KEY")
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
            if r.status_code >= 300:
                raise HTTPException(502, "ارسال ایمیل ناموفق بود")


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
    code = f"{secrets.randbelow(1_000_000):06d}"
    conn = _db()
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO otps (email, code_hash, expires, attempts) VALUES (?, ?, ?, 0)",
            (email, _hash_code(email, code), time.time() + OTP_TTL),
        )
    conn.close()
    await _send_email(email, code)
    return {"ok": True, "ttl": OTP_TTL}


@router.post("/auth/email/verify", dependencies=[Depends(rate_limit("auth", 0.3))])
async def email_verify(req: EmailVerify):
    email = req.email.lower()
    if not (req.code.isdigit() and len(req.code) == 6):
        raise HTTPException(400, "کد نامعتبر")
    conn = _db()
    row = conn.execute(
        "SELECT code_hash, expires, attempts FROM otps WHERE email=?", (email,)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(400, "کدی درخواست نشده")
    code_hash, expires, attempts = row
    if time.time() > expires:
        conn.close()
        raise HTTPException(400, "کد منقضی شده")
    if attempts >= 5:
        conn.close()
        raise HTTPException(429, "تلاش بیش از حد؛ دوباره درخواست دهید")
    if not hmac.compare_digest(code_hash, _hash_code(email, req.code)):
        with conn:
            conn.execute("UPDATE otps SET attempts=attempts+1 WHERE email=?", (email,))
        conn.close()
        raise HTTPException(400, "کد اشتباه است")
    token = secrets.token_urlsafe(32)
    now = time.time()
    with conn:
        conn.execute("DELETE FROM otps WHERE email=?", (email,))
        conn.execute(
            "INSERT INTO sessions (token, email, kind, created, expires) VALUES (?, ?, 'otp', ?, ?)",
            (token, email, now, now + SESSION_TTL),
        )
    conn.close()
    return {"session_token": token, "email": email, "expires": now + SESSION_TTL}


# =========================================================
#                      OAuth PKCE
# =========================================================
class PKCEInit(BaseModel):
    code_challenge: str
    code_challenge_method: str = "S256"


class PKCECallback(BaseModel):
    code: str
    code_verifier: str


@router.post("/auth/oauth/pkce-init")
async def pkce_init(req: PKCEInit):
    if req.code_challenge_method not in ("S256", "plain") or len(req.code_challenge) < 43:
        raise HTTPException(400, "code_challenge نامعتبر")
    params = {
        "client_id": os.environ.get("OAUTH_CLIENT_ID", "hoosh-pro"),
        "redirect_uri": OAUTH_REDIRECT,
        "response_type": "code",
        "code_challenge": req.code_challenge,
        "code_challenge_method": req.code_challenge_method,
    }
    return {"auth_url": f"{OPENROUTER_AUTH_URL}?{urlencode(params)}"}


@router.post("/auth/oauth/pkce-callback")
async def pkce_callback(req: PKCECallback):
    if not req.code or not 43 <= len(req.code_verifier) <= 128:
        raise HTTPException(400, "ورودی نامعتبر")
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            "https://openrouter.ai/api/v1/auth/keys",
            json={
                "code": req.code,
                "code_verifier": req.code_verifier,
                "code_challenge_method": "S256",
            },
        )
    if res.status_code != 200:
        raise HTTPException(400, "تبدیل کد ناموفق بود")
    api_key = res.json().get("key")
    if not api_key:
        raise HTTPException(502, "پاسخ OpenRouter کلید نداشت")
    token = secrets.token_urlsafe(32)
    now = time.time()
    conn = _db()
    with conn:
        conn.execute(
            "INSERT INTO sessions (token, api_key, kind, created, expires) VALUES (?, ?, 'oauth', ?, ?)",
            (token, api_key, now, now + SESSION_TTL),
        )
    conn.close()
    return {"session_token": token}


# =========================================================
#                  خروج و اطلاعات نشست
# =========================================================
@router.post("/auth/logout")
async def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if token:
        conn = _db()
        with conn:
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
        conn.close()
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "نشستی وجود ندارد")
    conn = _db()
    row = conn.execute(
        "SELECT email, kind, expires FROM sessions WHERE token=? AND expires>?",
        (token, time.time()),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(401, "نشست منقضی شده")
    email, kind, expires = row
    return {"email": email, "kind": kind, "expires": expires}


# =========================================================
#              تابع مشترک برای استخراج کلید
# =========================================================
def _resolve_keys(request: Request) -> list:
    """
    ترتیب اولویت:
    ۱. کلید مستقیم در هدر
    ۲. session token (OAuth → کلید کاربر / OTP → کلید سرور)
    ۳. کلید سرور
    """
    keys = [
        k.strip()
        for k in (request.headers.get("X-Api-Key"), request.headers.get("X-Api-Key-2"))
        if k and k.strip()
    ]
    if keys:
        return keys

    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if token:
        conn = _db()
        row = conn.execute(
            "SELECT api_key, kind FROM sessions WHERE token=? AND expires>?",
            (token, time.time()),
        ).fetchone()
        conn.close()
        if row:
            api_key, kind = row
            if kind == "oauth" and api_key:
                return [api_key]
            if kind == "otp":
                server_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
                if _flag("ALLOW_SERVER_KEY") and server_key:
                    return [server_key]

    if _flag("ALLOW_SERVER_KEY"):
        server_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        if server_key:
            return [server_key]
    return []


def verify_session(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        return None
    conn = _db()
    row = conn.execute(
        "SELECT email, expires FROM sessions WHERE token=?", (token,)
    ).fetchone()
    conn.close()
    if not row or time.time() > row[1]:
        return None
    return row[0]
