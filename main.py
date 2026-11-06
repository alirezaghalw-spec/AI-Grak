import os
import json
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# برای اجازه دادن به فرانت‌اند
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/chat")
async def chat_endpoint(request: Request):
    data = await request.json()
    messages = data.get("messages", [])
    model = data.get("model", "x-ai/grok-beta") # مدل پیش‌فرض در OpenRouter
    stream = data.get("stream", True)

    # گرفتن کلید API از هدر (که فرانت‌اند می‌فرستد) یا متغیر محیطی Render
    api_key = request.headers.get("X-Api-Key") or os.environ.get("OPENROUTER_API_KEY")
    
    if not api_key:
        raise HTTPException(status_code=401, detail="API Key is missing")

    # هدرهای استاندارد OpenRouter
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-grak.onrender.com", # آدرس سایت شما
        "X-Title": "Hoosh AI", # نام اپلیکیشن
    }

    payload = {
        "model": model,
        "messages": messages,
        "stream": stream
    }

    async def event_generator():
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        error_msg = f"OpenRouter Error ({response.status_code}): {err_text.decode('utf-8')}"
                        yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            line_data = line[6:].strip()
                            if line_data == "[DONE]":
                                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                                break
                            try:
                                parsed = json.loads(line_data)
                                # استخراج متن از فرمت استاندارد OpenAI
                                choices = parsed.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content")
                                    if content:
                                        # تبدیل به فرمتی که فرانت‌اند شما می‌فهمد
                                        yield f"data: {json.dumps({'type': 'delta', 'text': content})}\n\n"
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
