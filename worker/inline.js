// Inline mode: typing "@ShkadDollarBot" (optionally followed by an amount) in any chat offers ready rate cards.
// Inline mode must be switched on once in @BotFather with /setinline.

import { CITIES, cityLines, fmt, staleNote } from './rates.js';
import { ratesOrLastKnown } from './history.js';
import { tg } from './telegram.js';

const MINI_APP_LINK = 'https://t.me/ShkadDollarBot/rates';
const PHOTOS = { b: 'baghdad', n: 'erbil', s: 'basra' };

export async function handleInlineQuery(query, env) {
  let rates;
  let staleSince = null;
  try {
    ({ rates, staleSince } = await ratesOrLastKnown(env));
  } catch {
    return tg(env, 'answerInlineQuery', { inline_query_id: query.id, results: [], cache_time: 10 });
  }

  const origin = new URL(env.APP_URL).origin;
  const button = { inline_keyboard: [[{ text: 'افتح الأسعار 💵', url: MINI_APP_LINK }]] };
  const note = staleSince ? staleNote(staleSince) : '';
  const article = (id, title, description, text, photo) => ({
    type: 'article',
    id,
    title,
    description: note ? 'آخر سعر مسجّل — المصدر لا يستجيب الآن' : description,
    thumbnail_url: photo ? `${origin}/cities/${photo}.jpg` : undefined,
    input_message_content: { message_text: note ? `${text}\n\n${note}` : text },
    reply_markup: button,
  });

  const results = [];

  // "@ShkadDollarBot 500" → conversion cards at Baghdad's rates.
  const amount = parseAmount(query.query);
  if (amount) {
    const { buy, sell } = rates.b;
    const usdToIqd = article('usd-iqd', `${fmt(amount)}$ = ${fmt(Math.round(amount * buy))} د.ع`, 'تحويل دولار ← دينار (سعر الشراء في بغداد)',
      `💵 ${fmt(amount)} دولار = ${fmt(Math.round(amount * buy))} دينار\nحسب سعر الشراء في بغداد: ${fmt(buy)} لكل 1$`, 'baghdad');
    const iqdToUsd = article('iqd-usd', `${fmt(amount)} د.ع = ${fmt(amount / sell)}$`, 'تحويل دينار ← دولار (سعر البيع في بغداد)',
      `💵 ${fmt(amount)} دينار = ${fmt(amount / sell)} دولار\nحسب سعر البيع في بغداد: ${fmt(sell)} لكل 1$`, 'baghdad');
    // Amounts below 1,000 are almost certainly dollars; large ones are most likely dinars.
    if (amount < 1000) results.push(usdToIqd);
    else if (amount >= 100_000) results.push(iqdToUsd, usdToIqd);
    else results.push(usdToIqd, iqdToUsd);
  }

  results.push(article('all', 'شكد الدولار؟ — كل المدن', 'بغداد · أربيل · البصرة',
    ['شكد الدولار؟ 💵', '', ...cityLines(rates), '', 'الأسعار بالدينار لكل 1 دولار.'].join('\n'), 'baghdad'));

  for (const [key, name] of CITIES) {
    const r = rates[key];
    if (!r) continue;
    results.push(article(`city-${key}`, `${name}: بيع ${fmt(r.sell)} · شراء ${fmt(r.buy)}`, 'سعر الدولار مقابل الدينار، لكل 1$',
      `💵 سعر الدولار في ${name}\nبيع: ${fmt(r.sell)} · شراء: ${fmt(r.buy)}\nلكل 100$: ${fmt(r.sell * 100)} د.ع`, PHOTOS[key]));
  }

  await tg(env, 'answerInlineQuery', { inline_query_id: query.id, results, cache_time: staleSince ? 10 : 30, is_personal: false });
}

function parseAmount(raw) {
  const western = String(raw ?? '')
    .replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf))
    .replace(/٫/g, '.')
    .replace(/[,،\s$]/g, '');
  const n = Number(western);
  return western && Number.isFinite(n) && n > 0 && n < 1e12 ? n : 0;
}
