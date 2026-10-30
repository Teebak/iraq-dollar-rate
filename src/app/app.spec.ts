import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { RATES_API_URL } from './rates.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  it('shows per-$1 prices, with a change chip only when the price moved', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await new Promise(r => setTimeout(r)); // first poll fires on timer(0)
    TestBed.inject(HttpTestingController).expectOne(RATES_API_URL).flush({
      b: { sell: '1672.5', buy: '1662.5', psell: '1670', pbuy: '1660', sp: 0.15, bp: 0.15, sd: 2.5, bd: 2.5 }
    });
    await fixture.whenStable();
    const values = [...fixture.nativeElement.querySelectorAll('.quote-value')].map((e: Element) => e.textContent?.trim());
    expect(values).toEqual(['1,672.5', '1,662.5']);
    expect(fixture.nativeElement.querySelectorAll('.delta').length).toBe(2);
  });
});
