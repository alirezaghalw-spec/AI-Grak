import { getKey, getModel, getSysPrompt, getTemp, installedTools, installedSkills, isAgentMode } from './state.js';

export async function fetchModels() {
    let res = await fetch('/models'); 
    return await res.json();
}

export async function sendChatRequest(messagesSnapshot, modelToTry, signal) {
    return await fetch('/chat', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': getKey().trim() },
        body: JSON.stringify({ 
            messages: messagesSnapshot, 
            model: modelToTry, 
            system_prompt: getSysPrompt(), 
            temperature: getTemp(), 
            active_tools: installedTools, 
            active_skills: installedSkills, 
            agent_mode: isAgentMode, 
            stream: true 
        }),
        signal: signal
    });
}

export async function parsePDF(base64Data) {
    let res = await fetch('/parse-pdf', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({base64_data: base64Data}) });
    return await res.json();
}

export async function fetchUrlContent(url) {
    let res = await fetch('/fetch-url', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url: url}) });
    return await res.json();
}
