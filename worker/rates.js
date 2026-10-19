// Upstream rates and the Arabic text built from them.

const UPSTREAM = 'https://iraqborsa.com/borsa-api/summary.php';
/** Seconds Cloudflare may reuse an upstream response. The app polls every 15 s, so this is invisible to users but spares the source site. */
const EDGE_CACHE_SECONDS = 10;
const FETCH_TIMEOUT_MS = 8000;

export const CITIES = [
  ['b', 'بغداد'],
  ['n', 'أربيل'],
  ['s', 'البصرة'],
];

/** `url` overrides the source; only the RATES_UPSTREAM test var uses it (see index.js). */
export function fetchUpstream(url = UPSTREAM) {
  return fetch(url, {
    headers: { Accept: 'application/json' },
    // Fail fast so callers can fall back to the last known prices instead of hanging.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cf: { cacheTtl: EDGE_CACHE_SECONDS, cacheEverything: true },
  });
}

/**
 * Fetches the source once: { rates, raw }. `raw` is the source's JSON text, saved as-is so the app keeps its
 * fields (previous price, change). Throws if unavailable or implausible. Only the 5-minute cron calls this.
 */
export async function fetchSummary(url) {
  const res = await fetchUpstream(url);
  if (!res.ok) throw new Error(`upstream returned ${res.status}`);
  const raw = await res.text();
  return { rates: parseRates(JSON.parse(raw)), raw };
}

/** Rates keyed by market ('b', 'n', 's'), each { sell, buy } per $1, from the source's JSON. Throws if Baghdad is missing. */
export function parseRates(data) {
  const rates = {};
  for (const [key] of CITIES) {
    const sell = Number(data?.[key]?.sell);
    const buy = Number(data?.[key]?.buy);
    // A broken or placeholder response must not reach users, history or alerts.
    if (isPlausible(sell) && isPlausible(buy)) rates[key] = { sell, buy };
  }
  if (!rates.b) throw new Error('upstream returned no valid Baghdad price');
  return rates;
}

/** IQD per $1 has been ~1,300–1,700 for years; anything far outside is a source fault. */
const isPlausible = n => Number.isFinite(n) && n >= 500 && n <= 5000;

export const fmt = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** One line per city. With `yesterday` (sell per market ~24 h ago), the sell price gets its change, e.g. (▲ 2.5). */
export function cityLines(rates, yesterday = {}) {
  return CITIES.filter(([key]) => rates[key]).map(([key, name]) => {
    const { sell, buy } = rates[key];
    const before = yesterday[key];
    const delta = before == null ? '' : sell > before ? ` (▲ ${fmt(sell - before)})` : sell < before ? ` (▼ ${fmt(before - sell)})` : ' (ثابت)';
    return `📍 ${name}: بيع ${fmt(sell)}${delta} · شراء ${fmt(buy)}`;
  });
}

export function todayInBaghdad() {
  return new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Baghdad',
  }).format(new Date());
}

/** Shown under prices that came from history because the source isn't answering. */
export function staleNote(at) {
  const when = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
    day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Baghdad',
  }).format(at);
  return `⚠️ مصدر الأسعار لا يستجيب الآن. هذه آخر أسعار مسجّلة (${when}).`;
}
