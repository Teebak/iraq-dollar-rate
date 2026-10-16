// Cloudflare Worker for the Mini App and @ShkadDollarBot.
// Static files (the Angular build) are served by Workers Static Assets before this code runs;
// only requests that don't match a file reach fetch() below.
//
// /borsa-api/summary.php  proxies iraqborsa.com from the app's own origin (the API sends no CORS headers).
// /api/alerts            the signed-in user's price alerts (Mini App; auth by Telegram initData), see app-api.js.
// /api/history           shared price history for the app's chart (recorded by the cron, stored in D1).
// /telegram/webhook       receives bot updates (set up with scripts/setup-bot.mjs). Needs the BOT_TOKEN secret.
// scheduled()             checks price alerts every 5 minutes and sends the 10:00 daily summary (see wrangler.jsonc).

import { webhookSecret } from './telegram-secret.js';
import { fetchUpstream, getRates } from './rates.js';
import { RANGE_DAYS, getHistory, recordHistory } from './history.js';
import { checkAlerts, handleUpdate, sendDailySummary } from './bot.js';
import { alertsApi } from './app-api.js';

const DAILY_CRON = '0 7 * * *';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/borsa-api/summary.php') return proxyRates(request);
    if (pathname === '/api/history') return historyApi(request, env);
    if (pathname === '/api/alerts' || pathname.startsWith('/api/alerts/')) return alertsApi(request, env, pathname);
    if (pathname === '/telegram/webhook') return handleTelegram(request, env, ctx);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(event.cron, env).catch(err => console.error(`cron ${event.cron} failed:`, err.message)));
  },
};

async function runCron(cron, env) {
  if (cron === DAILY_CRON) {
    if (env.BOT_TOKEN) await sendDailySummary(env);
    return;
  }
  // Every 5 minutes: record history (also without a bot), then fire any price alerts.
  const rates = await getRates();
  await recordHistory(env, rates);
  if (env.BOT_TOKEN) await checkAlerts(env, rates);
}

// ── Rates proxy ──────────────────────────────────────────────

async function proxyRates(request) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  }
  try {
    const upstream = await fetchUpstream();
    if (!upstream.ok) return json({ error: `upstream returned ${upstream.status}` }, 502);
    return new Response(upstream.body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch {
    return json({ error: 'upstream unreachable' }, 502);
  }
}

// ── History API ──────────────────────────────────────────────

/** GET /api/history?market=b&days=7 → { market, days, from, since, points: [{ t, sell, buy }] } */
async function historyApi(request, env) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  const params = new URL(request.url).searchParams;
  const market = params.get('market') ?? 'b';
  const days = Number(params.get('days') ?? 1);
  if (!['b', 'n', 's'].includes(market) || !RANGE_DAYS.includes(days)) {
    return json({ error: 'market must be b, n or s; days must be ' + RANGE_DAYS.join(', ') }, 400);
  }
  const body = await getHistory(env, market, days);
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
  });
}

// ── Telegram webhook ─────────────────────────────────────────

async function handleTelegram(request, env, ctx) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.BOT_TOKEN) return new Response('Bot not configured', { status: 503 });
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== (await webhookSecret(env.BOT_TOKEN))) {
    return new Response('Forbidden', { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Handle each update once, even if Telegram delivers it again.
  const { meta } = await env.DB.prepare('INSERT OR IGNORE INTO processed_updates (update_id, created_at) VALUES (?, ?)')
    .bind(update.update_id, Date.now()).run();
  if (!meta.changes) {
    console.log('duplicate update ignored', update.update_id);
    return new Response('ok');
  }
  if (update.message?.text && (await isRepeat(env, update.message.chat.id, update.message.text))) {
    console.log('repeated message ignored', update.update_id, update.message.text);
    return new Response('ok');
  }
  console.log('update', update.update_id, update.message?.text ?? update.callback_query?.data ?? '');

  // Answer Telegram right away; replies are sent through the Bot API in the background.
  ctx.waitUntil(handleUpdate(update, env).catch(err => console.error('update failed:', err.message)));
  return new Response('ok');
}

const REPEAT_WINDOW_MS = 3000;

/**
 * True when this chat sent the same text less than REPEAT_WINDOW_MS ago. One conditional upsert, so two
 * copies arriving at the same moment can't both pass: D1 applies writes one at a time.
 */
async function isRepeat(env, chatId, text) {
  const { meta } = await env.DB.prepare(
    `INSERT INTO chat_last_message (chat_id, text, at) VALUES (?1, ?2, ?3)
     ON CONFLICT (chat_id) DO UPDATE SET text = excluded.text, at = excluded.at
     WHERE NOT (chat_last_message.text = excluded.text AND excluded.at - chat_last_message.at < ?4)`,
  ).bind(chatId, text, Date.now(), REPEAT_WINDOW_MS).run();
  return meta.changes === 0;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
