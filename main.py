import hmac
import json
import os
import time
from collections import defaultdict, deque

import httpx
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel

from sandbox import run_python

# ---------------------- تنظیمات ----------------------
XAI_URL = "https://api.x.ai/v1/chat/completions"
API_KEY = os.environ.get("XAI_API_KEY", "")
HOST_KEY = os.environ.get("HOST_API_KEY", "")
DEFAULT_MODEL = "grok-4"
MAX_TOOL_STEPS = 5

# سقف‌های ورودی
MAX_BODY = 400_000
MAX_MSGS = 60
MAX_MSG_CHARS = 20_000
MAX_TOTAL_CHARS = 120_000

# محدودیت تلاش ناموفق
FAIL_MAX = 10
FAIL_WINDOW = 600

# جلوگیری از خوانده شدن env توسط پروسه‌های دیگر
try:
    import ctypes
    ctypes.CDLL(None).prctl(4, 0, 0, 0, 0)  # PR_SET_DUMPABLE = 0
except Exception:
    pass

if len(HOST_KEY) < 16:
    print("WARNING: HOST_API_KEY is empty or shorter than 16 characters. "
          "Use a long random value (empty means every request is rejected).")

app = FastAPI(title="Hoosh Grok", docs_url=None, redoc_url=None, openapi_url=None)

_fails = defaultdict(deque)

RUN_PYTHON_TOOL = {
    "type": "function",
    "function": {
        "name": "run_python",
        "description": (
            "کد پایتون را اجرا می‌کند و خروجی print را برمی‌گرداند. "
            "فقط کتابخانه‌ی استاندارد پایتون؛ بدون اینترنت و بدون دسترسی به فایل‌های بیرون. "
            "حداکثر ۱۰ ثانیه. برای دیدن نتیجه حتماً print کن."
        ),
        "parameters": {
            "type": "object",
            "properties": {"code": {"type": "string", "description": "کد کامل پایتون"}},
            "required": ["code"],
        },
    },
}

SYSTEM_HINT = (
    "تو یک دستیار هستی. اگر محاسبه، آزمایش کد یا پردازش داده لازم بود، "
    "از ابزار run_python استفاده کن و نتیجه‌ی واقعی را به کاربر بگو. "
    "اگر نیازی نبود، مستقیم جواب بده."
)

EMPTY_AFTER_TOOL = "(مدل بعد از اجرای کد جوابی ننوشت؛ خروجی را در بخش ابزار ببین.)"


@app.middleware("http")
async def limit_body(request: Request, call_next):
    if request.method == "POST":
        try:
            size = int(request.headers.get("content-length") or 0)
        except ValueError:
            size = 0
        if size > MAX_BODY:
            return JSONResponse({"detail": "درخواست خیلی بزرگ است"}, status_code=413)
    return await call_next(request)


class ChatRequest(BaseModel):
    messages: list[dict]
    model: str = DEFAULT_MODEL
    stream: bool = False
    tools: bool = True


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[-1].strip() or "?"
    return request.client.host if request.client else "?"


def check_auth(request: Request, x_api_key: str = Header(default="")):
    ip, now = client_ip(request), time.time()
    if len(_fails) > 5000:
        _fails.clear()
    q = _fails[ip]
    while q and now - q[0] > FAIL_WINDOW:
        q.popleft()
    if len(q) >= FAIL_MAX:
        raise HTTPException(429, "تلاش‌های ناموفق زیاد بود؛ چند دقیقه بعد دوباره امتحان کن")
    ok = bool(HOST_KEY) and hmac.compare_digest(x_api_key.encode("utf-8"), HOST_KEY.encode("utf-8"))
    if not ok:
        q.append(now)
        raise HTTPException(401, "کلید نامعتبر")


def clean_messages(raw):
    if not isinstance(raw, list) or not raw or len(raw) > MAX_MSGS:
        raise HTTPException(400, f"تعداد پیام‌ها باید بین ۱ و {MAX_MSGS} باشد")
    out, total = [], 0
    for m in raw:
        role = m.get("role") if isinstance(m, dict) else None
        content = m.get("content") if isinstance(m, dict) else None
        if role not in ("user", "assistant") or not isinstance(content, str):
            raise HTTPException(400, "پیام نامعتبر است")
        if len(content) > MAX_MSG_CHARS:
            raise HTTPException(400, "یک پیام بیش از حد بلند است")
        total += len(content)
        out.append({"role": role, "content": content})
    if total > MAX_TOTAL_CHARS:
        raise HTTPException(400, "مجموع پیام‌ها بیش از حد بلند است")
    if out[-1]["role"] != "user":
        raise HTTPException(400, "آخرین پیام باید از کاربر باشد")
    return out


def headers():
    if not API_KEY:
        raise HTTPException(500, "XAI_API_KEY تنظیم نشده")
    return {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }


async def post_xai(payload):
    async with httpx.AsyncClient(timeout=120) as client:
        return await client.post(XAI_URL, json=payload, headers=headers())


def upstream_error(r):
    status = 429 if r.status_code == 429 else 502
    return HTTPException(status, f"خطای xAI ({r.status_code}): {r.text[:300]}")


# ---------------------- استریم SSE ----------------------

class UpstreamError(Exception):
    def __init__(self, status, text):
        super().__init__(text)
        self.status = status
        self.text = text


def ev(kind, **data):
    return "data: " + json.dumps({"type": kind, **data}, ensure_ascii=False) + "\n\n"


