window.onerror = function(msg, src, line) { var b = document.getElementById('jsErr'); if (b) { b.style.display = 'block'; b.textContent += 'JS error: ' + msg + '\n'; } };
const $ = function(id) { return document.getElementById(id); };
const chat = $('chat'), input = $('input'), sendBtn = $('sendBtn'), stopBtn = $('stopBtn');

marked.setOptions({ breaks: true, highlight: function(code, lang) { const l = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language: l }).value; } });
mermaid.initialize({ startOnLoad: false, theme: 'default' });
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(console.error); }

// --- مدیریت تم تاریک/روشن ---
if (localStorage.getItem('hoosh_theme') === 'dark') { document.body.classList.add('dark-mode'); $('themeBtn').textContent = '☀️'; }
$('themeBtn').onclick = () => { document.body.classList.toggle('dark-mode'); const d = document.body.classList.contains('dark-mode'); localStorage.setItem('hoosh_theme', d ? 'dark' : 'light'); $('themeBtn').textContent = d ? '☀️' : '🌙'; };

// --- متغیرهای سراسری ---
let convs = []; async function loadDB() { try { convs = await idbKeyval.get('hoosh_convs') || []; } catch(e) { convs = []; } } loadDB();
async function saveConvs() { try { await idbKeyval.set('hoosh_convs', convs); } catch(e) {} }

let abortController = null, attachments = [], cur = null, busy = false;
let installedTools = JSON.parse(localStorage.getItem('hoosh_tools') || '[]');
let installedSkills = JSON.parse(localStorage.getItem('hoosh_skills') || '[]');
let prompts = JSON.parse(localStorage.getItem('hoosh_prompts') || '[]');
let isCompareMode = false, isAgentMode = false, isVoiceChatMode = false;

const DEFAULT_MODELS = [
  { id: 'openrouter/free', name: '🎲 مسیریاب خودکار' }, { id: 'google/gemini-2.0-flash-exp:free', name: '✨ Gemini 2.0 Flash' },
  { id: 'deepseek/deepseek-r1:free', name: '🧠 DeepSeek R1' }, { id: 'meta-llama/llama-3.3-70b-instruct:free', name: '🦙 Llama 3.3 70B' },
  { id: 'qwen/qwen3.5-9b', name: '💰 Qwen3.5-9B' }, { id: 'google/gemini-2.0-flash-001', name: '💰 Gemini 2.0' }
];
let MODELS = DEFAULT_MODELS;
try { let s = localStorage.getItem('hoosh_models_list'); if(s) MODELS = JSON.parse(s); } catch(e){}

function getKey() { return localStorage.getItem('hoosh_key') || ''; }
function getModel() { return localStorage.getItem('hoosh_model') || 'openrouter/free'; }
function getSysPrompt() { return localStorage.getItem('hoosh_sys') || ''; }
function getTemp() { return parseFloat(localStorage.getItem('hoosh_temp')) || 0.7; }
function updateUI() { let b = $('modelBtn'); if(!b) return; let c = MODELS.find(m=>m.id===getModel()); b.textContent = c ? c.name.substring(0,15) : getModel().split('/')[0]; }

function newConv() { cur = { id: Date.now().toString(36), title: 'گفتگوی جدید', messages: [], ts: Date.now() }; }
async function commit() { if (convs.indexOf(cur) === -1) convs.unshift(cur); cur.ts = Date.now(); convs.sort((a,b)=>b.ts-a.ts); convs = convs.slice(0,50); await saveConvs(); localStorage.setItem('hoosh_cur', cur.id); }

// --- صدا (TTS & STT) ---
function speakText(text, callback) {
    if (!text || text.trim() === '') { if(callback) callback(); return; }
    let clean = text.replace(/[*#_`~>]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/```[\s\S]*?```/g, 'کد برنامه نویسی');
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean); u.lang = 'fa-IR'; u.rate = 0.95;
    u.onend = () => { if(callback) callback(); };
    window.speechSynthesis.speak(u);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fa-IR'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        input.value = transcript;
        if(isVoiceChatMode) { send(); }
    };
    recognition.onend = () => { if(isVoiceChatMode && !busy) { recognition.start(); } };
}

