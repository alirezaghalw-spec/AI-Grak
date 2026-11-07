const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fa-IR';
    recognition.continuous = true;      // شنیدن مداوم
    recognition.interimResults = true;  // نمایش زنده کلمات
}

let speaking = false;
let speakId = 0;
export const isSpeaking = () => speaking;

export function startListening() {
    if (!recognition) return;
    try { recognition.start(); } catch (e) { /* قبلاً شروع شده */ }
}

export function stopSpeaking() {
    speakId++;
    speaking = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
}

export function speakText(text, callback) {
    if (!window.speechSynthesis || !text || text.trim() === '') { if (callback) setTimeout(callback, 0); return; }
    const clean = text
        .replace(/```[\s\S]*?```/g, 'کد برنامه نویسی')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/[*#_`~>]/g, '');

    // تا وقتی ربات حرف می‌زند میکروفون خاموش باشد، وگرنه صدای خودش را می‌شنود
    if (recognition) { try { recognition.stop(); } catch (e) {} }

    const id = ++speakId;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'fa-IR'; u.rate = 0.95;
    const finish = () => { if (id !== speakId) return; speaking = false; if (callback) callback(); };
    u.onend = finish;
    u.onerror = finish;
    speaking = true;
    window.speechSynthesis.speak(u);
}
