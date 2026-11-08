export async function runCode(language, code, stdin = '') {
  const res = await fetch('/run-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, code, stdin })
  });
  return res.json();
}