if ($('micBtn')) $('micBtn').onclick = () => { if(recognition) { recognition.start(); } else alert('مرورگر شما از میکروفون پشتیبانی نمی‌کند.'); };
if ($('voiceChatBtn')) $('voiceChatBtn').onclick = () => {
    if(!recognition) return alert('مرورگر شما پشتیبانی نمی‌کند.');
    isVoiceChatMode = !isVoiceChatMode;
    $('voiceChatBtn').classList.toggle('active-compare', isVoiceChatMode);
    if(isVoiceChatMode) { recognition.start(); } else { recognition.stop(); }
};

function scrollDown() { if (chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150) chat.scrollTop = chat.scrollHeight; }

// --- نمایش پیام ---
function addMsg(content, role, feedbackId) {
  if (!chat) return null;
  let d = document.createElement('div'); d.className = 'msg ' + role;
  if (Array.isArray(content)) {
    let t = content.find(p=>p.type==='text')?.text || '';
    let imgs = content.filter(p=>p.type==='image_url');
    let td = document.createElement('div'); td.style.whiteSpace='pre-wrap'; td.textContent=t; d.appendChild(td);
    imgs.forEach(img => { let i = document.createElement('img'); i.src = img.image_url.url; i.style.maxWidth = '150px'; i.style.border = '2px solid var(--ink)'; i.style.marginTop = '8px'; d.appendChild(i); });
  } else if (role === 'bot') {
    d.innerHTML = marked.parse(content || '...');
    d.querySelectorAll('pre code').forEach((block) => {
      let btn = document.createElement('button'); btn.className='copy-code'; btn.textContent='کپی';
      btn.onclick = () => { navigator.clipboard.writeText(block.innerText); btn.textContent='✓'; setTimeout(()=>btn.textContent='کپی',1500); };
      block.parentElement.appendChild(btn);
    });
    if (feedbackId) {
        let f = document.createElement('div'); f.className = 'feedback';
        f.innerHTML = `<button onclick="localStorage.setItem('fb_${feedbackId}', 'like')">👍</button><button onclick="localStorage.setItem('fb_${feedbackId}', 'dislike')">👎</button>`;
        d.appendChild(f);
    }
  } else { d.textContent = content; }
  chat.appendChild(d); scrollDown(); return d;
}

async function buildMessageContent(text) {
  if (attachments.length === 0) return text;
  let parts = [{ type: "text", text: text || "فایل‌ها را بررسی کن." }];
  for (let a of attachments) {
    if (a.type.startsWith('image/')) parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    else if (a.type === 'application/pdf') {
      let res = await fetch('/parse-pdf', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({base64_data: a.dataUrl}) });
      let data = await res.json();
      parts[0].text += `\n\n[محتوای PDF (${a.name})]:\n${data.text || 'خطا'}`;
    } else {
      let b64 = a.dataUrl.split(',')[1];
      parts[0].text += `\n\n[محتوای فایل (${a.name})]:\n${decodeURIComponent(escape(atob(b64))).slice(0,5000)}`;
    }
  }
  return parts;
}

