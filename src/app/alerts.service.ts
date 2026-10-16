import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TelegramService } from './telegram.service';

export type Side = 'sell' | 'buy';

export interface PriceAlert {
  id: number;
  market: string;
  side: Side;
  direction: 'up' | 'down';
  target: number;
}

export type AlertError = 'invalid' | 'limit' | 'same' | 'duplicate' | 'network' | 'no_write_access';

/** Served by the Worker (worker/app-api.js); requests are signed with the Mini App's Telegram initData. */
const API = '/api/alerts';

/** The signed-in Telegram user's price alerts. Only usable inside Telegram. */
@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly http = inject(HttpClient);
  private readonly tg = inject(TelegramService);

  readonly available = this.tg.isInTelegram;
  readonly alerts = signal<PriceAlert[]>([]);
  readonly max = signal(5);
  private loaded = false;

  private get headers() {
    return new HttpHeaders({ Authorization: `tma ${this.tg.initData}` });
  }

  async load(force = false): Promise<void> {
    if (!this.available || (this.loaded && !force)) return;
    try {
      const res = await firstValueFrom(this.http.get<{ alerts: PriceAlert[]; max: number }>(API, { headers: this.headers }));
      this.alerts.set(res.alerts);
      this.max.set(res.max);
      this.loaded = true;
    } catch {
      /* keep what we have; the sheet shows the list as last known */
    }
  }

  async create(market: string, side: Side, target: number): Promise<{ alert?: PriceAlert; error?: AlertError }> {
    if (!(await this.tg.requestWriteAccess())) return { error: 'no_write_access' };
    try {
      const res = await firstValueFrom(this.http.post<{ alert: PriceAlert }>(API, { market, side, target }, { headers: this.headers }));
      this.alerts.update(list => [...list, res.alert]);
      return { alert: res.alert };
    } catch (err) {
      const code = err instanceof HttpErrorResponse ? err.error?.error : undefined;
      return { error: ['invalid', 'limit', 'same', 'duplicate'].includes(code) ? code : 'network' };
    }
  }

  async remove(id: number): Promise<void> {
    const before = this.alerts();
    this.alerts.update(list => list.filter(a => a.id !== id));
    try {
      await firstValueFrom(this.http.delete(`${API}/${id}`, { headers: this.headers }));
    } catch (err) {
      // Already gone on the server is fine; anything else, put it back.
      if (!(err instanceof HttpErrorResponse && err.status === 404)) this.alerts.set(before);
    }
  }
}
