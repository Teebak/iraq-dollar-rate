import { Injectable, effect, inject, signal } from '@angular/core';
import { RatesService } from './rates.service';

export interface PricePoint {
  /** Epoch ms when this app observed the price. */
  t: number;
  sell: number;
  buy: number;
}

type History = Record<string, PricePoint[]>;

const STORAGE_KEY = 'rates-history-v1';
const MAX_POINTS = 120;
/** Re-record an unchanged price after this long so the chart's time axis keeps moving. */
const HEARTBEAT_MS = 30 * 60_000;

/**
 * The API has no history endpoint, so this records what the app itself observes,
 * on this device only. It is a personal log, not an official price history.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly rates = inject(RatesService);
  readonly history = signal<History>(load());

  constructor() {
    effect(() => {
      const markets = this.rates.markets();
      const at = this.rates.lastUpdated()?.getTime();
      if (!markets.length || !at) return;

      const next: History = { ...this.history() };
      let changed = false;
      for (const m of markets) {
        const points = next[m.key] ?? [];
        const last = points.at(-1);
        const moved = !last || last.sell !== m.sell || last.buy !== m.buy;
        if (moved || at - last.t >= HEARTBEAT_MS) {
          next[m.key] = [...points, { t: at, sell: m.sell, buy: m.buy }].slice(-MAX_POINTS);
          changed = true;
        }
      }
      if (!changed) return;
      this.history.set(next);
      save(next);
    });
  }

  pointsFor(key: string): PricePoint[] {
    return this.history()[key] ?? [];
  }
}

function load(): History {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as History) : {};
  } catch {
    return {};
  }
}

function save(history: History): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch { /* storage unavailable */ }
}
