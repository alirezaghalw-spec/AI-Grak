import os
import zlib
import struct
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api_routes import router
from security import BodyLimitMiddleware, SecurityHeadersMiddleware

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI()

# سقف حجم بدنهٔ درخواست‌ها (بایت). مسیرهایی که اینجا نیامده‌اند سقف ۳۰۰ کیلوبایت دارند.
app.add_middleware(
    BodyLimitMiddleware,
    default_limit=300_000,
    limits={"/parse-pdf": 16_000_000, "/chat": 25_000_000},
)
app.add_middleware(SecurityHeadersMiddleware)

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

# ✅ این خط در نسخهٔ قبلی نبود و باعث می‌شد هیچ‌کدام از API ها وجود نداشته باشند
app.include_router(router)

# پیدا کردن پوشه استایل (چه اسمش css باشه چه cas)
css_folder = next((d for d in ("css", "cas") if os.path.isdir(os.path.join(BASE_DIR, d))), None)
if css_folder:
    app.mount("/css", StaticFiles(directory=os.path.join(BASE_DIR, css_folder)), name="css")

if os.path.isdir(os.path.join(BASE_DIR, "js")):
    app.mount("/js", StaticFiles(directory=os.path.join(BASE_DIR, "js")), name="js")


# ---------------------------------------------------------------- آیکون‌های PWA
# آیکون‌ها (همان لوگوی پیکسلی هدر، با رنگ‌های تم) در لحظه ساخته می‌شوند تا نیازی به آپلود فایل PNG نباشد.
_BG = "#faf9f5"
_ART = [
    (0, 0, 8, 8, _BG),
    (1, 1, 6, 5, "#c96442"),
    (2, 2, 1, 1, _BG),
    (5, 2, 1, 1, _BG),
    (2, 4, 4, 1, _BG),
    (3, 0, 2, 1, "#c96442"),
    (1, 6, 6, 1, "#c96442"),
]


def _hex(c: str):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


@lru_cache(maxsize=8)
def _icon_png(size: int, maskable: bool) -> bytes:
    bg = _hex(_BG)
    grid = [[bg] * 8 for _ in range(8)]
    for x, y, w, h, c in _ART:
        rgb = _hex(c)
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                grid[yy][xx] = rgb
    # در حالت maskable لوگو کوچک‌تر و وسط می‌ماند تا برش دایره‌ای آن را نبُرد
    art = int(size * 0.62) if maskable else size
    off = (size - art) // 2
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            ax, ay = px - off, py - off
            if 0 <= ax < art and 0 <= ay < art:
                rgb = grid[ay * 8 // art][ax * 8 // art]
            else:
                rgb = bg
            row += bytes(rgb)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(t: bytes, d: bytes) -> bytes:
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def _icon_response(size: int, maskable: bool) -> Response:
    if size not in (192, 512):
        raise HTTPException(status_code=404, detail="not found")
    return Response(
        _icon_png(size, maskable),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/icons/icon-{size}.png")
async def icon(size: int):
    return _icon_response(size, False)


@app.get("/icons/maskable-{size}.png")
async def icon_maskable(size: int):
    return _icon_response(size, True)


@app.get("/favicon.ico")
async def favicon():
    return _icon_response(192, False)


# ---------------------------------------------------------------- صفحه اصلی و فایل‌های PWA
@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"), headers={"Cache-Control": "no-cache"})


@app.get("/manifest.json")
async def serve_manifest():
    return FileResponse(os.path.join(BASE_DIR, "manifest.json"), media_type="application/manifest+json")


@app.get("/sw.js")
async def serve_sw():
    return FileResponse(
        os.path.join(BASE_DIR, "sw.js"),
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/health")
async def health():
    return {"ok": True}
