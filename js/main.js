import { initDB, saveConvs, setConvs, setCur, setBusy, setAttachments, toggleCompareMode, toggleAgentMode, toggleVoiceMode, setModels, setPrompts, addUsage, isCompareMode, isVoiceChatMode, getKey, getKey2, getModel, getSysPrompt, getTemp, convs, cur, prompts, attachments, busy } from './state.js';
import { fetchModels, fetchConfig, sendChatRequest, parsePDF, fetchUrlContent } from './api.js';
import { $, chat, addMsg, updateUI, renderAttachments, renderModelList, renderPrompts, renderStore, setupStoreTabs, loadConv, scrollDown, renderMd, enhanceMessage } from './ui.js';
import { speakText, stopSpeaking, startListening, isSpeaking, recognition } from './audio.js';

window.onerror = function (msg) { const b = $('jsErr'); if (b) { b.style.display = 'block'; b.textContent += 'JS error: ' + msg + '\n'; } };
const input = $('input'), sendBtn = $('sendBtn'), stopBtn = $('stopBtn');

marked.setOptions({ breaks: true }); // هایلایت کد در enhanceMessage انجام می‌شود (گزینه highlight در marked جدید حذف شده)
mermaid.initialize({ startOnLoad: false, theme: 'default' });
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(console.error); }

// --- میکروفون ---
function turnOffVoiceMode() {
    if (isVoiceChatMode) toggleVoiceMode();
    $('voiceChatBtn').classList.remove('active-compare');
}

if (recognition) {
    recognition.onstart = () => { if ($('micBtn')) { $('micBtn').classList.add('active-mic'); $('micBtn').textContent = '🔴'; } };

    recognition.onresult = (e) => {
        let finalTranscript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
        }
        if (finalTranscript) input.value += finalTranscript;
        if (isVoiceChatMode && finalTranscript.trim() !== '') {
            try { recognition.stop(); } catch (err) {}
            send();
        }
    };

    recognition.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        console.warn('خطای میکروفون:', e.error);
        if (e.error === 'not-allowed') {
            alert('دسترسی به میکروفون داده نشد. لطفاً از تنظیمات مرورگر اجازه دهید.');
            turnOffVoiceMode(); // وگرنه onend دوباره و دوباره تلاش می‌کرد
        }
        if ($('micBtn')) { $('micBtn').classList.remove('active-mic'); $('micBtn').textContent = '🎤'; }
    };

    recognition.onend = () => {
        if ($('micBtn')) { $('micBtn').classList.remove('active-mic'); $('micBtn').textContent = '🎤'; }
        // وقتی ربات در حال صحبت است میکروفون دوباره روشن نشود
        if (isVoiceChatMode && !busy && !isSpeaking()) startListening();
    };
}

// تم تاریک/روشن
if (localStorage.getItem('hoosh_theme') === 'dark') { document.body.classList.add('dark-mode'); $('themeBtn').textContent = '☀️'; }
$('themeBtn').onclick = () => { document.body.classList.toggle('dark-mode'); const d = document.body.classList.contains('dark-mode'); localStorage.setItem('hoosh_theme', d ? 'dark' : 'light'); $('themeBtn').textContent = d ? '☀️' : '🌙'; };

