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

# ابزار اجرای کد پایتون
def run_python_code(code: str):
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            exec(code, {"__builtins__": __builtins__})
        result = output.getvalue()
        return result if result.strip() else "کد با موفقیت اجرا شد (بدون خروجی متنی)."
    except Exception as e:
        return f"خطا در اجرای کد:\n{traceback.format_exc()}"

@app.post("/chat")
async def chat_endpoint(request: Request):
    data = await request.json()
    messages = data.get("messages", [])
    model = data.get("model", "openai/gpt-4o")
    temperature = data.get("temperature", 0.7)
    system_prompt = data.get("system_prompt", "")
    active_tools = data.get("active_tools", []) # دریافت ابزارهای نصب‌شده

    api_key = request.headers.get("X-Api-Key") or os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="API Key is missing")

    # --- ترکیب پرامپت سیستم با مهارت‌های نصب شده ---
    final_system_prompt = system_prompt + "\n\n"
    
    if "python_expert" in active_tools:
        final_system_prompt += "تو یک برنامه‌نویس ارشد پایتون هستی. همیشه کدهایت را داخل بلوک ```python بگذار.\n"
    if "js_expert" in active_tools:
        final_system_prompt += "تو یک توسعه‌دهنده ارشد جاوااسکریپت و فرانت‌اند هستی. کدها را داخل بلوک ```javascript بگذار.\n"
    if "image_designer" in active_tools:
        final_system_prompt += "تو یک متخصص طراحی گرافیک و ادیت تصویر هستی. برای ساختن تصاویر، کدهای SVG یا CSS بنویس.\n"
    if "code_interpreter" in active_tools:
        final_system_prompt += "اگر نیاز به محاسبه یا اجرای کد بود، کد پایتون را داخل تگ <run>کد شما</run> قرار بده تا من آن را اجرا کنم.\n"

    trimmed_messages = messages[-20:]
    if final_system_prompt.strip():
        trimmed_messages.insert(0, {"role": "system", "content": final_system_prompt.strip()})

    # --- تنظیمات درخواست به OpenRouter ---
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-grak-1.onrender.com",
        "X-Title": "Hoosh AI Store",
    }

    payload = {
        "model": model,
        "messages": trimmed_messages,
        "temperature": temperature,
        "stream": True,
        "stream_options": {"include_usage": True}
    }

    # فعال‌سازی پلاگین جستجوی وب
    if "web_search" in active_tools:
        payload["plugins"] = [{"id": "web"}]

    async def event_generator():
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                # درخواست اول
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
                    
                    # اگر ابزار اجرای کد فعال بود و مدل کدی برای اجرا فرستاد
                    if "code_interpreter" in active_tools and "<run>" in full_text and "</run>" in full_text:
                        import re
                        match = re.search(r'<run>(.*?)</run>', full_text, re.DOTALL)
                        if match:
                            code_to_run = match.group(1).strip()
                            # حذف تگ‌های <run> از متن نمایشی
                            display_text = full_text.replace(match.group(0), "").strip()
                            
                            # اطلاع به کاربر که کد در حال اجراست
                            yield f"data: {json.dumps({'type': 'delta', 'text': f'\n\n⏳ *در حال اجرای کد پایتون...*\n\n'})}\n\n"
                            
                            # اجرای کد
                            result = run_python_code(code_to_run)
                            
                            # نمایش نتیجه
                            yield f"data: {json.dumps({'type': 'delta', 'text': f'**نتیجه اجرا:**\n```text\n{result}\n```\n\n'})}\n\n"
                            
                            # ارسال نتیجه به مدل برای ادامه صحبت (اختیاری - برای سادگی اینجا متوقف می‌شود)
                            full_text = display_text + f"\n\nاجرای کد: {result}"

                    if usage_data:
                        yield f"data: {json.dumps({'type': 'usage', 'usage': usage_data})}\n\n"

                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
