import { DEFAULT_MODELS } from './config.js';

const readJSON = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (e) { return fallback; }
};

// اگر کتابخانه idb-keyval از CDN لود نشد (آفلاین/فیلتر)، به localStorage برمی‌گردیم تا برنامه نشکند
const store = {
    async get(k) {
        if (window.idbKeyval) return window.idbKeyval.get(k);
        try { return JSON.parse(localStorage.getItem('idb_' + k)); } catch (e) { return undefined; }
    },
    async set(k, v) {
        if (window.idbKeyval) return window.idbKeyval.set(k, v);
        localStorage.setItem('idb_' + k, JSON.stringify(v));
    }
};

export let convs = [];
export let cur = null;
export let busy = false;
export let attachments = [];
export let isCompareMode = false;
export let isAgentMode = false;
export let isVoiceChatMode = false;
export let installedTools = readJSON('hoosh_tools', []);
export let installedSkills = readJSON('hoosh_skills', []);
export let prompts = readJSON('hoosh_prompts', []);
export let MODELS = readJSON('hoosh_models_list', null) || DEFAULT_MODELS;

export function setConvs(newConvs) { convs = newConvs; }
export function setCur(newCur) { cur = newCur; }
export function setBusy(status) { busy = status; }
export function setAttachments(arr) { attachments = arr; }
export function toggleCompareMode() { isCompareMode = !isCompareMode; return isCompareMode; }
export function toggleAgentMode() { isAgentMode = !isAgentMode; return isAgentMode; }
export function toggleVoiceMode() { isVoiceChatMode = !isVoiceChatMode; return isVoiceChatMode; }
export function setModels(newModels) { MODELS = newModels; }
export function setInstalledTools(tools) { installedTools = tools; }
export function setInstalledSkills(skills) { installedSkills = skills; }
export function setPrompts(p) { prompts = p; }

export const getKey = () => localStorage.getItem('hoosh_key') || '';
export const getKey2 = () => localStorage.getItem('hoosh_key2') || '';
export const getModel = () => localStorage.getItem('hoosh_model') || 'openrouter/free';
export const getSysPrompt = () => localStorage.getItem('hoosh_sys') || '';
// دما می‌تواند صفر باشد
export const getTemp = () => { const v = parseFloat(localStorage.getItem('hoosh_temp')); return Number.isFinite(v) ? v : 0.7; };

// ---------------------------------------------------------------- آمار مصرف
// جمع کل + تفکیک بر اساس مدل + تفکیک روزانه (۳۰ روز اخیر) برای داشبورد
const DAYS_KEPT = 30;

// کلید روز به وقت محلی (نه UTC)، مثل 2026-11-07
export function dayKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const bump = (o, tokens, cost) => ({ tokens: (o?.tokens || 0) + tokens, cost: (o?.cost || 0) + cost, count: (o?.count || 0) + 1 });

// OpenRouter هزینه را در usage.cost می‌دهد
export function addUsage(u, model = 'unknown') {
    const tokens = parseInt(u && u.total_tokens) || 0;
    const cost = parseFloat(u && (u.cost ?? u.total_cost)) || 0;
    localStorage.setItem('hoosh_total_tokens', (parseInt(localStorage.getItem('hoosh_total_tokens')) || 0) + tokens);
    localStorage.setItem('hoosh_total_cost', (parseFloat(localStorage.getItem('hoosh_total_cost')) || 0) + cost);

    const byModel = readJSON('hoosh_usage_models', {});
    byModel[model] = bump(byModel[model], tokens, cost);
    localStorage.setItem('hoosh_usage_models', JSON.stringify(byModel));

    const days = readJSON('hoosh_usage_days', {});
    const k = dayKey();
    days[k] = bump(days[k], tokens, cost);
    // فقط ۳۰ روز آخر نگه داشته می‌شود
    const keep = Object.keys(days).sort().slice(-DAYS_KEPT);
    const trimmed = {}; keep.forEach((x) => { trimmed[x] = days[x]; });
    localStorage.setItem('hoosh_usage_days', JSON.stringify(trimmed));
    return { tokens, cost };
}

export function getUsageStats() {
    return {
        tokens: parseInt(localStorage.getItem('hoosh_total_tokens')) || 0,
        cost: parseFloat(localStorage.getItem('hoosh_total_cost')) || 0,
        byModel: readJSON('hoosh_usage_models', {}),
        days: readJSON('hoosh_usage_days', {})
    };
}

export function resetUsage() {
    ['hoosh_total_tokens', 'hoosh_total_cost', 'hoosh_usage_models', 'hoosh_usage_days'].forEach((k) => localStorage.removeItem(k));
}

export async function initDB() {
    try { convs = (await store.get('hoosh_convs')) || []; } catch (e) { console.error('initDB', e); convs = []; }
}
export async function saveConvs() {
    try { await store.set('hoosh_convs', convs); } catch (e) { console.error('saveConvs', e); }
}
