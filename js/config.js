// js/config.js — Pure JavaScript (browser-compatible)
// Type hints via JSDoc — syntax highlighting in IDE, zero runtime cost.

export const FALLBACK_MODEL = 'openrouter/free';

// ============================================================
// Type definitions (JSDoc — no build step needed)
// ============================================================

/**
 * @typedef {'router' | 'free' | 'paid'} ModelTier
 */

/**
 * @typedef {Object} ModelConfig
 * @property {string}     id
 * @property {string}     name
 * @property {ModelTier}  tier
 * @property {boolean}    [vision]
 * @property {number}     [contextK]
 * @property {number}     [inputPrice]
 * @property {number}     [outputPrice]
 * @property {string}     [note]
 * @property {boolean}    [free]   // ✅ اضافه‌شده خودکار برای سازگاری با کد قدیمی
 * @property {boolean}    [paid]   // ✅ اضافه‌شده خودکار برای سازگاری با کد قدیمی
 */

/**
 * @typedef {Object} StoreItem
 * @property {string} id
 * @property {string} title
 * @property {string} desc
 * @property {string} [warning]
 */

// ============================================================
// Default models
// ============================================================

/** @type {ModelConfig[]} */
export const DEFAULT_MODELS = [
  // ── Router ──
  { id: 'openrouter/free', name: '🎲 مسیریاب خودکار رایگان', tier: 'router' },

  // ── Free models ──
  { id: 'google/gemma-4-26b-a4b-it:free',              name: '💎 Gemma 4 26B (Vision)',     tier: 'free', vision: true, contextK: 128 },
  { id: 'google/gemma-4-31b-it:free',                  name: '💎 Gemma 4 31B',              tier: 'free', contextK: 128 },
  { id: 'deepseek/deepseek-r1:free',                    name: '🧠 DeepSeek R1',              tier: 'free', contextK: 164 },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free',        name: '🚀 Qwen3 Next 80B',           tier: 'free', contextK: 262 },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',       name: '🟢 Nemotron 3 Super 120B',    tier: 'free', contextK: 128 },
  { id: 'nvidia/nemotron-3.5-super-vl:free',            name: '👁️ Nemotron 3.5 Super VL',    tier: 'free', vision: true },
  { id: 'openai/gpt-oss-120b:free',                     name: '🤖 GPT-OSS 120B',             tier: 'free', contextK: 131 },
  { id: 'openai/gpt-oss-20b:free',                      name: '🤖 GPT-OSS 20B (کند)',        tier: 'free', note: 'پاسخ ۱۱–۲۲ ثانیه' },
  { id: 'z-ai/glm-4.5-air:free',                        name: '🌬️ GLM 4.5 Air',             tier: 'free', contextK: 128 },
  { id: 'minimax/minimax-m2.7:free',                    name: '⚡ MiniMax M2.7',              tier: 'free' },
  { id: 'stepfun/step-3.5-flash:free',                  name: '⚡ Step 3.5 Flash',            tier: 'free' },

  // ── Paid: DeepSeek ──
  { id: 'deepseek/deepseek-v4.1-flash',                 name: '💰 DeepSeek V4.1 Flash',      tier: 'paid', vision: true, contextK: 1000, inputPrice: 0.022, outputPrice: 0.192 },
  { id: 'deepseek/deepseek-v3.2-exp',                   name: '💰 DeepSeek V3.2 Exp',        tier: 'paid', contextK: 164,  inputPrice: 0.27,  outputPrice: 0.41 },
  { id: 'deepseek/deepseek-v3.1-terminus',              name: '💰 DeepSeek V3.1 Terminus',   tier: 'paid', contextK: 164,  inputPrice: 0.27,  outputPrice: 1.0 },

  // ── Paid: OpenAI ──
  { id: 'openai/gpt-5.1',                               name: '💰 GPT-5.1',                  tier: 'paid', contextK: 400,   inputPrice: 1.25,  outputPrice: 10 },
  { id: 'openai/gpt-5.4',                               name: '💰 GPT-5.4',                  tier: 'paid', contextK: 1050,  inputPrice: 2.50,  outputPrice: 15 },
  { id: 'openai/gpt-5.4-nano',                          name: '💰 GPT-5.4 Nano',             tier: 'paid', contextK: 400,   inputPrice: 0.20,  outputPrice: 1.25 },
  { id: 'openai/gpt-6-sol',                             name: '💰 GPT-6 Sol',                tier: 'paid', contextK: 1100,  inputPrice: 2,     outputPrice: 10 },

  // ── Paid: Anthropic ──
  { id: 'anthropic/claude-sonnet-5',                    name: '💰 Claude Sonnet 5',          tier: 'paid', vision: true, inputPrice: 2, outputPrice: 10 },
  { id: 'anthropic/claude-opus-5.5',                    name: '💰 Claude Opus 5.5',          tier: 'paid', vision: true, inputPrice: 4, outputPrice: 20 },

  // ── Paid: xAI ──
  { id: 'x-ai/grok-4.7',                                name: '💰 Grok 4.7',                 tier: 'paid', contextK: 500,  inputPrice: 2,     outputPrice: 6 },
  { id: 'x-ai/grok-4.20',                               name: '💰 Grok 4.20 (2M)',           tier: 'paid', contextK: 2000, inputPrice: 1.25,  outputPrice: 2.50 },

  // ── Paid: Qwen ──
  { id: 'qwen/qwen3.7-plus',                            name: '💰 Qwen3.7 Plus (1M)',        tier: 'paid', contextK: 1000, inputPrice: 0.32,  outputPrice: 1.28 },
  { id: 'qwen/qwen3.5-9b',                              name: '💰 Qwen3.5-9B',               tier: 'paid', contextK: 144,  inputPrice: 0.08 },
  { id: 'qwen/qwen3-coder-next',                        name: '💰 Qwen3 Coder Next',         tier: 'paid', contextK: 262,  inputPrice: 0.12,  outputPrice: 0.80 },

  // ── Paid: Google ──
  { id: 'google/gemini-3-flash-preview',                name: '💰 Gemini 3 Flash Preview',   tier: 'paid', vision: true, contextK: 1048, inputPrice: 0.50, outputPrice: 3 },
  { id: 'google/gemini-3.1-flash-lite-preview',         name: '💰 Gemini 3.1 Flash Lite',    tier: 'paid', vision: true, contextK: 1048, inputPrice: 0.25, outputPrice: 1.50 },
  { id: 'google/gemini-2.5-flash',                      name: '💰 Gemini 2.5 Flash',         tier: 'paid', vision: true, contextK: 1048, inputPrice: 0.30, outputPrice: 2.50 },

  // ── Paid: Mistral / Z.AI ──
  { id: 'mistralai/mistral-small-2603',                 name: '💰 Mistral Small 4',          tier: 'paid', contextK: 262,  inputPrice: 0.15,  outputPrice: 0.60 },
  { id: 'z-ai/glm-5.3-flash',                           name: '💰 GLM-5.3-Flash',            tier: 'paid', contextK: 1000, inputPrice: 0.075, outputPrice: 0.25 },
];

