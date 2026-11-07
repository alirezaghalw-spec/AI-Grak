import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api_routes import router

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI()

# فرانت و بک‌اند هم‌مبدا هستند، پس CORS فقط وقتی لازم است که صریحاً بخواهی.
# مثال: ALLOWED_ORIGINS="https://my-site.com,https://other.com"
_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Api-Key", "X-Api-Key-2"],
    )

app.include_router(router)

# پیدا کردن پوشه استایل (چه اسمش css باشه چه cas)
css_folder = next((d for d in ("css", "cas") if os.path.isdir(os.path.join(BASE_DIR, d))), None)
if css_folder:
    app.mount("/css", StaticFiles(directory=os.path.join(BASE_DIR, css_folder)), name="css")

if os.path.isdir(os.path.join(BASE_DIR, "js")):
    app.mount("/js", StaticFiles(directory=os.path.join(BASE_DIR, "js")), name="js")


@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/manifest.json")
async def serve_manifest():
    return FileResponse(os.path.join(BASE_DIR, "manifest.json"))


@app.get("/sw.js")
async def serve_sw():
    return FileResponse(os.path.join(BASE_DIR, "sw.js"), media_type="application/javascript")


@app.get("/health")
async def health():
    return {"ok": True}
