import { Injectable, computed, effect, signal } from '@angular/core';

export type Lang = 'ar' | 'en';

const STORAGE_KEY = 'lang';
const DEFAULT_LANG: Lang = 'ar';

const ar = {
  title: 'سعر الدولار',
  brand: 'شكد الدولار؟',
  preparingShare: 'جارٍ تجهيز الصورة…',
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
  trendSince: (date: string) => `بدأ تسجيل الأسعار في ${date}`,
  trendEmpty: 'لا توجد أسعار مسجّلة بعد لهذه المدينة.',
  trendLoading: 'جارٍ تحميل حركة السعر…',
  range: (days: number): string => (days === 1 ? '24 ساعة' : days === 7 ? 'أسبوع' : 'شهر'),
  high: 'الأعلى',
  low: 'الأدنى',
  refresh: 'تحديث الآن',
  share: (city: string) => `مشاركة سعر ${city}`,
  copied: 'تم نسخ السعر',
  shareText: (city: string, sell: string, buy: string, time: string) =>
    `💵 سعر الدولار في ${city}\nالبيع: ${sell} دينار لكل 100$\nالشراء: ${buy} دينار لكل 100$\n🕒 ${time}`,
  switchLang: 'English',
  alertBell: 'تنبيه سعر',
  alertTitle: (city: string) => `تنبيه سعر — ${city}`,
  close: 'إغلاق',
  alertOnlyTelegram: 'التنبيهات تعمل داخل تيليجرام، لأن البوت يرسلها لك كرسالة.',
  alertOpenInTelegram: 'افتح في تيليجرام',
  alertNow: 'السعر الآن:',
  alertTarget: 'نبّهني عند السعر',
  iqdPer1: 'دينار لكل 1$',
  alertCreate: 'أنشئ التنبيه',
  alertList: 'تنبيهاتك',
  alertDelete: 'حذف التنبيه',
  alertNone: 'لا توجد تنبيهات بعد.',
  alertCreated: (target: string, up: boolean) => `✓ سيرسل لك البوت رسالة عندما يصل السعر إلى ${target} ${up ? 'أو أعلى' : 'أو أقل'}.`,
  alertErrLimit: (max: number) => `لديك ${max} تنبيهات، احذف واحدًا أولًا.`,
  alertErrSame: 'هذا هو السعر الحالي، اختر سعرًا آخر.',
  alertErrDuplicate: 'لديك هذا التنبيه بالفعل.',
  alertErrInvalid: 'اكتب سعرًا بين 500 و5000 دينار لكل 1$.',
  alertErrWrite: 'اسمح للبوت بمراسلتك حتى تصلك التنبيهات.',
  alertErrNetwork: 'تعذّر الاتصال، حاول مجددًا.',
  source: 'المصدر',
  disclaimer: 'يعرض هذا التطبيق الأسعار المنشورة علنًا كما هي، للاطلاع فقط. ليس عرضًا للبيع أو الشراء ولا نصيحة مالية، وقد يختلف السعر الفعلي لدى الصرّافين.',
  cityPicker: 'اختر المدينة',
  markets: { b: 'بغداد', n: 'أربيل', s: 'البصرة' } as Record<string, string>,
};

type Dict = typeof ar;

const en: Dict = {
  title: 'Dollar rate',
  brand: 'Shkad Dollar?',
  preparingShare: 'Preparing image…',
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
  trendSince: (date: string) => `Recording started ${date}`,
  trendEmpty: 'No prices recorded for this city yet.',
  trendLoading: 'Loading price movement…',
  range: (days: number) => (days === 1 ? '24h' : days === 7 ? 'Week' : 'Month'),
  high: 'High',
  low: 'Low',
  refresh: 'Refresh now',
  share: (city: string) => `Share ${city} rate`,
  copied: 'Rate copied',
  shareText: (city: string, sell: string, buy: string, time: string) =>
    `💵 Dollar rate in ${city}\nSell: ${sell} IQD per $100\nBuy: ${buy} IQD per $100\n🕒 ${time}`,
  switchLang: 'العربية',
  alertBell: 'Price alert',
  alertTitle: (city: string) => `Price alert — ${city}`,
  close: 'Close',
  alertOnlyTelegram: 'Alerts work inside Telegram, because the bot sends them to you as a message.',
  alertOpenInTelegram: 'Open in Telegram',
  alertNow: 'Now:',
  alertTarget: 'Notify me at',
  iqdPer1: 'IQD per $1',
  alertCreate: 'Create alert',
  alertList: 'Your alerts',
  alertDelete: 'Delete alert',
  alertNone: 'No alerts yet.',
  alertCreated: (target: string, up: boolean) => `✓ The bot will message you when the price reaches ${target} ${up ? 'or higher' : 'or lower'}.`,
  alertErrLimit: (max: number) => `You have ${max} alerts. Delete one first.`,
  alertErrSame: "That's the current price. Pick another one.",
  alertErrDuplicate: 'You already have this alert.',
  alertErrInvalid: 'Enter a price between 500 and 5,000 IQD per $1.',
  alertErrWrite: 'Allow the bot to message you so alerts can reach you.',
  alertErrNetwork: "Couldn't connect. Try again.",
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
