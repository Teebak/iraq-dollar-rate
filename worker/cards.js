// Rate-card images: the Mini App draws the card (browsers shape Arabic correctly and it costs the Worker no CPU),
// uploads the JPEG here, and gets back a Telegram "prepared message" id to open the native share sheet with.

import { CITIES, fmt, getRates } from './rates.js';
import { tg } from './telegram.js';

const MAX_BYTES = 1_500_000;
const KEEP_MS = 7 * 86_400_000;
const MINI_APP_LINK = 'https://t.me/ShkadDollarBot/rates';

/** POST /api/cards?market=b with a JPEG body, for an authenticated user. */
export async function createCard(request, env, userId) {
  const market = new URL(request.url).searchParams.get('market') ?? 'b';
  const city = CITIES.find(([key]) => key === market);
  if (!city) return json({ error: 'invalid' }, 400);

  const image = new Uint8Array(await request.arrayBuffer());
  // JPEG files start with FF D8 FF.
  if (image.length < 1000 || image.length > MAX_BYTES || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
    return json({ error: 'invalid_image' }, 400);
  }

  const id = crypto.randomUUID().replaceAll('-', '');
  await env.DB.prepare('INSERT INTO share_cards (id, image, created_at) VALUES (?, ?, ?)').bind(id, image, Date.now()).run();
  const url = `${new URL(env.APP_URL).origin}/cards/${id}.jpg`;

  // The caption is built here from live rates, never taken from the client.
  let caption = `💵 سعر الدولار في ${city[1]}`;
  try {
    const r = (await getRates())[market];
    if (r) caption += `\nبيع ${fmt(r.sell)} · شراء ${fmt(r.buy)} (لكل 1$)`;
  } catch { /* image alone is fine */ }

  let prepared;
  try {
    prepared = await tg(env, 'savePreparedInlineMessage', {
    user_id: userId,
    result: {
      type: 'photo',
      id: id.slice(0, 32),
      photo_url: url,
      thumbnail_url: url,
      caption,
      reply_markup: { inline_keyboard: [[{ text: 'افتح الأسعار 💵', url: MINI_APP_LINK }]] },
    },
    allow_user_chats: true,
    allow_group_chats: true,
    allow_channel_chats: true,
    });
  } catch (err) {
    console.error('savePreparedInlineMessage failed:', err.message);
    // The image is still usable (e.g. for the device's own share sheet).
    return json({ error: 'telegram', url }, 502);
  }
  return json({ preparedId: prepared.id, url }, 201);
}

/**
 * GET/HEAD /cards/<id>.jpg. Supports Range requests: Telegram's phone apps fetch photos from a URL in chunks
 * ("bytes=N-M"), and answering every chunk with the whole file leaves the picture half gray.
 */
export async function serveCard(request, env, id) {
  const row = await env.DB.prepare('SELECT image FROM share_cards WHERE id = ?').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  const bytes = new Uint8Array(row.image);
  const size = bytes.length;
  const headers = {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'public, max-age=604800, immutable',
    'Accept-Ranges': 'bytes',
    ETag: `"${id}"`,
  };

  const range = parseRange(request.headers.get('Range'), size);
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }
  const body = request.method === 'HEAD' ? null : range ? bytes.subarray(range.start, range.end + 1) : bytes;
  if (range) {
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(range.end - range.start + 1) },
    });
  }
  return new Response(body, { headers: { ...headers, 'Content-Length': String(size) } });
}

/** Parses a single "bytes=start-end" / "bytes=start-" / "bytes=-suffix" range; null if absent. */
function parseRange(header, size) {
  if (!header) return null;
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start;
  let end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? 'invalid' : { start, end };
}

export function pruneCards(env, now = Date.now()) {
  return env.DB.prepare('DELETE FROM share_cards WHERE created_at < ?').bind(now - KEEP_MS).run();
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
