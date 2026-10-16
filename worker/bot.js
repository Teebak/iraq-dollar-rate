// @ShkadDollarBot: commands, price alerts and the daily summary.
// Alerts watch Baghdad's sell rate (per $1). Storage is the D1 database bound as env.DB.

import { cityLines, fmt, getRates, todayInBaghdad } from './rates.js';
import { isGone, openAppKeyboard, tg } from './telegram.js';
import { yesterdaySell } from './history.js';
import { handleInlineQuery } from './inline.js';

const MAX_ALERTS = 5;
/** Accept targets in this band (IQD per $1); a value above it is read as "per $100". */
const MIN_TARGET = 500;
const MAX_TARGET = 5000;
const QUICK_STEPS = [5, 10];

const HELP = [
  '🔔 /alert — نبّهني عندما يصل سعر البيع في بغداد إلى سعر أختاره',
  '🗓 /subscribe — ملخص يومي للأسعار الساعة 10 صباحًا',
].join('\n');

// ── Incoming updates ─────────────────────────────────────────

export async function handleUpdate(update, env) {
  if (update.callback_query) return handleCallback(update.callback_query, env);
  if (update.inline_query) return handleInlineQuery(update.inline_query, env);

  const message = update.message;
  if (!message?.text || message.chat?.type !== 'private') return;
  const chatId = message.chat.id;
  const [command, ...args] = message.text.trim().split(/\s+/);
  const name = command.toLowerCase().replace(/@\w+$/, '');

  switch (name) {
    case '/alert': return args.length ? createAlert(env, chatId, args.join('')) : alertMenu(env, chatId);
    case '/alerts': return listAlerts(env, chatId);
    case '/subscribe': return subscribe(env, chatId);
    case '/unsubscribe': return unsubscribe(env, chatId);
    default: return sendRates(env, chatId);
  }
}

async function handleCallback(query, env) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const [kind, value] = String(query.data ?? '').split(':');
  let toast = '';

  // Always answer the callback, even if editing fails, so the button stops spinning.
  try {
    if (chatId && kind === 'a') {
      const reply = await alertReply(env, chatId, value);
      await tg(env, 'editMessageText', { chat_id: chatId, message_id: messageId, text: reply });
    } else if (chatId && kind === 'd') {
      const { meta } = await env.DB.prepare('DELETE FROM alerts WHERE id = ? AND chat_id = ?').bind(Number(value), chatId).run();
      toast = meta.changes ? 'تم حذف التنبيه' : 'هذا التنبيه غير موجود';
      const { text, reply_markup } = await alertsView(env, chatId);
      await tg(env, 'editMessageText', { chat_id: chatId, message_id: messageId, text, reply_markup });
    }
  } finally {
    await tg(env, 'answerCallbackQuery', { callback_query_id: query.id, text: toast });
  }
}

// ── Commands ─────────────────────────────────────────────────

async function sendRates(env, chatId) {
  let body;
  try {
    const rates = await getRates();
    body = [...cityLines(rates), '', 'الأسعار بالدينار لكل 1 دولار.'].join('\n');
  } catch {
    body = 'تعذّر جلب الأسعار الآن.';
  }
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: ['شكد الدولار؟ 💵', '', body, '', HELP].join('\n'),
    reply_markup: openAppKeyboard(env.APP_URL),
  });
}

async function alertMenu(env, chatId) {
  let current;
  try {
    current = (await getRates()).b.sell;
  } catch {
    return tg(env, 'sendMessage', { chat_id: chatId, text: 'تعذّر جلب السعر الآن، حاول بعد قليل.' });
  }
  const button = target => ({ text: `${target > current ? '▲' : '▼'} ${fmt(target)}`, callback_data: `a:${target}` });
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: [
      '🔔 تنبيه سعر البيع في بغداد',
      `السعر الآن: ${fmt(current)} دينار لكل 1 دولار`,
      '',
      'اختر سعرًا، أو أرسل السعر الذي تريده مثل:',
      '/alert 1680',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [
        QUICK_STEPS.map(step => button(current + step)),
        QUICK_STEPS.map(step => button(current - step)),
      ],
    },
  });
}

async function createAlert(env, chatId, raw) {
  await tg(env, 'sendMessage', { chat_id: chatId, text: await alertReply(env, chatId, raw) });
}

/** Validates the target, stores the alert and returns the text to show the user. */
async function alertReply(env, chatId, raw) {
  let target = parseAmount(raw);
  if (target > MAX_TARGET) target = target / 100; // typed per $100, e.g. 168000
  if (!target || target < MIN_TARGET || target > MAX_TARGET) {
    return 'اكتب السعر بالدينار لكل 1 دولار، مثل: /alert 1680';
  }

  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM alerts WHERE chat_id = ?').bind(chatId).first();
  if (count >= MAX_ALERTS) return `لديك ${MAX_ALERTS} تنبيهات بالفعل. احذف واحدًا من /alerts ثم حاول مجددًا.`;

  let current;
  try {
    current = (await getRates()).b.sell;
  } catch {
    return 'تعذّر جلب السعر الآن، حاول بعد قليل.';
  }
  if (target === current) return `سعر البيع في بغداد الآن هو ${fmt(current)} بالفعل.`;

  const direction = target > current ? 'up' : 'down';
  const existing = await env.DB.prepare('SELECT 1 FROM alerts WHERE chat_id = ? AND direction = ? AND target = ?')
    .bind(chatId, direction, target).first();
  if (existing) return `لديك تنبيه على ${fmt(target)} بالفعل. تنبيهاتك: /alerts`;

  await env.DB.prepare('INSERT INTO alerts (chat_id, direction, target, created_at) VALUES (?, ?, ?, ?)')
    .bind(chatId, direction, target, Date.now()).run();

  return [
    `✅ سأرسل لك رسالة عندما يصل سعر البيع في بغداد إلى ${fmt(target)} ${direction === 'up' ? 'أو أعلى' : 'أو أقل'}.`,
    `السعر الآن: ${fmt(current)}`,
    '',
    'تنبيهاتك: /alerts',
  ].join('\n');
}

