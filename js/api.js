import { installedTools, installedSkills, isAgentMode, isCompareMode } from './state.js';

const API_BASE = window.location.origin;

// خطاهای FastAPI به شکل {detail: "..."} می‌آیند (مثلاً ۴۰۳ و ۴۲۹)؛ آن‌ها را به {error} تبدیل می‌کنیم
// تا بقیهٔ کد (که d.error و r.error می‌خواند) پیام درست را نشان دهد.
async function readJSON(res) {
    let d = null;
    try { d = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
        const detail = d && (typeof d.detail === 'string' ? d.detail : d.error);
        return { error: detail || `خطای سرور (${res.status})` };
    }
    return d || {};
}

export async function fetchModels() {
    try {
        const res = await fetch(`${API_BASE}/models`);
        if (!res.ok) throw new Error('Failed to fetch models');
        return await res.json();
    } catch (e) {
        console.warn(e);
        return { models: [] };
    }
}

export async function fetchConfig() {
    try {
        const res = await fetch(`${API_BASE}/config`);
        return await res.json();
    } catch (e) {
        return {};
    }
}

export async function sendChatRequest(messages, model, signal) {
    const key = (localStorage.getItem('hoosh_key') || '').trim();
    const key2 = (localStorage.getItem('hoosh_key2') || '').trim();
    const sys = localStorage.getItem('hoosh_sys') || '';
    const t = parseFloat(localStorage.getItem('hoosh_temp'));
    const temp = Number.isFinite(t) ? t : 0.7;   // قبلاً دمای صفر به 0.7 تبدیل می‌شد

    // کلیدها در هدر می‌روند (نه body)، چون بک‌اند از X-Api-Key می‌خواند و body لاگ/کش نمی‌شود
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['X-Api-Key'] = key;
    if (key2) headers['X-Api-Key-2'] = key2;

    return fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            messages,
            model,
            system_prompt: sys,
            temperature: temp,
            agent_mode: isAgentMode && !isCompareMode,
            active_tools: installedTools,
            active_skills: installedSkills
        }),
        signal
    });
}

export async function parsePDF(dataUrl) {
    const res = await fetch(`${API_BASE}/parse-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64_data: dataUrl })
    });
    return readJSON(res);
}

export async function fetchUrlContent(url) {
    try {
        const res = await fetch(`${API_BASE}/fetch-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        return await readJSON(res);
    } catch (e) {
        return { error: 'خطای شبکه' };
    }
}

export async function runPython(code) {
    try {
        const res = await fetch(`${API_BASE}/run-python`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        return await readJSON(res);
    } catch (e) {
        return { error: 'خطای شبکه' };
    }
}

// اجرای دستور ترمینال (فقط وقتی سرور با ENABLE_RUN_SHELL=1 بالا آمده باشد)
export async function runShell(command) {
    try {
        const res = await fetch(`${API_BASE}/run-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        const d = await readJSON(res);
        if (d.error && !d.output) return { output: d.error };
        return d;
    } catch (e) {
        return { output: 'خطای شبکه در اتصال به ترمینال' };
    }
}

export function errorText(rawError) {
    try {
        const data = JSON.parse(rawError);
        if (typeof data.detail === 'string') return data.detail;
        return data.error?.message || rawError;
    } catch (e) {
        return rawError;
    }
}
  
