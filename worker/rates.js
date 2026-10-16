// Upstream rates and the Arabic text built from them.

const UPSTREAM = 'https://iraqborsa.com/borsa-api/summary.php';
/** Seconds Cloudflare may reuse an upstream response. The app polls every 15 s, so this is invisible to users but spares the source site. */
const EDGE_CACHE_SECONDS = 10;

export const CITIES = [
  ['b', 'بغداد'],
  ['n', 'أربيل'],
  ['s', 'البصرة'],
];

export function fetchUpstream() {
  return fetch(UPSTREAM, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: EDGE_CACHE_SECONDS, cacheEverything: true },
  });
}

/** Parsed rates keyed by market ('b', 'n', 's'), each { sell, buy } per $1. Throws if unavailable. */
export async function getRates() {
  const res = await fetchUpstream();
  if (!res.ok) throw new Error(`upstream returned ${res.status}`);
  const data = await res.json();
  const rates = {};
  for (const [key] of CITIES) {
    if (data[key]) rates[key] = { sell: Number(data[key].sell), buy: Number(data[key].buy) };
  }
  if (!rates.b) throw new Error('upstream missing Baghdad');
  return rates;
}

export const fmt = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function cityLines(rates) {
  return CITIES.filter(([key]) => rates[key]).map(
    ([key, name]) => `📍 ${name}: بيع ${fmt(rates[key].sell)} · شراء ${fmt(rates[key].buy)}`,
  );
}

export function todayInBaghdad() {
  return new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Baghdad',
  }).format(new Date());
}
