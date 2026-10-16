import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { AlertError, AlertsService, Side } from './alerts.service';
import { RatesService } from './rates.service';
import { I18nService } from './i18n.service';
import { TelegramService } from './telegram.service';
import { IconComponent } from './icon.component';

const STEPS = [10, 5, -5, -10];

/** Bottom sheet for creating and managing price alerts for one city. */
@Component({
  selector: 'app-alert-sheet',
  imports: [DecimalPipe, IconComponent],
  templateUrl: './alert-sheet.component.html',
  styleUrl: './alert-sheet.component.scss',
  host: { '(document:keydown.escape)': 'close.emit()' },
})
export class AlertSheetComponent {
  protected readonly alertsSvc = inject(AlertsService);
  protected readonly i18n = inject(I18nService);
  private readonly rates = inject(RatesService);
  private readonly tg = inject(TelegramService);

  readonly market = input.required<string>();
  readonly close = output<void>();

  protected readonly steps = STEPS;
  protected readonly side = signal<Side>('sell');
  protected readonly targetText = signal('');
  protected readonly busy = signal(false);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  protected readonly current = computed(() => this.rates.markets().find(m => m.key === this.market())?.[this.side()] ?? null);
  protected readonly cityName = computed(() => this.i18n.marketLabel(this.market()));

  constructor() {
    void this.alertsSvc.load(true);
    // Start each side at a sensible target just above the current price.
    effect(() => {
      const now = this.current();
      if (now != null) this.targetText.set(String(now + 5));
    });
  }

  protected setSide(side: Side): void {
    this.side.set(side);
    this.message.set(null);
    this.tg.selection();
  }

  protected nudge(step: number): void {
    const now = this.current();
    if (now == null) return;
    this.targetText.set(String(now + step));
    this.message.set(null);
    this.tg.selection();
  }

  protected onTarget(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value
      .replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf))
      .replace(/٫/g, '.')
      .replace(/[^\d.]/g, '');
    if (clean !== input.value) input.value = clean;
    this.targetText.set(clean);
    this.message.set(null);
  }

  protected async create(): Promise<void> {
    const target = Number(this.targetText());
    if (!target || this.busy()) return;
    this.busy.set(true);
    const { alert, error } = await this.alertsSvc.create(this.market(), this.side(), target);
    this.busy.set(false);
    const t = this.i18n.t();
    if (alert) {
      this.tg.notify('success');
      this.message.set({ kind: 'ok', text: t.alertCreated(this.fmt(alert.target), alert.direction === 'up') });
    } else {
      this.tg.notify('error');
      this.message.set({ kind: 'error', text: this.errorText(error!) });
    }
  }

  protected remove(id: number): void {
    this.tg.haptic('light');
    void this.alertsSvc.remove(id);
  }

  protected sideLabel(side: Side): string {
    const t = this.i18n.t();
    return side === 'sell' ? t.sellShort : t.buyShort;
  }

  private errorText(error: AlertError): string {
    const t = this.i18n.t();
    switch (error) {
      case 'limit': return t.alertErrLimit(this.alertsSvc.max());
      case 'same': return t.alertErrSame;
      case 'duplicate': return t.alertErrDuplicate;
      case 'invalid': return t.alertErrInvalid;
      case 'no_write_access': return t.alertErrWrite;
      default: return t.alertErrNetwork;
    }
  }

  private fmt(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}
