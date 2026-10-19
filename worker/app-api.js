// Mini App API for the signed-in Telegram user. Requests carry the Mini App's initData as
// "Authorization: tma <initData>"; its HMAC is checked against the bot token, so only Telegram can mint it.
//
//   GET    /api/alerts        → { alerts: [...], max }
//   POST   /api/alerts        { market, side, target } → 201 { alert, current } | 4xx { error, current? }
//   DELETE /api/alerts/<id>   → 204 | 404
//   POST   /api/cards?market= JPEG body → 201 { preparedId, url }   (see cards.js)

import { MAX_ALERTS, addAlert, deleteAlert, listAlerts } from './alerts.js';
import { storedRates } from './history.js';
import { createCard } from './cards.js';

const MAX_AUTH_AGE_S = 24 * 60 * 60;

export async function appApi(request, env, pathname) {
  if (!env.BOT_TOKEN) return json({ error: 'not_configured' }, 503);
  const user = await authenticate(request, env.BOT_TOKEN);
  if (!user) return json({ error: 'unauthorized' }, 401);
  // A user's private chat with the bot has the same id as the user.
  const chatId = user.id;

  if (pathname === '/api/cards' && request.method === 'POST') return createCard(request, env, user.id);

  if (pathname === '/api/alerts' && request.method === 'GET') {
    return json({ alerts: await listAlerts(env, chatId), max: MAX_ALERTS });
  }

  if (pathname === '/api/alerts' && request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid' }, 400);
    }
    let rates;
    try {
      ({ rates } = await storedRates(env));
    } catch {
      return json({ error: 'rates_unavailable' }, 503);
    }
    const result = await addAlert(env, chatId, body, rates);
    if (result.ok) return json({ alert: result.alert, current: result.current }, 201);
    return json({ error: result.error, current: result.current }, result.error === 'limit' ? 409 : 400);
  }

  const match = pathname.match(/^\/api\/alerts\/(\d+)$/);
  if (match && request.method === 'DELETE') {
    return (await deleteAlert(env, chatId, match[1])) ? new Response(null, { status: 204 }) : json({ error: 'not_found' }, 404);
  }

  return json({ error: 'not_found' }, 404);
}

/** Returns the Telegram user from valid, fresh initData, or null. */
async function authenticate(request, botToken) {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('tma ')) return null;
  const params = new URLSearchParams(header.slice(4));
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const expected = toHex(await hmac(secret, dataCheckString));
  if (!timingSafeEqual(expected, hash)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_S) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    return user && Number.isInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

const toHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