// ── Backward-compat: پر کردن خودکار free/paid روی هر مدل ──
// اگر UI کد قدیمی با m.free یا m.paid چک می‌کند، اینجا سازگار می‌شود.
for (const m of DEFAULT_MODELS) {
  m.free = m.tier === 'free' || m.tier === 'router';
  m.paid = m.tier === 'paid';
}

// ============================================================
// Dynamic sync with OpenRouter live catalog
// ============================================================

const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * لیست مدل‌ها را با catalog زنده OpenRouter ادغام می‌کند.
 * در صورت خطای شبکه، همان fallback برمی‌گردد.
 *
 * @param {ModelConfig[]} [fallback]
 * @returns {Promise<ModelConfig[]>}
 */
export async function resolveModels(fallback = DEFAULT_MODELS) {
  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const live = await res.json();
    const data = Array.isArray(live?.data) ? live.data : [];
    const liveIds = new Set(data.map((m) => m.id));

    // فقط مدل‌هایی که واقعاً در catalog زنده هستند
    const validated = fallback.filter((m) => liveIds.has(m.id));

    // مدل‌های رایگان جدیدی که در لیست پیش‌فرض نیستند
    const extras = data
      .filter((m) => m.id.endsWith(':free') && !validated.some((v) => v.id === m.id))
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        tier: 'free',
        free: true,
        paid: false,
        contextK: m.context_length ? Math.round(m.context_length / 1000) : undefined,
      }));

    return [...validated, ...extras];
  } catch (err) {
    console.warn('[config] resolveModels failed, using fallback:', err);
    return fallback;
  }
}

// ============================================================
// Store items
// ============================================================

/** @type {{ tools: StoreItem[], skills: StoreItem[] }} */
export const STORE_ITEMS = {
  tools: [
    {
      id: 'web_search',
      title: '🔍 جستجوی وب زنده',
      desc: 'جستجوی اینترنتی از طریق پلاگین OpenRouter.',
      warning: 'ممکن است از اعتبار حساب شما کم کند، حتی با مدل رایگان.',
    },
    {
      id: 'web_fetch',
      title: '🌐 دریافت محتوای وب',
      desc: 'لینک‌های داخل پیام شما خوانده می‌شود و متن آن به مدل داده می‌شود.',
    },
  ],
  skills: [
    { id: 'python_expert', title: '🐍 مهارت پایتون',    desc: 'مدل را وادار می‌کند کد پایتون کامل، تمیز و قابل اجرا بنویسد.' },
    { id: 'js_expert',     title: '🌐 مهارت فرانت‌اند', desc: 'تولید کد HTML، CSS و JavaScript با کیفیت بهتر.' },
    { id: 'image_editor',  title: '🎨 مهارت تصویر',     desc: 'تحلیل دقیق تصاویر پیوست‌شده و ساخت تصویر جدید با پرامپت حرفه‌ای. ویرایش پیکسلی تصویر انجام نمی‌دهد.' },
  ],
};
