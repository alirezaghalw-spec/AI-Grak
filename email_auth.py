import os, time, secrets, sqlite3, hashlib, hmac
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr
from security import rate_limit

router = APIRouter()

DB_PATH = os.environ.get("AUTH_DB", "auth.db")
OTP_TTL = 600              # کد ۱۰ دقیقه اعتبار دارد
SESSION_TTL = 30 * 86400   # نشست ۳۰ روز
SEND_MODE = os.environ.get("EMAIL_SEND_MODE", "console")  # console | resend
OTP_SECRET = os.environ.get("OTP_SECRET", "change-me-in-production")


def _db() -> sqlite3.Connection:
    """اتصال به دیتابیس و ساخت جداول اگر وجود ندارند."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS otps (
        email TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        expires REAL NOT NULL,
        attempts INTEGER DEFAULT 0
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        email TEXT,                     -- برای ورود با ایمیل
        api_key TEXT,                   -- برای OAuth (کاربر خودش)
        kind TEXT NOT NULL,             -- 'otp' یا 'oauth'
        created REAL NOT NULL,
        expires REAL NOT NULL
    )""")
    return conn


def _hash_code(email: str, code: str) -> str:
    return hmac.new(
        OTP_SECRET.encode(),
        f"{email}:{code}".encode(),
        hashlib.sha256,
    ).hexdigest()


async def _send_email(email: str, code: str):
    if SEND_MODE == "console":
        print(f"[DEV] کد ورود برای {email}: {code}")
        return
    if SEND_MODE == "resend":
        import httpx
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


# ------------------------------------------------ مدل‌های ورودی
class EmailStart(BaseModel):
    email: EmailStr


class EmailVerify(BaseModel):
    email: EmailStr
    code: str


# ------------------------------------------------ اندپوینت‌ها
@router.post("/auth/email/start", dependencies=[Depends(rate_limit("auth", 0.3))])
async def email_start(req: EmailStart):
    """ارسال کد ۶ رقمی به ایمیل کاربر."""
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
    """اعتبارسنجی کد و صدور session token."""
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


@router.post("/auth/logout")
async def logout(request: Request):
    """حذف نشست فعلی."""
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
    """اطلاعات نشست فعلی (برای نمایش در فرانت)."""
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


# ------------------------------------------------ کمکی برای api_routes
def verify_session(request: Request) -> str | None:
    """ایمیل کاربر از session token — برای استفاده در جاهای دیگر."""
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        return None
    conn = _db()
    row = conn.execute(
        "SELECT email, expires FROM sessions WHERE token=? AND kind='otp'", (token,)
    ).fetchone()
    conn.close()
    if not row or time.time() > row[1]:
        return None
    return row[0]
