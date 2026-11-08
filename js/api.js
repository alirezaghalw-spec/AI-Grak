const API_BASE = window.location.origin;

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
    const key = localStorage.getItem('hoosh_key');
    const key2 = localStorage.getItem('hoosh_key2');
    const sys = localStorage.getItem('hoosh_sys');
    const temp = parseFloat(localStorage.getItem('hoosh_temp')) || 0.7;

    return fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages, model, key, key2, system: sys, temperature: temp
        }),
        signal
    });
}

export async function parsePDF(dataUrl) {
    const res = await fetch(`${API_BASE}/parse-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: dataUrl })
    });
    return res.json();
}

export async function fetchUrlContent(url) {
    const res = await fetch(`${API_BASE}/fetch-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
    return res.json();
}

export async function runPython(code) {
    const res = await fetch(`${API_BASE}/run-python`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    return res.json();
}

// ✅ تابع جدید برای اجرای دستورات ترمینال
export async function runShell(command) {
    try {
        const res = await fetch(`${API_BASE}/run-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        return await res.json();
    } catch (e) {
        return { output: 'خطای شبکه در اتصال به ترمینال' };
    }
}

export function errorText(rawError) {
    try {
        const data = JSON.parse(rawError);
        return data.error?.message || rawError;
    } catch (e) {
        return rawError;
    }
}
