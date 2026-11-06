window.onerror = function(msg, src, line) { 
  var b = document.getElementById('jsErr'); 
  if (b) { b.style.display = 'block'; b.textContent += 'JS error: ' + msg + '\n'; } 
};

const $ = function(id) { return document.getElementById(id); };
const chat = $('chat'), input = $('input'), sendBtn = $('sendBtn'), stopBtn = $('stopBtn');

marked.setOptions({ breaks: true, highlight: function(code, lang) { const l = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language: l }).value; } });

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(console.error); }

if (localStorage.getItem('hoosh_theme') === 'dark') { document.body.classList.add('dark-mode'); $('themeBtn').textContent = '☀️'; }
$('themeBtn').onclick = () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('hoosh_theme', isDark ? 'dark' : 'light');
  $('themeBtn').textContent = isDark ? '☀️' : '🌙';
};

let convs = [];
async function loadDB() { try { convs = await idbKeyval.get('hoosh_convs') || []; } catch(e) { convs = []; } }
loadDB();
async function saveConvs() { await idbKeyval.set('hoosh_convs', convs); }

let abortController = null;
let attachments = [];
let installedTools = JSON.parse(localStorage.getItem('hoosh_tools') || '[]');
let installedSkills = JSON.parse(localStorage.getItem('hoosh_skills') || '[]');
let prompts = JSON.parse(localStorage.getItem('hoosh_prompts') || '[]');
let cur = null;
let busy = false;

const DEFAULT_MODELS = [
  { id: 'openrouter/free', name: '🎲 مسیریاب خودکار رایگان' },
  { id: 'google/gemini-2.0-flash-exp:free', name: '✨ Gemini 2.0 Flash' },
  { id: 'deepseek/deepseek-r1:free', name: '🧠 DeepSeek R1' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: '🦙 Llama 3.3 70B' },
  { id: 'qwen/qwen3.5-9b', name: '💰 Qwen3.5-9B (ارزان)' }
];
let MODELS = JSON.parse(localStorage.getItem('hoosh_models_list')) || DEFAULT_MODELS;

function getKey() { return localStorage.getItem('hoosh_key') || ''; }
function getModel() { return localStorage.getItem('hoosh_model') || 'openrouter/free'; }
function getSysPrompt() { return localStorage.getItem('hoosh_sys') || ''; }
function getTemp() { return parseFloat(localStorage.getItem('hoosh_temp')) || 0.7; }

function updateUI() { 
  let btn = $('modelBtn'); if (!btn) return;
  let current = MODELS.find(m => m.id === getModel());
  btn.textContent = current ? current.name.substring(0, 15) : getModel().split('/')[0]; 
}

function newConv() { cur = { id: Date.now().toString(36), title: 'گفتگوی جدید', messages: [], ts: Date.now() }; }
async function commit() { 
  if (convs.indexOf(cur) === -1) convs.unshift(cur); 
  cur.ts = Date.now(); convs.sort((a, b) => b.ts - a.ts); convs = convs.slice(0, 50); 
  await saveConvs(); localStorage.setItem('hoosh_cur', cur.id); 
}

function speakText(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fa-IR';
    window.speechSynthesis.speak(utterance);
}

function scrollDown() { if (chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150) chat.scrollTop = chat.scrollHeight; }

function addMsg(content, role) {
  if (!chat) return null;
  let e = $('empty'); if (e) e.remove();
  let d = document.createElement('div'); d.className = 'msg ' + role;
  if (Array.isArray(content)) {
    let textPart = content.find(p => p.type === 'text')?.text || '';
    let imgParts = content.filter(p => p.type === 'image_url');
    let textDiv = document.createElement('div'); textDiv.style.whiteSpace = 'pre-wrap'; textDiv.textContent = textPart; d.appendChild(textDiv);
    imgParts.forEach(img => { let i = document.createElement('img'); i.src = img.image_url.url; i.style.maxWidth = '150px'; i.style.border = '2px solid var(--ink)'; i.style.marginTop = '8px'; d.appendChild(i); });
  } else if (role === 'bot') {
    d.innerHTML = marked.parse(content || '...');
    d.querySelectorAll('pre code').forEach((block) => {
      let btn = document.createElement('button'); btn.className = 'copy-code'; btn.textContent = 'کپی';
      btn.onclick = () => { navigator.clipboard.writeText(block.innerText); btn.textContent = '✓'; setTimeout(()=>btn.textContent='کپی', 1500); };
      block.parentElement.appendChild(btn);
    });
  } else { d.textContent = content; }
  chat.appendChild(d); scrollDown(); return d;
}

