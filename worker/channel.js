// Public Telegram channel that the bot posts to automatically: on price moves and with the daily summary.
// The admin links it with "/channel @name" after adding the bot as a channel admin; "/channel off" unlinks.
// Settings keys: channel_id, channel_last ({ at, sell, buy } for Baghdad, as last posted).

import { CITIES, fmt } from './rates.js';
import { tg } from './telegram.js';

const MINI_APP_LINK = 'https://t.me/ShkadDollarBot/rates';
/** Normal moves are posted at most this often; a jump of BIG_MOVE or more is posted straight away. */
const MIN_INTERVAL_MS = 30 * 60_000;
const BIG_MOVE = 5;

const button = { inline_keyboard: [[{ text: 'افتح الأسعار 💵', url: MINI_APP_LINK }]] };

async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

async function setSetting(env, key, value) {
  if (value == null) {
    await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
    return;
  }
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, value).run();
}

export const getChannel = env => getSetting(env, 'channel_id');

/** Links a channel after proving the bot can post there. Returns the reply text for the admin. */
export async function linkChannel(env, arg) {
  if (!arg) {
    const current = await getChannel(env);
    return current
      ? `📢 القناة المرتبطة: ${current}\nلإلغاء الربط: /channel off`
      : 'أرسل: /channel @اسم_القناة\nبعد إضافة البوت كمشرف في القناة مع صلاحية النشر.';
  }
  if (arg === 'off') {
    await setSetting(env, 'channel_id', null);
    return '✅ تم إلغاء ربط القناة.';
  }
  const channel = arg.startsWith('@') || /^-100\d+$/.test(arg) ? arg : `@${arg}`;
  try {
    await tg(env, 'sendMessage', { chat_id: channel, text: '✅ تم ربط هذه القناة بـ @ShkadDollarBot. ستُنشر هنا تحديثات سعر الدولار تلقائيًا.' });
  } catch (err) {
    return `تعذّر النشر في ${channel}. تأكد أن البوت مشرف في القناة ولديه صلاحية نشر الرسائل.\n(${err.message})`;
  }
  await setSetting(env, 'channel_id', channel);
  await setSetting(env, 'channel_last', null);
  return `✅ تم ربط ${channel}. سيُنشر فيها كل تغيّر في سعر بغداد (مرة كل 30 دقيقة كحد أقصى، أو فورًا عند تغيّر 5 أو أكثر) والملخص اليومي.`;
}

/** Called after each fresh price fetch: posts if Baghdad moved, respecting the rate limit. */
export async function maybePostChange(env, rates, now = Date.now()) {
  const channel = await getChannel(env);
  if (!channel || !rates.b) return false;
  const { sell, buy } = rates.b;
  const lastRaw = await getSetting(env, 'channel_last');
  const last = lastRaw ? JSON.parse(lastRaw) : null;

  if (!last) {
    // First fetch after linking: remember the starting point, post only when it moves.
    await setSetting(env, 'channel_last', JSON.stringify({ at: now, sell, buy }));
    return false;
  }
  if (last.sell === sell && last.buy === buy) return false;
  const big = Math.abs(sell - last.sell) >= BIG_MOVE || Math.abs(buy - last.buy) >= BIG_MOVE;
  if (!big && now - last.at < MIN_INTERVAL_MS) return false; // a later run will post once the interval passes

  await tg(env, 'sendMessage', { chat_id: channel, text: changeText(rates, last, now), reply_markup: button });
  await setSetting(env, 'channel_last', JSON.stringify({ at: now, sell, buy }));
  return true;
}

/** Posts the daily summary text to the channel, if one is linked. */
export async function postToChannel(env, text) {
  const channel = await getChannel(env);
  if (!channel) return;
  try {
    await tg(env, 'sendMessage', { chat_id: channel, text, reply_markup: button });
  } catch (err) {
    console.error('channel post failed:', err.message);
  }
}

function changeText(rates, last, now) {
  const { sell, buy } = rates.b;
  const d = sell - last.sell;
  const headline = d > 0 ? '🔺 ارتفع الدولار في بغداد' : d < 0 ? '🔻 انخفض الدولار في بغداد' : '🔄 تغيّر سعر الدولار في بغداد';
  const change = d ? ` (${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))})` : '';
  const others = CITIES.filter(([key]) => key !== 'b' && rates[key]).map(([key, name]) => `${name}: ${fmt(rates[key].sell)}`);
  const time = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Baghdad' }).format(now);
  return [
    headline,
    `بيع ${fmt(sell)}${change} · شراء ${fmt(buy)}`,
    ...(others.length ? [others.join(' · ')] : []),
    '',
    `🕒 ${time} بتوقيت بغداد · الأسعار لكل 1$`,
  ].join('\n');
}
