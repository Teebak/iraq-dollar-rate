import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, timer } from 'rxjs';
import { RatesService } from './rates.service';

interface SourceStatus {
  lastOkAt: number | null;
  lastChangeAt: number | null;
  failingSince: number | null;
}

/** Served by the Worker (worker/monitor.js), updated by the 5-minute cron. */
const STATUS_API_URL = '/api/status';
const REFRESH_MS = 5 * 60_000;
/** Show the warning once the source has been failing this long (two missed cron runs). */
const WARN_AFTER_MS = 10 * 60_000;

/** Tells the UI when prices may be stale because the price source isn't answering. */
@Injectable({ providedIn: 'root' })
export class SourceStatusService {
  private readonly http = inject(HttpClient);
  private readonly rates = inject(RatesService);
  private readonly status = signal<SourceStatus | null>(null);
  private readonly now = signal(Date.now());

  /** Minutes the source has been down, or null when there's nothing to warn about. */
  readonly downForMinutes = computed(() => {
    const failingSince = this.status()?.failingSince;
    if (failingSince && this.now() - failingSince >= WARN_AFTER_MS) return Math.round((this.now() - failingSince) / 60_000);
    return null;
  });

  /** The app's own fetches are failing while older prices are still on screen. */
  readonly showingStale = computed(() => (this.rates.error() || !!this.rates.staleSince()) && this.rates.markets().length > 0);

  constructor() {
    timer(0, REFRESH_MS).pipe(
      switchMap(() => this.http.get<SourceStatus>(STATUS_API_URL).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(),
    ).subscribe(status => {
      this.now.set(Date.now());
      if (status) this.status.set(status);
    });
  }
}
