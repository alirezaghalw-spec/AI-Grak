// ---------------------------------------------------
// pyodide-worker.js
// اجرای پایتون در Web Worker (بدون قفل کردن UI)
// ---------------------------------------------------

import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs";

let pyodide = null;

async function getPyodide() {
    if (pyodide) return pyodide;
    pyodide = await loadPyodide();
    // batched خط‌به‌خط و بدون «\n» صدا زده می‌شود؛ بدون اضافه‌کردنش همهٔ printها به هم می‌چسبیدند
    pyodide.setStdout({ batched: (t) => postMessage({ type: "stdout", text: t + "\n" }) });
    pyodide.setStderr({ batched: (t) => postMessage({ type: "stderr", text: t + "\n" }) });
    return pyodide;
}

self.onmessage = async (e) => {
    const { type, code } = e.data || {};
    if (type !== "run") return;

    try {
        const py = await getPyodide();

        // پکیج‌هایی که کد import می‌کند (numpy، matplotlib، ...) به‌صورت خودکار دانلود می‌شوند
        await py.loadPackagesFromImports(code);

        // matplotlib در worker صفحه ندارد؛ بک‌اند بدون نمایش لازم است
        if (/matplotlib/.test(code)) {
            await py.runPythonAsync("import matplotlib\nmatplotlib.use('agg')");
        }

        // اجرای کد
        await py.runPythonAsync(code);

        // بررسی اگر نمودار matplotlib تولید شده
        const hasFig = await py.runPythonAsync(`
try:
    import matplotlib.pyplot as plt
    _has = bool(plt.get_fignums())
except Exception:
    _has = False
_has
`);

        if (hasFig) {
            const b64 = await py.runPythonAsync(`
import io, base64
_buf = io.BytesIO()
plt.savefig(_buf, format='png', bbox_inches='tight')
_buf.seek(0)
base64.b64encode(_buf.read()).decode('utf-8')
`);
            postMessage({ type: "image", data: b64 });
            await py.runPythonAsync("plt.close('all')");
        }

        postMessage({ type: "done" });
    } catch (err) {
        postMessage({ type: "stderr", text: String(err) });
        postMessage({ type: "done" });
    }
};
