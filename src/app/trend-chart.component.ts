import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PricePoint } from './history.service';

const W = 320;
const H = 132;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

/**
 * Step chart of observed sell/buy prices (per $100). Prices move in discrete steps,
 * so a step line is the honest shape; the last value extends to "now".
 */
@Component({
  selector: 'app-trend-chart',
  imports: [DecimalPipe],
  template: `
    @if (geometry(); as g) {
      <p class="scale">{{ highLabel() }} <b dir="ltr">{{ g.max * 100 | number: '1.0-0' }}</b></p>
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" dir="ltr" role="img"
           [attr.aria-label]="ariaLabel()">
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.28" />
            <stop offset="1" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line class="grid" x1="0" [attr.x2]="width" [attr.y1]="padTop" [attr.y2]="padTop" />
        <line class="grid" x1="0" [attr.x2]="width" [attr.y1]="height - padBottom" [attr.y2]="height - padBottom" />
        <path class="area" [attr.d]="g.sellArea" fill="url(#trend-fill)" />
        <path class="line buy" [attr.d]="g.buy" />
        <path class="line sell" [attr.d]="g.sell" />
        <circle class="dot" [attr.cx]="width" [attr.cy]="g.lastSellY" r="3.5" />
      </svg>
      <p class="scale low">{{ lowLabel() }} <b dir="ltr">{{ g.min * 100 | number: '1.0-0' }}</b></p>
    }
  `,
  styleUrl: './trend-chart.component.scss',
})
export class TrendChartComponent {
  readonly points = input.required<PricePoint[]>();
  /** Left edge of the time axis (epoch ms); defaults to the first point. */
  readonly from = input<number | null>(null);
  readonly highLabel = input('High');
  readonly lowLabel = input('Low');
  readonly ariaLabel = input('');

  protected readonly width = W;
  protected readonly height = H;
  protected readonly padTop = PAD_TOP;
  protected readonly padBottom = PAD_BOTTOM;

  protected readonly geometry = computed(() => {
    const pts = this.points();
    if (!pts.length) return null;

    const t0 = this.from() ?? pts[0].t;
    const t1 = Math.max(Date.now(), pts.at(-1)!.t + 1, t0 + 1);
    const values = pts.flatMap(p => [p.sell, p.buy]);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }

    // Clamped: the first point may sit before the window (it's the price going into it).
    const x = (t: number) => Math.max(0, ((t - t0) / (t1 - t0)) * W);
    const y = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);

    const step = (pick: (p: PricePoint) => number) => {
      let d = `M${x(pts[0].t).toFixed(1)} ${y(pick(pts[0])).toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` H${x(pts[i].t).toFixed(1)} V${y(pick(pts[i])).toFixed(1)}`;
      }
      return `${d} H${W}`;
    };

    const sell = step(p => p.sell);
    return {
      sell,
      buy: step(p => p.buy),
      sellArea: `${sell} V${H} H${x(pts[0].t).toFixed(1)} Z`,
      lastSellY: y(pts.at(-1)!.sell),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
}