function decodeBase64Utf8(dataUrl) {
    const bin = atob(dataUrl.split(',')[1] || '');
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function addAttachment(a) {
    const next = [...attachments, a]; // قبلاً هر انتخاب فایل‌های قبلی را پاک می‌کرد
    setAttachments(next); renderAttachments(next);
}

async function send() {
    const text = input.value.trim();
    if ((!text && !attachments.length) || busy) return;
    if (!getKey().trim()) return alert('کلید API وارد نشده است.');

    setBusy(true);
    if (sendBtn) sendBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'block';
    window.abortController = new AbortController();

    try {
        let payloadText = text;
        if (attachments.length > 0) {
            const parts = [{ type: 'text', text: text || 'فایل‌ها را بررسی کن.' }];
            for (const a of attachments) {
                if (a.type.startsWith('image/')) parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
                else if (a.type === 'application/pdf') {
                    const data = await parsePDF(a.dataUrl);
                    parts[0].text += `\n\n[محتوای PDF (${a.name})]:\n${data.text || 'خطا: ' + (data.error || '')}`;
                } else {
                    parts[0].text += `\n\n[محتوای فایل (${a.name})]:\n${decodeBase64Utf8(a.dataUrl).slice(0, 5000)}`;
                }
            }
            payloadText = parts.length === 1 ? parts[0].text : parts;
        }

        input.value = ''; input.style.height = 'auto'; setAttachments([]); renderAttachments([]);
        const currentConv = cur || { id: Date.now().toString(36), title: 'گفتگوی جدید', messages: [], ts: Date.now() };
        setCur(currentConv);
        localStorage.setItem('hoosh_cur', currentConv.id);

        currentConv.messages.push({ role: 'user', content: payloadText });
        if (currentConv.messages.length === 1) currentConv.title = (text || 'فایل').slice(0, 40);
        if (convs.indexOf(currentConv) === -1) convs.unshift(currentConv);
        currentConv.ts = Date.now(); convs.sort((a, b) => b.ts - a.ts);
        await saveConvs();
        addMsg(payloadText, 'user');

        const messagesSnapshot = JSON.parse(JSON.stringify(currentConv.messages));
        let modelsToTry = [getModel()];
        if (isCompareMode) {
            const second = getModel() === 'openrouter/free' ? 'google/gemini-2.0-flash-exp:free' : 'openrouter/free';
            modelsToTry = [getModel(), second];
        }

        for (const m of modelsToTry) {
            const botEl = addMsg('', 'bot', Date.now() + Math.random().toString(36).substr(2, 5));
            const body = botEl._body;
            let currentText = '', usageData = null, reasoningText = '';

            const reasonBox = document.createElement('details');
            reasonBox.className = 'reasoning';
            reasonBox.innerHTML = '<summary>🤔 فرآیند تفکر مدل</summary><div class="reason-content"></div>';
            const reasonDiv = reasonBox.querySelector('.reason-content');

            let pending = false;
            const render = () => { pending = false; body.innerHTML = renderMd(currentText); scrollDown(); };
            const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(render); } };

            try {
                const res = await sendChatRequest(messagesSnapshot, m, window.abortController.signal);
                if (!res.ok) throw new Error(await res.text());

                const reader = res.body.getReader(), dec = new TextDecoder();
                let buf = '';
                while (true) {
                    const { done, value } = await reader.read(); if (done) break;
                    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
                    const parts = buf.split('\n\n'); buf = parts.pop();
                    for (const p of parts) {
                        if (!p.startsWith('data: ')) continue;
                        let d; try { d = JSON.parse(p.slice(6)); } catch (err) { continue; }
                        if (d.type === 'delta' && d.text) { currentText += d.text; schedule(); }
                        else if (d.type === 'reasoning' && d.text) {
                            reasoningText += d.text; reasonDiv.textContent = reasoningText; reasonBox.open = true;
                            if (!reasonBox.parentElement) botEl.prepend(reasonBox);
                        }
                        else if (d.type === 'usage') { usageData = d.usage; }
                        else if (d.type === 'error') { throw new Error(d.message); }
                    }
                }

                if (currentText) { render(); enhanceMessage(botEl, currentText); }
                else body.textContent = '(پاسخی دریافت نشد)';

                chat.querySelectorAll('.quick-replies').forEach((el) => el.remove());
                const qrDiv = document.createElement('div'); qrDiv.className = 'quick-replies';
                ['بیشتر توضیح بده', 'یک مثال بزن', 'بهینه‌سازی کن'].forEach((s) => {
                    const b = document.createElement('button'); b.className = 'quick-reply'; b.textContent = s;
                    b.onclick = () => { input.value = s; send(); }; qrDiv.appendChild(b);
                });
                botEl.appendChild(qrDiv);

                if (usageData) {
                    const { tokens, cost } = addUsage(usageData);
                    const u = document.createElement('div'); u.className = 'usage-info';
                    u.textContent = `Tokens: ${tokens} | Cost: $${cost.toFixed(5)}`; botEl.appendChild(u);
                }

                const tts = document.createElement('button'); tts.className = 'btn mint'; tts.textContent = '🔊';
                tts.style.cssText = 'position:absolute; bottom:4px; left:4px; padding:2px 6px; font-size:11px; box-shadow:none;';
                tts.onclick = (e) => { e.stopPropagation(); speakText(currentText, () => { if (isVoiceChatMode && !busy) startListening(); }); };
                botEl.appendChild(tts);

                if (isVoiceChatMode && m === getModel()) speakText(currentText, () => { if (isVoiceChatMode && !busy) startListening(); });

                if (m === getModel()) { currentConv.messages.push({ role: 'assistant', content: currentText }); await saveConvs(); }
            } catch (e) {
                if (e.name === 'AbortError') {
                    if (currentText) { render(); if (m === getModel()) { currentConv.messages.push({ role: 'assistant', content: currentText }); await saveConvs(); } }
                    botEl.insertAdjacentHTML('beforeend', '<div class="note" style="color:red">(متوقف شد)</div>');
                    break;
                }
                botEl.className = 'msg err'; botEl.textContent = 'خطا: ' + e.message;
            }
        }
    } catch (e) {
        alert('خطا: ' + e.message); // قبلاً خطا در پردازش فایل، برنامه را برای همیشه «مشغول» می‌گذاشت
    } finally {
        setBusy(false);
        if (sendBtn) sendBtn.style.display = 'block';
        if (stopBtn) stopBtn.style.display = 'none';
        window.abortController = null;
    }
}

