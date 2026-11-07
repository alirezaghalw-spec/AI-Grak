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
let warnedNoVoice = false;
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

// Chrome پخش متن‌های بلند را بعد از چند ثانیه قطع می‌کند؛ پس متن را به تکه‌های کوتاه می‌شکنیم
function chunkText(text, max = 180) {
    const sentences = text.replace(/[ \t]+/g, ' ').match(/[^.!?؟…\n]+[.!?؟…]*\n?/g) || [text];
    const chunks = [];
    let cur = '';
    const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
    for (const s of sentences) {
        if (s.length > max) {
            flush();
            let part = '';
            for (const w of s.split(' ')) {
                if ((part + ' ' + w).length > max) { if (part.trim()) chunks.push(part.trim()); part = w; }
                else part += (part ? ' ' : '') + w;
            }
            if (part.trim()) chunks.push(part.trim());
            continue;
        }
        if ((cur + s).length > max) flush();
        cur += s;
    }
    flush();
    return chunks;
}

function pickVoice() {
    const voices = window.speechSynthesis.getVoices() || [];
    const voice = voices.find((v) => /^fa/i.test(v.lang)) || null;
    if (!voice && voices.length && !warnedNoVoice) {
        warnedNoVoice = true;
        window.dispatchEvent(new CustomEvent('tts-no-voice'));
    }
    return voice;
}

export function speakText(text, callback) {
    if (!window.speechSynthesis || !text || text.trim() === '') { if (callback) setTimeout(callback, 0); return; }
    const clean = text
        .replace(/```[\s\S]*?```/g, 'کد برنامه نویسی')
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/[*#_`~>]/g, '');

    // تا وقتی ربات حرف می‌زند میکروفون خاموش باشد، وگرنه صدای خودش را می‌شنود
    if (recognition) { try { recognition.stop(); } catch (e) { /* ignore */ } }

    const id = ++speakId;
    window.speechSynthesis.cancel();
    const chunks = chunkText(clean);
    const voice = pickVoice();
    let i = 0;
    speaking = true;

    const next = () => {
        if (id !== speakId) return; // پخش جدید یا توقف
        if (i >= chunks.length) { speaking = false; if (callback) callback(); return; }
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        u.lang = 'fa-IR'; u.rate = 0.95;
        if (voice) u.voice = voice;
        u.onend = next;
        u.onerror = next;
        window.speechSynthesis.speak(u);
    };
    next();
}
