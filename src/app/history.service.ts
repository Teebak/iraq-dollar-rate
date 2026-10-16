import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, of, switchMap, timer } from 'rxjs';

export interface PricePoint {
  /** Epoch ms when the price was recorded. */
  t: number;
  sell: number;
  buy: number;
}

export type RangeDays = 1 | 7 | 30;

export interface History {
  market: string;
  days: RangeDays;
  /** Start of the requested window (epoch ms). */
  from: number;
  /** When recording began for this market, or null if nothing is recorded yet. */
  since: number | null;
  points: PricePoint[];
}

/** Served by the Cloudflare Worker (worker/history.js); proxied to the live Worker in dev by proxy.conf.json. */
export const HISTORY_API_URL = '/api/history';
const REFRESH_MS = 5 * 60_000;

/**
 * Shared price history, recorded every 5 minutes on the server for everyone.
 * Follows the selected market and range, and refreshes as new points are recorded.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);

  readonly market = signal('b');
  readonly range = signal<RangeDays>(1);
  readonly history = signal<History | null>(null);

  constructor() {
    combineLatest([toObservable(this.market), toObservable(this.range), timer(0, REFRESH_MS)]).pipe(
      switchMap(([market, days]) =>
        this.http.get<History>(HISTORY_API_URL, { params: { market, days } }).pipe(catchError(() => of(null))),
      ),
      takeUntilDestroyed(),
    ).subscribe(history => {
      if (history) this.history.set(history);
    });
  }
}
