export const DEFAULT_MODELS = [
  // --- مسیریاب خودکار ---
  { id: 'openrouter/free', name: '🎲 مسیریاب خودکار رایگان' },

  // --- مدل‌های رایگان گوگل ---
  { id: 'google/gemini-2.0-flash-exp:free', name: '✨ Gemini 2.0 Flash (Vision)' },
  { id: 'google/gemma-4-26b-a4b-it:free', name: '💎 Gemma 4 26B (Vision)' },
  { id: 'google/gemma-4-31b-it:free', name: '💎 Gemma 4 31B' },

  // --- مدل‌های رایگان DeepSeek و Meta ---
  { id: 'deepseek/deepseek-r1:free', name: '🧠 DeepSeek R1' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: '🦙 Llama 3.3 70B' },

  // --- مدل‌های رایگان Qwen ---
  { id: 'qwen/qwen3.6-plus:free', name: '🚀 Qwen3.6 Plus (1M)' },
  { id: 'qwen/qwen3-coder:free', name: '💻 Qwen3 Coder 480B' },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: '🚀 Qwen3 Next 80B' },
  { id: 'qwen/qwen3.8-27b:free', name: '🚀 Qwen3.8 27B' },

  // --- مدل‌های رایگان NVIDIA ---
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: '🟢 Nemotron 3 Super 120B' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: '🧠 Nemotron 3 Ultra (1M)' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', name: '👁️ Nemotron 3.5 Super VL' },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: '⚡ Nemotron 3.5 Lightning' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: '🧠 Nemotron 3 Nano' },

  // --- مدل‌های رایگان OpenAI و دیگران ---
  { id: 'openai/gpt-oss-120b:free', name: '🤖 GPT-OSS 120B' },
  { id: 'openai/gpt-oss-20b:free', name: '🤖 GPT-OSS 20B' },
  { id: 'arcee-ai/trinity-large-preview:free', name: '🔱 Trinity Large' },
  { id: 'arcee-ai/trinity-mini:free', name: '🔱 Trinity Mini' },
  { id: 'cohere/north-mini-code:free', name: '💻 Cohere North Mini Code' },
  { id: 'poolside/laguna-s-2.1:free', name: '💻 Poolside Laguna S 2.1' },
  { id: 'poolside/laguna-m.1:free', name: '💻 Poolside Laguna M.1' },
  { id: 'inclusionai/ling-3.0-flash:free', name: '🌊 Ling 3.0 Flash' },
  { id: 'inclusionai/ling-2.6-1t:free', name: '🌊 Ling 2.6 1T' },

  // --- مدل‌های رایگان تخصصی و جدید ---
  { id: 'minimax/minimax-m3.1-flash:free', name: '⚡ MiniMax M3.1 Flash' },
  { id: 'minimax/minimax-m2.7:free', name: '⚡ MiniMax M2.7' },
  { id: 'stepfun/step-3.5-flash:free', name: '⚡ Step 3.5 Flash' },
  { id: 'tencent/hy3-preview:free', name: '🔷 Tencent Hy3 Preview' },
  { id: 'z-ai/glm-5.2:free', name: '🌬️ GLM 5.2' },
  { id: 'z-ai/glm-4.5-air:free', name: '🌬️ GLM 4.5 Air' },
  { id: 'liquid/lfm-2.5-2.6b:free', name: '💧 LFM 2.5 2.6B' },
  { id: 'dots-studio/dots-3-note-preview:free', name: '📝 Dots 3 Note' },
  { id: 'stealth/crouton-alpha', name: '🥐 Crouton Alpha (مخفی)' },

  // --- مدل‌های فوق‌العاده ارزان (برای وقتی که محدودیت رایگان تموم میشه) ---
  { id: 'qwen/qwen3.5-9b', name: '💰 Qwen3.5-9B (ارزان)' },
  { id: 'google/gemini-2.0-flash-001', name: '💰 Gemini 2.0 Flash' },
  { id: 'google/gemini-2.5-flash-lite', name: '💰 Gemini 2.5 Flash Lite' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: '💰 Llama 3.3 70B' },
  { id: 'mistralai/mistral-small-2603', name: '💰 Mistral Small 4' },
  { id: 'z-ai/glm-5.3-flash', name: '💰 GLM-5.3-Flash' }
];

export const STORE_ITEMS = {
  tools: [
    { id: 'web_search', title: '🔍 جستجوی وب زنده', desc: 'دسترسی واقعی به اینترنت برای دریافت اخبار و اطلاعات روز.' },
    { id: 'web_fetch', title: '🌐 دریافت محتوای وب', desc: 'لینک‌های داخل پیام شما خوانده می‌شود و متن آن به مدل داده می‌شود.' }
  ],
  skills: [
    { id: 'python_expert', title: '🐍 مهارت پایتون', desc: 'به مدل یاد می‌دهد کدهای پایتون را استاندارد بنویسد.' },
    { id: 'js_expert', title: '🌐 مهارت فرانت‌اند', desc: 'تولید کدهای HTML، CSS و JS.' },
    { id: 'image_editor', title: '🎨 مهارت ویرایش تصویر', desc: 'مدل را برای انجام ادیت‌های دقیق روی تصاویر آماده می‌کند.' }
  ]
};
