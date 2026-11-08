# تغییرات کوچک باقی‌مانده

فایل‌های کامل این پوشه را جایگزین فایل‌های هم‌نام مخزن کنید:
`main.py`، `api_routes.py`، `sw.js`، `js/config.js`، `js/api.js`

سه فایل زیر فقط چند خط تغییر دارند.

## 1) js/main.js

### الف) ابزار ترمینال فقط وقتی سرور فعالش کرده باشد شناسایی شود

پیدا کنید:

```js
    m = /<shell>\s*([\s\S]*?)\s*<\/shell>/.exec(t);
    if (m) return { name: 'shell', arg: m[1].trim() };
```

جایگزین کنید با:

```js
    if (window.APP_CONFIG && window.APP_CONFIG.run_shell) {
        m = /<shell>\s*([\s\S]*?)\s*<\/shell>/.exec(t);
        if (m) return { name: 'shell', arg: m[1].trim() };
    }
```

### ب) قبل از اجرای هر دستور ترمینال از کاربر تأیید گرفته شود

پیدا کنید:

```js
    if (tool.name === 'shell') {
        const r = await runShell(tool.arg);
```

جایگزین کنید با:

```js
    if (tool.name === 'shell') {
        if (!confirm('مدل می‌خواهد این دستور را روی سرور اجرا کند:\n\n' + tool.arg.slice(0, 500) + '\n\nاجازه می‌دهید؟')) {
            return 'کاربر اجرای دستور را رد کرد.';
        }
        const r = await runShell(tool.arg);
```

### پ) پیام روشن‌شدن حالت عامل

پیدا کنید:

```js
toast(mode ? 'حالت عامل روشن شد: مدل می‌تواند وب و ترمینال را اجرا کند.' : 'حالت عامل خاموش شد.');
```

جایگزین کنید با:

```js
toast(mode ? 'حالت عامل روشن شد: مدل می‌تواند صفحات وب را بخواند.' : 'حالت عامل خاموش شد.');
```

بقیهٔ `main.js` بدون تغییر می‌ماند. باگ مدل تکراری با `config.js` جدید خودبه‌خود حل می‌شود.

## 2) tests/test_api.py

در `test_config` سه خط را به این شکل تغییر دهید (کلید `run_shell` اضافه شده):

```python
def test_config(monkeypatch):
    assert client.get("/config").json() == {"run_python": False, "run_shell": False, "server_key": False}
    monkeypatch.setenv("ENABLE_RUN_PYTHON", "1")
    monkeypatch.setenv("ALLOW_SERVER_KEY", "1")
    assert client.get("/config").json()["server_key"] is False      # بدون OPENROUTER_API_KEY
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-x")
    assert client.get("/config").json() == {"run_python": True, "run_shell": False, "server_key": True}
```

تست جدید برای ترمینال (به انتهای فایل اضافه کنید):

```python
def test_run_shell_disabled_by_default():
    assert client.post("/run-shell", json={"command": "echo 1"}).status_code == 403


def test_run_shell_enabled(monkeypatch):
    monkeypatch.setenv("ENABLE_RUN_SHELL", "1")
    monkeypatch.setenv("SECRET_FOR_TEST", "leak")
    r = client.post("/run-shell", json={"command": "echo hi"}).json()
    assert r["output"].strip() == "hi" and r["exit_code"] == 0
    r = client.post("/run-shell", json={"command": "echo $SECRET_FOR_TEST"}).json()
    assert "leak" not in r["output"]          # متغیرهای محیطی سرور به دستور داده نمی‌شود
```

## 3) README.md

در جدول متغیرهای محیطی این ردیف را اضافه کنید:

| متغیر | کاربرد |
|---|---|
| `ENABLE_RUN_SHELL=1` | اجرای دستور ترمینال روی سرور در حالت عامل (با تأیید کاربر). **خطرناک است؛ فقط روی سیستم شخصی/محلی، نه روی Render عمومی.** |

## بعد از آپلود

1. در Render یک بار Deploy کنید.
2. در مرورگر یک بار صفحه را Hard Refresh کنید تا Service Worker نسخهٔ `hoosh-pro-v6` جایگزین شود.
3. اگر هنوز صفحه خالی بود، کنسول مرورگر را برای خطای import بررسی کنید.
