import { MODELS, getModel, prompts, installedTools, installedSkills, convs, setCur, setInstalledTools, setInstalledSkills, getUsageStats, dayKey } from './state.js';
import { STORE_ITEMS } from './config.js';
import { runPython } from './api.js';

export const $ = (id) => document.getElementById(id);
export const chat = $('chat');

if (window.DOMPurify) {
  DOMPurify.addHook('afterSanitizeAttributes', (n) => {
    if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
    if (n.tagName === 'IMG') { n.setAttribute('loading', 'lazy'); n.setAttribute('referrerpolicy', 'no-referrer'); }
  });
}

// پیام کوتاه و موقت (به‌جای alert)
export function toast(msg, ms = 4000) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

export function scrollDown() { if (chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150) chat.scrollTop = chat.scrollHeight; }

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// پرامپت تصویر Pollinations باید URL-encode شود، وگرنه فاصله و حروف فارسی لینک را خراب می‌کنند
const POLLINATIONS = /!\[([^\]]*)\]\(\s*https:\/\/image\.pollinations\.ai\/prompt\/([^)]*?)\s*\)/g;
function fixPollinations(t) {
  return t.replace(POLLINATIONS, (m, alt, rest) => {
    const qi = rest.indexOf('?');
    let p = qi === -1 ? rest : rest.slice(0, qi);
    const q = qi === -1 ? '?nologo=true' : rest.slice(qi).replace(/\s/g, '');
    try { p = decodeURIComponent(p); } catch (e) { /* همان متن */ }
    p = p.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!p) return m;
    return `![${alt}](https://image.pollinations.ai/prompt/${encodeURIComponent(p)}${q})`;
  });
}

// تگ‌های ابزار را قابل نمایش می‌کند: <run_python> به بلاک کد، <fetch_url> به یک یادداشت
const preprocess = (t) => fixPollinations(String(t || ''))
  .replace(/<run_python>([\s\S]*?)(?:<\/run_python>|$)/g, (m, c) => '\n```python\n' + c.trim() + '\n```\n')
  .replace(/<fetch_url>([\s\S]*?)(?:<\/fetch_url>|$)/g, (m, u) => '\n\n> 🔧 دریافت صفحه: ' + u.trim() + '\n\n');

// مارک‌داون → HTML امن. بدون marked یا DOMPurify فقط متن ساده (escape شده) نمایش داده می‌شود
export function renderMd(text) {
  const src = preprocess(text);
  const plain = () => '<div style="white-space:pre-wrap">' + escapeHtml(src) + '</div>';
  if (!window.marked || !window.DOMPurify) return plain();
  try { return DOMPurify.sanitize(marked.parse(src || '...')); } catch (e) { return plain(); }
}

