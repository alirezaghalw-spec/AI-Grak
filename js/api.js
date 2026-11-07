import { getKey, getKey2, getSysPrompt, getTemp, installedTools, installedSkills, isAgentMode } from './state.js';

const MAX_HISTORY = 20;
// محتوای فایل‌های پیوستی فقط برای چند پیام آخر دوباره فرستاده می‌شود
const FILE_WINDOW = 5;

async function postJSON(url, body) {
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        let d;
        try { d = await res.json(); } catch (e) { d = { error: `خطای سرور (${res.status})` }; }
        if (d && d.detail && !d.error) d.error = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail);
        if (!res.ok && !d.error) d.error = `خطای سرور (${res.status})`;
        return d;
    } catch (e) { return { error: e.message }; }
}

// پیام خطای خوانا از بدنهٔ پاسخ ناموفق (FastAPI خطاها را به شکل {"detail": ...} می‌فرستد)
export function errorText(raw) {
    try {
        const j = JSON.parse(raw);
        if (j && j.detail) return typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch (e) { /* متن خام */ }
    return String(raw || '').slice(0, 500);
}

export async function fetchModels() {
    try { return await (await fetch('/models')).json(); } catch (e) { return { error: e.message }; }
}

export async function fetchConfig() {
    try { return await (await fetch('/config')).json(); } catch (e) { return {}; }
}

const textOf = (c) => typeof c === 'string' ? c
    : Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text || '').join('\n') : '';
const imagesOf = (c) => Array.isArray(c) ? c.filter((p) => p && p.type === 'image_url') : [];

// تاریخچه را برای ارسال به مدل سبک می‌کند:
// - تصویرها فقط در آخرین پیام ارسال می‌شوند (نه در هر درخواست)
// - متن فایل‌ها فقط برای چند پیام آخر می‌ماند
export function buildApiMessages(msgs) {
    // پاسخ‌های «مدل دوم» در حالت مقایسه (alt) فقط برای نمایش ذخیره می‌شوند و به مدل فرستاده نمی‌شوند
    const recent = msgs.filter((m) => !m.alt).slice(-MAX_HISTORY);
    const last = recent.length - 1;
    return recent.map((m, i) => {
        const role = m.role === 'bot' ? 'assistant' : m.role;
        if (role !== 'user') return { role, content: textOf(m.content) };

        let text = textOf(m.content);
        const imgs = [
            ...imagesOf(m.content),
            ...(m.images || []).map((u) => ({ type: 'image_url', image_url: { url: u } }))
        ];
        const fresh = i >= last - FILE_WINDOW;
        for (const f of (m.files || [])) {
            text += fresh
                ? `\n\n[محتوای فایل (${f.name})]:\n${f.text}`
                : `\n\n[پیوست قبلی: ${f.name}. محتوا برای صرفه‌جویی حذف شده است]`;
        }
        if (imgs.length) {
            if (i === last) return { role, content: [{ type: 'text', text: text || 'تصویر را بررسی کن.' }, ...imgs] };
            text += `\n\n[${imgs.length} تصویر قبلاً ارسال شده بود]`;
        }
        return { role, content: text };
    });
}

export async function sendChatRequest(messagesSnapshot, modelToTry, signal) {
    const headers = { 'Content-Type': 'application/json', 'X-Api-Key': getKey().trim() };
    const k2 = getKey2().trim();
    if (k2) headers['X-Api-Key-2'] = k2;
    return await fetch('/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            messages: buildApiMessages(messagesSnapshot),
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
