import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, fromEvent, map, merge, of, startWith, switchMap, timer } from 'rxjs';

/**
 * Same-origin path to the rates API (iraqborsa.com sends no CORS headers, so it can't be called directly).
 * Dev: proxied by proxy.conf.json. Production: proxied by the Cloudflare Worker in worker/index.js.
 */
export const RATES_API_URL = '/borsa-api/summary.php';
export const POLL_INTERVAL_MS = 15_000;

interface RawMarket {
  sell: string; buy: string;
  psell: string; pbuy: string;
  sp: number; bp: number;  // % change vs previous
  sd: number; bd: number;  // absolute change vs previous
}

export interface Market {
  key: string;
  sell: number; buy: number;
  prevSell: number; prevBuy: number;
  sellChangePct: number; buyChangePct: number;
  sellChange: number; buyChange: number;
}

@Injectable({ providedIn: 'root' })
export class RatesService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly manualRefresh$ = new Subject<void>();

  readonly markets = signal<Market[]>([]);
  readonly lastUpdated = signal<Date | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  constructor() {
    // Poll while the page is visible; refetch immediately when it becomes visible again.
    const visible$ = fromEvent(document, 'visibilitychange').pipe(
      map(() => !document.hidden),
      startWith(!document.hidden),
    );

    merge(
      visible$.pipe(switchMap(v => (v ? timer(0, POLL_INTERVAL_MS) : EMPTY))),
      this.manualRefresh$,
    ).pipe(
      switchMap(() => {
        this.loading.set(true);
        return this.http.get<Record<string, RawMarket>>(RATES_API_URL).pipe(
          catchError(() => {
            this.error.set(true);
            return of(null);
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      this.loading.set(false);
      if (!data) return;
      this.error.set(false);
      this.markets.set(Object.entries(data).map(([key, m]) => toMarket(key, m)));
      this.lastUpdated.set(new Date());
    });
  }

  refresh(): void {
    this.manualRefresh$.next();
  }
}

function toMarket(key: string, m: RawMarket): Market {
  return {
    key,
    sell: +m.sell, buy: +m.buy,
    prevSell: +m.psell, prevBuy: +m.pbuy,
    sellChangePct: m.sp, buyChangePct: m.bp,
    sellChange: m.sd, buyChange: m.bd,
  };
}
