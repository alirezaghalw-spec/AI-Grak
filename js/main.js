import { initDB, saveConvs, setConvs, setCur, setBusy, setAttachments, toggleCompareMode, toggleAgentMode, toggleVoiceMode, setModels, setPrompts, isCompareMode, isAgentMode, isVoiceChatMode, getKey, getModel, getSysPrompt, getTemp, MODELS, convs, cur, prompts, attachments, busy } from './state.js';
import { fetchModels, sendChatRequest, parsePDF, fetchUrlContent } from './api.js';
import { $, chat, addMsg, updateUI, renderAttachments, renderModelList, renderPrompts, renderStore, setupStoreTabs, loadConv, scrollDown } from './ui.js';
import { speakText, recognition } from './audio.js';

window.onerror = function(msg, src, line) { var b = $('jsErr'); if (b) { b.style.display = 'block'; b.textContent += 'JS error: ' + msg + '\n'; } };
const input = $('input'), sendBtn = $('sendBtn'), stopBtn = $('stopBtn');

marked.setOptions({ breaks: true, highlight: function(code, lang) { const l = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language: l }).value; } });
mermaid.initialize({ startOnLoad: false, theme: 'default' });
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(console.error); }

// --- تنظیمات میکروفون ---
if (recognition) {
    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        input.value = transcript;
        if (isVoiceChatMode) { send(); }
    };
    recognition.onend = () => { 
        if (isVoiceChatMode && !busy) { recognition.start(); } 
    };
}

// تم تاریک/روشن
if (localStorage.getItem('hoosh_theme') === 'dark') { document.body.classList.add('dark-mode'); $('themeBtn').textContent = '☀️'; }
$('themeBtn').onclick = () => { document.body.classList.toggle('dark-mode'); const d = document.body.classList.contains('dark-mode'); localStorage.setItem('hoosh_theme', d ? 'dark' : 'light'); $('themeBtn').textContent = d ? '☀️' : '🌙'; };

