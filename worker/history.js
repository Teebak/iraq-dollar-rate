// Shared price history in D1 (table price_history, see migrations/0004).

import { CITIES, parseRates } from './rates.js';
import { dailyCloses } from './iqwealth.js';

const HEARTBEAT_MS = 60 * 60_000;
const KEEP_MS = 90 * 86_400_000;
export const RANGE_DAYS = [1, 7, 30];

/**
 * Stores the current prices for each market that changed, or hasn't been recorded for an hour.
 * Returns true if any market's price changed since its last record.
 */
export async function recordHistory(env, rates, now = Date.now()) {
  const lastRows = await env.DB.batch(
    Object.keys(rates).map(market =>
      env.DB.prepare('SELECT sell, buy, at FROM price_history WHERE market = ? ORDER BY at DESC LIMIT 1').bind(market),
    ),
  );
  const writes = [];
  let changed = false;
  Object.entries(rates).forEach(([market, { sell, buy }], i) => {
    const last = lastRows[i].results[0];
    const moved = !last || last.sell !== sell || last.buy !== buy;
    if (moved) changed = true;
    if (moved || now - last.at >= HEARTBEAT_MS) {
      writes.push(env.DB.prepare('INSERT OR IGNORE INTO price_history (market, at, sell, buy) VALUES (?, ?, ?, ?)')
        .bind(market, now, sell, buy));
    }
  });
  writes.push(env.DB.prepare('DELETE FROM price_history WHERE at < ?').bind(now - KEEP_MS));
  await env.DB.batch(writes);
  return changed;
}

/**
 * Points for one market over the last `days`, plus the last point before the window so a step chart
 * can start at the window's left edge. `since` is when recording began for that market.
 */
export async function getHistory(env, market, days, now = Date.now()) {
  const from = now - days * 86_400_000;
  const [before, inside, first] = await env.DB.batch([
    env.DB.prepare('SELECT at, sell, buy FROM price_history WHERE market = ? AND at < ? ORDER BY at DESC LIMIT 1').bind(market, from),
    env.DB.prepare('SELECT at, sell, buy FROM price_history WHERE market = ? AND at >= ? ORDER BY at').bind(market, from),
    env.DB.prepare('SELECT MIN(at) AS since FROM price_history WHERE market = ?').bind(market),
  ]);
  const since = first.results[0]?.since ?? null;
  // Before our recording began, fill Baghdad's chart with IQWealth's daily closes (drawn lighter, labelled).
  const daily = market === 'b' ? await dailyCloses(env, from, since ?? now) : [];
  return {
    market,
    days,
    from,
    daily,
    since,
    points: [...before.results, ...inside.results].map(r => ({ t: r.at, sell: r.sell, buy: r.buy })),
  };
}

/** Each market's sell price as of ~24 h ago, for "change since yesterday". */
export async function yesterdaySell(env, now = Date.now()) {
  const at = now - 86_400_000;
  const rows = await env.DB.batch(
    CITIES.map(([market]) =>
      env.DB.prepare('SELECT sell FROM price_history WHERE market = ? AND at <= ? ORDER BY at DESC LIMIT 1').bind(market, at),
    ),
  );
  return Object.fromEntries(CITIES.map(([market], i) => [market, rows[i].results[0]?.sell]));
}

/** The most recent recorded price for each market: { rates: { b: { sell, buy }, ... }, at } or null. */
export async function lastKnownRates(env) {
  const rows = await env.DB.batch(
    CITIES.map(([market]) =>
      env.DB.prepare('SELECT sell, buy, at FROM price_history WHERE market = ? ORDER BY at DESC LIMIT 1').bind(market),
    ),
  );
  const rates = {};
  let at = 0;
  CITIES.forEach(([market], i) => {
    const row = rows[i].results[0];
    if (!row) return;
    rates[market] = { sell: row.sell, buy: row.buy };
    at = Math.max(at, row.at);
  });
  return rates.b ? { rates, at } : null;
}

/** A saved copy older than this is shown as "last known" (two missed 5-minute runs plus slack). */
const FRESH_MS = 12 * 60_000;

