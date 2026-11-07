import { getKey, getKey2, getSysPrompt, getTemp, installedTools, installedSkills, isAgentMode } from './state.js';

const MAX_HISTORY = 20;

async function postJSON(url, body) {
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json();
        if (d && d.detail && !d.error) d.error = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail);
        return d;
    } catch (e) { return { error: e.message }; }
}

export async function fetchModels() {
    try { return await (await fetch('/models')).json(); } catch (e) { return { error: e.message }; }
}

export async function fetchConfig() {
    try { return await (await fetch('/config')).json(); } catch (e) { return {}; }
}

export async function sendChatRequest(messagesSnapshot, modelToTry, signal) {
    const headers = { 'Content-Type': 'application/json', 'X-Api-Key': getKey().trim() };
    const k2 = getKey2().trim();
    if (k2) headers['X-Api-Key-2'] = k2;
    return await fetch('/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            messages: messagesSnapshot.slice(-MAX_HISTORY), // فقط ۲۰ پیام آخر (سرور هم همین کار را می‌کند)
            model: modelToTry,
            system_prompt: getSysPrompt(),
            temperature: getTemp(),
            active_tools: installedTools,
            active_skills: installedSkills,
            agent_mode: isAgentMode,
            stream: true
        }),
        signal
    });
}

export const parsePDF = (base64Data) => postJSON('/parse-pdf', { base64_data: base64Data });
export const fetchUrlContent = (url) => postJSON('/fetch-url', { url });
export const runPython = (code) => postJSON('/run-python', { code });