async function send() {
  let text = input.value.trim();
  if ((!text && !attachments.length) || busy) return;
  
  let key = getKey().trim();
  if (!key) return alert('کلید API وارد نشده است.');

  setBusy(true); if(sendBtn) sendBtn.style.display='none'; if(stopBtn) stopBtn.style.display='block';
  window.abortController = new AbortController();

  let payloadText = text;
  let currentAtts = attachments;
  if (currentAtts.length > 0) {
      let parts = [{ type: "text", text: text || "فایل‌ها را بررسی کن." }];
      for (let a of currentAtts) {
        if (a.type.startsWith('image/')) parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
        else if (a.type === 'application/pdf') {
          let data = await parsePDF(a.dataUrl);
          parts[0].text += `\n\n[محتوای PDF (${a.name})]:\n${data.text || 'خطا'}`;
        } else {
          let b64 = a.dataUrl.split(',')[1];
          parts[0].text += `\n\n[محتوای فایل (${a.name})]:\n${decodeURIComponent(escape(atob(b64))).slice(0,5000)}`;
        }
      }
      payloadText = parts;
  }

  input.value = ''; input.style.height = 'auto'; setAttachments([]); renderAttachments([]);
  let currentConv = cur || { id: Date.now().toString(36), title: 'گفتگوی جدید', messages: [], ts: Date.now() };
  setCur(currentConv);
  
  currentConv.messages.push({ role: 'user', content: payloadText });
  if (currentConv.messages.length === 1) currentConv.title = (text || 'فایل').slice(0, 40);
  
  if (convs.indexOf(currentConv) === -1) convs.unshift(currentConv);
  currentConv.ts = Date.now(); convs.sort((a,b)=>b.ts-a.ts);
  await saveConvs();
  addMsg(payloadText, 'user');

  const messagesSnapshot = JSON.parse(JSON.stringify(currentConv.messages));
  let modelsToTry = [getModel()];
  if (isCompareMode) {
      let secondModel = getModel() === 'openrouter/free' ? 'google/gemini-2.0-flash-exp:free' : 'openrouter/free';
      modelsToTry = [getModel(), secondModel];
  }

  for (let m of modelsToTry) {
    let msgId = Date.now() + Math.random().toString(36).substr(2, 5);
    let botEl = addMsg('', 'bot', msgId); 
    let currentText = '', usageData = null, reasoningText = '', success = false;
    
    let reasonBox = document.createElement('details');
    reasonBox.className = 'reasoning';
    reasonBox.innerHTML = '<summary>🤔 فرآیند تفکر مدل</summary><div class="reason-content"></div>';
    let reasonDiv = reasonBox.querySelector('.reason-content');

    try {
      let res = await sendChatRequest(messagesSnapshot, m, window.abortController.signal);
      if (!res.ok) throw new Error(await res.text());

      let reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
      while (true) {
        let { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let parts = buf.split('\n\n'); buf = parts.pop();
        for (let p of parts) {
          if (!p.startsWith('data: ')) continue;
          let d = JSON.parse(p.slice(6));
          if (d.type === 'delta' && d.text) {
            currentText += d.text; 
            botEl.innerHTML = marked.parse(currentText);
            if (reasoningText) botEl.prepend(reasonBox); 
            botEl.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b)); scrollDown();
          } else if (d.type === 'reasoning' && d.text) { 
              reasoningText += d.text; reasonDiv.textContent = reasoningText; reasonBox.open = true;
              if(!reasonBox.parentElement) botEl.prepend(reasonBox);
          }
          else if (d.type === 'usage') { usageData = d.usage; }
          else if (d.type === 'error') { throw new Error(d.message); }
        }
      }
      success = true;

      if(currentText.includes('```mermaid')) { try { await mermaid.run({ nodes: botEl.querySelectorAll('.language-mermaid') }); } catch(e){} }
      
      botEl.querySelectorAll('pre code.language-html').forEach(block => {
          let btn = document.createElement('button'); btn.className='run-code'; btn.textContent='👁️ پیش‌نمایش';
          btn.onclick = () => { let iframe = document.createElement('iframe'); iframe.className = 'preview-box'; iframe.style.display = 'block'; iframe.srcdoc = block.innerText; block.parentElement.parentElement.appendChild(iframe); };
          block.parentElement.appendChild(btn);
      });
      
      let qrDiv = document.createElement('div'); qrDiv.className = 'quick-replies';
      ["بیشتر توضیح بده", "یک مثال بزن", "بهینه‌سازی کن"].forEach(s => {
          let b = document.createElement('button'); b.className='quick-reply'; b.textContent=s;
          b.onclick = () => { input.value = s; send(); }; qrDiv.appendChild(b);
      });
      botEl.appendChild(qrDiv);

      if (usageData) {
        let u = document.createElement('div'); u.className='usage-info'; let c = parseFloat(usageData.total_cost||0);
        u.textContent = `Tokens: ${usageData.total_tokens} | Cost: $${c.toFixed(5)}`; botEl.appendChild(u);
        localStorage.setItem('hoosh_total_cost', parseFloat(localStorage.getItem('hoosh_total_cost')||0)+c);
      }

      let tts = document.createElement('button'); tts.className='btn mint'; tts.textContent='🔊'; tts.style='position:absolute; bottom:4px; left:4px; padding:2px 6px; font-size:11px; box-shadow:none;';
      tts.onclick = (e) => { e.stopPropagation(); speakText(currentText, () => { if(isVoiceChatMode && !busy) recognition.start(); }); };
      botEl.appendChild(tts);
      
      if(isVoiceChatMode) { speakText(currentText, () => { if(!busy) recognition.start(); }); }

      if (m === getModel()) {
          currentConv.messages.push({ role: 'assistant', content: currentText }); await saveConvs();
      }
    } catch (e) {
      if (e.name === 'AbortError') { botEl.innerHTML += '<div class="note" style="color:red">(متوقف شد)</div>'; }
      else { botEl.className = 'msg err'; botEl.textContent = 'خطا: ' + e.message; }
    }
  }
  setBusy(false); if(sendBtn) sendBtn.style.display='block'; if(stopBtn) stopBtn.style.display='none'; window.abortController = null;
}

// اتصال رویدادها
$('form').onsubmit = (e) => { e.preventDefault(); send(); };
$('stopBtn').onclick = () => window.abortController && window.abortController.abort();
input.oninput = function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 130) + 'px'; };
input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

$('micBtn').onclick = () => { if(recognition) { recognition.start(); } else alert('پشتیبانی نمی‌شود.'); };
$('voiceChatBtn').onclick = () => {
    if(!recognition) return alert('پشتیبانی نمی‌شود.');
    let mode = toggleVoiceMode();
    $('voiceChatBtn').classList.toggle('active-compare', mode);
    if(mode) recognition.start(); else recognition.stop();
};

$('attachBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = (e) => {
    let files = [];
    for (let f of e.target.files) {
      if (f.size > 3000000) { alert('حجم زیاد است.'); continue; }
      let r = new FileReader(); r.onload = () => { files.push({ name: f.name, type: f.type, dataUrl: r.result }); setAttachments(files); renderAttachments(files); }; r.readAsDataURL(f);
    }
    e.target.value = '';
};

