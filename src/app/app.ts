import {
  Component, ElementRef, OnInit, afterNextRender, computed, effect, inject, signal, untracked, viewChild, viewChildren,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TelegramService } from './telegram.service';
import { Market, RatesService } from './rates.service';
import { I18nService } from './i18n.service';
import { HistoryService } from './history.service';
import { CITIES, City, cityFor } from './cities';
import { TickerComponent } from './ticker.component';
import { TrendChartComponent } from './trend-chart.component';
import { IconComponent } from './icon.component';

type Have = 'usd' | 'iqd';

/** Link attached to shared messages: opens this Mini App in Telegram. */
const SHARE_URL = 'https://t.me/ShkadDollarBot/rates';
const CHROME_COLOR = '#0b0f14';
const DEFAULT_TINT = CITIES[0].tint;

interface CityCard { market: Market; city: City }

@Component({
  selector: 'app-root',
  imports: [DecimalPipe, DatePipe, TickerComponent, TrendChartComponent, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '[style.--tint]': 'tint()' },
})
export class App implements OnInit {
  protected readonly tg = inject(TelegramService);
  protected readonly rates = inject(RatesService);
  protected readonly i18n = inject(I18nService);
  private readonly historySvc = inject(HistoryService);

  protected readonly cities = CITIES;
  protected readonly cards = computed<CityCard[]>(() =>
    this.rates.markets().map(market => ({ market, city: cityFor(market.key) })),
  );

  protected readonly activeIndex = signal(0);
  protected readonly active = computed(() => this.cards()[this.activeIndex()] ?? null);
  protected readonly activeKey = computed(() => this.active()?.city.key ?? null);
  protected readonly tint = computed(() => this.active()?.city.tint ?? DEFAULT_TINT);
  protected readonly activeName = computed(() => {
    const a = this.active();
    return a ? this.i18n.marketLabel(a.market.key) : '';
  });

  /** Per-card offset from the rail's centre (-1…1), drives the photo parallax. */
  protected readonly offsets = signal<number[]>([]);

  protected readonly have = signal<Have>('usd');
  /** Exactly what the user typed (sanitised); formatted with separators only while the field isn't focused. */
  protected readonly amountText = signal('100');
  protected readonly amountFocused = signal(false);
  protected readonly amount = computed(() => Number(this.amountText()) || 0);
  protected readonly amountDisplay = computed(() =>
    this.amountFocused() ? this.amountText() : formatAmount(this.amountText()),
  );
  protected readonly converted = computed(() => {
    const m = this.active()?.market;
    if (!m) return null;
    const a = this.amount() || 0;
    // The market buys your dollars at `buy` and sells you dollars at `sell`.
    return this.have() === 'usd' ? a * m.buy : a / m.sell;
  });

  protected readonly trendPoints = computed(() => {
    const key = this.active()?.market.key;
    return key ? (this.historySvc.history()[key] ?? []) : [];
  });
  /** Today's date in the UI language; re-evaluated on every poll so it rolls over at midnight. */
  protected readonly today = computed(() => {
    const now = this.rates.lastUpdated() ?? new Date();
    const locale = this.i18n.lang() === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB';
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  });

  protected readonly trendSince = computed(() => {
    const first = this.trendPoints()[0];
    if (!first) return '';
    const locale = this.i18n.lang() === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(first.t);
  });

  protected readonly toast = signal<string | null>(null);
  protected readonly tickKey = signal(0);

  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');
  private readonly cardEls = viewChildren<ElementRef<HTMLElement>>('card');
  private scrollFrame = 0;
  private toastTimer = 0;
  private lastSnapshot = '';

  constructor() {
    // Pulse the price panels when any price moves.
    effect(() => {
      const snapshot = JSON.stringify(this.rates.markets().map(m => [m.sell, m.buy]));
      if (this.lastSnapshot && snapshot !== this.lastSnapshot) {
        this.tickKey.update(k => k + 1);
        this.tg.notify('warning');
      }
      this.lastSnapshot = snapshot;
    });

    // Flipping LTR/RTL reverses the rail; keep the same city centred instead of whatever lands there.
    effect(() => {
      this.i18n.dir();
      const index = untracked(this.activeIndex);
      requestAnimationFrame(() =>
        this.cardEls()[index]?.nativeElement.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' }),
      );
    });

    // Recompute parallax once cards exist.
    effect(() => {
      if (this.cardEls().length) requestAnimationFrame(() => this.measure());
    });

    afterNextRender(() => window.addEventListener('resize', () => this.measure(), { passive: true }));
  }