// دکمه‌های کپی / پیش‌نمایش HTML / اجرای پایتون + هایلایت + mermaid
export function enhanceMessage(msgEl, text) {
  const root = msgEl._body || msgEl;
  const diagrams = [];
  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code || pre.querySelector('.copy-code')) return;
    const lang = (code.className.match(/language-(\w+)/) || [])[1] || '';

    // mermaid: به جای بلاک کد، یک div.mermaid می‌سازیم تا رندر شود
    if (lang === 'mermaid' && window.mermaid) {
      const div = document.createElement('div'); div.className = 'mermaid'; div.textContent = code.textContent;
      pre.replaceWith(div); diagrams.push(div);
      return;
    }
    if (window.hljs && !code.dataset.highlighted) { try { hljs.highlightElement(code); } catch (e) { /* ignore */ } }

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

  if (diagrams.length) {
    // اگر کد mermaid ایراد داشته باشد، همان متن خام (بدون خطا) در پیام می‌ماند
    try { const p = mermaid.run({ nodes: diagrams, suppressErrors: true }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
}

// نام نمایشی مدل (برای برچسب‌های حالت مقایسه)
export function modelLabel(id) {
  const m = MODELS.find((x) => x.id === id);
  return m ? m.name : String(id || '');
}

export function makeModelTag(id) {
  const t = document.createElement('div'); t.className = 'model-tag'; t.textContent = modelLabel(id);
  return t;
}

// content: متن (یا آرایه در پیام‌های قدیمی). extra: خود پیام ذخیره‌شده (images / files / tool)
export function addMsg(content, role, feedbackId, extra) {
  if (!chat) return null;
  if (role === 'assistant') role = 'bot';
  const d = document.createElement('div'); d.className = 'msg ' + role + (extra && extra.tool ? ' tool' : '');

  if (role === 'bot') {
    // محتوا در یک div جدا می‌ماند تا بروزرسانی استریم دکمه‌های فیدبک را پاک نکند
    const body = document.createElement('div'); body.className = 'md-body';
    body.innerHTML = renderMd(content || '...');
    // در حالت مقایسه، هر پاسخ نام مدل خودش را دارد (چه در لحظه، چه بعد از بارگذاری دوبارهٔ گفتگو)
    if (extra && extra.cmp && extra.model) d.appendChild(makeModelTag(extra.model));
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
  } else {
    let t = typeof content === 'string' ? content : ((Array.isArray(content) && (content.find((p) => p.type === 'text') || {}).text) || '');
    if (extra && extra.tool && t.length > 600) t = t.slice(0, 600) + '…';
    const td = document.createElement('div'); td.style.whiteSpace = 'pre-wrap'; td.textContent = t; d.appendChild(td);

    const imgs = [
      ...(Array.isArray(content) ? content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url) : []),
      ...((extra && extra.images) || [])
    ];
    imgs.forEach((src) => {
      const i = document.createElement('img'); i.src = src; i.style.maxWidth = '150px'; i.style.border = '2px solid var(--ink)'; i.style.marginTop = '8px'; d.appendChild(i);
    });
    ((extra && extra.files) || []).forEach((f) => {
      const c = document.createElement('div'); c.className = 'attach-file-chip'; c.textContent = '📎 ' + f.name; d.appendChild(c);
    });
  }
  chat.appendChild(d); scrollDown(); return d;
}

export function updateUI() {
  const b = $('modelBtn'); if (!b) return;
  const c = MODELS.find((m) => m.id === getModel());
  b.textContent = c ? c.name.substring(0, 15) : getModel().split('/')[0];
}

// onRemove(index): حذف پیوست توسط main.js انجام می‌شود (بدون دستکاری مستقیم state)
export function renderAttachments(attachments, onRemove) {
  const b = $('attachPreview'); if (!b) return;
  if (!attachments.length) { b.style.display = 'none'; b.innerHTML = ''; return; }
  b.style.display = 'flex'; b.innerHTML = '';
  attachments.forEach((a, i) => {
    const d = document.createElement('div'); d.className = 'attach-item';
    if (a.kind === 'image') { const img = document.createElement('img'); img.src = a.dataUrl; d.appendChild(img); } else d.textContent = a.name;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×'; rm.type = 'button';
    rm.onclick = () => onRemove && onRemove(i);
    d.appendChild(rm); b.appendChild(d);
  });
}

// ✅ تغییر ۱: نمایش قیمت برای مدل‌های پولی + کانتکست
export function renderModelList(filter = '') {
  const l = $('modelList'); if (!l) return; l.innerHTML = '';
  const f = String(filter || '').trim().toLowerCase();
  const list = MODELS.filter((m) => !f || m.name.toLowerCase().includes(f) || m.id.toLowerCase().includes(f));
  if (!list.length) { const n = document.createElement('div'); n.className = 'note'; n.textContent = 'مدلی پیدا نشد.'; l.appendChild(n); return; }
  list.forEach((m) => {
    const b = document.createElement('button'); b.className = 'mitem' + (m.id === getModel() ? ' sel' : '');

    // نام مدل
    const nameEl = document.createElement('div');
    nameEl.textContent = m.name + (m.vision && !m.name.includes('👁') ? ' 👁' : '');
    b.appendChild(nameEl);

    // قیمت / رایگان بودن / کانتکست
    if (m.paid && (m.inputPrice !== undefined || m.outputPrice !== undefined)) {
      const priceEl = document.createElement('div');
      priceEl.style.fontSize = '0.72em';
      priceEl.style.opacity = '0.7';
      priceEl.style.marginTop = '3px';
      const inP = m.inputPrice !== undefined ? `$${m.inputPrice}` : '?';
      const outP = m.outputPrice !== undefined ? `$${m.outputPrice}` : '?';
      const ctx = m.contextK ? ` · ${m.contextK}K ctx` : '';
      priceEl.textContent = `ورودی ${inP} / خروجی ${outP} (هر 1M توکن)${ctx}`;
      b.appendChild(priceEl);
    } else if (m.free) {
      const freeEl = document.createElement('div');
      freeEl.style.fontSize = '0.72em';
      freeEl.style.opacity = '0.7';
      freeEl.style.marginTop = '3px';
      freeEl.textContent = 'رایگان' + (m.contextK ? ` · ${m.contextK}K ctx` : '');
      b.appendChild(freeEl);
    }

    b.onclick = () => { localStorage.setItem('hoosh_model', m.id); updateUI(); $('modelOv').classList.remove('on'); };
    l.appendChild(b);
  });
}

// عنوان و متن پرامپت‌ها با textContent گذاشته می‌شود (innerHTML خام باعث XSS می‌شد)
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

// ---------------------------------------------------------------- داشبورد هزینه
const fa = (n) => Number(n).toLocaleString('en-US');
const usd = (n) => '$' + Number(n).toFixed(5);

export function renderDashboard() {
  const s = getUsageStats();
  $('totalCostDash').textContent = usd(s.cost);
  $('totalTokensDash').textContent = fa(s.tokens);

  // ۷ روز اخیر
  const daysBox = $('dashDays'); daysBox.innerHTML = '';
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last7.push({ key: dayKey(d), date: d });
  }
  const max = Math.max(1, ...last7.map((x) => (s.days[x.key] || {}).tokens || 0));
  last7.forEach(({ key, date }) => {
    const v = s.days[key] || { tokens: 0, cost: 0, count: 0 };
    const col = document.createElement('div'); col.className = 'bar-col';
    col.title = `${key}\n${fa(v.tokens)} توکن | ${usd(v.cost)} | ${v.count} پیام`;
    const fill = document.createElement('div');
    fill.className = 'bar-fill' + (v.tokens ? '' : ' empty');
    fill.style.height = Math.max(3, Math.round((v.tokens / max) * 80)) + 'px';
    const lab = document.createElement('div'); lab.className = 'bar-label';
    lab.textContent = date.toLocaleDateString('fa-IR', { weekday: 'short' });
    col.append(fill, lab); daysBox.appendChild(col);
  });

  // به تفکیک مدل
  const box = $('dashModels'); box.innerHTML = '';
  const rows = Object.entries(s.byModel).sort((a, b) => b[1].tokens - a[1].tokens);
  if (!rows.length) { const n = document.createElement('div'); n.className = 'note'; n.textContent = 'هنوز مصرفی ثبت نشده است.'; box.appendChild(n); return; }
  const top = Math.max(1, rows[0][1].tokens);
  rows.forEach(([id, v]) => {
    const r = document.createElement('div'); r.className = 'model-row';
    // ✅ تغییر ۲: نمایش نام خوانا به‌جای شناسه‌ی خام (id کامل در title می‌ماند)
    const name = document.createElement('div'); name.className = 'name';
    name.textContent = modelLabel(id);
    name.title = id;
    const track = document.createElement('div'); track.className = 'track';
    const bar = document.createElement('i'); bar.style.width = Math.max(2, Math.round((v.tokens / top) * 100)) + '%';
    track.appendChild(bar);
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `${fa(v.tokens)} tokens · ${usd(v.cost)} · ${v.count} msgs`;
    r.append(name, track, meta); box.appendChild(r);
  });
}

export function loadConv(id, addMsgFn) {
  const found = convs.find((c) => c.id === id);
  if (!found) return false;
  setCur(found);
  localStorage.setItem('hoosh_cur', id);
  chat.innerHTML = '';
  found.messages.forEach((m) => addMsgFn(m.content, m.role === 'assistant' ? 'bot' : m.role, undefined, m));
  chat.scrollTop = chat.scrollHeight;
  return true;
                                   }
