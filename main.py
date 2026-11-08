import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

# ساخت خودکار پوشه‌ها در صورت نبودن
for folder in ["css", "js", "icons"]:
    if not os.path.exists(folder):
        os.makedirs(folder)

# اتصال پوشه‌ها
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/icons", StaticFiles(directory="icons"), name="icons")

@app.get("/")
async def read_index():
    return FileResponse('index.html')

# ... (بقیه کدهای شما مثل include_router و ...)