async function listAlerts(env, chatId) {
  const { text, reply_markup } = await alertsView(env, chatId);
  await tg(env, 'sendMessage', { chat_id: chatId, text, reply_markup });
}

async function alertsView(env, chatId) {
  const { results } = await env.DB.prepare('SELECT id, direction, target FROM alerts WHERE chat_id = ? ORDER BY target')
    .bind(chatId).all();
  if (!results.length) return { text: 'لا توجد لديك تنبيهات. أنشئ واحدًا بـ /alert', reply_markup: { inline_keyboard: [] } };
  return {
    text: `🔔 تنبيهاتك (سعر البيع في بغداد) — اضغط لحذف:`,
    reply_markup: {
      inline_keyboard: results.map(a => [{ text: `❌ ${a.direction === 'up' ? '▲' : '▼'} ${fmt(a.target)}`, callback_data: `d:${a.id}` }]),
    },
  };
}

async function subscribe(env, chatId) {
  await env.DB.prepare('INSERT OR IGNORE INTO subscribers (chat_id, created_at) VALUES (?, ?)').bind(chatId, Date.now()).run();
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: '✅ اشتركت في الملخص اليومي. يصلك كل يوم الساعة 10 صباحًا بتوقيت بغداد.\nلإلغاء الاشتراك: /unsubscribe',
  });
}

async function unsubscribe(env, chatId) {
  await env.DB.prepare('DELETE FROM subscribers WHERE chat_id = ?').bind(chatId).run();
  await tg(env, 'sendMessage', { chat_id: chatId, text: 'تم إلغاء الاشتراك في الملخص اليومي.' });
}

// ── Scheduled jobs ───────────────────────────────────────────

/** Sends and deletes every alert whose target has been reached. */
export async function checkAlerts(env, rates) {
  await env.DB.prepare('DELETE FROM processed_updates WHERE created_at < ?').bind(Date.now() - 86_400_000).run();
  const sell = rates.b.sell;
  const { results } = await env.DB.prepare(
    `SELECT id, chat_id, direction, target FROM alerts
     WHERE market = 'b' AND side = 'sell'
       AND ((direction = 'up' AND target <= ?1) OR (direction = 'down' AND target >= ?1))`,
  ).bind(sell).all();

  for (const alert of results) {
    try {
      await tg(env, 'sendMessage', {
        chat_id: alert.chat_id,
        text: `🔔 وصل سعر البيع في بغداد إلى ${fmt(alert.target)}\nالسعر الآن: ${fmt(sell)} دينار لكل 1 دولار`,
        reply_markup: openAppKeyboard(env.APP_URL),
      });
    } catch (err) {
      if (!isGone(err)) { console.error('alert send failed', alert.id, err.message); continue; }
    }
    await env.DB.prepare('DELETE FROM alerts WHERE id = ?').bind(alert.id).run();
  }
  return results.length;
}

/** Daily summary to every subscriber; drops users who blocked the bot. */
export async function sendDailySummary(env) {
  const rates = await getRates();
  const yesterday = await yesterdaySell(env);
  const text = ['🗓 ملخص اليوم — ' + todayInBaghdad(), '', ...cityLines(rates, yesterday), '', 'الأسعار بالدينار لكل 1 دولار.'].join('\n');
  const { results } = await env.DB.prepare('SELECT chat_id FROM subscribers').all();

  // Telegram allows ~30 messages/second; stay well under it.
  for (let i = 0; i < results.length; i += 20) {
    await Promise.all(results.slice(i, i + 20).map(async ({ chat_id }) => {
      try {
        await tg(env, 'sendMessage', { chat_id, text, reply_markup: openAppKeyboard(env.APP_URL) });
      } catch (err) {
        if (isGone(err)) await env.DB.prepare('DELETE FROM subscribers WHERE chat_id = ?').bind(chat_id).run();
        else console.error('summary send failed', chat_id, err.message);
      }
    }));
    if (i + 20 < results.length) await new Promise(r => setTimeout(r, 1000));
  }
  return results.length;
}

// ── Helpers ──────────────────────────────────────────────────

/** Parses "1680", "1,680", "1680.5", Arabic-Indic "١٦٨٠" and the Arabic decimal mark. */
function parseAmount(raw) {
  const western = String(raw)
    .replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf))
    .replace(/٫/g, '.')
    .replace(/[,،\s]/g, '');
  return /^\d+(\.\d+)?$/.test(western) ? Number(western) : NaN;
}
