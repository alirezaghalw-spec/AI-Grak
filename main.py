import json
import struct
import zlib
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from security import BodyLimitMiddleware, SecurityHeadersMiddleware
from api_routes import router as api_router
from email_auth import router as email_router

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="هوش پرو", docs_url=None, redoc_url=None)

# ------------------------------------------------- میدل‌ویرها
# سقف پیش‌فرض ۳۰۰ کیلوبایت است؛ آپلود PDF و تصویر (base64) سقف بالاتر لازم دارند
app.add_middleware(
    BodyLimitMiddleware,
    limits={
        "/parse-pdf": 15_000_000,
        "/chat": 12_000_000,
    },
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_headers=["*"],
    allow_methods=["*"],
)

# ------------------------------------------------- روترها
app.include_router(api_router)
app.include_router(email_router)

# ------------------------------------------------- فایل‌های استاتیک
for _name in ("css", "js"):
    if (BASE_DIR / _name).is_dir():
        app.mount(f"/{_name}", StaticFiles(directory=str(BASE_DIR / _name)), name=_name)


@app.get("/health")
async def health():
    return {"ok": True}


# ------------------------------------------------- آیکون‌های PWA (تولید در لحظه)
@lru_cache(maxsize=8)
def _make_png(size: int, maskable: bool = False) -> bytes:
    """یک PNG با لوگوی پیکسلی ۸×۸ تولید می‌کند."""
    logo = [
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 0, 0, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
    ]
    bg = (30, 30, 30)
    fg = (201, 100, 66)  # #c96442
    margin = size // 8 if not maskable else size // 4
    usable = size - 2 * margin
    cell = max(1, usable // 8)
    offset = (size - cell * 8) // 2

    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            if offset <= x < offset + cell * 8 and offset <= y < offset + cell * 8:
                gx = (x - offset) // cell
                gy = (y - offset) // cell
                if 0 <= gx < 8 and 0 <= gy < 8 and logo[gy][gx]:
                    row += bytes(fg)
                    continue
            row += bytes(bg)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


_ICONS = {
    "icon-192.png": (192, False),
    "icon-512.png": (512, False),
    "maskable-512.png": (512, True),
}


def _icon(name: str) -> Response:
    spec = _ICONS.get(name)
    if not spec:
        raise HTTPException(status_code=404)
    return Response(
        _make_png(*spec),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/icons/{name}")
async def icons(name: str):
    return _icon(name)


# مسیرهای قدیمی (index.html از /icon-192.png استفاده می‌کند)
@app.get("/icon-192.png")
async def icon_192():
    return _icon("icon-192.png")


@app.get("/icon-512.png")
async def icon_512():
    return _icon("icon-512.png")


@app.get("/icon-maskable-512.png")
async def icon_maskable_512():
    return _icon("maskable-512.png")


# ------------------------------------------------- manifest و sw.js
@app.get("/manifest.json")
async def manifest():
    data = {
        "name": "هوش پرو",
        "short_name": "هوش",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#1e1e1e",
        "theme_color": "#c96442",
        "dir": "rtl",
        "lang": "fa",
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {
                "src": "/icons/maskable-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            },
        ],
    }
    return Response(json.dumps(data, ensure_ascii=False), media_type="application/manifest+json")


@app.get("/sw.js")
async def service_worker():
    path = BASE_DIR / "sw.js"
    if path.is_file():
        return FileResponse(
            path,
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache"},
        )
    return Response("// sw.js موجود نیست", media_type="application/javascript")


# ------------------------------------------------- index.html
@app.get("/", response_class=HTMLResponse)
async def index():
    path = BASE_DIR / "index.html"
    if path.is_file():
        return FileResponse(path, media_type="text/html", headers={"Cache-Control": "no-cache"})
    return HTMLResponse("<h1>index.html پیدا نشد</h1>", status_code=404)
