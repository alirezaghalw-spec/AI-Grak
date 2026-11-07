// ---------------------------------------------------
// studio.js
// استودیوی کدنویسی: CodeMirror 5 + Pyodide + دیباگ
// ---------------------------------------------------

// مسیر قبلاً '../api.js' بود (یعنی /api.js که وجود ندارد) و کل ماژول لود نمی‌شد
import { requestDebug } from './api.js';
import { getModel } from './state.js';

let editor = null;
let worker = null;
let lastErrorText = '';
let pendingFix = '';

// -------------------------------------------------- راه‌اندازی اولیه
export function initStudio() {
    if (editor) return;

    const editorEl = document.getElementById('studio-editor');
    if (!editorEl) return;
    if (typeof CodeMirror === 'undefined') {
        console.warn('CodeMirror بارگذاری نشد');
        editorEl.textContent = '⚠️ CodeMirror بارگذاری نشد. اتصال اینترنت را بررسی کنید.';
        return;
    }

    editor = CodeMirror(editorEl, {
        value: '# کد پایتون خود را اینجا بنویسید\nprint("سلام از Pyodide")\n',
        mode: 'python',
        theme: 'material-darker',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true,
        direction: 'ltr',
    });

    try {
        worker = new Worker('/js/pyodide-worker.js', { type: 'module' });
        worker.onmessage = handleWorkerMessage;
        worker.onerror = (err) => {
            appendOutput('\n[Worker Error] ' + err.message + '\n');
        };
    } catch (e) {
        console.warn('Worker ساخت نشد:', e);
        appendOutput('⚠️ Pyodide در این مرورگر بارگذاری نشد.\n');
    }

    const runBtn = document.getElementById('studioRun');
    const clearBtn = document.getElementById('studioClear');
    const helpBtn = document.getElementById('studioHelp');
    const langSel = document.getElementById('studioLang');
    const closeBtn = document.getElementById('studioClose');
    const rejectBtn = document.getElementById('studioRejectDiff');
    const applyBtn = document.getElementById('studioApplyDiff');

    if (runBtn) runBtn.onclick = runCode;
    if (clearBtn) clearBtn.onclick = clearOutput;
    if (helpBtn) helpBtn.onclick = askModelHelp;
    if (langSel) langSel.onchange = changeLanguage;
    if (closeBtn) closeBtn.onclick = () => {
        document.getElementById('studioPanel').classList.remove('on');
    };
    if (rejectBtn) rejectBtn.onclick = () => {
        pendingFix = '';
        document.getElementById('studio-diff').style.display = 'none';
    };
    if (applyBtn) applyBtn.onclick = applyFix;
}

function appendOutput(text) {
    const out = document.getElementById('studio-output');
    if (!out) return;
    out.textContent += text;
    out.scrollTop = out.scrollHeight;
}

function clearOutput() {
    const out = document.getElementById('studio-output');
    if (out) out.textContent = '';
    const img = document.getElementById('studio-image');
    if (img) img.style.display = 'none';
    const diff = document.getElementById('studio-diff');
    if (diff) diff.style.display = 'none';
    lastErrorText = '';
    pendingFix = '';
}

function handleWorkerMessage(e) {
    const d = e.data || {};
    if (d.type === 'stdout') {
        appendOutput(d.text);
    } else if (d.type === 'stderr') {
        appendOutput('\n[err] ' + d.text + '\n');
        lastErrorText += d.text + '\n';
    } else if (d.type === 'image') {
        const img = document.getElementById('studio-image');
        if (img) {
            img.src = 'data:image/png;base64,' + d.data;
            img.style.display = 'block';
        }
    } else if (d.type === 'done') {
        appendOutput('\n--- اجرا تمام شد ---\n');
    }
}

function changeLanguage() {
    if (!editor) return;
    const mode = document.getElementById('studioLang').value;
    editor.setOption('mode', mode);

    if (mode === 'python') {
        editor.setValue('# کد پایتون\nprint("سلام")\n');
    } else if (mode === 'javascript') {
        editor.setValue('// کد JavaScript\nconsole.log("سلام");\n');
    } else if (mode === 'text/x-c++src') {
        editor.setValue('// کد C++\n#include <iostream>\nint main() {\n    std::cout << "سلام\\n";\n    return 0;\n}\n');
    }
}

function runCode() {
    if (!editor) return;
    const mode = document.getElementById('studioLang').value;
    const code = editor.getValue();
    clearOutput();

    if (mode === 'python') {
        if (!worker) {
            appendOutput('⚠️ Worker پایتون آماده نیست.\n');
            return;
        }
        appendOutput('⏳ در حال اجرا...\n');
        worker.postMessage({ type: 'run', code });
    } else if (mode === 'javascript') {
        runJavaScript(code);
    } else if (mode === 'text/x-c++src') {
        appendOutput('ℹ️ اجرای C++ در مرورگر پشتیبانی نمی‌شود.\n');
        appendOutput('می‌توانید از دکمه «کمک از مدل» برای تحلیل کد استفاده کنید.\n');
    }
}

