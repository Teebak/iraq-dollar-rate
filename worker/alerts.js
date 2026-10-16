// Price alerts shared by the bot commands and the Mini App API. Table: alerts (migrations/0001).
// An alert watches one market's sell or buy price (IQD per $1) and fires once when it reaches the target.

import { CITIES, fmt } from './rates.js';
import { isGone, openAppKeyboard, tg } from './telegram.js';

export const MAX_ALERTS = 5;
/** Accept targets in this band (IQD per $1); a value above it is read as "per $100". */
const MIN_TARGET = 500;
const MAX_TARGET = 5000;
const MARKETS = CITIES.map(([key]) => key);
const SIDES = ['sell', 'buy'];

const cityName = market => CITIES.find(([key]) => key === market)?.[1] ?? market;
/** e.g. "سعر البيع في بغداد" */
export const alertLabel = (market, side) => `سعر ${side === 'buy' ? 'الشراء' : 'البيع'} في ${cityName(market)}`;

export function normalizeTarget(n) {
  const target = n > MAX_TARGET ? n / 100 : n; // typed per $100, e.g. 168000
  return Number.isFinite(target) && target >= MIN_TARGET && target <= MAX_TARGET ? target : NaN;
}

/**
 * Validates and stores an alert. The direction comes from where the price is now.
 * Returns { ok: true, alert, current } or { ok: false, error, current } with error one of
 * 'invalid' | 'limit' | 'same' | 'duplicate'.
 */
export async function addAlert(env, chatId, { market, side, target: raw }, rates) {
  const target = normalizeTarget(Number(raw));
  if (!MARKETS.includes(market) || !SIDES.includes(side) || Number.isNaN(target) || !rates[market]) {
    return { ok: false, error: 'invalid' };
  }
  const current = rates[market][side];

  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM alerts WHERE chat_id = ?').bind(chatId).first();
  if (count >= MAX_ALERTS) return { ok: false, error: 'limit', current };
  if (target === current) return { ok: false, error: 'same', current };

  const direction = target > current ? 'up' : 'down';
  const existing = await env.DB.prepare(
    'SELECT 1 FROM alerts WHERE chat_id = ? AND market = ? AND side = ? AND direction = ? AND target = ?',
  ).bind(chatId, market, side, direction, target).first();
  if (existing) return { ok: false, error: 'duplicate', current };

  const row = await env.DB.prepare(
    'INSERT INTO alerts (chat_id, market, side, direction, target, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
  ).bind(chatId, market, side, direction, target, Date.now()).first();
  return { ok: true, alert: { id: row.id, market, side, direction, target }, current };
}

export async function listAlerts(env, chatId) {
  const { results } = await env.DB.prepare(
    'SELECT id, market, side, direction, target FROM alerts WHERE chat_id = ? ORDER BY market, side, target',
  ).bind(chatId).all();
  return results;
}

/** Deletes one of this chat's alerts; returns true if it existed. */
export async function deleteAlert(env, chatId, id) {
  const { meta } = await env.DB.prepare('DELETE FROM alerts WHERE id = ? AND chat_id = ?').bind(Number(id), chatId).run();
  return meta.changes > 0;
}

/** Sends and deletes every alert whose target has been reached. */
export async function fireAlerts(env, rates) {
  const { results } = await env.DB.prepare('SELECT id, chat_id, market, side, direction, target FROM alerts').all();
  const due = results.filter(a => {
    const now = rates[a.market]?.[a.side];
    return now != null && (a.direction === 'up' ? now >= a.target : now <= a.target);
  });

  for (const alert of due) {
    const now = rates[alert.market][alert.side];
    try {
      await tg(env, 'sendMessage', {
        chat_id: alert.chat_id,
        text: `🔔 وصل ${alertLabel(alert.market, alert.side)} إلى ${fmt(alert.target)}\nالسعر الآن: ${fmt(now)} دينار لكل 1 دولار`,
        reply_markup: openAppKeyboard(env.APP_URL),
      });
    } catch (err) {
      if (!isGone(err)) { console.error('alert send failed', alert.id, err.message); continue; }
    }
    await env.DB.prepare('DELETE FROM alerts WHERE id = ?').bind(alert.id).run();
  }
  return due.length;
}