async def upstream_stream(payload):
    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=30)) as client:
        async with client.stream(
            "POST", XAI_URL, json=payload, headers=headers()
        ) as r:
            if r.status_code != 200:
                body = (await r.aread()).decode("utf-8", errors="replace")
                raise UpstreamError(r.status_code, body[:300])
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    yield json.loads(data)
                except json.JSONDecodeError:
                    continue


async def sse_events(model, messages, use_tools, opener=None, runner=None):
    opener = opener or upstream_stream
    runner = runner or run_python
    messages = list(messages)
    if use_tools:
        messages.insert(0, {"role": "system", "content": SYSTEM_HINT})
    tool_used = False
    total_text = False

    try:
        for step in range(MAX_TOOL_STEPS + 1):
            payload = {
                "model": model,
                "messages": messages,
                "stream": True,
            }
            if use_tools and step < MAX_TOOL_STEPS:
                payload["tools"] = [RUN_PYTHON_TOOL]

            text_parts = []
            calls = {}
            for attempt in (0, 1):
                try:
                    async for ch in opener(payload):
                        if ch.get("error"):
                            raise UpstreamError(502, str(ch["error"])[:300])
                        choices = ch.get("choices") or [{}]
                        d = (choices[0] or {}).get("delta") or {}
                        t = d.get("content")
                        if isinstance(t, str) and t:
                            text_parts.append(t)
                            total_text = True
                            yield ev("delta", text=t)
                        for tc in d.get("tool_calls") or []:
                            i = tc.get("index", 0)
                            slot = calls.setdefault(i, {"id": "", "name": "", "args": ""})
                            if tc.get("id"):
                                slot["id"] = tc["id"]
                            f = tc.get("function") or {}
                            if f.get("name"):
                                slot["name"] = slot["name"] or f["name"]
                            if f.get("arguments"):
                                slot["args"] += f["arguments"]
                    break
                except UpstreamError as e:
                    nothing_yet = not text_parts and not calls
                    if attempt == 0 and "tools" in payload and not tool_used and nothing_yet:
                        # مدل از ابزار پشتیبانی نمی‌کند؛ بدون ابزار دوباره تلاش کن
                        use_tools = False
                        payload.pop("tools", None)
                        if messages and messages[0].get("role") == "system":
                            messages.pop(0)
                        continue
                    status = 429 if e.status == 429 else 502
                    yield ev("error", message=f"خطای xAI ({e.status}): {e.text}", status=status)
                    return

            if calls and "tools" in payload:
                tool_used = True
                ordered = [calls[k] for k in sorted(calls)]
                tool_calls = []
                for n, c in enumerate(ordered):
                    tool_calls.append({
                        "id": c["id"] or f"call_{step}_{n}",
                        "type": "function",
                        "function": {"name": c["name"], "arguments": c["args"] or "{}"},
                    })
                messages.append({
                    "role": "assistant",
                    "content": "".join(text_parts),
                    "tool_calls": tool_calls,
                })
                for tcall in tool_calls:
                    fn = tcall["function"]
                    code = ""
                    if fn["name"] == "run_python":
                        try:
                            parsed = json.loads(fn["arguments"])
                            code = parsed.get("code", "") if isinstance(parsed, dict) else ""
                        except json.JSONDecodeError:
                            code = ""
                        if not isinstance(code, str):
                            code = ""
                        yield ev("tool_start", code=code)
                        output = await runner(code) if code else "کدی ارسال نشد"
                        yield ev("tool_result", code=code, output=output)
                    else:
                        output = "ابزار ناشناخته"
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tcall["id"],
                        "content": output,
                    })
                continue

            # جواب نهایی
            if not total_text and tool_used:
                yield ev("delta", text=EMPTY_AFTER_TOOL)
            yield ev("done")
            return

        yield ev("done")
    except Exception as e:
        yield ev("error", message=str(e)[:300], status=500)


# ---------------------- مسیرهای API ----------------------

@app.post("/chat")
async def chat(req: ChatRequest, request: Request, x_api_key: str = Header(default="")):
    check_auth(request, x_api_key)
    messages = clean_messages(req.messages)
    model = (req.model or DEFAULT_MODEL).strip() or DEFAULT_MODEL

    if req.stream:
        return StreamingResponse(
            sse_events(model, messages, req.tools),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # حالت غیر استریم (ساده‌تر)
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
    }
    if req.tools:
        payload["tools"] = [RUN_PYTHON_TOOL]
        payload["messages"] = [{"role": "system", "content": SYSTEM_HINT}] + messages

    r = await post_xai(payload)
    if r.status_code != 200:
        raise upstream_error(r)
    data = r.json()
    try:
        content = data["choices"][0]["message"]["content"] or ""
    except Exception:
        content = str(data)[:500]
    return {"content": content}


@app.get("/models")
async def list_models(request: Request, x_api_key: str = Header(default="")):
    check_auth(request, x_api_key)
    # مدل‌های رایج Grok (می‌تونی بعداً گسترش بدی)
    return {
        "models": [
            {"id": "grok-4", "name": "Grok 4"},
            {"id": "grok-4.6", "name": "Grok 4.6"},
            {"id": "grok-4.7", "name": "Grok 4.7"},
        ]
    }


@app.get("/")
async def root():
    return FileResponse(os.path.join(os.path.dirname(__file__), "index.html"))


@app.get("/health")
async def health():
    return {"status": "ok"}
