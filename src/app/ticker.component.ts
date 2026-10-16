import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';

const DURATION_MS = 700;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Displays a number and rolls smoothly to each new value. */
@Component({
  selector: 'app-ticker',
  imports: [DecimalPipe],
  template: `{{ display() | number: format() }}`,
  host: { dir: 'ltr', '[class.rolling]': 'rolling()' },
})
export class TickerComponent {
  readonly value = input.required<number>();
  readonly format = input('1.0-0');

  protected readonly display = signal(0);
  protected readonly rolling = signal(false);
  private frame = 0;
  private initialized = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));

    effect(() => {
      const to = this.value();
      untracked(() => {
        if (!this.initialized || reducedMotion()) {
          this.initialized = true;
          this.display.set(to);
          return;
        }
        this.roll(this.display(), to);
      });
    });
  }

  private roll(from: number, to: number): void {
    cancelAnimationFrame(this.frame);
    if (from === to) return;
    const start = performance.now();
    this.rolling.set(true);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - p, 4); // ease-out-quart
      this.display.set(from + (to - from) * eased);
      if (p < 1) this.frame = requestAnimationFrame(step);
      else this.rolling.set(false);
    };
    this.frame = requestAnimationFrame(step);
  }
}
