import { MODELS, getModel, prompts, installedTools, installedSkills, cur, convs, setCur, setInstalledTools, setInstalledSkills } from './state.js';
import { STORE_ITEMS } from './config.js';

export const $ = (id) => document.getElementById(id);
export const chat = $('chat');

export function scrollDown() { if (chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 150) chat.scrollTop = chat.scrollHeight; }

export function addMsg(content, role, feedbackId) {
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

export function updateUI() { 
    let b = $('modelBtn'); if(!b) return; 
    let c = MODELS.find(m=>m.id===getModel()); 
    b.textContent = c ? c.name.substring(0,15) : getModel().split('/')[0]; 
}

export function renderAttachments(attachments) {
  let b = $('attachPreview'); if (!b) return;
  if (!attachments.length) { b.style.display = 'none'; return; }
  b.style.display = 'flex'; b.innerHTML = '';
  attachments.forEach((a, i) => {
    let d = document.createElement('div'); d.className = 'attach-item';
    if (a.type.startsWith('image/')) { let img = document.createElement('img'); img.src = a.dataUrl; d.appendChild(img); } else d.textContent = a.name;
    let rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×'; 
    rm.onclick = () => { attachments.splice(i,1); renderAttachments(attachments); };
    d.appendChild(rm); b.appendChild(d);
  });
}

export function renderModelList() { 
    let l = $('modelList'); if(!l) return; l.innerHTML = ''; 
    MODELS.forEach(m => { 
        let b = document.createElement('button'); b.className='mitem'+(m.id===getModel()?' sel':''); b.textContent=m.name; 
        b.onclick=()=>{ localStorage.setItem('hoosh_model',m.id); updateUI(); $('modelOv').classList.remove('on'); }; 
        l.appendChild(b); 
    }); 
}

export function renderPrompts() { 
    let l = $('promptList'); if(!l) return; l.innerHTML = ''; 
    prompts.forEach(p => { 
        let b = document.createElement('div'); b.className='pitem'; b.innerHTML=`<b>${p.title}</b><br><small>${p.text}</small>`; 
        b.onclick=()=>{ $('sysPromptInput').value=p.text; localStorage.setItem('hoosh_sys',p.text); $('promptOv').classList.remove('on'); }; 
        l.appendChild(b); 
    }); 
}

let currentStoreTab = 'tools';
export function renderStore() {
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
      if (currentStoreTab === 'tools') { 
          let tools = installedTools.includes(id) ? installedTools.filter(t=>t!==id) : [...installedTools, id]; 
          setInstalledTools(tools); // اصلاح شد: آپدیت استیت
          localStorage.setItem('hoosh_tools', JSON.stringify(tools)); 
      } else { 
          let skills = installedSkills.includes(id) ? installedSkills.filter(t=>t!==id) : [...installedSkills, id]; 
          setInstalledSkills(skills); // اصلاح شد: آپدیت استیت
          localStorage.setItem('hoosh_skills', JSON.stringify(skills)); 
      }
      renderStore(); // اصلاح شد: بدون رفرش صفحه، فقط لیست رو دوباره می‌سازیم
    };
  });
}

export function setupStoreTabs() {
    document.querySelectorAll('.store-tab').forEach(t => {
        t.onclick = () => { document.querySelectorAll('.store-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); currentStoreTab = t.getAttribute('data-tab'); renderStore(); };
    });
}

export function loadConv(id, addMsgFn) { 
    let found = convs.find(c=>c.id===id) || null; 
    if(!found) return false; 
    setCur(found); // اصلاح شد: استفاده از تابع setCur برای آپدیت متغیر سراسری
    chat.innerHTML = ''; 
    found.messages.forEach(m=>addMsgFn(m.content, m.role)); 
    return true;
      }
