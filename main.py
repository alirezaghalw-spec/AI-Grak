import os
import json
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# این بخش جدید اضافه شده است تا صفحه HTML را نمایش دهد
@app.get("/")
async def serve_index():
    # فرض بر این است که فایل index.html در کنار main.py قرار دارد
    return FileResponse("index.html")


@app.post("/chat")
async def chat_endpoint(request: Request):
    data = await request.json()
    messages = data.get("messages", [])
    model = data.get("model", "openai/gpt-4o")
    temperature = data.get("temperature", 0.7)
    system_prompt = data.get("system_prompt", "")

    api_key = request.headers.get("X-Api-Key") or os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="API Key is missing")

    # مدیریت طول تاریخچه
    trimmed_messages = messages[-20:]

    # اضافه کردن پرامپت سیستم
    if system_prompt.strip():
        trimmed_messages.insert(0, {"role": "system", "content": system_prompt.strip()})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-grak-1.onrender.com",
        "X-Title": "Hoosh AI",
    }

    payload = {
        "model": model,
        "messages": trimmed_messages,
        "temperature": temperature,
        "stream": True,
        "stream_options": {"include_usage": True}
    }

    async def event_generator():
        async with httpx.AsyncClient(timeout=120.0) as client:
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
                                break
                            try:
                                parsed = json.loads(line_data)
                                choices = parsed.get("choices", [])
                                
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content")
                                    if content:
                                        yield f"data: {json.dumps({'type': 'delta', 'text': content})}\n\n"
                                
                                usage = parsed.get("usage")
                                if usage:
                                    yield f"data: {json.dumps({'type': 'usage', 'usage': usage})}\n\n"

                            except json.JSONDecodeError:
                                continue
                
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