async function send() {
  let text = input.value.trim();
  if ((!text && !attachments.length) || busy) return;
  let key = getKey().trim();
  if (!key) return alert('کلید API وارد نشده است.');

  if (!cur) newConv();
  busy = true; if(sendBtn) sendBtn.style.display='none'; if(stopBtn) stopBtn.style.display='block';
  abortController = new AbortController();

  let payloadText = await buildMessageContent(text);
  input.value = ''; input.style.height = 'auto'; attachments = []; renderAttachments();
  cur.messages.push({ role: 'user', content: payloadText });
  if (cur.messages.length === 1) cur.title = (text || 'فایل').slice(0, 40);
  await commit(); addMsg(payloadText, 'user');

  const messagesSnapshot = JSON.parse(JSON.stringify(cur.messages));

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
      let res = await fetch('/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
        body: JSON.stringify({ messages: messagesSnapshot, model: m, system_prompt: getSysPrompt(), temperature: getTemp(), active_tools: installedTools, active_skills: installedSkills, agent_mode: isAgentMode, stream: true }),
        signal: abortController.signal
      });

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
              reasoningText += d.text; 
              reasonDiv.textContent = reasoningText;
              reasonBox.open = true;
              if(!reasonBox.parentElement) botEl.prepend(reasonBox);
          }
          else if (d.type === 'usage') { usageData = d.usage; }
          else if (d.type === 'error') { throw new Error(d.message); }
        }
      }
      success = true;

      if(currentText.includes('```mermaid')) {
          try { await mermaid.run({ nodes: botEl.querySelectorAll('.language-mermaid') }); } catch(e){}
      }
      botEl.querySelectorAll('pre code.language-html').forEach(block => {
          let btn = document.createElement('button'); btn.className='run-code'; btn.textContent='👁️ پیش‌نمایش';
          btn.onclick = () => {
              let iframe = document.createElement('iframe'); iframe.className = 'preview-box'; iframe.style.display = 'block';
              iframe.srcdoc = block.innerText; block.parentElement.parentElement.appendChild(iframe);
          };
          block.parentElement.appendChild(btn);
      });
      
      let qrDiv = document.createElement('div'); qrDiv.className = 'quick-replies';
      let suggestions = ["بیشتر توضیح بده", "یک مثال بزن", "بهینه‌سازی کن"];
      suggestions.forEach(s => {
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
          cur.messages.push({ role: 'assistant', content: currentText }); await commit();
      }

    } catch (e) {
      if (e.name === 'AbortError') { botEl.innerHTML += '<div class="note" style="color:red">(متوقف شد)</div>'; }
      else { botEl.className = 'msg err'; botEl.textContent = 'خطا: ' + e.message; }
    }
  }
  busy = false; if(sendBtn) sendBtn.style.display='block'; if(stopBtn) stopBtn.style.display='none'; abortController = null;
}
// --- فروشگاه ---
const STORE_ITEMS = {
  tools: [
    { id: 'web_search', title: '🔍 جستجوی وب', desc: 'دسترسی به اینترنت' },
    { id: 'shell', title: '⚙️ محیط اجرای کد', desc: 'اجرای کد در سرور' }
  ],
  skills: [
    { id: 'python_expert', title: '🐍 پایتون', desc: 'نوشتن کد استاندارد' },
    { id: 'image_editor', title: '🎨 ویرایش تصویر', desc: 'ادیت دقیق تصاویر' }
  ]
};

let currentStoreTab = 'tools';

function renderStore() {
  let g = $('storeGrid'); if(!g) return; g.innerHTML = '';
  STORE_ITEMS[currentStoreTab].forEach(i => {
    let inst = installedTools.includes(i.id) || installedSkills.includes(i.id);
    let d = document.createElement('div'); d.className = 'store-item' + (inst ? ' installed' : '');
    d.innerHTML = `<h3>${i.title} <button class="store-btn ${inst ? 'uninstall' : 'install'}" data-id="${i.id}">${inst ? 'حذف' : 'نصب'}</button></h3><p>${i.desc}</p>`;
    g.appendChild(d);
  });
  g.querySelectorAll('button').forEach(b => {
    b.onclick = (e) => {
      let id = e.target.getAttribute('data-id');
      if (currentStoreTab === 'tools') { if(installedTools.includes(id)) installedTools = installedTools.filter(t=>t!==id); else installedTools.push(id); localStorage.setItem('hoosh_tools', JSON.stringify(installedTools)); }
      else { if(installedSkills.includes(id)) installedSkills = installedSkills.filter(t=>t!==id); else installedSkills.push(id); localStorage.setItem('hoosh_skills', JSON.stringify(installedSkills)); }
      renderStore();
    };
  });
}

