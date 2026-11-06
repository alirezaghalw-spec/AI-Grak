from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
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

@app.get("/")
async def serve_index(): return FileResponse("index.html")
@app.get("/manifest.json")
async def serve_manifest(): return FileResponse("manifest.json")
@app.get("/sw.js")
async def serve_sw(): return FileResponse("sw.js")
