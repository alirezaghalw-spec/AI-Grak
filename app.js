window.onerror = function(msg, src, line) { 
  var b = document.getElementById('jsErr'); 
  if (b) { b.style.display = 'block'; b.textContent += 'JS error: ' + msg + '\n'; } 
};

const $ = function(id) { return document.getElementById(id); };
const chat = $('chat'), input = $('input'), sendBtn = $('sendBtn'), stopBtn = $('stopBtn');

marked.setOptions({ breaks: true, highlight: function(code, lang) { const l = hljs.getLanguage(lang) ? lang : 'plaintext'; return hljs.highlight(code, { language: l }).value; } });

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(console.error); }

// --- مدیریت تم تاریک/روشن ---
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
async function saveConvs() { try { await idbKeyval.set('hoosh_convs', convs); } catch(e) { console.error("DB Error"); } }

let abortController = null;
let attachments = [];
let installedTools = JSON.parse(localStorage.getItem('hoosh_tools') || '[]');
let installedSkills = JSON.parse(localStorage.getItem('hoosh_skills') || '[]');
let prompts = JSON.parse(localStorage.getItem('hoosh_prompts') || '[]');
let cur = null;
let busy = false;

// --- لیست کامل مدل‌های رایگان و ارزان ---
const DEFAULT_MODELS = [
  { id: 'openrouter/free', name: '🎲 مسیریاب خودکار رایگان' },
  { id: 'google/gemini-2.0-flash-exp:free', name: '✨ Gemini 2.0 Flash (Vision)' },
  { id: 'deepseek/deepseek-r1:free', name: '🧠 DeepSeek R1' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: '🦙 Llama 3.3 70B' },
  { id: 'qwen/qwen3.6-plus:free', name: '🚀 Qwen3.6 Plus (1M Context)' },
  { id: 'qwen/qwen3-coder:free', name: '💻 Qwen3 Coder 480B' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: '🟢 Nemotron 3 Super 120B' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: '🧠 Nemotron 3 Ultra (1M)' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', name: '👁️ Nemotron 3.5 Super VL' },
  { id: 'openai/gpt-oss-120b:free', name: '🤖 GPT-OSS 120B' },
  { id: 'arcee-ai/trinity-large-preview:free', name: '🔱 Trinity Large' },
  { id: 'cohere/north-mini-code:free', name: '💻 North Mini Code' },
  { id: 'poolside/laguna-s-2.1:free', name: '💻 Laguna S 2.1' },
  { id: 'inclusionai/ling-3.0-flash:free', name: '🌊 Ling 3.0 Flash' },
  { id: 'google/gemma-4-26b-a4b-it:free', name: '💎 Gemma 4 26B (Vision)' },
  { id: 'google/gemma-4-31b-it:free', name: '💎 Gemma 4 31B' },
  { id: 'dots-studio/dots-3-note-preview:free', name: '📝 Dots 3 Note' },
  { id: 'liquid/lfm-2.5-2.6b:free', name: '💧 LFM 2.5 2.6B' },
  { id: 'minimax/minimax-m3.1-flash:free', name: '⚡ MiniMax M3.1 Flash' },
  { id: 'tencent/hy3-preview:free', name: '🔷 Tencent Hy3 Preview' },
  { id: 'qwen/qwen3.8-27b:free', name: '🚀 Qwen3.8 27B' },
  { id: 'z-ai/glm-5.2:free', name: '🌬️ GLM 5.2' },
  { id: 'qwen/qwen3.5-9b', name: '💰 Qwen3.5-9B (ارزان)' },
  { id: 'google/gemini-2.0-flash-001', name: '💰 Gemini 2.0 Flash' },
  { id: 'google/gemini-2.5-flash-lite', name: '💰 Gemini 2.5 Flash Lite' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: '💰 Llama 3.3 70B' }
];

let MODELS = DEFAULT_MODELS;
try {
    let savedModels = localStorage.getItem('hoosh_models_list');
    if (savedModels) MODELS = JSON.parse(savedModels);
} catch(e) { console.warn("Could not parse saved models, using defaults."); }

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

// --- بلندگو (TTS) ---
function speakText(text) {
    if (!text || text.trim() === '') return;
    // حذف علائم مارک‌داون برای خواندن روان‌تر
    let cleanText = text.replace(/[*#_`~>]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1'); 
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'fa-IR'; 
    utterance.rate = 0.95; 
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

// --- ارسال پیام ---
async function send() {
  let text = input.value.trim();
  if ((!text && !attachments.length) || busy) return;
  
  let key = getKey().trim();
  if (!key) { alert('ابتدا در تنظیمات ⚙ کلید API را وارد کنید'); return; }
  if (!key.startsWith('sk-or-v1-')) { alert('کلید API نامعتبر است! باید با sk-or-v1- شروع شود.'); return; }

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
  
  let fallbackModels = [getModel(), 'openrouter/free'].filter((v, i, a) => a.indexOf(v) === i);
  let success = false;
  let currentText = '';
  let finalErrorMessage = '';

  for (let modelToTry of fallbackModels) {
    if (success) break;
    
    if (botEl) botEl.innerHTML = ''; // پاک کردن متن مدل قبلی در صورت خطا
    currentText = ''; 
    let usageData = null;
    let reasoningText = '';
    
    try {
      let res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
        body: JSON.stringify({
          messages: cur.messages.map(m => ({ role: m.role, content: m.content })),
          model: modelToTry, system_prompt: getSysPrompt(), temperature: getTemp(),
          active_tools: installedTools, active_skills: installedSkills, stream: true
        }),
        signal: abortController.signal
      });

      if (!res.ok) {
        let err = await res.text();
        if (res.status === 401) {
            finalErrorMessage = "کلید API نامعتبر است. لطفاً در تنظیمات ⚙ آن را بررسی کنید. (خطای 401)";
            break; 
        }
        if (res.status === 429 || res.status >= 500) { 
            finalErrorMessage = "محدودیت درخواست (Rate Limit) یا خطای سرور OpenRouter. لطفاً کمی بعد تلاش کنید.";
            continue; 
        }
        throw new Error(`خطای سرور: ${err}`);
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
            if (reasoningText) botEl.prepend(reasonBox);
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
      ttsBtn.className = 'btn mint'; 
      ttsBtn.textContent = '🔊'; 
      ttsBtn.style = 'position:absolute; bottom:4px; left:4px; padding:2px 6px; font-size:11px; box-shadow:none;';
      ttsBtn.onclick = (e) => { e.stopPropagation(); speakText(currentText); };
      botEl.appendChild(ttsBtn);

      cur.messages.push({ role: 'assistant', content: currentText }); await commit();

    } catch (e) {
      if (e.name === 'AbortError') { if(botEl) botEl.innerHTML += '<div class="note" style="color:red">(متوقف شد)</div>'; success = true; break; }
      else { 
          console.error("Model error:", e.message); 
          finalErrorMessage = e.message;
      }
    }
  }

  if (!success && botEl) {
      botEl.className = 'msg err';
      botEl.textContent = finalErrorMessage || 'خطا: ارتباط با سرور برقرار نشد.';
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

// --- رویدادها ---
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

async function refreshModels() {
  let btn = $('refreshModelsBtn'); if (!btn) return;
  btn.textContent = '⏳ دریافت...'; btn.disabled = true;
  try {
    let res = await fetch('/models'); let data = await res.json();
    if (data.models && data.models.length > 0) {
      MODELS = data.models; 
      localStorage.setItem('hoosh_models_list', JSON.stringify(MODELS)); 
      renderModelList();
      alert('لیست مدل‌ها بروزرسانی شد!');
    }
  } catch (e) { alert('خطا در دریافت مدل‌ها: ' + e.message); } 
  finally { btn.textContent = '🔄 بروزرسانی'; btn.disabled = false; }
}

function renderModelList() {
  let list = $('modelList'); if (!list) return;
  list.innerHTML = '';
  MODELS.forEach(m => {
    let b = document.createElement('button'); b.className = 'mitem' + (m.id === getModel() ? ' sel' : ''); b.textContent = m.name;
    b.onclick = () => { localStorage.setItem('hoosh_model', m.id); updateUI(); $('modelOv').classList.remove('on'); };
    list.appendChild(b);
  });
}

if ($('modelBtn')) $('modelBtn').onclick = () => { renderModelList(); $('modelOv').classList.add('on'); };
if ($('modelClose')) $('modelClose').onclick = () => $('modelOv').classList.remove('on');
if ($('refreshModelsBtn')) $('refreshModelsBtn').onclick = refreshModels;

const STORE_ITEMS = {
  tools: [
    { id: 'web_search', title: '🔍 جستجوی وب زنده', desc: 'دسترسی واقعی به اینترنت برای دریافت اخبار و اطلاعات روز.' },
    { id: 'shell', title: '⚙️ محیط اجرای کد (Shell)', desc: 'اجرای واقعی کدهای پایتون و دستورات لینوکس در سرور OpenRouter.' },
    { id: 'web_fetch', title: '🌐 دریافت محتوای وب', desc: 'امکان خواندن متن یک وب‌سایت خاص.' }
  ],
  skills: [
    { id: 'python_expert', title: '🐍 مهارت پایتون', desc: 'به مدل یاد می‌دهد کدهای پایتون را استاندارد بنویسد.' },
    { id: 'js_expert', title: '🌐 مهارت فرانت‌اند', desc: 'تولید کدهای HTML، CSS و JS.' },
    { id: 'image_editor', title: '🎨 مهارت ویرایش تصویر', desc: 'مدل را برای انجام ادیت‌های دقیق روی تصاویر آماده می‌کند.' }
  ]
};

let currentStoreTab = 'tools';
function renderStore() {
  let grid = $('storeGrid'); if (!grid) return;
  grid.innerHTML = '';
  let items = STORE_ITEMS[currentStoreTab];
  items.forEach(item => {
    let isInstalled = installedTools.includes(item.id) || installedSkills.includes(item.id);
    let div = document.createElement('div'); div.className = 'store-item' + (isInstalled ? ' installed' : '');
    div.innerHTML = `<h3>${item.title} <button class="store-btn ${isInstalled ? 'uninstall' : 'install'}" data-id="${item.id}">${isInstalled ? 'حذف' : 'نصب'}</button></h3><p>${item.desc}</p>`;
    grid.appendChild(div);
  });
  grid.querySelectorAll('button').forEach(btn => {
    btn.onclick = (e) => {
      let id = e.target.getAttribute('data-id');
      if (currentStoreTab === 'tools') {
        if (installedTools.includes(id)) installedTools = installedTools.filter(t => t !== id); else installedTools.push(id);
        localStorage.setItem('hoosh_tools', JSON.stringify(installedTools));
      } else if (currentStoreTab === 'skills') {
        if (installedSkills.includes(id)) installedSkills = installedSkills.filter(t => t !== id); else installedSkills.push(id);
        localStorage.setItem('hoosh_skills', JSON.stringify(installedSkills));
      }
      renderStore();
    };
  });
}

document.querySelectorAll('.store-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active'); currentStoreTab = tab.getAttribute('data-tab'); renderStore();
  };
});

if ($('storeBtn')) $('storeBtn').onclick = () => { renderStore(); $('storeOv').classList.add('on'); };
if ($('storeClose')) $('storeClose').onclick = () => $('storeOv').classList.remove('on');

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

// --- دکمه پاک کردن گفتگو (اضافه شد) ---
if ($('clearChat') && $('setOv')) {
  $('clearChat').onclick = () => { 
    if (cur) { cur.messages = []; commit(); loadConv(cur.id); } 
    $('setOv').classList.remove('on'); 
  };
}

function loadConv(id) { 
  cur = convs.find(c => c.id === id) || null; 
  if (!cur) return newConv(); 
  if(chat) chat.innerHTML = ''; 
  cur.messages.forEach(m => addMsg(m.content, m.role)); 
}

if ($('convBtn')) $('convBtn').onclick = () => {
    if (busy) { alert('لطفاً تا پایان پاسخ مدل صبر کنید.'); return; }
    let list = $('convList'); if(list) {
      list.innerHTML = '';
      convs.forEach(c => {
        let row = document.createElement('div'); row.className = 'citem';
        let b = document.createElement('button'); b.className = 'ct' + (cur && cur.id === c.id ? ' sel' : ''); b.textContent = c.title;
        b.onclick = () => { loadConv(c.id); $('convOv').classList.remove('on'); };
        let d = document.createElement('button'); d.className = 'cd'; d.textContent = '×';
        d.onclick = (e) => { e.stopPropagation(); convs = convs.filter(x => x.id !== c.id); saveConvs(); if (cur && cur.id === c.id) { newConv(); if(chat) chat.innerHTML=''; } $('convBtn').click(); };
        row.appendChild(b); row.appendChild(d); list.appendChild(row);
      });
    }
    $('convOv').classList.add('on');
};
if ($('convClose')) $('convClose').onclick = () => $('convOv').classList.remove('on');
if ($('convNew')) $('convNew').onclick = () => { newConv(); if(chat) chat.innerHTML = ''; $('convOv').classList.remove('on'); };

updateUI();
(function() { let id = localStorage.getItem('hoosh_cur'); if (id) { let found = convs.find(c => c.id === id); if(found) cur = found; } if(!cur) newConv(); })();
