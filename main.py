import os
import json
import httpx
import io
import contextlib
import traceback
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

# مسیر دریافت لیست مدل‌ها (شامل مدل‌های رایگان و مدل‌های تصویر)
@app.get("/models")
async def get_models():
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get("https://openrouter.ai/api/v1/models")
            if res.status_code == 200:
                data = res.json()
                free_models = []
                image_models = []
                for m in data.get("data", []):
                    is_free = m["id"].endswith(":free") or (
                        m.get("pricing", {}).get("prompt") == "0" and 
                        m.get("pricing", {}).get("completion") == "0"
                    )
                    # جدا کردن مدل‌های تصویر (Riverflow و غیره)
                    if "image" in m.get("architecture", {}).get("output_modalities", []):
                        image_models.append({"id": m["id"], "name": m.get("name", m["id"])})
                    elif is_free:
                        free_models.append({"id": m["id"], "name": m.get("name", m["id"])})
                
                free_models.insert(0, {"id": "openrouter/free", "name": "🎲 مسیریاب خودکار رایگان"})
                # مدل‌های تصویر را با یک نشانگر به لیست اضافه می‌کنیم
                for im in image_models:
                    free_models.append({"id": im["id"], "name": f"🖼️ {im['name']}"})
                
                return {"models": free_models}
        except Exception as e:
            print("Error fetching models:", e)
    return {"models": []}

def run_python_code(code: str):
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            exec(code, {"__builtins__": __builtins__})
        return output.getvalue() or "کد با موفقیت اجرا شد (بدون خروجی)."
    except Exception:
        return traceback.format_exc()

@app.post("/chat")
async def chat_endpoint(request: Request):
    data = await request.json()
    messages = data.get("messages", [])
    model = data.get("model", "openrouter/free")
    temperature = data.get("temperature", 0.7)
    system_prompt = data.get("system_prompt", "")
    active_tools = data.get("active_tools", [])
    active_skills = data.get("active_skills", [])

    api_key = request.headers.get("X-Api-Key") or os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="API Key is missing")

    # --- ۱. تزریق مهارت‌ها (Skills) به پرامپت سیستم ---
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
        "HTTP-Referer": "https://ai-grak-1.onrender.com",
        "X-Title": "Hoosh AI Pro",
    }

    # --- ۲. ساخت Payload و فعال‌سازی ابزارهای واقعی ---
    payload = {
        "model": model,
        "messages": trimmed_messages,
        "temperature": temperature,
        "stream": True,
        "stream_options": {"include_usage": True}
    }

    # فعال‌سازی ابزارهای سروری OpenRouter
    tools = []
    if "web_search" in active_tools:
        # استفاده از سرور-ابزار جدید به جای پلاگین قدیمی
        tools.append({"type": "openrouter:web_search"})
    if "shell" in active_tools:
        # اجرای کد واقعی در محیط لینوکس OpenRouter
        tools.append({"type": "openrouter:shell", "parameters": {"engine": "openrouter"}})

    if tools:
        payload["tools"] = tools

    async def event_generator():
        async with httpx.AsyncClient(timeout=180.0) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Error {response.status_code}: {err_text.decode()}'})}\n\n"
                        return

                    full_text = ""
                    usage_data = None
                    
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
                                        full_text += content
                                        yield f"data: {json.dumps({'type': 'delta', 'text': content})}\n\n"
                                if parsed.get("usage"):
                                    usage_data = parsed.get("usage")
                            except json.JSONDecodeError:
                                pass

                    # اگر ابزار shell فعال بود و مدل کدی برای اجرا فرستاد
                    if "shell" in active_tools and "<run>" in full_text and "</run>" in full_text:
                        import re
                        match = re.search(r'<run>(.*?)</run>', full_text, re.DOTALL)
                        if match:
                            code_to_run = match.group(1).strip()
                            display_text = full_text.replace(match.group(0), "").strip()
                            
                            yield f"data: {json.dumps({'type': 'delta', 'text': f'\n\n⏳ *در حال اجرای کد در محیط ایزوله...*\n\n'})}\n\n"
                            result = run_python_code(code_to_run)
                            yield f"data: {json.dumps({'type': 'delta', 'text': f'**نتیجه اجرا:**\n```text\n{result}\n```\n\n'})}\n\n"
                            full_text = display_text + f"\n\nاجرای کد: {result}"

                    if usage_data:
                        yield f"data: {json.dumps({'type': 'usage', 'usage': usage_data})}\n\n"

                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
