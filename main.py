import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api_routes import router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# پیدا کردن پوشه استایل (چه اسمش css باشه چه cas)
css_folder = "css" if os.path.exists("css") else ("cas" if os.path.exists("cas") else None)
if css_folder:
    app.mount("/css", StaticFiles(directory=css_folder), name="css")

# سرو کردن پوشه جاوااسکریپت
if os.path.exists("js"):
    app.mount("/js", StaticFiles(directory="js"), name="js")

@app.get("/")
async def serve_index(): return FileResponse("index.html")

@app.get("/manifest.json")
async def serve_manifest(): return FileResponse("manifest.json")

@app.get("/sw.js")
async def serve_sw(): return FileResponse("sw.js")