$('modelBtn').onclick = () => { renderModelList(); $('modelOv').classList.add('on'); };
$('modelClose').onclick = () => $('modelOv').classList.remove('on');
$('refreshModelsBtn').onclick = async () => { let d = await fetchModels(); if(d.models){ setModels(d.models); localStorage.setItem('hoosh_models_list', JSON.stringify(d.models)); renderModelList(); } };
$('compareBtn').onclick = () => { let mode = toggleCompareMode(); $('compareBtn').classList.toggle('active-compare', mode); };
$('agentBtn').onclick = () => { let mode = toggleAgentMode(); $('agentBtn').classList.toggle('active-compare', mode); };

setupStoreTabs();
$('storeBtn').onclick = () => { renderStore(); $('storeOv').classList.add('on'); };
$('storeClose').onclick = () => $('storeOv').classList.remove('on');

$('dashBtn').onclick = () => { $('totalCostDash').textContent = `$${parseFloat(localStorage.getItem('hoosh_total_cost')||0).toFixed(5)}`; $('totalTokensDash').textContent = parseInt(localStorage.getItem('hoosh_total_tokens')||0); $('dashOv').classList.add('on'); };
$('dashClose').onclick = () => $('dashOv').classList.remove('on');

$('exportBtn').onclick = () => {
    if(!cur) return;
    let md = cur.messages.map(m => `### ${m.role === 'user' ? 'کاربر' : 'هوش'}\n${typeof m.content === 'string' ? m.content : '[رسانه]'}`).join('\n\n');
    let blob = new Blob([md], { type: 'text/markdown' }); let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chat-${cur.id}.md`; a.click();
};

$('setBtn').onclick = () => { $('keyInput').value=getKey(); $('sysPromptInput').value=getSysPrompt(); $('tempInput').value=getTemp(); $('tempVal').textContent=getTemp(); $('setOv').classList.add('on'); };
$('setClose').onclick = () => $('setOv').classList.remove('on');
$('tempInput').oninput = function() { $('tempVal').textContent = this.value; };
$('keySave').onclick = () => { localStorage.setItem('hoosh_key', $('keyInput').value.trim()); localStorage.setItem('hoosh_sys', $('sysPromptInput').value.trim()); localStorage.setItem('hoosh_temp', $('tempInput').value); $('setOv').classList.remove('on'); };
$('clearChat').onclick = () => { if(cur) { cur.messages=[]; saveConvs(); loadConv(cur.id, addMsg); } $('setOv').classList.remove('on'); };

$('convBtn').onclick = () => {
    let l = $('convList'); l.innerHTML = '';
    convs.forEach(c => {
      let r = document.createElement('div'); r.className='citem';
      let b = document.createElement('button'); b.className='ct'+(cur&&cur.id===c.id?' sel':''); b.textContent=c.title; b.onclick=()=>{ loadConv(c.id, addMsg); $('convOv').classList.remove('on'); };
      let d = document.createElement('button'); d.className='cd'; d.textContent='×'; 
      d.onclick=(e)=>{ 
          e.stopPropagation(); 
          setConvs(convs.filter(x=>x.id!==c.id)); 
          saveConvs(); 
          if(cur&&cur.id===c.id){ setCur(null); chat.innerHTML=''; } 
          $('convBtn').click(); 
      };
      r.appendChild(b); r.appendChild(d); l.appendChild(r);
    });
    $('convOv').classList.add('on');
};
$('convClose').onclick = () => $('convOv').classList.remove('on');
$('convNew').onclick = () => { setCur(null); chat.innerHTML=''; $('convOv').classList.remove('on'); };

$('promptBtn').onclick = () => { renderPrompts(); $('promptOv').classList.add('on'); };
$('promptClose').onclick = () => $('promptOv').classList.remove('on');
$('savePromptBtn').onclick = () => { let t=$('newPromptTitle').value, x=$('newPromptText').value; if(t&&x){ setPrompts([...prompts, {title:t,text:x}]); localStorage.setItem('hoosh_prompts',JSON.stringify(prompts)); renderPrompts(); } };

$('urlBtn').onclick = () => $('urlOv').classList.add('on');
$('urlClose').onclick = () => $('urlOv').classList.remove('on');
$('fetchUrlBtn').onclick = async () => {
    let u = $('urlInput').value; if(!u) return;
    $('fetchUrlBtn').textContent = '...';
    let d = await fetchUrlContent(u);
    if(d.text) { input.value += `\n\n[محتوای سایت ${u}]:\n${d.text}`; } else alert('خطا: ' + d.error);
    $('fetchUrlBtn').textContent = 'خواندن'; $('urlOv').classList.remove('on');
};

// شروع
initDB().then(() => {
    updateUI();
    let id = localStorage.getItem('hoosh_cur'); 
    if (id) loadConv(id, addMsg); 
    else setCur(null);
});
