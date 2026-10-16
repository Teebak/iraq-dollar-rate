/**
 * Draws the shareable rate card on a canvas. Done on the device because browsers shape Arabic correctly
 * and it keeps image work off the Worker. 1080×1080 JPEG, in the app's look: city photo, ink fade, tint accents.
 */
export interface RateCard {
  dir: 'rtl' | 'ltr';
  title: string;
  date: string;
  cityName: string;
  photoUrl: string;
  tint: string;
  sell: { label: string; price: string; per100: string };
  buy: { label: string; price: string; per100: string };
  footerStart: string;
  footerEnd: string;
}

const SIZE = 1080;
const PAD = 72;
const FONT = '"Readex Pro", sans-serif';

export async function drawRateCard(card: RateCard): Promise<Blob> {
  await Promise.all(['400', '600', '700'].map(w => document.fonts.load(`${w} 60px "Readex Pro"`)));
  const photo = await loadImage(card.photoUrl);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Photo, cover-fitted, under an ink fade that keeps the text readable.
  const scale = Math.max(SIZE / photo.width, SIZE / photo.height);
  const w = photo.width * scale;
  const h = photo.height * scale;
  ctx.drawImage(photo, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  const fade = ctx.createLinearGradient(0, 0, 0, SIZE);
  fade.addColorStop(0, 'rgba(11,15,20,0.55)');
  fade.addColorStop(0.32, 'rgba(11,15,20,0.25)');
  fade.addColorStop(0.5, 'rgba(11,15,20,0.85)');
  fade.addColorStop(1, 'rgba(11,15,20,0.97)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const rtl = card.dir === 'rtl';
  const start = rtl ? SIZE - PAD : PAD;
  const end = rtl ? PAD : SIZE - PAD;
  const startAlign: CanvasTextAlign = rtl ? 'right' : 'left';
  const endAlign: CanvasTextAlign = rtl ? 'left' : 'right';
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign, dir = card.dir) => {
    ctx.direction = dir;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };

  // Header: app name and date.
  text(card.title, start, PAD + 40, `600 46px ${FONT}`, '#ffffff', startAlign);
  text(card.date, end, PAD + 36, `400 32px ${FONT}`, 'rgba(255,255,255,0.75)', endAlign);

  // City name.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 4;
  text(card.cityName, start, 560, `700 120px ${FONT}`, '#ffffff', startAlign);
  ctx.shadowColor = 'transparent';

  // Sell | buy columns, sell on the reading-start side.
  const colWidth = (SIZE - PAD * 2 - 60) / 2;
  const columns = [card.sell, card.buy];
  columns.forEach((col, i) => {
    const x = rtl ? SIZE - PAD - i * (colWidth + 60) : PAD + i * (colWidth + 60);
    text(col.label, x, 680, `600 44px ${FONT}`, card.tint, startAlign);
    // Digits always left-to-right, aligned to the column's reading start.
    text(col.price, x, 810, `700 128px ${FONT}`, '#ffffff', startAlign, 'ltr');
    text(col.per100, x, 880, `400 34px ${FONT}`, 'rgba(255,255,255,0.75)', startAlign);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(SIZE / 2 - 1, 640, 2, 260);

  // Footer.
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(PAD, 950, SIZE - PAD * 2, 2);
  text(card.footerStart, start, 1012, `600 34px ${FONT}`, card.tint, startAlign, 'ltr');
  text(card.footerEnd, end, 1012, `400 30px ${FONT}`, 'rgba(255,255,255,0.65)', endAlign);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.88),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}