async function send() {
  let text = input.value.trim();
  if ((!text && !attachments.length) || busy) return;
  if (!getKey()) { alert('ابتدا در تنظیمات ⚙ کلید API را وارد کنید'); return; }
  if (!cur) newConv();

  busy = true; if (sendBtn) sendBtn.style.display = 'none'; if (stopBtn) stopBtn.style.display = 'block';
  abortController = new AbortController();

  let contentPayload = await buildMessageContent(text);
  input.value = ''; input.style.height = 'auto'; attachments = []; renderAttachments();
  
  cur.messages.push({ role: 'user', content: contentPayload });
  if (cur.messages.length === 1) cur.title = (text || 'تصویر/فایل').slice(0, 40);
  await commit();
  
  addMsg(contentPayload, 'user');
  let botEl = addMsg('', 'bot');
  
  let fallbackModels = [getModel(), 'openrouter/free', 'google/gemini-2.0-flash-exp:free'].filter((v, i, a) => a.indexOf(v) === i);
  let success = false;
  let currentText = '';

  for (let modelToTry of fallbackModels) {
    if (success) break;
    currentText = ''; 
    let usageData = null;
    let reasoningText = '';
    
    try {
      let res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': getKey() },
        body: JSON.stringify({
          messages: cur.messages.map(m => ({ role: m.role, content: m.content })),
          model: modelToTry, system_prompt: getSysPrompt(), temperature: getTemp(),
          active_tools: installedTools, active_skills: installedSkills, stream: true
        }),
        signal: abortController.signal
      });

      if (!res.ok) {
        let err = await res.text();
        if (res.status === 429 || res.status >= 500) { console.warn("Fallback to next model..."); continue; }
        throw new Error(err);
      }

      let reader = res.body.getReader(); let dec = new TextDecoder(); let buf = '';
      let reasonBox = document.createElement('details');
      reasonBox.className = 'reasoning';
      reasonBox.innerHTML = '<summary>🤔 فرآیند تفکر مدل</summary><div class="reason-content"></div>';
      let reasonDiv = reasonBox.querySelector('.reason-content');

      while (true) {
        let { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let parts = buf.split('\n\n'); buf = parts.pop();
        for (let part of parts) {
          if (!part.startsWith('data: ')) continue;
          let data = JSON.parse(part.slice(6));
          if (data.type === 'delta' && data.text) {
            currentText += data.text; 
            botEl.innerHTML = marked.parse(currentText); 
            if (reasonText) botEl.prepend(reasonBox);
            botEl.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
            scrollDown();
          } else if (data.type === 'reasoning' && data.text) {
            reasoningText += data.text;
            reasonDiv.textContent = reasoningText;
            reasonBox.open = true;
            if(!reasonBox.parentElement) botEl.prepend(reasonBox);
          } else if (data.type === 'usage') { usageData = data.usage; }
          else if (data.type === 'error') { throw new Error(data.message); }
        }
      }
      
      success = true;
      
      if (usageData) {
        let u = document.createElement('div'); u.className = 'usage-info';
        let cost = parseFloat(usageData.total_cost || 0);
        u.textContent = `Tokens: ${usageData.total_tokens || 0} | Cost: $${cost.toFixed(5)}`;
        botEl.appendChild(u);
        
        let totalCost = parseFloat(localStorage.getItem('hoosh_total_cost') || 0) + cost;
        let totalTokens = parseInt(localStorage.getItem('hoosh_total_tokens') || 0) + (usageData.total_tokens || 0);
        localStorage.setItem('hoosh_total_cost', totalCost);
        localStorage.setItem('hoosh_total_tokens', totalTokens);
      }

      let ttsBtn = document.createElement('button');
      ttsBtn.className = 'btn mint'; ttsBtn.textContent = '🔊'; ttsBtn.style = 'position:absolute; bottom:4px; left:4px; padding:2px 6px; font-size:11px; box-shadow:none;';
      ttsBtn.onclick = () => speakText(currentText);
      botEl.appendChild(ttsBtn);

      cur.messages.push({ role: 'assistant', content: currentText }); await commit();

    } catch (e) {
      if (e.name === 'AbortError') { if(botEl) botEl.innerHTML += '<div class="note" style="color:red">(متوقف شد)</div>'; success = true; break; }
      else { console.error("Model error:", e.message); }
    }
  }

  if (!success && botEl) {
      botEl.className = 'msg err';
      botEl.textContent = 'خطا: تمام مدل‌ها با شکست مواجه شدند. لطفاً کلید API را در تنظیمات بررسی کنید.';
  }

  busy = false; if (sendBtn) sendBtn.style.display = 'block'; if (stopBtn) stopBtn.style.display = 'none'; abortController = null;
}

async function buildMessageContent(text) {
  if (attachments.length === 0) return text;
  let parts = [{ type: "text", text: text || "این فایل‌ها را بررسی کن." }];
  for (let a of attachments) {
    if (a.type.startsWith('image/')) {
      parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    } else if (a.type === 'application/pdf') {
      let res = await fetch('/parse-pdf', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({base64_data: a.dataUrl}) });
      let data = await res.json();
      parts[0].text += `\n\n--- محتوای PDF (${a.name}) ---\n${data.text || 'خطا در خواندن PDF'}`;
    } else {
      let base64Content = a.dataUrl.split(',')[1];
      let decodedText = decodeURIComponent(escape(atob(base64Content)));
      parts[0].text += `\n\n--- محتوای فایل (${a.name}) ---\n${decodedText.slice(0, 5000)}`;
    }
  }
  return parts;
}

