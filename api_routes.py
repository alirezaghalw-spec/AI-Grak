import os, json, httpx, asyncio, subprocess, base64, io
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

class PDFRequest(BaseModel): base64_data: str
class CodeRequest(BaseModel): code: str
class URLRequest(BaseModel): url: str

@router.post("/parse-pdf")
async def parse_pdf(req: PDFRequest):
    try:
        from pypdf import PdfReader
        b64 = req.base64_data.split(",")[1] if "," in req.base64_data else req.base64_data
        pdf_bytes = base64.b64decode(b64)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = "".join([(p.extract_text() or "") + "\n" for p in reader.pages])
        return {"text": text[:15000]}
    except Exception as e:
        return {"error": str(e)}

@router.post("/run-python")
async def run_python(req: CodeRequest):
    env = os.environ.copy()
    env["MPLBACKEND"] = "Agg"
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
        result = await asyncio.to_thread(subprocess.run, ["python", "-c", wrapped_code], capture_output=True, text=True, timeout=15, env=env)
        output, error, image_data = result.stdout, result.stderr, None
        if "__IMAGE__:" in output:
            parts = output.split("__IMAGE__:")
            output, image_data = parts[0].strip(), parts[1].strip()
        return {"output": output, "error": error, "image": image_data}
    except Exception as e:
        return {"error": str(e)}

@router.post("/fetch-url")
async def fetch_url(req: URLRequest):
    try:
        from bs4 import BeautifulSoup
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            r = await client.get(req.url, headers={"User-Agent": "Mozilla/5.0"})
            soup = BeautifulSoup(r.text, 'html.parser')
            for script in soup(["script", "style"]): script.decompose()
            return {"text": " ".join(soup.get_text(separator=' ').split())[:12000]}
    except Exception as e:
        return {"error": str(e)}

@router.get("/models")
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
                    except: is_free = m["id"].endswith(":free")
                    if is_free: free_models.append({"id": m["id"], "name": m.get("name", m["id"])})
                free_models.insert(0, {"id": "openrouter/free", "name": "🎲 مسیریاب خودکار"})
                return {"models": free_models}
        except: pass
    return {"models": []}

@router.post("/chat")
async def chat_endpoint(request: Request):
    data = await request.json()
    api_key = request.headers.get("X-Api-Key") or os.environ.get("OPENROUTER_API_KEY")
    if not api_key: raise HTTPException(status_code=401, detail="API Key missing")

    final_sys = data.get("system_prompt", "") + "\n\n"
    if data.get("agent_mode"): final_sys += "حالت عامل فعال است.\n"
    if "python_expert" in data.get("active_skills", []): final_sys += "تو یک برنامه‌نویس پایتون هستی.\n"
    if "image_editor" in data.get("active_skills", []): final_sys += "تو یک متخصص تصویر هستی.\n"
    final_sys += "برای تولید تصویر: ![توصیف](https://image.pollinations.ai/prompt/{prompt}?nologo=true)\n"
    final_sys += "برای اجرای کد: کد را دقیقاً در تگ <run_python>کد شما</run_python> قرار بده.\n"

    msgs = data.get("messages", [])[-20:]
    if final_sys.strip(): msgs.insert(0, {"role": "system", "content": final_sys.strip()})

    headers = {"Authorization": f"Bearer {api_key.strip()}", "Content-Type": "application/json"}
    payload = {"model": data.get("model"), "messages": msgs, "temperature": data.get("temperature", 0.7), "stream": True, "stream_options": {"include_usage": True}}
    if "web_search" in data.get("active_tools", []): payload["plugins"] = [{"id": "web"}]

    async def gen():
        async with httpx.AsyncClient(timeout=180.0) as client:
            try:
                async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as res:
                    if res.status_code != 200:
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Error {res.status_code}'})}\n\n"; return
                    async for line in res.aiter_lines():
                        if line.startswith("data: "):
                            ld = line[6:].strip()
                            if ld == "[DONE]": break
                            try:
                                parsed = json.loads(ld)
                                if parsed.get("choices"):
                                    d = parsed["choices"][0].get("delta", {})
                                    if d.get("content"): yield f"data: {json.dumps({'type': 'delta', 'text': d['content']})}\n\n"
                                    if d.get("reasoning_content") or d.get("reasoning"): yield f"data: {json.dumps({'type': 'reasoning', 'text': d.get('reasoning_content') or d.get('reasoning')})}\n\n"
                                if parsed.get("usage"): yield f"data: {json.dumps({'type': 'usage', 'usage': parsed['usage']})}\n\n"
                            except: pass
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as e: yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(gen(), media_type="text/event-stream")
