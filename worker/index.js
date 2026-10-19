// Cloudflare Worker for the Mini App and @ShkadDollarBot.
// Static files (the Angular build) are served by Workers Static Assets before this code runs;
// only requests that don't match a file reach fetch() below.
//
// /borsa-api/summary.php  the app's rates: the cron's saved copy of iraqborsa.com's response (only the cron calls the source).
// /api/cards, /cards/*   rate-card images drawn by the app and shared via Telegram, see cards.js.
// /api/alerts            the signed-in user's price alerts (Mini App; auth by Telegram initData), see app-api.js.
// /api/status            price-source health for the app's stale-data warning (see monitor.js).
// /api/history           shared price history for the app's chart (recorded by the cron, stored in D1).
// /telegram/webhook       receives bot updates (set up with scripts/setup-bot.mjs). Needs the BOT_TOKEN secret.
// scheduled()             checks price alerts every 5 minutes and sends the 10:00 daily summary (see wrangler.jsonc).

import { webhookSecret } from './telegram-secret.js';
import { fetchSummary } from './rates.js';
import { RANGE_DAYS, getHistory, loadSummary, recordHistory, saveSummary, storedRates } from './history.js';
import { checkAlerts, handleUpdate, sendDailySummary } from './bot.js';
import { appApi } from './app-api.js';
import { pruneCards, serveCard } from './cards.js';
import { publicStatus, sourceFailed, sourceOk } from './monitor.js';

const DAILY_CRON = '0 7 * * *';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/borsa-api/summary.php') return proxyRates(request, env);
    if (pathname === '/api/history') return historyApi(request, env);
    if (pathname === '/api/status') return json(await publicStatus(env), 200, 'public, max-age=60');
    if (pathname === '/api/alerts' || pathname.startsWith('/api/alerts/') || pathname === '/api/cards') {
      return appApi(request, env, pathname);
    }
    const card = pathname.match(/^\/cards\/([a-f0-9]{32})\.jpg$/);
    if (card && (request.method === 'GET' || request.method === 'HEAD')) return serveCard(request, env, card[1]);
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
  // Every 5 minutes: check the source, record history (also without a bot), then fire any price alerts.
  // This is the only place that contacts the source; everything else reads the saved copy.
  let rates;
  try {
    let raw;
    ({ rates, raw } = await fetchSummary(env.RATES_UPSTREAM)); // override is test-only, unset in production
    await saveSummary(env, raw);
  } catch (err) {
    await sourceFailed(env, err);
    return;
  }
  await sourceOk(env, await recordHistory(env, rates));
  await pruneCards(env);
  if (env.BOT_TOKEN) await checkAlerts(env, rates);
}

// ── Rates proxy ──────────────────────────────────────────────

/** The app's rates endpoint: the cron's saved copy of the source response, never a live call to the source. */
async function proxyRates(request, env) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  }
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    const { rates, at, staleSince } = await storedRates(env);
    const summary = await loadSummary(env);
    // Prefer the source's own JSON (it carries previous prices); otherwise build the same shape from history.
    const body = summary && summary.at === at
      ? summary.raw
      : JSON.stringify(Object.fromEntries(Object.entries(rates).map(([market, { sell, buy }]) => [market, {
          sell: String(sell), buy: String(buy), psell: String(sell), pbuy: String(buy), sp: 0, bp: 0, sd: 0, bd: 0,
        }])));
    if (staleSince) headers['X-Rates-Stale-Since'] = String(staleSince);
    return new Response(body, { headers });
  } catch (err) {
    return json({ error: String(err.message ?? err) }, 503);
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

function json(body, status, cacheControl = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl },
  });
}
