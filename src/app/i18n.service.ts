import { Injectable, computed, effect, signal } from '@angular/core';

export type Lang = 'ar' | 'en';

const STORAGE_KEY = 'lang';
const DEFAULT_LANG: Lang = 'ar';

const ar = {
  title: 'سعر الدولار',
  live: 'مباشر',
  connecting: 'جارٍ الاتصال…',
  loadError: 'تعذّر تحميل الأسعار — سنحاول مجددًا تلقائيًا',
  sellTitle: 'سعر البيع',
  buyTitle: 'سعر الشراء',
  sellShort: 'بيع',
  buyShort: 'شراء',
  steady: 'ثابت',
  per100Line: (iqd: string) => `100 دولار = ${iqd} د.ع`,
  usd: 'دولار',
  iqd: 'دينار',
  converter: 'حاسبة التحويل',
  haveUsd: 'عندي دولار',
  haveIqd: 'عندي دينار',
  enterAmount: 'اكتب المبلغ',
  youGet: 'تحصل على',
  rateUsed: (rate: string, kind: 'sell' | 'buy') => `حسب سعر ${kind === 'sell' ? 'البيع' : 'الشراء'}: ${rate} دينار لكل 1$`,
  trend: 'حركة السعر',
  trendSince: (date: string) => `مسجّلة على جهازك منذ ${date}`,
  trendEmpty: 'سيمتلئ المخطط كلما تغيّر السعر أثناء استخدامك للتطبيق.',
  high: 'الأعلى',
  low: 'الأدنى',
  refresh: 'تحديث الآن',
  share: (city: string) => `مشاركة سعر ${city}`,
  copied: 'تم نسخ السعر',
  shareText: (city: string, sell: string, buy: string, time: string) =>
    `💵 سعر الدولار في ${city}\nالبيع: ${sell} دينار لكل 100$\nالشراء: ${buy} دينار لكل 100$\n🕒 ${time}`,
  switchLang: 'English',
  source: 'المصدر',
  disclaimer: 'يعرض هذا التطبيق الأسعار المنشورة علنًا كما هي، للاطلاع فقط. ليس عرضًا للبيع أو الشراء ولا نصيحة مالية، وقد يختلف السعر الفعلي لدى الصرّافين.',
  cityPicker: 'اختر المدينة',
  markets: { b: 'بغداد', n: 'أربيل', s: 'البصرة' } as Record<string, string>,
};

type Dict = typeof ar;

const en: Dict = {
  title: 'Dollar rate',
  live: 'Live',
  connecting: 'Connecting…',
  loadError: 'Couldn’t load prices — retrying automatically',
  sellTitle: 'Sell price',
  buyTitle: 'Buy price',
  sellShort: 'Sell',
  buyShort: 'Buy',
  steady: 'Steady',
  per100Line: (iqd: string) => `$100 = ${iqd} IQD`,
  usd: 'USD',
  iqd: 'IQD',
  converter: 'Converter',
  haveUsd: 'I have dollars',
  haveIqd: 'I have dinars',
  enterAmount: 'Enter amount',
  youGet: 'You get',
  rateUsed: (rate: string, kind: 'sell' | 'buy') => `At the ${kind} price: ${rate} IQD per $1`,
  trend: 'Price movement',
  trendSince: (date: string) => `Recorded on this device since ${date}`,
  trendEmpty: 'The chart fills in as prices change while you use the app.',
  high: 'High',
  low: 'Low',
  refresh: 'Refresh now',
  share: (city: string) => `Share ${city} rate`,
  copied: 'Rate copied',
  shareText: (city: string, sell: string, buy: string, time: string) =>
    `💵 Dollar rate in ${city}\nSell: ${sell} IQD per $100\nBuy: ${buy} IQD per $100\n🕒 ${time}`,
  switchLang: 'العربية',
  source: 'Source',
  disclaimer: 'This app only shows publicly published prices, as they are, for information. It is not an offer to buy or sell or financial advice, and actual exchange-shop prices may differ.',
  cityPicker: 'Choose city',
  // Keys as used by iraqborsa.com's own "سعر الدولار في السوق" page (n = North, s = South).
  markets: { b: 'Baghdad', n: 'Erbil', s: 'Basra' },
};

const DICTS: Record<Lang, Dict> = { ar, en };

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(readStoredLang());
  readonly t = computed(() => DICTS[this.lang()]);
  readonly dir = computed(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));

  constructor() {
    effect(() => {
      const root = document.documentElement;
      root.lang = this.lang();
      root.dir = this.dir();
      try { localStorage.setItem(STORAGE_KEY, this.lang()); } catch { /* storage unavailable */ }
    });
  }

  toggle(): void {
    this.lang.update(l => (l === 'ar' ? 'en' : 'ar'));
  }

  marketLabel(key: string): string {
    return this.t().markets[key] ?? key.toUpperCase();
  }
}

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ar' || stored === 'en') return stored;
  } catch { /* storage unavailable */ }
  return DEFAULT_LANG;
}
