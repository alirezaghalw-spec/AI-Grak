export const FALLBACK_MODEL = 'openrouter/free';

// فهرست پیش‌فرض (فقط وقتی استفاده می‌شود که فهرست زنده از OpenRouter هنوز نیامده یا آفلاین هستید).
// بعد از اولین بروزرسانی موفق، فهرست زنده جایگزین می‌شود و مدل‌های منقضی خودبه‌خود حذف می‌شوند.
// paid: true یعنی مدل ارزان ولی غیررایگان؛ vision: true یعنی تصویر را می‌فهمد.
export const DEFAULT_MODELS = [
  // --- مسیریاب خودکار ---
  { id: 'openrouter/free', name: '🎲 مسیریاب خودکار رایگان', free: true },

  // --- مدل‌های رایگان ---
  { id: 'google/gemini-2.0-flash-exp:free', name: '✨ Gemini 2.0 Flash (Vision)', free: true, vision: true },
  { id: 'google/gemma-4-26b-a4b-it:free', name: '💎 Gemma 4 26B (Vision)', free: true, vision: true },
  { id: 'google/gemma-4-31b-it:free', name: '💎 Gemma 4 31B', free: true },
  { id: 'deepseek/deepseek-r1:free', name: '🧠 DeepSeek R1', free: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: '🦙 Llama 3.3 70B', free: true },
  { id: 'qwen/qwen3.6-plus:free', name: '🚀 Qwen3.6 Plus (1M)', free: true },
  { id: 'qwen/qwen3-coder:free', name: '💻 Qwen3 Coder 480B', free: true },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: '🚀 Qwen3 Next 80B', free: true },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: '🟢 Nemotron 3 Super 120B', free: true },
  { id: 'nvidia/nemotron-3.5-super-vl:free', name: '👁️ Nemotron 3.5 Super VL', free: true, vision: true },
  { id: 'openai/gpt-oss-120b:free', name: '🤖 GPT-OSS 120B', free: true },
  { id: 'openai/gpt-oss-20b:free', name: '🤖 GPT-OSS 20B', free: true },
  { id: 'z-ai/glm-4.5-air:free', name: '🌬️ GLM 4.5 Air', free: true },
  { id: 'minimax/minimax-m2.7:free', name: '⚡ MiniMax M2.7', free: true },
  { id: 'stepfun/step-3.5-flash:free', name: '⚡ Step 3.5 Flash', free: true },

  // --- مدل‌های فوق‌العاده ارزان (وقتی سقف رایگان تمام شد) ---
  { id: 'qwen/qwen3.5-9b', name: '💰 Qwen3.5-9B (ارزان)', paid: true },
  { id: 'google/gemini-2.0-flash-001', name: '💰 Gemini 2.0 Flash', paid: true, vision: true },
  { id: 'google/gemini-2.5-flash-lite', name: '💰 Gemini 2.5 Flash Lite', paid: true, vision: true },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: '💰 Llama 3.3 70B', paid: true },
  { id: 'mistralai/mistral-small-2603', name: '💰 Mistral Small 4', paid: true },
  { id: 'z-ai/glm-5.3-flash', name: '💰 GLM-5.3-Flash', paid: true }
];

export const STORE_ITEMS = {
  tools: [
    { id: 'web_search', title: '🔍 جستجوی وب زنده', desc: 'جستجوی اینترنتی از طریق پلاگین OpenRouter. توجه: ممکن است از اعتبار حساب شما کم کند، حتی با مدل رایگان.' },
    { id: 'web_fetch', title: '🌐 دریافت محتوای وب', desc: 'لینک‌های داخل پیام شما خوانده می‌شود و متن آن به مدل داده می‌شود.' }
  ],
  skills: [
    { id: 'python_expert', title: '🐍 مهارت پایتون', desc: 'مدل را وادار می‌کند کد پایتون کامل، تمیز و قابل اجرا بنویسد.' },
    { id: 'js_expert', title: '🌐 مهارت فرانت‌اند', desc: 'تولید کد HTML، CSS و JavaScript با کیفیت بهتر.' },
    { id: 'image_editor', title: '🎨 مهارت تصویر', desc: 'تحلیل دقیق تصاویر پیوست‌شده و ساخت تصویر جدید با پرامپت حرفه‌ای. ویرایش پیکسلی تصویر انجام نمی‌دهد.' }
  ]
};
