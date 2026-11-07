import os
import struct
import zlib
import json
from fastapi import FastAPI, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# نام دقیق کلاس/تابع را با حروف بزرگ اصلاح کردیم
from security import BodyLimitMiddleware, SecurityHeadersMiddleware
from api_routes import router as api_router
from email_auth import router as email_router


app = FastAPI(title="هوش پرو", docs_url=None, redoc_url=None)

# ------------------------------------------------- میدل‌ویرها
app.add_middleware(BodyLimitMiddleware)

# اتصال امن میدل‌ویر امنیتی
if hasattr(SecurityHeadersMiddleware, "__call__"):
    try:
        app.add_middleware(SecurityHeadersMiddleware)
    except TypeError:
        app.middleware("http")(SecurityHeadersMiddleware)

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
if os.path.isdir("css"):
    app.mount("/css", StaticFiles(directory="css"), name="css")
if os.path.isdir("cas"):
    app.mount("/cas", StaticFiles(directory="cas"), name="cas")
if os.path.isdir("js"):
    app.mount("/js", StaticFiles(directory="js"), name="js")


# ------------------------------------------------- آیکون‌های PWA (تولید در لحظه)
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


@app.get("/icon-192.png")
async def icon_192():
    return Response(_make_png(192), media_type="image/png")


@app.get("/icon-512.png")
async def icon_512():
    return Response(_make_png(512), media_type="image/png")


@app.get("/icon-maskable-512.png")
async def icon_maskable_512():
    return Response(_make_png(512, maskable=True), media_type="image/png")


# ------------------------------------------------- manifest و sw.js
@app.get("/manifest.json")
async def manifest():
    data = {
        "name": "هوش پرو",
        "short_name": "هوش",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#1e1e1e",
        "theme_color": "#c96442",
        "dir": "rtl",
        "lang": "fa",
        "icons": [
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {
                "src": "/icon-maskable-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            },
        ],
    }
    return Response(json.dumps(data, ensure_ascii=False), media_type="application/manifest+json")


@app.get("/sw.js")
async def service_worker():
    if os.path.isfile("sw.js"):
        return FileResponse("sw.js", media_type="application/javascript")
    return Response("// sw.js موجود نیست", media_type="application/javascript")


# ------------------------------------------------- index.html
@app.get("/", response_class=HTMLResponse)
async def index():
    if os.path.isfile("index.html"):
        return FileResponse("index.html", media_type="text/html")
    return HTMLResponse("<h1>index.html پیدا نشد</h1>", status_code=404)
