const CHAT_URL = '/chat';
const MODELS_URL = '/models';
const PDF_URL = '/parse-pdf';
const FETCH_URL = '/fetch-url';
const RUN_URL = '/run-python';
const CONFIG_URL = '/config';
const DEBUG_URL = '/debug';

// ------------------------------------------------ helpers
export function errorText(text) {
    try {
        const obj = JSON.parse(text);
        if (obj && typeof obj === 'object') {
            return obj.detail || obj.error || obj.message || text;
        }
    } catch (_) { /* not JSON */ }
    return text || 'خطای نامشخص';
}

function authHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    const key = (localStorage.getItem('hoosh_key') || '').trim();
    const session = (localStorage.getItem('hoosh_session') || '').trim();
    if (key) {
        headers['X-Api-Key'] = key;
        const key2 = (localStorage.getItem('hoosh_key2') || '').trim();
        if (key2) headers['X-Api-Key-2'] = key2;
    } else if (session) {
        headers['Authorization'] = 'Bearer ' + session;
    }
    return headers;
}

// ------------------------------------------------ config
export async function fetchConfig() {
    try {
        const r = await fetch(CONFIG_URL);
        if (!r.ok) return { run_python: false, server_key: false };
        return await r.json();
    } catch (_) {
        return { run_python: false, server_key: false };
    }
}

// ------------------------------------------------ models
export async function fetchModels() {
    try {
        const r = await fetch(MODELS_URL);
        if (!r.ok) return { models: [] };
        return await r.json();
    } catch (_) {
        return { models: [] };
    }
}

// ------------------------------------------------ ساخت پیام‌های API
// پیام‌های ذخیره‌شده در مرورگر فیلدهای اضافه دارند (images / files / cmp / alt / tool)
// که سرور (و OpenRouter) نمی‌فهمد؛ اینجا به قالب استاندارد تبدیل می‌شوند:
//  - پاسخ دوم حالت مقایسه (alt) حذف می‌شود
//  - متن فایل‌های پیوست به متن پیام اضافه می‌شود
//  - تصویر فقط روی آخرین پیام واقعی کاربر می‌ماند (حجم درخواست کم بماند)
export function buildApiMessages(msgs) {
    const clean = (Array.isArray(msgs) ? msgs : []).filter(
        (m) => m && !m.alt && (m.role === 'user' || m.role === 'assistant')
    );

    // آخرین پیام واقعی کاربر (نه نتیجهٔ ابزار)
    let lastReal = -1;
    clean.forEach((m, i) => { if (m.role === 'user' && !m.tool) lastReal = i; });

    const partsOf = (content) => {
        if (typeof content === 'string') return { text: content, images: [] };
        if (!Array.isArray(content)) return { text: '', images: [] };
        const text = content.filter((p) => p && p.type === 'text').map((p) => p.text || '').join('\n');
        const images = content
            .filter((p) => p && p.type === 'image_url' && p.image_url && p.image_url.url)
            .map((p) => p.image_url.url);
        return { text, images };
    };

    const out = [];
    clean.forEach((m, i) => {
        const { text: baseText, images: inlineImages } = partsOf(m.content);
        let text = baseText;
        if (Array.isArray(m.files) && m.files.length) {
            text += '\n\n' + m.files.map((f) => `[فایل: ${f.name}]\n${f.text || ''}`).join('\n\n');
        }

        if (m.role === 'assistant') {
            if (text.trim()) out.push({ role: 'assistant', content: text });
            return;
        }

        const images = i === lastReal ? [...inlineImages, ...(Array.isArray(m.images) ? m.images : [])] : [];
        if (images.length) {
            out.push({
                role: 'user',
                content: [
                    { type: 'text', text: text || 'تصویر را بررسی کن.' },
                    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
                ],
            });
        } else {
            out.push({ role: 'user', content: text });
        }
    });
    return out;
}

// ------------------------------------------------ chat (streaming)
export function sendChatRequest(messages, model, signal, opts = {}) {
    const body = {
        model,
        messages: buildApiMessages(messages),
        temperature: opts.temperature,
        active_skills: opts.active_skills,
        active_tools: opts.active_tools,
        agent_mode: opts.agent_mode || false,
        system_prompt: opts.system_prompt,
    };
    return fetch(CHAT_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
        signal,
    });
}

// ------------------------------------------------ PDF
export async function parsePDF(base64Data) {
    try {
        const r = await fetch(PDF_URL, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ base64_data: base64Data }),
        });
        if (!r.ok) return { error: errorText(await r.text()) };
        return await r.json();
    } catch (e) {
        return { error: e.message || 'خطای شبکه' };
    }
}

// ------------------------------------------------ fetch URL
export async function fetchUrlContent(url) {
    try {
        const r = await fetch(FETCH_URL, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ url }),
        });
        if (!r.ok) return { error: errorText(await r.text()) };
        return await r.json();
    } catch (e) {
        return { error: e.message || 'خطای شبکه' };
    }
}

// ------------------------------------------------ run python
export async function runPython(code) {
    try {
        const r = await fetch(RUN_URL, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ code }),
        });
        if (!r.ok) return { error: errorText(await r.text()) };
        return await r.json();
    } catch (e) {
        return { error: e.message || 'خطای شبکه' };
    }
}

// ------------------------------------------------ debug (استودیو)
// نام پارامتر قبلاً errorText بود و تابع errorText را می‌پوشاند → «errorText is not a function»
export async function requestDebug(code, errText, language = 'python', model = null) {
    try {
        const r = await fetch(DEBUG_URL, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ code, error: errText, language, model }),
        });
        if (!r.ok) return { error: errorText(await r.text()) };
        return await r.json();
    } catch (e) {
        return { error: e.message || 'خطای شبکه' };
    }
}

// ------------------------------------------------ auth
export async function emailStart(email) {
    const r = await fetch('/auth/email/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
    if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || 'ارسال کد ناموفق بود');
    }
    return r.json();
}

export async function emailVerify(email, code) {
    const r = await fetch('/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
    });
    if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || 'کد اشتباه است');
    }
    const d = await r.json();
    localStorage.setItem('hoosh_session', d.session_token);
    localStorage.setItem('hoosh_email', d.email);
    return d;
}

export async function logout() {
    const session = localStorage.getItem('hoosh_session') || '';
    try {
        await fetch('/auth/logout', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + session },
        });
    } catch (_) { /* ignore */ }
    localStorage.removeItem('hoosh_session');
    localStorage.removeItem('hoosh_email');
}

export async function getMe() {
    const session = localStorage.getItem('hoosh_session');
    if (!session) return null;
    try {
        const r = await fetch('/me', {
            headers: { Authorization: 'Bearer ' + session },
        });
        if (!r.ok) return null;
        return await r.json();
    } catch (_) {
        return null;
    }
}
