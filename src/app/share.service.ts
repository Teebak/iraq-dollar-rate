import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TelegramService } from './telegram.service';
import { RateCard, drawRateCard } from './rate-card';

export type ImageShareResult = 'telegram' | 'native' | 'unavailable';

/** Shares a drawn rate card: Telegram's share sheet in the Mini App, the device's share sheet elsewhere. */
@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly http = inject(HttpClient);
  private readonly tg = inject(TelegramService);

  async shareImage(market: string, card: RateCard, text: string): Promise<ImageShareResult> {
    const blob = await drawRateCard(card);

    if (this.tg.canShareMessage) {
      const res = await firstValueFrom(this.http.post<{ preparedId?: string }>(`/api/cards?market=${market}`, blob, {
        headers: new HttpHeaders({ Authorization: `tma ${this.tg.initData}`, 'Content-Type': 'image/jpeg' }),
      }));
      if (res.preparedId) {
        await this.tg.shareMessage(res.preparedId);
        return 'telegram'; // closing the sheet without sending is still a handled share
      }
    }

    const file = new File([blob], 'shkad-dollar.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') throw err;
      }
      return 'native';
    }
    return 'unavailable';
  }
}