document.querySelectorAll('.store-tab').forEach(t => {
  t.onclick = () => { document.querySelectorAll('.store-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); currentStoreTab = t.getAttribute('data-tab'); renderStore(); };
});

// --- توابع کمکی ---
function renderAttachments() {
  let b = $('attachPreview'); if (!b) return;
  if (!attachments.length) { b.style.display = 'none'; return; }
  b.style.display = 'flex'; b.innerHTML = '';
  attachments.forEach((a, i) => {
    let d = document.createElement('div'); d.className = 'attach-item';
    if (a.type.startsWith('image/')) { let img = document.createElement('img'); img.src = a.dataUrl; d.appendChild(img); } else d.textContent = a.name;
    let rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×'; rm.onclick = () => { attachments.splice(i,1); renderAttachments(); };
    d.appendChild(rm); b.appendChild(d);
  });
}

async function refreshModels() { 
    let res = await fetch('/models'); let d = await res.json(); 
    if(d.models){ MODELS = d.models; localStorage.setItem('hoosh_models_list', JSON.stringify(MODELS)); renderModelList(); } 
}

function renderModelList() { 
    let l = $('modelList'); if(!l) return; l.innerHTML = ''; 
    MODELS.forEach(m => { 
        let b = document.createElement('button'); b.className='mitem'+(m.id===getModel()?' sel':''); b.textContent=m.name; 
        b.onclick=()=>{ localStorage.setItem('hoosh_model',m.id); updateUI(); $('modelOv').classList.remove('on'); }; 
        l.appendChild(b); 
    }); 
}

function renderPrompts() { 
    let l = $('promptList'); if(!l) return; l.innerHTML = ''; 
    prompts.forEach(p => { 
        let b = document.createElement('div'); b.className='pitem'; b.innerHTML=`<b>${p.title}</b><br><small>${p.text}</small>`; 
        b.onclick=()=>{ $('sysPromptInput').value=p.text; localStorage.setItem('hoosh_sys',p.text); $('promptOv').classList.remove('on'); }; 
        l.appendChild(b); 
    }); 
}

function loadConv(id) { 
    cur = convs.find(c=>c.id===id) || null; 
    if(!cur) return newConv(); 
    chat.innerHTML = ''; 
    cur.messages.forEach(m=>addMsg(m.content, m.role)); 
}

// --- رویدادهای دکمه‌ها (Event Listeners) ---
if ($('form')) $('form').onsubmit = (e) => { e.preventDefault(); send(); };
if ($('stopBtn')) $('stopBtn').onclick = () => abortController && abortController.abort();

if (input) { 
    input.oninput = function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 130) + 'px'; }; 
    input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }; 
}

if ($('attachBtn')) {
  $('attachBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => {
    for (let f of e.target.files) {
      if (f.size > 3000000) { alert('حجم زیاد است.'); continue; }
      let r = new FileReader(); r.onload = () => { attachments.push({ name: f.name, type: f.type, dataUrl: r.result }); renderAttachments(); }; r.readAsDataURL(f);
    }
    e.target.value = '';
  };
}

if ($('modelBtn')) $('modelBtn').onclick = () => { renderModelList(); $('modelOv').classList.add('on'); };
if ($('modelClose')) $('modelClose').onclick = () => $('modelOv').classList.remove('on');
if ($('refreshModelsBtn')) $('refreshModelsBtn').onclick = refreshModels;

if ($('compareBtn')) $('compareBtn').onclick = () => { isCompareMode = !isCompareMode; $('compareBtn').classList.toggle('active-compare', isCompareMode); };

if ($('agentBtn')) $('agentBtn').onclick = () => { 
    isAgentMode = !isAgentMode; 
    $('agentBtn').classList.toggle('active-compare', isAgentMode); 
};

if ($('storeBtn')) $('storeBtn').onclick = () => { renderStore(); $('storeOv').classList.add('on'); };
if ($('storeClose')) $('storeClose').onclick = () => $('storeOv').classList.remove('on');

if ($('dashBtn')) $('dashBtn').onclick = () => { 
    $('totalCostDash').textContent = `$${parseFloat(localStorage.getItem('hoosh_total_cost')||0).toFixed(5)}`; 
    $('totalTokensDash').textContent = parseInt(localStorage.getItem('hoosh_total_tokens')||0); 
    $('dashOv').classList.add('on'); 
};
if ($('dashClose')) $('dashClose').onclick = () => $('dashOv').classList.remove('on');

