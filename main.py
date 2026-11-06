import os
import json
import httpx
import io
import base64
import subprocess
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- سرو کردن فایل‌های استاتیک ---
@app.get("/")
async def serve_index(): return FileResponse("index.html")

@app.get("/app.js")
async def serve_js(): return FileResponse("app.js")

@app.get("/manifest.json")
async def serve_manifest(): return FileResponse("manifest.json")

@app.get("/sw.js")
async def serve_sw(): return FileResponse("sw.js")

# --- پردازش PDF ---
class PDFRequest(BaseModel):
    base64_data: str

@app.post("/parse-pdf")
async def parse_pdf(req: PDFRequest):
    try:
        from pypdf import PdfReader
        b64 = req.base64_data.split(",")[1] if "," in req.base64_data else req.base64_data
        pdf_bytes = base64.b64decode(b64)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = ""
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted: text += extracted + "\n"
        return {"text": text[:15000]}
    except Exception as e:
        return {"error": f"خطا در خواندن PDF: {str(e)}"}

# --- اجرای کد پایتون ---
class CodeRequest(BaseModel):
    code: str

@app.post("/run-python")
async def run_python(req: CodeRequest):
    code = req.code
    wrapped_code = f"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io, base64, sys

{code}

if plt.get_fignums():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    buf.seek(0)
    print("\\n__IMAGE__:" + base64.b64encode(buf.read()).decode('utf-8'))
"""
    try:
        result = subprocess.run(["python", "-c", wrapped_code], capture_output=True, text=True, timeout=15)
        output = result.stdout
        error = result.stderr
        image_data = None
        if "__IMAGE__:" in output:
            parts = output.split("__IMAGE__:")
            output = parts[0].strip()
            image_data = parts[1].strip()
        return {"output": output, "error": error, "image": image_data}
    except subprocess.TimeoutExpired:
        return {"error": "زمان اجرای کد بیش از ۱۵ ثانیه شد."}
    except Exception as e:
        return {"error": str(e)}

# --- دریافت مدل‌های رایگان ---
@app.get("/models")
async def get_models():
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get("https://openrouter.ai/api/v1/models")
            if res.status_code == 200:
                data = res.json()
                free_models = []
                for m in data.get("data", []):
                    is_free = m["id"].endswith(":free") or (m.get("pricing", {}).get("prompt") == "0" and m.get("pricing", {}).get("completion") == "0")
                    if is_free: free_models.append({"id": m["id"], "name": m.get("name", m["id"])})
                free_models.insert(0, {"id": "openrouter/free", "name": "🎲 مسیریاب خودکار رایگان"})
                return {"models": free_models}
        except Exception: pass
    return {"models": []}

# --- چت اصلی ---
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
    if not api_key or api_key.strip() == "": 
        raise HTTPException(status_code=401, detail="کلید API در تنظیمات وارد نشده است.")
    api_key = api_key.strip()

    final_system_prompt = system_prompt + "\n\n"
    if "python_expert" in active_skills: final_system_prompt += "تو یک برنامه‌نویس ارشد پایتون هستی.\n"
    if "image_editor" in active_skills: final_system_prompt += "تو یک متخصص ویرایش تصویر هستی.\n"
    
    # دستور تولید عکس با Pollinations
    final_system_prompt += "برای تولید تصویر، از این ساختار استفاده کن: ![توصیف](https://image.pollinations.ai/prompt/{prompt}?nologo=true&width=800&height=800) و {prompt} را با کلمات انگلیسی جایگزین کن.\n"
    # دستور اجرای کد
    final_system_prompt += "اگر نیاز به محاسبه یا رسم نمودار داری، کد پایتون را دقیقاً داخل تگ <run_python>کد شما</run_python> قرار بده.\n"

    trimmed_messages = messages[-20:]
    if final_system_prompt.strip(): trimmed_messages.insert(0, {"role": "system", "content": final_system_prompt.strip()})

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "HTTP-Referer": "https://ai-grak-2.onrender.com", "X-Title": "Hoosh AI Pro"}
    payload = {"model": model, "messages": trimmed_messages, "temperature": temperature, "stream": True, "stream_options": {"include_usage": True}}

    tools = []
    if "web_search" in active_tools: tools.append({"type": "openrouter:web_search"})
    if tools: payload["tools"] = tools

    async def event_generator():
        async with httpx.AsyncClient(timeout=180.0) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield f"data: {json.dumps({'type': 'error', 'message': f'خطای OpenRouter ({response.status_code})'})}\n\n"
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            line_data = line[6:].strip()
                            if line_data == "[DONE]": break
                            try:
                                parsed = json.loads(line_data)
                                choices = parsed.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content")
                                    if content: yield f"data: {json.dumps({'type': 'delta', 'text': content})}\n\n"
                                    reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                                    if reasoning: yield f"data: {json.dumps({'type': 'reasoning', 'text': reasoning})}\n\n"
                                if parsed.get("usage"): yield f"data: {json.dumps({'type': 'usage', 'usage': parsed.get('usage')})}\n\n"
                            except json.JSONDecodeError: pass
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
