export function speakText(text, callback) {
    if (!text || text.trim() === '') { if(callback) callback(); return; }
    let clean = text.replace(/[*#_`~>]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/```[\s\S]*?```/g, 'کد برنامه نویسی');
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean); u.lang = 'fa-IR'; u.rate = 0.95;
    u.onend = () => { if(callback) callback(); };
    window.speechSynthesis.speak(u);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fa-IR'; recognition.continuous = false; recognition.interimResults = false;
}