  ngOnInit(): void {
    this.tg.init();
    this.tg.setChromeColor(CHROME_COLOR);
    this.tg.disableVerticalSwipes();
  }

  protected onRailScroll(): void {
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => this.measure());
  }

  /** Works for LTR and RTL alike: the active card is whichever sits nearest the rail's centre. */
  private measure(): void {
    const rail = this.rail()?.nativeElement;
    if (!rail) return;
    const r = rail.getBoundingClientRect();
    const centre = r.left + r.width / 2;
    const offsets = this.cardEls().map(({ nativeElement: el }) => {
      const c = el.getBoundingClientRect();
      return Math.max(-1, Math.min(1, (c.left + c.width / 2 - centre) / r.width));
    });
    this.offsets.set(offsets);

    let nearest = 0;
    offsets.forEach((o, i) => { if (Math.abs(o) < Math.abs(offsets[nearest])) nearest = i; });
    if (nearest !== this.activeIndex()) {
      this.activeIndex.set(nearest);
      this.tg.selection();
    }
  }

  protected goTo(index: number): void {
    this.cardEls()[index]?.nativeElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  protected refresh(): void {
    this.tg.haptic('light');
    this.rates.refresh();
  }

  protected toggleLang(): void {
    this.i18n.toggle();
    this.tg.haptic('light');
  }

  protected setHave(have: Have): void {
    if (have === this.have()) return;
    this.have.set(have);
    this.amountText.set(have === 'usd' ? '100' : '100000');
    this.tg.selection();
  }

  protected onAmount(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = sanitizeAmount(input.value);
    if (clean !== input.value) input.value = clean;
    this.amountText.set(clean);
  }

  protected onAmountFocus(event: FocusEvent): void {
    this.amountFocused.set(true);
    // Select everything so the first keystroke replaces the old amount.
    const input = event.target as HTMLInputElement;
    requestAnimationFrame(() => input.select());
  }

  protected async share(): Promise<void> {
    const a = this.active();
    if (!a) return;
    const fmt = (n: number) => Math.round(n * 100).toLocaleString('en-US');
    const time = this.rates.lastUpdated()?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) ?? '';
    const t = this.i18n.t();
    this.tg.haptic('medium');
    const result = await this.tg.share(t.shareText(this.activeName(), fmt(a.market.sell), fmt(a.market.buy), time), SHARE_URL);
    if (result === 'copied') this.showToast(t.copied);
  }

  private showToast(message: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(message);
    this.toastTimer = window.setTimeout(() => this.toast.set(null), 2200);
  }

  protected changeIcon(delta: number): 'up' | 'down' | 'flat' {
    return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  }
}

const ARABIC_DIGITS = /[\u0660-\u0669\u06f0-\u06f9]/g;
const MAX_INT_DIGITS = 12;

/**
 * Accepts what people actually type: Arabic-Indic (٠١٢) and Persian (۰۱۲) digits, the Arabic decimal
 * mark (٫), and thousands separators, and reduces it to a plain decimal string with up to 2 decimals.
 */
function sanitizeAmount(raw: string): string {
  const western = raw
    .replace(ARABIC_DIGITS, d => String(d.charCodeAt(0) & 0xf))
    .replace(/[٫,]/g, m => (m === '٫' ? '.' : ''))
    .replace(/[^\d.]/g, '');
  const [int = '', ...rest] = western.split('.');
  const intPart = int.replace(/^0+(?=\d)/, '').slice(0, MAX_INT_DIGITS);
  return rest.length ? `${intPart || '0'}.${rest.join('').slice(0, 2)}` : intPart;
}

function formatAmount(text: string): string {
  if (!text) return '';
  return Number(text).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
