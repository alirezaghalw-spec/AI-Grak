import os
import json
import httpx
import asyncio
import subprocess
import base64
import io
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

@app.get("/")
async def serve_index(): return FileResponse("index.html")

@app.get("/app.js")
async def serve_js(): return FileResponse("app.js")

@app.get("/manifest.json")
async def serve_manifest(): return FileResponse("manifest.json")

@app.get("/sw.js")
async def serve_sw(): return FileResponse("sw.js")

class PDFRequest(BaseModel):
    base64_data: str

@app.post("/parse-pdf")
async def parse_pdf(req: PDFRequest):
    try:
        from pypdf import PdfReader
        b64 = req.base64_data.split(",")[1] if "," in req.base64_data else req.base64_data
        pdf_bytes = base64.b64decode(b64)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = "".join([(p.extract_text() or "") + "\n" for p in reader.pages])
        return {"text": text[:15000]}
    except Exception as e:
        return {"error": f"خطا در پردازش PDF: {str(e)}"}

class CodeRequest(BaseModel):
    code: str

@app.post("/run-python")
async def run_python(req: CodeRequest):
    env = os.environ.copy()
    env["MPLBACKEND"] = "Agg" # جلوگیری از خطای گرافیک در سرور
    wrapped_code = f"""
import io, base64, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
{req.code}

if plt.get_fignums():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    buf.seek(0)
    print("\\n__IMAGE__:" + base64.b64encode(buf.read()).decode('utf-8'))
"""
    try:
        # اجرای کد در یک ترد جداگانه تا سرور فریز نشود (محدودیت ۱۵ ثانیه)
        result = await asyncio.to_thread(
            subprocess.run, ["python", "-c", wrapped_code], 
            capture_output=True, text=True, timeout=15, env=env
        )
        output, error, image_data = result.stdout, result.stderr, None
        
        if "__IMAGE__:" in output:
            parts = output.split("__IMAGE__:")
            output, image_data = parts[0].strip(), parts[1].strip()
            
        return {"output": output, "error": error, "image": image_data}
    except subprocess.TimeoutExpired:
        return {"error": "زمان اجرای کد بیش از ۱۵ ثانیه شد."}
    except Exception as e:
        return {"error": str(e)}

class URLRequest(BaseModel):
    url: str

@app.post("/fetch-url")
async def fetch_url(req: URLRequest):
    try:
        from bs4 import BeautifulSoup
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            r = await client.get(req.url, headers={"User-Agent": "Mozilla/5.0"})
            soup = BeautifulSoup(r.text, 'html.parser')
            for script in soup(["script", "style"]): script.decompose()
            text = soup.get_text(separator=' ')
            return {"text": " ".join(text.split())[:12000]}
    except Exception as e:
        return {"error": f"خطا در خواندن سایت: {str(e)}"}

@app.get("/models")
async def get_models():
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get("https://openrouter.ai/api/v1/models")
            if res.status_code == 200:
                data = res.json()
                free_models = []
                for m in data.get("data", []):
                    try:
                        p = float(m.get("pricing", {}).get("prompt", "1"))
                        c = float(m.get("pricing", {}).get("completion", "1"))
                        is_free = m["id"].endswith(":free") or (p == 0.0 and c == 0.0)
                    except (ValueError, TypeError):
                        is_free = m["id"].endswith(":free")
                        
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
    model = data.get("model", "openrouter/free")
    active_tools = data.get("active_tools", [])
    active_skills = data.get("active_skills", [])
    agent_mode = data.get("agent_mode", False)
    system_prompt = data.get("system_prompt", "")
    temperature = data.get("temperature", 0.7)
    messages = data.get("messages", [])

    api_key = request.headers.get("X-Api-Key") or os.environ.get("OPENROUTER_API_KEY")
    if not api_key or not api_key.strip(): 
        raise HTTPException(status_code=401, detail="کلید API در تنظیمات وارد نشده است.")

    # --- ساخت پرامپت سیستم بر اساس تنظیمات و ابزارها ---
    final_sys = system_prompt + "\n\n"
    if agent_mode:
        final_sys += "حالت عامل (Agent) فعال است. شما باید قدم به قدم فکر کنید و از ابزارها استفاده کنید.\n"
    if "python_expert" in active_skills: 
        final_sys += "تو یک برنامه‌نویس ارشد پایتون هستی. کدها را در بلوک ```python قرار بده.\n"
    if "image_editor" in active_skills: 
        final_sys += "تو یک متخصص ویرایش تصویر هستی.\n"
    
    final_sys += "برای تولید تصویر: ![توصیف](https://image.pollinations.ai/prompt/{prompt}?nologo=true&width=800&height=800) و {prompt} را با کلمات انگلیسی جایگزین کن.\n"
    final_sys += "برای اجرای کد: کد پایتون را دقیقاً داخل تگ <run_python>کد شما</run_python> قرار بده.\n"
    final_sys += "در انتهای هر پاسخ، ۳ پیشنهاد برای ادامه گفتگو در قالب [پیشنهاد: متن] بنویس.\n"

    # محدود کردن تاریخچه به ۲۰ پیام آخر
    trimmed_msgs = messages[-20:]
    if final_sys.strip(): 
        trimmed_msgs.insert(0, {"role": "system", "content": final_sys.strip()})

    headers = {
        "Authorization": f"Bearer {api_key.strip()}", 
        "Content-Type": "application/json", 
        "HTTP-Referer": "https://ai-grak.onrender.com",
        "X-Title": "Hoosh AI Pro"
    }
    
    payload = {
        "model": model, 
        "messages": trimmed_msgs, 
        "temperature": temperature, 
        "stream": True, 
        "stream_options": {"include_usage": True}
    }
    
    # اضافه کردن پلاگین جستجوی وب
    if "web_search" in active_tools: 
        payload["plugins"] = [{"id": "web"}]

    async def gen():
        async with httpx.AsyncClient(timeout=180.0) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as res:
                    if res.status_code != 200:
                        err_text = await res.aread()
                        yield f"data: {json.dumps({'type': 'error', 'message': f'خطای OpenRouter ({res.status_code}): {err_text.decode()}'})}\n\n"
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
                        return
                        
                    async for line in res.aiter_lines():
                        if line.startswith("data: "):
                            ld = line[6:].strip()
                            if ld == "[DONE]": break
                            try:
                                parsed = json.loads(ld)
                                if parsed.get("choices"):
                                    d = parsed["choices"][0].get("delta", {})
                                    if d.get("content"): 
                                        yield f"data: {json.dumps({'type': 'delta', 'text': d['content']})}\n\n"
                                    
                                    # بررسی هر دو کلید reasoning_content و reasoning
                                    reasoning = d.get("reasoning_content") or d.get("reasoning")
                                    if reasoning: 
                                        yield f"data: {json.dumps({'type': 'reasoning', 'text': reasoning})}\n\n"
                                        
                                if parsed.get("usage"): 
                                    yield f"data: {json.dumps({'type': 'usage', 'usage': parsed['usage']})}\n\n"
                            except json.JSONDecodeError: 
                                pass
                                
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
    
    return StreamingResponse(gen(), media_type="text/event-stream")
