// ---------------------------------------------------
// models.js
// فهرست زنده مدل‌ها، انتخاب مدل دوم (حالت مقایسه) و تشخیص «مدل در دسترس نیست»
// (main.js این فایل را import می‌کند؛ قبلاً در مخزن وجود نداشت و کل برنامه بالا نمی‌آمد)
// ---------------------------------------------------

import { DEFAULT_MODELS, FALLBACK_MODEL } from './config.js';
import { MODELS, setModels, getModel } from './state.js';
import { fetchModels } from './api.js';
import { updateUI, toast } from './ui.js';

// فهرست زنده از سرور (فقط رایگان‌ها) + مسیریاب خودکار در بالا + مدل‌های ارزان پیش‌فرض در پایین.
// مدل‌هایی که دیگر در OpenRouter نیستند خودبه‌خود از فهرست حذف می‌شوند.
export async function refreshModels(force = false) {
    if (!navigator.onLine) {
        if (force) toast('اینترنت قطع است.');
        return false;
    }
    const data = await fetchModels();
    const live = Array.isArray(data.models) ? data.models : [];
    if (!live.length) {
        if (force) toast('دریافت فهرست مدل‌ها ممکن نشد. کمی بعد دوباره تلاش کنید.');
        return false;
    }

    const known = new Map(DEFAULT_MODELS.map((m) => [m.id, m]));
    const router = known.get(FALLBACK_MODEL) || { id: FALLBACK_MODEL, name: '🎲 مسیریاب خودکار رایگان', free: true };
    const freeList = live
        .filter((m) => m && m.id && m.id !== FALLBACK_MODEL)
        .map((m) => {
            const d = known.get(m.id) || {};
            const vision = m.vision !== null && m.vision !== undefined ? m.vision : d.vision;
            const item = { id: m.id, name: d.name || m.name || m.id, free: true };
            if (vision !== undefined) item.vision = vision;
            return item;
        });
    const paid = DEFAULT_MODELS.filter((m) => m.paid);

    const list = [router, ...freeList, ...paid];
    setModels(list);
    localStorage.setItem('hoosh_models_list', JSON.stringify(list));
    localStorage.setItem('hoosh_models_ts', String(Date.now()));
    updateUI();
    if (force) toast(`${freeList.length} مدل رایگان بروزرسانی شد.`, 2500);
    return true;
}

// مدل دوم برای حالت مقایسه: یک مدل رایگان متفاوت از مدل فعلی (ترجیحاً غیر از مسیریاب)
export function pickSecondModel() {
    const cur = getModel();
    const pool = MODELS.filter((m) => m.id !== cur && !m.paid);
    const others = pool.filter((m) => m.id !== FALLBACK_MODEL);
    const from = others.length ? others : pool;
    if (!from.length) return FALLBACK_MODEL;
    return from[Math.floor(Math.random() * from.length)].id;
}

// پیام خطایی که یعنی خود مدل در دسترس نیست (نه کلید یا شبکه)
const UNAVAILABLE_RE = /Error 404|No endpoints found|not a valid model|model.{0,40}(not found|not available|does not exist|unavailable)|no longer (available|supported)|deprecated|مدل.{0,20}(نیست|نامعتبر)/i;
export function isModelUnavailable(message) {
    return UNAVAILABLE_RE.test(String(message || ''));
}
