import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, of, switchMap, timer } from 'rxjs';

export interface MarketStats {
  market: string;
  current: { sell: number; buy: number; at: number } | null;
  today: { high: number; low: number } | null;
  change24h: number | null;
  avg7: number | null;
  vsAvg7Pct: number | null;
  biggestMove: { delta: number; at: number } | null;
}

/** Served by the Worker from recorded history (worker/history.js → getStats). */
const STATS_API_URL = '/api/stats';
const REFRESH_MS = 5 * 60_000;

/** Today's range, change since yesterday, 7-day average and the week's biggest move, for the city on screen. */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);

  readonly market = signal('b');
  readonly stats = signal<MarketStats | null>(null);

  constructor() {
    combineLatest([toObservable(this.market), timer(0, REFRESH_MS)]).pipe(
      switchMap(([market]) =>
        this.http.get<MarketStats>(STATS_API_URL, { params: { market } }).pipe(catchError(() => of(null))),
      ),
      takeUntilDestroyed(),
    ).subscribe(stats => {
      if (stats) this.stats.set(stats);
    });
  }
}
