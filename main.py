from fastapi import APIRouter
from pydantic import BaseModel
import subprocess, tempfile, os, sys

router = APIRouter()

class CodeRequest(BaseModel):
    language: str
    code: str
    stdin: str = ""

@router.post("/run-code")
async def run_code(req: CodeRequest):
    with tempfile.TemporaryDirectory() as tmpdir:
        if req.language == "python":
            file_path = os.path.join(tmpdir, "main.py")
            with open(file_path, "w") as f:
                f.write(req.code)
            cmd = [sys.executable, file_path]
        
        elif req.language == "javascript":
            file_path = os.path.join(tmpdir, "main.js")
            with open(file_path, "w") as f:
                f.write(req.code)
            cmd = ["node", file_path]
        
        elif req.language == "csharp":
            file_path = os.path.join(tmpdir, "Program.cs")
            with open(file_path, "w") as f:
                f.write(req.code)
            cmd = ["dotnet", "run", "--project", tmpdir]
        
        elif req.language in ["c", "cpp"]:
            ext = ".c" if req.language == "c" else ".cpp"
            src = os.path.join(tmpdir, "main" + ext)
            out = os.path.join(tmpdir, "main")
            with open(src, "w") as f:
                f.write(req.code)
            compile_cmd = ["gcc", src, "-o", out] if req.language == "c" else ["g++", src, "-o", out]
            subprocess.run(compile_cmd, check=True)
            cmd = [out]
        
        else:
            return {"error": "زبان پشتیبانی نمی‌شود"}

        try:
            result = subprocess.run(
                cmd,
                input=req.stdin,
                capture_output=True,
                text=True,
                timeout=10
            )
            return {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"error": "زمان اجرا (۱۰ ثانیه) به پایان رسید"}
        except Exception as e:
            return {"error": str(e)}
