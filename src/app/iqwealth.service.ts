import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of, switchMap, timer } from 'rxjs';

export interface OfficialRate {
  cbi: number;
  confirmed: string | null;
}

export interface GoldKarat {
  karat: number;
  mithqal: number;
  gram: number;
  change: number | null;
}

export interface GoldSummary {
  asOf: string | null;
  karats: GoldKarat[];
  shops21: {
    gulf: { low: number; high: number } | null;
    iraqi: { low: number; high: number } | null;
    publishedAt: string | null;
  } | null;
}

/** The Worker's copies of IQWealth's open feeds (worker/iqwealth.js). Daily readings, not live. */
const REFRESH_MS = 30 * 60_000;
export const IQWEALTH_URL = 'https://iraqsm.com';

/** Central Bank official rate and gold prices, credited to IQWealth (iraqsm.com) wherever shown. */
@Injectable({ providedIn: 'root' })
export class IqwealthService {
  private readonly http = inject(HttpClient);

  readonly official = signal<OfficialRate | null>(null);
  readonly gold = signal<GoldSummary | null>(null);

  constructor() {
    timer(0, REFRESH_MS).pipe(
      switchMap(() => forkJoin({
        official: this.http.get<OfficialRate>('/api/official').pipe(catchError(() => of(null))),
        gold: this.http.get<GoldSummary | null>('/api/gold').pipe(catchError(() => of(null))),
      })),
      takeUntilDestroyed(),
    ).subscribe(({ official, gold }) => {
      if (official?.cbi) this.official.set(official);
      if (gold?.karats?.length) this.gold.set(gold);
    });
  }
}
