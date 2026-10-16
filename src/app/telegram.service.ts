import { Injectable, NgZone, computed, inject, signal } from '@angular/core';

type HapticImpact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type HapticNotification = 'error' | 'success' | 'warning';

/**
 * Thin Angular wrapper around window.Telegram.WebApp.
 * Exposes reactive state as signals and keeps Telegram callbacks inside Angular.
 */
@Injectable({ providedIn: 'root' })
export class TelegramService {
  private readonly zone = inject(NgZone);
  readonly webApp = window.Telegram?.WebApp;

  /** True only when actually opened from a Telegram client (initData is signed by Telegram). */
  readonly isInTelegram = !!this.webApp?.initData;

  readonly user = signal(this.webApp?.initDataUnsafe?.user ?? null);
  readonly colorScheme = signal(this.webApp?.colorScheme ?? 'light');
  readonly platform = this.webApp?.platform ?? 'unknown';
  readonly version = this.webApp?.version ?? '0';
  readonly displayName = computed(() => {
    const u = this.user();
    return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : 'Guest';
  });

  private mainButtonHandler?: () => void;
  private backButtonHandler?: () => void;

  init(): void {
    const app = this.webApp;
    if (!app) return;
    app.ready();
    app.expand();
    app.onEvent('themeChanged', () => this.zone.run(() => this.colorScheme.set(app.colorScheme)));
  }

  /** Paint Telegram's own chrome to match the app's surface (Bot API 6.1+ / 7.10+). */
  setChromeColor(color: `#${string}`): void {
    const app = this.webApp;
    if (!app) return;
    if (app.isVersionAtLeast('6.1')) {
      app.setHeaderColor(color);
      app.setBackgroundColor(color);
    }
    if (app.isVersionAtLeast('7.10')) app.setBottomBarColor(color);
  }

  /** Stop vertical drags from collapsing the app, so the page scrolls freely (Bot API 7.7+). */
  disableVerticalSwipes(): void {
    if (this.webApp?.isVersionAtLeast('7.7')) this.webApp.disableVerticalSwipes();
  }

  /** Opens Telegram's chat picker with a prefilled message; falls back to the Web Share API or clipboard. */
  async share(text: string, url: string): Promise<'telegram' | 'native' | 'copied' | 'failed'> {
    if (this.isInTelegram) {
      this.webApp!.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      );
      return 'telegram';
    }
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return 'native';
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  /** Telegram's native "share to chat" sheet for a prepared message (Bot API 8.0+). */
  get canShareMessage(): boolean {
    return this.isInTelegram && !!this.webApp?.isVersionAtLeast('8.0');
  }

  shareMessage(preparedId: string): Promise<boolean> {
    return new Promise(resolve => this.webApp!.shareMessage(preparedId, sent => this.zone.run(() => resolve(sent))));
  }

  /**
   * Asks the user to let the bot message them (needed for alerts). Resolves true if granted or already allowed;
   * outside Telegram or on old clients it resolves true and lets the server report a failure later.
   */
  requestWriteAccess(): Promise<boolean> {
    const app = this.webApp;
    if (!this.isInTelegram || !app?.isVersionAtLeast('6.9')) return Promise.resolve(true);
    return new Promise(resolve => app.requestWriteAccess(granted => this.zone.run(() => resolve(granted))));
  }

  /** Raw initData string — send this to your backend and validate it with your bot token. */
  get initData(): string {
    return this.webApp?.initData ?? '';
  }

  showMainButton(text: string, onClick: () => void, colors?: { color: `#${string}`; textColor: `#${string}` }): void {
    const btn = this.webApp?.MainButton;
    if (!btn) return;
    if (this.mainButtonHandler) btn.offClick(this.mainButtonHandler);
    this.mainButtonHandler = () => this.zone.run(onClick);
    if (colors) btn.setParams({ color: colors.color, text_color: colors.textColor });
    btn.setText(text).onClick(this.mainButtonHandler).show();
  }

  hideMainButton(): void {
    const btn = this.webApp?.MainButton;
    if (!btn) return;
    if (this.mainButtonHandler) btn.offClick(this.mainButtonHandler);
    this.mainButtonHandler = undefined;
    btn.hide();
  }

  showBackButton(onClick: () => void): void {
    const btn = this.webApp?.BackButton;
    if (!btn) return;
    if (this.backButtonHandler) btn.offClick(this.backButtonHandler);
    this.backButtonHandler = () => this.zone.run(onClick);
    btn.onClick(this.backButtonHandler).show();
  }

  hideBackButton(): void {
    const btn = this.webApp?.BackButton;
    if (!btn) return;
    if (this.backButtonHandler) btn.offClick(this.backButtonHandler);
    this.backButtonHandler = undefined;
    btn.hide();
  }

  haptic(style: HapticImpact = 'light'): void {
    this.webApp?.HapticFeedback?.impactOccurred(style);
  }

  selection(): void {
    this.webApp?.HapticFeedback?.selectionChanged();
  }

  notify(type: HapticNotification): void {
    this.webApp?.HapticFeedback?.notificationOccurred(type);
  }

  /** Uses Telegram's native alert inside Telegram, falls back to window.alert in a browser. */
  alert(message: string): Promise<void> {
    return new Promise(resolve => {
      if (this.isInTelegram) this.webApp!.showAlert(message, () => resolve());
      else { window.alert(message); resolve(); }
    });
  }

  close(): void {
    this.webApp?.close();
  }
}
