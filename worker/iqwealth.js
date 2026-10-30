// IQWealth (iraqsm.com) open data feeds: the CBI official rate, daily Baghdad closes, and gold prices.
// Licence (in every feed): "Free to use with attribution to IQWealth (iraqsm.com). Not real-time: figures are as
// of the session or reading stated in asOf." So: credit them with a link wherever shown, never call it live.
// The cron refreshes them about hourly into D1 settings; the app and bot only read our copy.

const BASE = 'https://iraqsm.com/data';
const FEEDS = ['fx', 'fx-history', 'gold'];
const REFRESH_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;
export const ATTRIBUTION = { name: 'IQWealth', url: 'https://iraqsm.com' };

const key = feed => `iq_${feed.replace('-', '_')}`;

/** Refreshes any feed whose saved copy is older than an hour. Failures keep the previous copy. */
export async function refreshIqwealth(env, now = Date.now()) {
  for (const feed of FEEDS) {
    const saved = await load(env, feed);
    if (saved && now - saved.fetchedAt < REFRESH_MS) continue;
    try {
      const res = await fetch(`${BASE}/${feed}.json`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`${feed}: ${res.status}`);
      const data = await res.json();
      await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
        .bind(key(feed), JSON.stringify({ fetchedAt: now, data })).run();
    } catch (err) {
      console.error('iqwealth refresh failed:', err.message);
    }
  }
}

async function load(env, feed) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key(feed)).first();
  return row ? JSON.parse(row.value) : null;
}

/** { cbi, confirmed, asOf } — the Central Bank of Iraq's official rate (IQD per $1), or null. */
export async function officialRate(env) {
  const fx = (await load(env, 'fx'))?.data;
  const cbi = Number(fx?.official?.cbi);
  return cbi ? { cbi, confirmed: fx.official.confirmed ?? null, asOf: fx.asOf ?? null } : null;
}

/**
 * Baghdad daily closes ({ t, sell, buy } per $1) from `from` onwards and before `until`, for filling the chart
 * before our own recording began. `t` is 21:00 Baghdad time on that date.
 */
export async function dailyCloses(env, from, until) {
  const rows = (await load(env, 'fx-history'))?.data?.parallel?.rows ?? [];
  return rows
    .map(r => ({ t: closeTime(r.date), sell: Number(r.sell ?? r.close), buy: Number(r.buy ?? r.close) }))
    .filter(p => p.t && p.sell > 0 && p.buy > 0 && p.t >= from && p.t < until);
}

function closeTime(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 18) : null; // 18:00 UTC = 21:00 Baghdad
}

/** Gold summary for the app and bot, or null: per mithqal by karat with yesterday's change, and shop ranges. */
export async function goldSummary(env) {
  const g = (await load(env, 'gold'))?.data;
  if (!g?.gramByCarat?.length) return null;
  const prev = Object.fromEntries((g.previous?.gramByCarat ?? []).map(k => [k.karat, k.mithqalIqd]));
  const karats = g.gramByCarat
    .filter(k => [24, 22, 21, 18].includes(Number(k.karat)) && k.mithqalIqd)
    .map(k => ({
      karat: Number(k.karat),
      mithqal: Number(k.mithqalIqd),
      gram: Number(k.iqd),
      change: prev[k.karat] ? Number(k.mithqalIqd) - Number(prev[k.karat]) : null,
    }));
  const shops = g.iraqi?.shops;
  return {
    asOf: g.asOf ?? null,
    karats,
    shops21: shops?.gulf || shops?.iraqi ? {
      gulf: shops.gulf ? { low: shops.gulf.low, high: shops.gulf.high } : null,
      iraqi: shops.iraqi ? { low: shops.iraqi.low, high: shops.iraqi.high } : null,
      publishedAt: g.iraqi?.publishedAt ?? null,
    } : null,
    ounceUsd: g.ounce?.sell?.usd ?? null,
    attribution: ATTRIBUTION,
  };
}
