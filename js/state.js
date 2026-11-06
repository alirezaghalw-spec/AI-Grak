import { DEFAULT_MODELS } from './config.js';

export let convs = []; 
export let cur = null;
export let busy = false;
export let attachments = [];
export let isCompareMode = false;
export let isAgentMode = false;
export let isVoiceChatMode = false;
export let installedTools = JSON.parse(localStorage.getItem('hoosh_tools') || '[]');
export let installedSkills = JSON.parse(localStorage.getItem('hoosh_skills') || '[]');
export let prompts = JSON.parse(localStorage.getItem('hoosh_prompts') || '[]');

// اصلاح شد: استفاده از DEFAULT_MODELS به عنوان پشتیبان
export let MODELS = JSON.parse(localStorage.getItem('hoosh_models_list') || 'null') || DEFAULT_MODELS;

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
export const getModel = () => localStorage.getItem('hoosh_model') || 'openrouter/free';
export const getSysPrompt = () => localStorage.getItem('hoosh_sys') || '';
export const getTemp = () => parseFloat(localStorage.getItem('hoosh_temp')) || 0.7;

export async function initDB() { 
    try { convs = await idbKeyval.get('hoosh_convs') || []; } catch(e) { convs = []; } 
}
export async function saveConvs() { 
    try { await idbKeyval.set('hoosh_convs', convs); } catch(e) {} 
}