if ($('form')) $('form').onsubmit = (e) => { e.preventDefault(); send(); };
if ($('stopBtn')) $('stopBtn').onclick = () => { if (abortController) abortController.abort(); };
if (input) {
  input.oninput = function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 130) + 'px'; };
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
}

if ($('attachBtn') && $('fileInput')) {
  $('attachBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => {
    for (let f of e.target.files) {
      if (f.size > 3000000) { alert('حجم فایل زیاد است: ' + f.name); continue; }
      if (attachments.length >= 3) { alert('حداکثر ۳ فایل'); break; }
      let reader = new FileReader();
      reader.onload = () => { attachments.push({ name: f.name, type: f.type, dataUrl: reader.result }); renderAttachments(); };
      reader.readAsDataURL(f);
    }
    e.target.value = '';
  };
}
function renderAttachments() {
  let box = $('attachPreview'); if (!box) return;
  if (!attachments.length) { box.style.display = 'none'; return; }
  box.style.display = 'flex'; box.innerHTML = '';
  attachments.forEach((a, i) => {
    let div = document.createElement('div'); div.className = 'attach-item';
    if (a.type.startsWith('image/')) { let img = document.createElement('img'); img.src = a.dataUrl; div.appendChild(img); }
    else { div.textContent = a.name; }
    let rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.onclick = () => { attachments.splice(i, 1); renderAttachments(); }; div.appendChild(rm); box.appendChild(div);
  });
}

if ($('modelBtn')) $('modelBtn').onclick = () => { 
  let list = $('modelList'); list.innerHTML = '';
  MODELS.forEach(m => {
    let b = document.createElement('button'); b.className = 'mitem' + (m.id === getModel() ? ' sel' : ''); b.textContent = m.name;
    b.onclick = () => { localStorage.setItem('hoosh_model', m.id); updateUI(); $('modelOv').classList.remove('on'); };
    list.appendChild(b);
  });
  $('modelOv').classList.add('on'); 
};
if ($('modelClose')) $('modelClose').onclick = () => $('modelOv').classList.remove('on');

if ($('dashBtn')) $('dashBtn').onclick = () => {
    let cost = parseFloat(localStorage.getItem('hoosh_total_cost') || 0).toFixed(5);
    let tokens = parseInt(localStorage.getItem('hoosh_total_tokens') || 0);
    $('totalCostDash').textContent = `$${cost}`;
    $('totalTokensDash').textContent = tokens;
    $('dashOv').classList.add('on');
};
if ($('dashClose')) $('dashClose').onclick = () => $('dashOv').classList.remove('on');

if ($('promptBtn')) $('promptBtn').onclick = () => { renderPrompts(); $('promptOv').classList.add('on'); };
if ($('promptClose')) $('promptClose').onclick = () => $('promptOv').classList.remove('on');
if ($('savePromptBtn')) $('savePromptBtn').onclick = () => {
    let title = $('newPromptTitle').value.trim();
    let text = $('newPromptText').value.trim();
    if(title && text) { prompts.push({title, text}); localStorage.setItem('hoosh_prompts', JSON.stringify(prompts)); $('newPromptTitle').value=''; $('newPromptText').value=''; renderPrompts(); }
};
function renderPrompts() {
    let list = $('promptList'); if(!list) return; list.innerHTML = '';
    prompts.forEach((p, idx) => {
        let b = document.createElement('div'); b.className = 'pitem';
        b.innerHTML = `<b>${p.title}</b><br><small>${p.text}</small>`;
        b.onclick = () => { 
            $('sysPromptInput').value = p.text; 
            localStorage.setItem('hoosh_sys', p.text);
            $('promptOv').classList.remove('on'); 
            alert('پرامپت با موفقیت اعمال شد.');
        };
        list.appendChild(b);
    });
}

if ($('setBtn')) $('setBtn').onclick = () => { if($('keyInput')) $('keyInput').value = getKey(); if($('sysPromptInput')) $('sysPromptInput').value = getSysPrompt(); if($('tempInput')) $('tempInput').value = getTemp(); if($('tempVal')) $('tempVal').textContent = getTemp(); $('setOv').classList.add('on'); };
if ($('setClose')) $('setClose').onclick = () => $('setOv').classList.remove('on');
if ($('keySave')) $('keySave').onclick = () => { localStorage.setItem('hoosh_key', $('keyInput').value.trim()); localStorage.setItem('hoosh_sys', $('sysPromptInput').value.trim()); localStorage.setItem('hoosh_temp', $('tempInput').value); $('setOv').classList.remove('on'); };

updateUI();
(function() { let id = localStorage.getItem('hoosh_cur'); if (id) { let found = convs.find(c => c.id === id); if(found) cur = found; } if(!cur) newConv(); })();
