export const FALLBACK_MODEL = 'deepseek/deepseek-v4-flash';

export const DEFAULT_MODELS = [
  { 
    id: 'deepseek/deepseek-v4-flash', 
    name: '🐋 DeepSeek V4 Flash (کدنویس)', 
    tier: 'paid', 
    contextK: 1000, 
    inputPrice: 0.14, 
    outputPrice: 0.28,
    note: 'بهینه برای کدنویسی و دیباگ'
  }
];

// سازگاری با کد قدیمی
for (const m of DEFAULT_MODELS) {
  m.free = false;
  m.paid = true;
}

const MODELS_URL = 'https://openrouter.ai/api/v1/models';

export async function resolveModels(fallback = DEFAULT_MODELS) {
  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const live = await res.json();
    const data = Array.isArray(live?.data) ? live.data : [];
    const liveIds = new Set(data.map((m) => m.id));
    return fallback.filter((m) => liveIds.has(m.id));
  } catch {
    return fallback;
  }
}

// سایر بخش‌های STORE_ITEMS حذف می‌شوند
