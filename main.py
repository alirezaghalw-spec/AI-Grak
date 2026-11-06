import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# بررسی می‌کنیم اگر فایل api_routes وجود داشت ایمپورتش کنه
try:
    from api_routes import router
except ImportError:
    router = None

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if router:
    app.include_router(router)

# --- بخش محافظتی جدید: اگر پوشه‌ها نبودن، سرور کرش نکنه ---
if os.path.exists("css"):
    app.mount("/css", StaticFiles(directory="css"), name="css")
if os.path.exists("js"):
    app.mount("/js", StaticFiles(directory="js"), name="js")

@app.get("/")
async def serve_index(): return FileResponse("index.html")

@app.get("/manifest.json")
async def serve_manifest(): return FileResponse("manifest.json")

@app.get("/sw.js")
async def serve_sw(): return FileResponse("sw.js")
