import { MODELS, getModel, prompts, installedTools, installedSkills, convs, setCur, setInstalledTools, setInstalledSkills } from './state.js';
import { STORE_ITEMS } from './config.js';
import { runPython } from './api.js';

export const $ = (id) => document.getElementById(id);
export const chat = $('chat');

if (window.DOMPurify) {
  DOMPurify.addHook('afterSanitizeAttributes', (n) => {
    if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
  });
}

export function scrollDown() { if (chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150) chat.scrollTop = chat.scrollHeight; }

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// تگ <run_python> را به بلاک کد پایتون تبدیل می‌کند تا قابل نمایش/اجرا باشد
const preprocess = (t) => String(t || '').replace(/<run_python>([\s\S]*?)(?:<\/run_python>|$)/g, (m, c) => '\n```python\n' + c.trim() + '\n```\n');

// مارک‌داون → HTML امن (بدون sanitize ممکن بود XSS و دزدیده شدن کلید API رخ دهد)
export function renderMd(text) {
  const src = preprocess(text);
  const plain = () => '<div style="white-space:pre-wrap">' + escapeHtml(src) + '</div>';
  try {
    const html = marked.parse(src || '...');
    return window.DOMPurify ? DOMPurify.sanitize(html) : plain();
  } catch (e) { return plain(); }
}