/** Called by the cron after each successful fetch: the one copy everything else reads. */
export async function saveSummary(env, raw, at = Date.now()) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('last_summary', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify({ at, raw })).run();
}

/** The last saved source response: { data, at } or null. */
export async function loadSummary(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_summary'").first();
  if (!row) return null;
  const { at, raw } = JSON.parse(row.value);
  return { data: JSON.parse(raw), raw, at };
}

/**
 * Rates for display, from our saved copy only (never contacts the source).
 * Returns { rates, at, staleSince } with staleSince null while the copy is fresh, otherwise when it was saved.
 * Falls back to the newest history rows; throws only if nothing has ever been saved.
 */
export async function storedRates(env, now = Date.now()) {
  const summary = await loadSummary(env);
  if (summary) {
    return { rates: parseRates(summary.data), at: summary.at, staleSince: now - summary.at > FRESH_MS ? summary.at : null };
  }
  const last = await lastKnownRates(env);
  if (!last) throw new Error('no prices recorded yet');
  return { rates: last.rates, at: last.at, staleSince: now - last.at > FRESH_MS ? last.at : null };
}

const DAY_MS = 86_400_000;
const BAGHDAD_OFFSET_MS = 3 * 3_600_000; // UTC+3, no daylight saving

/**
 * Summary numbers for one market's sell price, from our recorded history:
 * today's high/low (Baghdad calendar day), change since ~24 h ago, the 7-day time-weighted average and how far
 * the current price is from it, and the biggest single move in the last 7 days. Null fields mean not enough data.
 */
export async function getStats(env, market, now = Date.now()) {
  const weekAgo = now - 7 * DAY_MS;
  const [before, rows] = await env.DB.batch([
    env.DB.prepare('SELECT at, sell, buy FROM price_history WHERE market = ? AND at < ? ORDER BY at DESC LIMIT 1').bind(market, weekAgo),
    env.DB.prepare('SELECT at, sell, buy FROM price_history WHERE market = ? AND at >= ? ORDER BY at').bind(market, weekAgo),
  ]);
  return { market, ...computeStats([...before.results, ...rows.results], now) };
}

/** Pure part of getStats: `points` are { at, sell, buy } in time order, starting with the last one before the window. */
export function computeStats(points, now = Date.now()) {
  const weekAgo = now - 7 * DAY_MS;
  if (!points.length) return { current: null, today: null, change24h: null, avg7: null, vsAvg7Pct: null, biggestMove: null };

  const current = points.at(-1);
  // Price in force at time t: the last point at or before t.
  const priceAt = t => [...points].reverse().find(p => p.at <= t)?.sell ?? null;

  const todayStart = Math.floor((now + BAGHDAD_OFFSET_MS) / DAY_MS) * DAY_MS - BAGHDAD_OFFSET_MS;
  const todaySells = [priceAt(todayStart), ...points.filter(p => p.at >= todayStart).map(p => p.sell)].filter(v => v != null);

  const dayAgo = priceAt(now - DAY_MS);

  // Time-weighted average over the window covered by data (each price counts for as long as it lasted).
  let weighted = 0;
  let span = 0;
  points.forEach((p, i) => {
    const start = Math.max(p.at, weekAgo);
    const end = points[i + 1]?.at ?? now;
    if (end > start) { weighted += p.sell * (end - start); span += end - start; }
  });
  const avg7 = span >= DAY_MS ? weighted / span : null; // under a day of data, an average is meaningless

  let biggestMove = null;
  for (let i = 1; i < points.length; i++) {
    if (points[i].at < weekAgo) continue;
    const delta = points[i].sell - points[i - 1].sell;
    if (delta !== 0 && (!biggestMove || Math.abs(delta) > Math.abs(biggestMove.delta))) biggestMove = { delta, at: points[i].at };
  }

  return {
    current: { sell: current.sell, buy: current.buy, at: current.at },
    today: todaySells.length ? { high: Math.max(...todaySells), low: Math.min(...todaySells) } : null,
    change24h: dayAgo == null ? null : current.sell - dayAgo,
    avg7,
    vsAvg7Pct: avg7 ? ((current.sell - avg7) / avg7) * 100 : null,
    biggestMove,
  };
}
