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

@app.get("/")
async def serve_index():
    return FileResponse("index.html")

@app.get("/models")
async def get_models():
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get("https://openrouter.ai/api/v1/models")
            if res.status_code == 200:
                data = res.json()
                free_models = []
                for m in data.get("data", []):
                    # بررسی رایگان بودن مدل (بر اساس قیمت صفر یا پسوند :free)
                    is_free = m["id"].endswith(":free") or (
                        m.get("pricing", {}).get("prompt") == "0" and 
                        m.get("pricing", {}).get("completion") == "0"
                    )
                    if is_free:
                        free_models.append({"id": m["id"], "name": m.get("name", m["id"])})
                
                free_models.insert(0, {"id": "openrouter/free", "name": "🎲 مسیریاب خودکار رایگان"})
                return {"models": free_models}
        except Exception as e:
            print("Error fetching models:", e)
    return {"models": []}

@app.post("/chat")
async def chat_endpoint(request: Request):
    data = await request.json()
    messages = data.get("messages", [])
    model = data.get("model", "openrouter/free")
    temperature = data.get("temperature", 0.7)
    system_prompt = data.get("system_prompt", "")
    active_tools = data.get("active_tools", [])
    active_skills = data.get("active_skills", [])

    # خواندن کلید از هدر فرانت‌اند
    api_key = request.headers.get("X-Api-Key")
    
    # اگر در فرانت‌اند کلید وارد نشده بود، سراغ متغیر محیطی Render می‌رود
    if not api_key:
        api_key = os.environ.get("OPENROUTER_API_KEY")

    if not api_key or api_key.strip() == "":
        raise HTTPException(status_code=401, detail="کلید API در تنظیمات سایت وارد نشده است.")

    api_key = api_key.strip()

    # --- اضافه کردن مهارت‌ها به پرامپت سیستم ---
    final_system_prompt = system_prompt + "\n\n"
    if "python_expert" in active_skills:
        final_system_prompt += "تو یک برنامه‌نویس ارشد پایتون هستی. کدها را در بلوک ```python قرار بده.\n"
    if "js_expert" in active_skills:
        final_system_prompt += "تو یک توسعه‌دهنده ارشد فرانت‌اند هستی. کدها را در بلوک ```javascript قرار بده.\n"
    if "image_editor" in active_skills:
        final_system_prompt += "تو یک متخصص ویرایش تصویر هستی. هنگام پاسخ، دقیقاً مشخص کن چه تغییری در تصویر ایجاد می‌کنی.\n"

    trimmed_messages = messages[-20:]
    if final_system_prompt.strip():
        trimmed_messages.insert(0, {"role": "system", "content": final_system_prompt.strip()})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-grak-2.onrender.com",
        "X-Title": "Hoosh AI Pro",
    }

    payload = {
        "model": model,
        "messages": trimmed_messages,
        "temperature": temperature,
        "stream": True,
        "stream_options": {"include_usage": True}
    }

    # --- اضافه کردن ابزارهای واقعی ---
    tools = []
    if "web_search" in active_tools:
        tools.append({"type": "openrouter:web_search"})
    if "shell" in active_tools:
        tools.append({"type": "openrouter:shell"})
        
    if tools:
        payload["tools"] = tools

    async def event_generator():
        async with httpx.AsyncClient(timeout=180.0) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield f"data: {json.dumps({'type': 'error', 'message': f'خطای OpenRouter ({response.status_code}): {err_text.decode()}'})}\n\n"
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
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
                                if parsed.get("usage"):
                                    yield f"data: {json.dumps({'type': 'usage', 'usage': parsed.get('usage')})}\n\n"
                            except json.JSONDecodeError:
                                pass
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