function runJavaScript(code) {
    appendOutput('⏳ در حال اجرا...\n');
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = 'allow-scripts';
    document.body.appendChild(iframe);

    // اگر کاربر در کدش </script> داشته باشد، تگ اسکریپت زودتر بسته می‌شد
    const safeCode = code.replace(/<\/script/gi, '<\\/script');

    const script = `<script>
(function(){
    const send = (type, text) => parent.postMessage({ __studio: true, type, text }, '*');
    const fmt = (a) => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
    };
    console.log = (...args) => send('stdout', args.map(fmt).join(' ') + '\\n');
    console.error = (...args) => send('stderr', args.map(fmt).join(' ') + '\\n');
    try {
        ${safeCode}
        send('done', '');
    } catch (e) {
        send('stderr', String(e) + '\\n');
        send('done', '');
    }
})();
<\/script>`;

    iframe.srcdoc = script;

    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        window.removeEventListener('message', listener);
        clearTimeout(timer);
        setTimeout(() => iframe.remove(), 300);
    };
    const listener = (e) => {
        // فقط پیام‌های همین iframe
        if (e.source !== iframe.contentWindow || !e.data || !e.data.__studio) return;
        if (e.data.type === 'stdout') appendOutput(e.data.text);
        else if (e.data.type === 'stderr') {
            appendOutput('\n[err] ' + e.data.text + '\n');
            lastErrorText += e.data.text + '\n';
        } else if (e.data.type === 'done') {
            appendOutput('\n--- اجرا تمام شد ---\n');
            finish();
        }
    };
    // کد با حلقهٔ بی‌نهایت یا async که هرگز تمام نمی‌شود، iframe را برای همیشه نگه می‌داشت
    const timer = setTimeout(() => {
        if (finished) return;
        appendOutput('\n⏱ زمان اجرا (۱۰ ثانیه) تمام شد و اجرا متوقف شد.\n');
        finish();
    }, 10000);
    window.addEventListener('message', listener);
}

// پاسخ مدل: توضیح + یک بلاک کد کامل. توضیح در خروجی چاپ می‌شود و کد اصلاح‌شده برای «اعمال» نگه داشته می‌شود
async function askModelHelp() {
    if (!editor) return;
    const code = editor.getValue();
    const langSelect = document.getElementById('studioLang');
    const languageMap = {
        'python': 'python',
        'javascript': 'javascript',
        'text/x-c++src': 'cpp',
    };
    const language = languageMap[langSelect.value] || 'python';

    appendOutput('\n⏳ در حال پرسیدن از مدل...\n');
    const result = await requestDebug(code, lastErrorText || '(بدون خطا)', language, getModel());

    if (result.error) {
        appendOutput('❌ ' + result.error + '\n');
        return;
    }

    const suggestion = result.suggestion || '';
    const blocks = [...suggestion.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
    const fixed = blocks.length ? blocks[blocks.length - 1][1].replace(/\n$/, '') : '';
    const explanation = suggestion.replace(/```[^\n]*\n[\s\S]*?```/g, '').trim();

    if (explanation) appendOutput('\n📝 تحلیل مدل:\n' + explanation + '\n');

    if (fixed) {
        pendingFix = fixed;
        document.getElementById('studio-diff-content').textContent = fixed;
        document.getElementById('studio-diff').style.display = 'block';
    } else if (!explanation) {
        appendOutput('\n📝 پیشنهاد مدل:\n' + suggestion + '\n');
    }
}

// قبلاً خطوط «-» با replace حذف و خطوط «+» ته فایل اضافه می‌شد (کد را به هم می‌ریخت)؛
// حالا کل کد اصلاح‌شدهٔ مدل جایگزین می‌شود
function applyFix() {
    if (!editor || !pendingFix) return;
    editor.setValue(pendingFix);
    pendingFix = '';
    document.getElementById('studio-diff').style.display = 'none';
    appendOutput('\n✅ کد اصلاح‌شده در ادیتور گذاشته شد.\n');
}

// -------------------------------------------------- اتصال دکمه استودیو در منو
function wireStudioButton() {
    const studioBtn = document.getElementById('studioBtn');
    if (studioBtn) {
        studioBtn.addEventListener('click', () => {
            document.getElementById('studioPanel').classList.add('on');
            initStudio();
        });
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireStudioButton);
} else {
    wireStudioButton();
}