// دکمه‌های کپی / پیش‌نمایش HTML / اجرای پایتون + هایلایت + mermaid
export function enhanceMessage(msgEl, text) {
  const root = msgEl._body || msgEl;
  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code || pre.querySelector('.copy-code')) return;
    if (!code.dataset.highlighted) { try { hljs.highlightElement(code); } catch (e) {} }
    const lang = (code.className.match(/language-(\w+)/) || [])[1] || '';

    const copy = document.createElement('button'); copy.className = 'copy-code'; copy.textContent = 'کپی';
    copy.onclick = () => { navigator.clipboard.writeText(code.innerText); copy.textContent = '✓'; setTimeout(() => copy.textContent = 'کپی', 1500); };
    pre.appendChild(copy);

    if (lang === 'html') {
      const btn = document.createElement('button'); btn.className = 'run-code'; btn.textContent = '👁️ پیش‌نمایش';
      let frame = null;
      btn.onclick = () => {
        if (frame) frame.remove();
        frame = document.createElement('iframe'); frame.className = 'preview-box'; frame.style.display = 'block';
        frame.setAttribute('sandbox', 'allow-scripts'); // بدون allow-same-origin: به localStorage و کلید دسترسی ندارد
        frame.srcdoc = code.innerText;
        pre.after(frame);
      };
      pre.appendChild(btn);
    }

    if (lang === 'python' && window.APP_CONFIG && window.APP_CONFIG.run_python) {
      const btn = document.createElement('button'); btn.className = 'run-code'; btn.textContent = '▶ اجرا';
      let out = null;
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = '...';
        const r = await runPython(code.innerText);
        if (out) out.remove();
        out = document.createElement('div'); out.className = 'run-out';
        const pr = document.createElement('pre');
        pr.textContent = [r.output, r.error].filter(Boolean).join('\n') || '(بدون خروجی)';
        out.appendChild(pr);
        if (r.image && /^[A-Za-z0-9+/=]+$/.test(r.image)) {
          const img = document.createElement('img'); img.src = 'data:image/png;base64,' + r.image; img.style.maxWidth = '100%';
          out.appendChild(img);
        }
        pre.after(out);
        btn.disabled = false; btn.textContent = '▶ اجرا';
      };
      pre.appendChild(btn);
    }
  });

  if (/```mermaid/.test(text || '')) {
    try { const p = mermaid.run({ nodes: root.querySelectorAll('.language-mermaid') }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
}

export function addMsg(content, role, feedbackId) {
  if (!chat) return null;
  if (role === 'assistant') role = 'bot'; // پیام‌های ذخیره‌شده با نقش assistant بودند و به‌صورت متن ساده نمایش داده می‌شدند
  const d = document.createElement('div'); d.className = 'msg ' + role;
  if (Array.isArray(content)) {
    const t = (content.find((p) => p.type === 'text') || {}).text || '';
    const imgs = content.filter((p) => p.type === 'image_url');
    const td = document.createElement('div'); td.style.whiteSpace = 'pre-wrap'; td.textContent = t; d.appendChild(td);
    imgs.forEach((img) => { const i = document.createElement('img'); i.src = img.image_url.url; i.style.maxWidth = '150px'; i.style.border = '2px solid var(--ink)'; i.style.marginTop = '8px'; d.appendChild(i); });
  } else if (role === 'bot') {
    // محتوا در یک div جدا می‌ماند تا بروزرسانی استریم دکمه‌های فیدبک را پاک نکند
    const body = document.createElement('div'); body.className = 'md-body';
    body.innerHTML = renderMd(content || '...');
    d.appendChild(body); d._body = body;
    if (content) enhanceMessage(d, content);
    if (feedbackId) {
      const f = document.createElement('div'); f.className = 'feedback';
      [['👍', 'like'], ['👎', 'dislike']].forEach(([icon, val]) => {
        const b = document.createElement('button'); b.textContent = icon;
        b.onclick = () => localStorage.setItem('fb_' + feedbackId, val);
        f.appendChild(b);
      });
      d.appendChild(f);
    }
  } else { d.textContent = content; }
  chat.appendChild(d); scrollDown(); return d;
}

export function updateUI() {
  const b = $('modelBtn'); if (!b) return;
  const c = MODELS.find((m) => m.id === getModel());
  b.textContent = c ? c.name.substring(0, 15) : getModel().split('/')[0];
}

export function renderAttachments(attachments) {
  const b = $('attachPreview'); if (!b) return;
  if (!attachments.length) { b.style.display = 'none'; b.innerHTML = ''; return; }
  b.style.display = 'flex'; b.innerHTML = '';
  attachments.forEach((a, i) => {
    const d = document.createElement('div'); d.className = 'attach-item';
    if (a.type.startsWith('image/')) { const img = document.createElement('img'); img.src = a.dataUrl; d.appendChild(img); } else d.textContent = a.name;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.onclick = () => { attachments.splice(i, 1); renderAttachments(attachments); };
    d.appendChild(rm); b.appendChild(d);
  });
}

export function renderModelList() {
  const l = $('modelList'); if (!l) return; l.innerHTML = '';
  MODELS.forEach((m) => {
    const b = document.createElement('button'); b.className = 'mitem' + (m.id === getModel() ? ' sel' : ''); b.textContent = m.name;
    b.onclick = () => { localStorage.setItem('hoosh_model', m.id); updateUI(); $('modelOv').classList.remove('on'); };
    l.appendChild(b);
  });
}

// عنوان و متن پرامپت‌ها را با textContent می‌گذاریم (قبلاً innerHTML خام بود → XSS)
export function renderPrompts() {
  const l = $('promptList'); if (!l) return; l.innerHTML = '';
  prompts.forEach((p) => {
    const b = document.createElement('div'); b.className = 'pitem';
    const t = document.createElement('b'); t.textContent = p.title;
    const s = document.createElement('small'); s.textContent = p.text;
    b.append(t, document.createElement('br'), s);
    b.onclick = () => { $('sysPromptInput').value = p.text; localStorage.setItem('hoosh_sys', p.text); $('promptOv').classList.remove('on'); };
    l.appendChild(b);
  });
}

let currentStoreTab = 'tools';
export function renderStore() {
  const g = $('storeGrid'); if (!g) return; g.innerHTML = '';
  STORE_ITEMS[currentStoreTab].forEach((i) => {
    const inst = installedTools.includes(i.id) || installedSkills.includes(i.id);
    const d = document.createElement('div'); d.className = 'store-item' + (inst ? ' installed' : '');
    d.innerHTML = `<h3>${i.title} <button class="store-btn ${inst ? 'uninstall' : 'install'}" data-id="${i.id}">${inst ? 'حذف' : 'نصب'}</button></h3><p>${i.desc}</p>`;
    g.appendChild(d);
  });
  g.querySelectorAll('button').forEach((b) => {
    b.onclick = (e) => {
      const id = e.target.getAttribute('data-id');
      if (currentStoreTab === 'tools') {
        const tools = installedTools.includes(id) ? installedTools.filter((t) => t !== id) : [...installedTools, id];
        setInstalledTools(tools);
        localStorage.setItem('hoosh_tools', JSON.stringify(tools));
      } else {
        const skills = installedSkills.includes(id) ? installedSkills.filter((t) => t !== id) : [...installedSkills, id];
        setInstalledSkills(skills);
        localStorage.setItem('hoosh_skills', JSON.stringify(skills));
      }
      renderStore();
    };
  });
}

export function setupStoreTabs() {
  document.querySelectorAll('.store-tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.store-tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active'); currentStoreTab = t.getAttribute('data-tab'); renderStore();
    };
  });
}

export function loadConv(id, addMsgFn) {
  const found = convs.find((c) => c.id === id);
  if (!found) return false;
  setCur(found);
  localStorage.setItem('hoosh_cur', id); // قبلاً هیچ‌جا ذخیره نمی‌شد، پس آخرین گفتگو بعد از رفرش برنمی‌گشت
  chat.innerHTML = '';
  found.messages.forEach((m) => addMsgFn(m.content, m.role === 'assistant' ? 'bot' : m.role));
  chat.scrollTop = chat.scrollHeight;
  return true;
  }
    
