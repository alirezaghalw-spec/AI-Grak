// ✅ مدل جایگزین حالا رایگان است (قبلاً DeepSeek پولی بود و کاربر بی‌صدا پولی می‌شد)
export const FALLBACK_MODEL = 'openrouter/free';

export const DEFAULT_MODELS = [
  {
    id: 'openrouter/free',
    name: '🆓 مسیریاب رایگان',
    tier: 'router',
    free: true,
    paid: false,
    note: 'خودکار یکی از مدل‌های رایگان را انتخاب می‌کند'
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    name: '🐋 DeepSeek V4 Flash (کدنویس)',
    tier: 'paid',
    free: false,
    paid: true,
    contextK: 1000,
    inputPrice: 0.14,
    outputPrice: 0.28,
    note: 'بهینه برای کدنویسی و دیباگ'
  }
];

const MODELS_URL = 'https://openrouter.ai/api/v1/models';

// فقط مدل‌های پولی پیش‌فرض با فهرست زندهٔ OpenRouter چک می‌شوند؛ مسیریاب همیشه می‌ماند
export async function resolveModels(fallback = DEFAULT_MODELS) {
  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const live = await res.json();
    const data = Array.isArray(live?.data) ? live.data : [];
    const liveIds = new Set(data.map((m) => m.id));
    return fallback.filter((m) => m.tier === 'router' || liveIds.has(m.id));
  } catch {
    return fallback;
  }
}

// ✅ قبلاً این خروجی وجود نداشت و ui.js به‌خاطر import آن کل برنامه را از کار می‌انداخت.
// idها باید با بک‌اند (active_tools / SKILL_PROMPTS در api_routes.py) یکی باشند.
export const STORE_ITEMS = {
  tools: [
    { id: 'web_fetch', title: '🌐 خواندن لینک‌ها', desc: 'لینک‌های داخل پیام شما را باز می‌کند و متن صفحه را به مدل می‌دهد.' },
    { id: 'web_search', title: '🔎 جستجوی وب', desc: 'پلاگین جستجوی OpenRouter. ممکن است حتی با مدل رایگان از اعتبار شما کم کند.' }
  ],
  skills: [
    { id: 'python_expert', title: '🐍 متخصص پایتون', desc: 'کد کامل، تمیز و قابل اجرای پایتون با مدیریت خطا.' },
    { id: 'js_expert', title: '🧩 متخصص فرانت‌اند', desc: 'HTML، CSS و JavaScript خوانا و سازگار با موبایل.' },
    { id: 'image_editor', title: '🖼️ تحلیل و ساخت تصویر', desc: 'تصویرهای پیوست‌شده را تحلیل می‌کند و برای نسخهٔ جدید پرامپت می‌سازد.' }
  ]
};
