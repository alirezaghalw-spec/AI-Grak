// برای هر بلاک کد (صرف‌نظر از زبان)
const lang = (code.className.match(/language-(\w+)/) || [])[1] || 'text';
if (['python', 'javascript', 'c', 'cpp', 'csharp'].includes(lang)) {
  const btn = document.createElement('button');
  btn.className = 'run-code';
  btn.textContent = '▶ اجرا و دیباگ';
  let out = null;
  
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = '...';
    
    const result = await runCode(lang, code.innerText);
    
    if (out) out.remove();
    out = document.createElement('div');
    out.className = 'run-out';
    
    const pre = document.createElement('pre');
    if (result.error) {
      pre.textContent = '❌ خطا: ' + result.error;
    } else {
      pre.textContent = result.stdout || '(بدون خروجی)';
      if (result.stderr) pre.textContent += '\n' + result.stderr;
    }
    out.appendChild(pre);
    pre.after(out);
    
    btn.disabled = false;
    btn.textContent = '▶ اجرا و دیباگ';
  };
  
  pre.appendChild(btn);
}