// اتصال رویدادها
$('form').onsubmit = (e) => { e.preventDefault(); send(); };
$('stopBtn').onclick = () => window.abortController && window.abortController.abort();
input.oninput = function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 130) + 'px'; };
input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

$('micBtn').onclick = () => {
    if (!recognition) return alert('پشتیبانی نمی‌شود.');
    if ($('micBtn').classList.contains('active-mic')) { try { recognition.stop(); } catch (e) {} }
    else startListening();
};

$('voiceChatBtn').onclick = () => {
    if (!recognition) return alert('پشتیبانی نمی‌شود.');
    const mode = toggleVoiceMode();
    $('voiceChatBtn').classList.toggle('active-compare', mode);
    if (mode) startListening(); else { try { recognition.stop(); } catch (e) {} stopSpeaking(); }
};

$('attachBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = (e) => {
    for (const f of e.target.files) {
        if (f.size > 3000000) { alert('حجم ' + f.name + ' زیاد است.'); continue; }
        const r = new FileReader();
        r.onload = () => addAttachment({ name: f.name, type: f.type, dataUrl: r.result });
        r.readAsDataURL(f);
    }
    e.target.value = '';
};

$('modelBtn').onclick = () => { renderModelList(); $('modelOv').classList.add('on'); };
$('modelClose').onclick = () => $('modelOv').classList.remove('on');
$('refreshModelsBtn').onclick = async () => {
    const d = await fetchModels();
    if (d.models && d.models.length) { setModels(d.models); localStorage.setItem('hoosh_models_list', JSON.stringify(d.models)); renderModelList(); }
    else alert('دریافت لیست مدل‌ها ممکن نبود.');
};
$('compareBtn').onclick = () => { const mode = toggleCompareMode(); $('compareBtn').classList.toggle('active-compare', mode); };
$('agentBtn').onclick = () => { const mode = toggleAgentMode(); $('agentBtn').classList.toggle('active-compare', mode); };

setupStoreTabs();
$('storeBtn').onclick = () => { renderStore(); $('storeOv').classList.add('on'); };
$('storeClose').onclick = () => $('storeOv').classList.remove('on');

$('dashBtn').onclick = () => {
    $('totalCostDash').textContent = `$${(parseFloat(localStorage.getItem('hoosh_total_cost')) || 0).toFixed(5)}`;
    $('totalTokensDash').textContent = parseInt(localStorage.getItem('hoosh_total_tokens')) || 0;
    $('dashOv').classList.add('on');
};
$('dashClose').onclick = () => $('dashOv').classList.remove('on');

