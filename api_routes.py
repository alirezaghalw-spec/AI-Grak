from fastapi import APIRouter
from pydantic import BaseModel
import subprocess
import os

router = APIRouter()

class ShellRequest(BaseModel):
    command: str

@router.post("/run-shell")
async def run_shell(req: ShellRequest):
    # ⚠️ هشدار امنیتی: این کد اجازه اجرای دستورات لینوکس را به هوش مصنوعی می‌دهد.
    # حتماً فقط روی سیستم شخصی (Local) از این قابلیت استفاده کنید و نه روی سرور عمومی (Render).
    try:
        # اجرای دستور با محدودیت زمانی ۳۰ ثانیه در پوشه پروژه
        result = subprocess.run(
            req.command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=os.getcwd()
        )
        
        output = result.stdout
        if result.stderr:
            output += "\n[Errors/Warnings]:\n" + result.stderr
            
        if not output.strip():
            output = "(دستور بدون خروجی اجرا شد)"
            
        return {"output": output, "exit_code": result.returncode}
        
    except subprocess.TimeoutExpired:
        return {"output": "خطا: زمان اجرای دستور (۳۰ ثانیه) به پایان رسید."}
    except Exception as e:
        return {"output": f"خطا در اجرا: {str(e)}"}
