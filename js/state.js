import { DEFAULT_MODELS } from './config.js';

const readJSON = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (e) { return fallback; }
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
// دما می‌تواند صفر باشد (قبلاً صفر به 0.7 تبدیل می‌شد)
export const getTemp = () => { const v = parseFloat(localStorage.getItem('hoosh_temp')); return Number.isFinite(v) ? v : 0.7; };

// جمع مصرف توکن و هزینه برای داشبورد (OpenRouter هزینه را در usage.cost می‌دهد)
export function addUsage(u) {
    const tokens = parseInt(u && u.total_tokens) || 0;
    const cost = parseFloat(u && (u.cost ?? u.total_cost)) || 0;
    localStorage.setItem('hoosh_total_tokens', (parseInt(localStorage.getItem('hoosh_total_tokens')) || 0) + tokens);
    localStorage.setItem('hoosh_total_cost', (parseFloat(localStorage.getItem('hoosh_total_cost')) || 0) + cost);
    return { tokens, cost };
}

export async function initDB() {
    try { convs = (await idbKeyval.get('hoosh_convs')) || []; } catch (e) { console.error('initDB', e); convs = []; }
}
export async function saveConvs() {
    try { await idbKeyval.set('hoosh_convs', convs); } catch (e) { console.error('saveConvs', e); }
}
