// اجرا: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

// شبیه‌سازی حداقلی مرورگر (state.js فقط به localStorage و window نیاز دارد)
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.window = {};

const s = await import('../js/state.js');
const api = await import('../js/api.js');

test('addUsage: جمع کل، تفکیک مدل و روز', () => {
  mem.clear();
  s.addUsage({ total_tokens: 100, cost: 0.01 }, 'a/x');
  s.addUsage({ total_tokens: 50, cost: 0.005 }, 'a/x');
  s.addUsage({ total_tokens: 10, cost: 0 }, 'b/y');
  const st = s.getUsageStats();
  assert.equal(st.tokens, 160);
  assert.ok(Math.abs(st.cost - 0.015) < 1e-9);
  assert.equal(st.byModel['a/x'].count, 2);
  assert.equal(st.byModel['a/x'].tokens, 150);
  assert.equal(st.days[s.dayKey()].tokens, 160);
});

test('addUsage: فقط ۳۰ روز آخر نگه داشته می‌شود', () => {
  mem.clear();
  const old = {};
  for (let i = 1; i <= 40; i++) old['2020-01-' + String(i).padStart(2, '0')] = { tokens: 1, cost: 0, count: 1 };
  localStorage.setItem('hoosh_usage_days', JSON.stringify(old));
  s.addUsage({ total_tokens: 5, cost: 0 }, 'm');
  assert.equal(Object.keys(s.getUsageStats().days).length, 30);
});

test('resetUsage همه چیز را صفر می‌کند', () => {
  s.addUsage({ total_tokens: 5, cost: 1 }, 'm');
  s.resetUsage();
  const st = s.getUsageStats();
  assert.deepEqual([st.tokens, st.cost, st.byModel, st.days], [0, 0, {}, {}]);
});

test('buildApiMessages: پاسخ alt حذف می‌شود و تصویر فقط در آخرین پیام می‌ماند', () => {
  const msgs = [
    { role: 'user', content: 'q1', images: ['data:old'] },
    { role: 'assistant', content: 'a1', cmp: true, model: 'a' },
    { role: 'assistant', content: 'a1-alt', cmp: true, model: 'b', alt: true },
    { role: 'user', content: 'q2', images: ['data:new'] },
  ];
  const out = api.buildApiMessages(msgs);
  assert.equal(out.length, 3);
  assert.ok(!out.some((m) => String(m.content).includes('a1-alt')));
  assert.ok(Array.isArray(out[2].content) && out[2].content.some((p) => p.type === 'image_url'));
  assert.equal(typeof out[0].content, 'string');
});

test('errorText: detail را از JSON بیرون می‌کشد', () => {
  assert.equal(api.errorText('{"detail":"سلام"}'), 'سلام');
  assert.equal(api.errorText('plain'), 'plain');
});
