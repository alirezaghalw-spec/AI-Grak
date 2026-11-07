// ---------------------------------------------------
// studio.js
// استودیوی کدنویسی: CodeMirror 5 + Pyodide + دیباگ
// ---------------------------------------------------

import { requestDebug } from './api.js';

let editor = null;
let worker = null;
let lastErrorText = '';

// -------------------------------------------------- راه‌اندازی اولیه
export function initStudio() {
    if (editor) return; // فقط یک‌بار

    const editorEl = document.getElementById('studio-editor');
    if (!editorEl || typeof CodeMirror === 'undefined') {
        console.warn('CodeMirror بارگذاری نشد');
        return;
    }

    editor = CodeMirror(editorEl, {
        value: `# کد پایتون خود را اینجا بنویسید
print("سلام از Pyodide")
`,
        mode: 'python',
        theme: 'material-darker',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true,
        direction: 'ltr',
    });

    // Worker برای پایتون
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

    // دکمه‌ها
    document.getElementById('studioRun').onclick = runCode;
    document.getElementById('studioClear').onclick = clearOutput;
    document.getElementById('studioHelp').onclick = askModelHelp;
    document.getElementById('studioLang').onchange = changeLanguage;
    document.getElementById('studioClose').onclick = () => {
        document.getElementById('studioPanel').classList.remove('on');
    };
    document.getElementById('studioRejectDiff').onclick = () => {
        document.getElementById('studio-diff').style.display = 'none';
    };
    document.getElementById('studioApplyDiff').onclick = applyDiff;
}

// -------------------------------------------------- خروجی
function appendOutput(text) {
    const out = document.getElementById('studio-output');
    out.textContent += text;
    out.scrollTop = out.scrollHeight;
}

function clearOutput() {
    document.getElementById('studio-output').textContent = '';
    document.getElementById('studio-image').style.display = 'none';
    document.getElementById('studio-diff').style.display = 'none';
    lastErrorText = '';
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
        img.src = 'data:image/png;base64,' + d.data;
        img.style.display = 'block';
    } else if (d.type === 'done') {
        appendOutput('\n--- اجرا تمام شد ---\n');
    }
}

// -------------------------------------------------- تغییر زبان
function changeLanguage() {
    if (!editor) return;
    const mode = document.getElementById('studioLang').value;
    editor.setOption('mode', mode);

    // پیش‌فرض هر زبان
    if (mode === 'python') {
        editor.setValue('# کد پایتون\nprint("سلام")\n');
    } else if (mode === 'javascript') {
        editor.setValue('// کد JavaScript\nconsole.log("سلام");\n');
    } else if (mode === 'text/x-c++src') {
        editor.setValue('// کد C++\n#include <iostream>\nint main() {\n    std::cout << "سلام\\n";\n    return 0;\n}\n');
    }
}

// -------------------------------------------------- اجرای کد
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

    const script = `
<script>
(function(){
    const _log = console.log;
    const send = (type, text) => parent.postMessage({ __studio: true, type, text }, '*');
    console.log = (...args) => { send('stdout', args.join(' ') + '\\n'); _log(...args); };
    console.error = (...args) => { send('stderr', args.join(' ') + '\\n'); };
    try {
        ${code}
        send('done', '');
    } catch (e) {
        send('stderr', String(e) + '\\n');
        send('done', '');
    }
})();
<\/script>`;

    iframe.srcdoc = script;

    const listener = (e) => {
        if (!e.data || !e.data.__studio) return;
        if (e.data.type === 'stdout') appendOutput(e.data.text);
        else if (e.data.type === 'stderr') {
            appendOutput('\n[err] ' + e.data.text + '\n');
            lastErrorText += e.data.text + '\n';
        } else if (e.data.type === 'done') {
            appendOutput('\n--- اجرا تمام شد ---\n');
            window.removeEventListener('message', listener);
            setTimeout(() => iframe.remove(), 500);
        }
    };
    window.addEventListener('message', listener);
}

// -------------------------------------------------- کمک از مدل
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
    const result = await requestDebug(code, lastErrorText || '(بدون خطا)', language);

    if (result.error) {
        appendOutput('❌ ' + result.error + '\n');
        return;
    }

    const suggestion = result.suggestion || '';
    // جستجوی blok diff
    const diffMatch = suggestion.match(/```diff\n([\s\S]*?)```/);
    if (diffMatch) {
        document.getElementById('studio-diff-content').textContent = diffMatch[1];
        document.getElementById('studio-diff').style.display = 'block';
    } else {
        appendOutput('\n📝 پیشنهاد مدل:\n' + suggestion + '\n');
    }
}

// -------------------------------------------------- اعمال diff
function applyDiff() {
    if (!editor) return;
    const diffText = document.getElementById('studio-diff-content').textContent;

    // diff ساده: خطوط با - حذف، با + اضافه می‌شوند
    // این یک پیاده‌سازی ساده است، برای diff پیچیده از کتابخانه استفاده کنید
    const lines = diffText.split('\n');
    const removed = [];
    const added = [];
    for (const line of lines) {
        if (line.startsWith('-') && !line.startsWith('---')) removed.push(line.slice(1));
        else if (line.startsWith('+') && !line.startsWith('+++')) added.push(line.slice(1));
    }

    let current = editor.getValue();
    for (const r of removed) {
        current = current.replace(r, '');
    }
    // افزودن ساده: خطوط + را به انتهای فایل اضافه می‌کنیم
    if (added.length) {
        current += '\n' + added.join('\n');
    }
    editor.setValue(current);

    document.getElementById('studio-diff').style.display = 'none';
    appendOutput('\n✅ تغییرات اعمال شد.\n');
}

// -------------------------------------------------- اتصال دکمه استودیو در منو
document.addEventListener('DOMContentLoaded', () => {
    const studioBtn = document.getElementById('studioBtn');
    if (studioBtn) {
        studioBtn.addEventListener('click', () => {
            document.getElementById('studioPanel').classList.add('on');
            initStudio();
        });
    }
});
