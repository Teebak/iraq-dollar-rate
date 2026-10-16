// @ShkadDollarBot: commands, alert shortcuts and the daily summary. Storage is the D1 database bound as env.DB.
// /alert sets Baghdad sell alerts; the Mini App can set them for any city and side (worker/alerts.js).

import { cityLines, fmt, getRates, todayInBaghdad } from './rates.js';
import { isGone, openAppKeyboard, tg } from './telegram.js';
import { yesterdaySell } from './history.js';
import { handleInlineQuery } from './inline.js';
import { adminCode, getAdmin, setAdmin, statusText } from './monitor.js';
import { MAX_ALERTS, addAlert, alertLabel, deleteAlert, fireAlerts, listAlerts as alertsFor, normalizeTarget } from './alerts.js';

const QUICK_STEPS = [5, 10];

const APP_HOOKS = '📈 حركة السعر · 🧮 الحاسبة · 🔔 التنبيهات · أربيل والبصرة';
const HELP = '🗓 /subscribe — ملخص يومي للأسعار الساعة 10 صباحًا';

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
    case '/admin': return claimAdmin(env, chatId, args[0]);
    case '/status':
      if ((await getAdmin(env)) === chatId) return tg(env, 'sendMessage', { chat_id: chatId, text: await statusText(env) });
      return sendRates(env, chatId);
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
      toast = (await deleteAlert(env, chatId, value)) ? 'تم حذف التنبيه' : 'هذا التنبيه غير موجود';
      const { text, reply_markup } = await alertsView(env, chatId);
      await tg(env, 'editMessageText', { chat_id: chatId, message_id: messageId, text, reply_markup });
    }
  } finally {
    await tg(env, 'answerCallbackQuery', { callback_query_id: query.id, text: toast });
  }
}

// ── Commands ─────────────────────────────────────────────────

/**
 * Reply to /start and any other message: a quick Baghdad answer, plus what only the app has.
 * Full city lists stay in the daily summary and inline cards, which are for sharing.
 */
async function sendRates(env, chatId) {
  let body;
  try {
    const rates = await getRates();
    const { sell, buy } = rates.b;
    const before = (await yesterdaySell(env)).b;
    const delta = before == null ? '' : sell > before ? ` (▲ ${fmt(sell - before)} عن أمس)` : sell < before ? ` (▼ ${fmt(before - sell)} عن أمس)` : ' (ثابت عن أمس)';
    body = [
      '📍 بغداد الآن',
      `بيع ${fmt(sell)}${delta} · شراء ${fmt(buy)}`,
    ].join('\n');
  } catch {
    body = 'تعذّر جلب الأسعار الآن. افتح التطبيق للأسعار المباشرة.';
  }
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: ['شكد الدولار؟ 💵', '', body, '', 'في التطبيق 👇', APP_HOOKS, '', HELP].join('\n'),
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

/** Stores a Baghdad sell alert from a typed or tapped target and returns the text to show the user. */
async function alertReply(env, chatId, raw) {
  const target = parseAmount(raw);
  if (Number.isNaN(target)) return 'اكتب السعر بالدينار لكل 1 دولار، مثل: /alert 1680';

  let rates;
  try {
    rates = await getRates();
  } catch {
    return 'تعذّر جلب السعر الآن، حاول بعد قليل.';
  }
  const result = await addAlert(env, chatId, { market: 'b', side: 'sell', target }, rates);
  const label = alertLabel('b', 'sell');
  if (!result.ok) {
    switch (result.error) {
      case 'invalid': return 'اكتب السعر بالدينار لكل 1 دولار، مثل: /alert 1680';
      case 'limit': return `لديك ${MAX_ALERTS} تنبيهات بالفعل. احذف واحدًا من /alerts ثم حاول مجددًا.`;
      case 'same': return `${label} الآن هو ${fmt(result.current)} بالفعل.`;
      case 'duplicate': return `لديك تنبيه على ${fmt(normalizeTarget(target))} بالفعل. تنبيهاتك: /alerts`;
    }
  }
  const { alert, current } = result;
  return [
    `✅ سأرسل لك رسالة عندما يصل ${label} إلى ${fmt(alert.target)} ${alert.direction === 'up' ? 'أو أعلى' : 'أو أقل'}.`,
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
  const alerts = await alertsFor(env, chatId);
  if (!alerts.length) return { text: 'لا توجد لديك تنبيهات. أنشئ واحدًا بـ /alert أو من التطبيق 🔔', reply_markup: { inline_keyboard: [] } };
  return {
    text: '🔔 تنبيهاتك — اضغط لحذف:',
    reply_markup: {
      inline_keyboard: alerts.map(a => [{
        text: `❌ ${alertLabel(a.market, a.side)} ${a.direction === 'up' ? '▲' : '▼'} ${fmt(a.target)}`,
        callback_data: `d:${a.id}`,
      }]),
    },
  };
}

/** "/admin <code>": the code comes from scripts/setup-bot.mjs and is derived from the bot token. */
async function claimAdmin(env, chatId, code) {
  if (!code || code !== (await adminCode(env.BOT_TOKEN))) return sendRates(env, chatId);
  await setAdmin(env, chatId);
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: '✅ أنت المشرف الآن. ستصلك رسالة إذا تعطّل مصدر الأسعار أو توقفت الأسعار عن التغيّر.\nحالة المصدر في أي وقت: /status',
  });
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

/** Every 5 minutes: housekeeping, then fire any alerts whose target has been reached. */
export async function checkAlerts(env, rates) {
  await env.DB.prepare('DELETE FROM processed_updates WHERE created_at < ?').bind(Date.now() - 86_400_000).run();
  return fireAlerts(env, rates);
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
