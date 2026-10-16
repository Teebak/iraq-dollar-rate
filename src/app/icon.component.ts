import { Component, input } from '@angular/core';

export type IconName = 'refresh' | 'share' | 'languages' | 'up' | 'down' | 'flat' | 'edit';

/** Stroke icons (Lucide geometry, 24px grid, 2px stroke). */
@Component({
  selector: 'app-icon',
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name()) {
        @case ('refresh') {
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        }
        @case ('share') {
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.59 13.51 6.83 3.98" />
          <path d="m15.41 6.51-6.82 3.98" />
        }
        @case ('languages') {
          <path d="m5 8 6 6" />
          <path d="m4 14 6-6 2-3" />
          <path d="M2 5h12" />
          <path d="M7 2h1" />
          <path d="m22 22-5-10-5 10" />
          <path d="M14 18h6" />
        }
        @case ('up') {
          <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
          <path d="M16 7h6v6" />
        }
        @case ('down') {
          <path d="M22 17 13.5 8.5 8.5 13.5 2 7" />
          <path d="M16 17h6v-6" />
        }
        @case ('flat') {
          <path d="M5 12h14" />
        }
        @case ('edit') {
          <path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />
          <path d="m15 5 4 4" />
        }
      }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; width: 1.25em; height: 1.25em; flex: none; }
    svg { width: 100%; height: 100%; }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
}