$('exportBtn').onclick = () => {
    if (!cur) return;
    const textOf = (c) => typeof c === 'string' ? c : (Array.isArray(c) ? ((c.find((p) => p.type === 'text') || {}).text || '') + '\n[تصویر]' : '');
    const md = cur.messages.map((m) => `### ${m.role === 'user' ? 'کاربر' : 'هوش'}\n${textOf(m.content)}`).join('\n\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = `chat-${cur.id}.md`; a.click();
};

$('setBtn').onclick = () => {
    $('keyInput').value = getKey(); $('keyInput2').value = getKey2();
    $('sysPromptInput').value = getSysPrompt(); $('tempInput').value = getTemp(); $('tempVal').textContent = getTemp();
    $('setOv').classList.add('on');
};
$('setClose').onclick = () => $('setOv').classList.remove('on');
$('tempInput').oninput = function () { $('tempVal').textContent = this.value; };
$('keySave').onclick = () => {
    localStorage.setItem('hoosh_key', $('keyInput').value.trim());
    localStorage.setItem('hoosh_key2', $('keyInput2').value.trim()); // قبلاً ذخیره نمی‌شد
    localStorage.setItem('hoosh_sys', $('sysPromptInput').value.trim());
    localStorage.setItem('hoosh_temp', $('tempInput').value);
    $('setOv').classList.remove('on');
};
$('clearChat').onclick = () => { if (cur) { cur.messages = []; saveConvs(); loadConv(cur.id, addMsg); } $('setOv').classList.remove('on'); };

$('convBtn').onclick = () => {
    const l = $('convList'); l.innerHTML = '';
    convs.forEach((c) => {
        const r = document.createElement('div'); r.className = 'citem';
        const b = document.createElement('button'); b.className = 'ct' + (cur && cur.id === c.id ? ' sel' : ''); b.textContent = c.title;
        b.onclick = () => { loadConv(c.id, addMsg); $('convOv').classList.remove('on'); };
        const d = document.createElement('button'); d.className = 'cd'; d.textContent = '×';
        d.onclick = (e) => {
            e.stopPropagation();
            setConvs(convs.filter((x) => x.id !== c.id));
            saveConvs();
            if (cur && cur.id === c.id) { setCur(null); localStorage.removeItem('hoosh_cur'); chat.innerHTML = ''; }
            $('convBtn').click();
        };
        r.appendChild(b); r.appendChild(d); l.appendChild(r);
    });
    $('convOv').classList.add('on');
};
$('convClose').onclick = () => $('convOv').classList.remove('on');
$('convNew').onclick = () => { setCur(null); localStorage.removeItem('hoosh_cur'); chat.innerHTML = ''; $('convOv').classList.remove('on'); };

$('promptBtn').onclick = () => { renderPrompts(); $('promptOv').classList.add('on'); };
$('promptClose').onclick = () => $('promptOv').classList.remove('on');
$('savePromptBtn').onclick = () => {
    const t = $('newPromptTitle').value.trim(), x = $('newPromptText').value.trim();
    if (t && x) {
        setPrompts([...prompts, { title: t, text: x }]);
        localStorage.setItem('hoosh_prompts', JSON.stringify(prompts));
        $('newPromptTitle').value = ''; $('newPromptText').value = '';
        renderPrompts();
    }
};

$('urlBtn').onclick = () => $('urlOv').classList.add('on');
$('urlClose').onclick = () => $('urlOv').classList.remove('on');
$('fetchUrlBtn').onclick = async () => {
    const u = $('urlInput').value.trim(); if (!u) return;
    $('fetchUrlBtn').textContent = '...';
    const d = await fetchUrlContent(u);
    if (d.text) { input.value += `\n\n[محتوای سایت ${u}]:\n${d.text}`; $('urlInput').value = ''; } else alert('خطا: ' + d.error);
    $('fetchUrlBtn').textContent = 'خواندن'; $('urlOv').classList.remove('on');
};

// شروع
initDB().then(async () => {
    window.APP_CONFIG = await fetchConfig();
    updateUI();
    const id = localStorage.getItem('hoosh_cur');
    if (!(id && loadConv(id, addMsg))) setCur(null);
});
                   
