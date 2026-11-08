#!/bin/bash
# نصب ابزارهای پایه
apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    nodejs npm \
    gcc g++ gdb lldb \
    dotnet-sdk-8.0 \
    git curl wget

# ابزارهای پایتون
pip install debugpy ruff pyright pytest

# ابزارهای Node.js
npm install -g eslint prettier typescript ts-node nodemon

# ابزار دیباگ چندزبانه (MCP)
npm install -g debug-run
# یا
# pip install mcp-debugger

# ابزار دیباگ C/C++ (از قبل نصب شد)
# ابزار دیباگ C# (netcoredbg)
# برای .NET:
dotnet tool install -g dotnet-script