if ($('exportBtn')) $('exportBtn').onclick = () => {
    let md = cur.messages.map(m => `### ${m.role === 'user' ? 'کاربر' : 'هوش'}\n${typeof m.content === 'string' ? m.content : '[رسانه]'}`).join('\n\n');
    let blob = new Blob([md], { type: 'text/markdown' }); 
    let a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chat-${cur.id}.md`; a.click();
};

if ($('setBtn')) $('setBtn').onclick = () => { 
    $('keyInput').value=getKey(); $('sysPromptInput').value=getSysPrompt(); $('tempInput').value=getTemp(); $('tempVal').textContent=getTemp(); $('setOv').classList.add('on'); 
};
if ($('setClose')) $('setClose').onclick = () => $('setOv').classList.remove('on');
if ($('tempInput')) $('tempInput').oninput = function() { $('tempVal').textContent = this.value; };

if ($('keySave')) $('keySave').onclick = () => { 
    localStorage.setItem('hoosh_key', $('keyInput').value.trim()); 
    localStorage.setItem('hoosh_sys', $('sysPromptInput').value.trim()); 
    localStorage.setItem('hoosh_temp', $('tempInput').value); 
    $('setOv').classList.remove('on'); 
};

if ($('clearChat')) $('clearChat').onclick = () => { 
    if(cur) { cur.messages=[]; commit(); loadConv(cur.id); } 
    $('setOv').classList.remove('on'); 
};

if ($('convBtn')) $('convBtn').onclick = () => {
    let l = $('convList'); l.innerHTML = '';
    convs.forEach(c => {
      let r = document.createElement('div'); r.className='citem';
      let b = document.createElement('button'); b.className='ct'+(cur&&cur.id===c.id?' sel':''); b.textContent=c.title; b.onclick=()=>{ loadConv(c.id); $('convOv').classList.remove('on'); };
      let d = document.createElement('button'); d.className='cd'; d.textContent='×'; d.onclick=(e)=>{ e.stopPropagation(); convs=convs.filter(x=>x.id!==c.id); saveConvs(); if(cur&&cur.id===c.id){ newConv(); chat.innerHTML=''; } $('convBtn').click(); };
      r.appendChild(b); r.appendChild(d); l.appendChild(r);
    });
    $('convOv').classList.add('on');
};
if ($('convClose')) $('convClose').onclick = () => $('convOv').classList.remove('on');
if ($('convNew')) $('convNew').onclick = () => { newConv(); chat.innerHTML=''; $('convOv').classList.remove('on'); };

if ($('promptBtn')) $('promptBtn').onclick = () => { renderPrompts(); $('promptOv').classList.add('on'); };
if ($('promptClose')) $('promptClose').onclick = () => $('promptOv').classList.remove('on');

if ($('savePromptBtn')) $('savePromptBtn').onclick = () => { 
    let t=$('newPromptTitle').value, x=$('newPromptText').value; 
    if(t&&x){ prompts.push({title:t,text:x}); localStorage.setItem('hoosh_prompts',JSON.stringify(prompts)); renderPrompts(); } 
};

// خواندن URL
if ($('urlBtn')) $('urlBtn').onclick = () => $('urlOv').classList.add('on');
if ($('urlClose')) $('urlClose').onclick = () => $('urlOv').classList.remove('on');

if ($('fetchUrlBtn')) $('fetchUrlBtn').onclick = async () => {
    let u = $('urlInput').value; if(!u) return;
    $('fetchUrlBtn').textContent = '...';
    let res = await fetch('/fetch-url', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url:u}) });
    let d = await res.json();
    if(d.text) { input.value += `\n\n[محتوای سایت ${u}]:\n${d.text}`; } else alert('خطا: ' + d.error);
    $('fetchUrlBtn').textContent = 'خواندن'; $('urlOv').classList.remove('on');
};

// --- شروع برنامه ---
updateUI();
(function() { 
    let id = localStorage.getItem('hoosh_cur'); 
    if (id) { let f = convs.find(c=>c.id===id); if(f) cur = f; } 
    if(!cur) newConv(); 
})();
