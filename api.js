const CHAT_URL = '/chat';
const MODELS_URL = '/models';
const PDF_URL = '/parse-pdf';
const FETCH_URL = '/fetch-url';
const RUN_URL = '/run-python';
const CONFIG_URL = '/config';

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

// ------------------------------------------------ chat (streaming)
export function sendChatRequest(messages, model, signal, opts = {}) {
    const body = {
        model,
        messages,
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

// ------------------------------------------------ debug (new)
export async function requestDebug(code, errorText, language = 'python') {
    try {
        const r = await fetch('/debug', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ code, error: errorText, language }),
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
