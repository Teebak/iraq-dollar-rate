// Watches the price source. The 5-minute cron reports each fetch here; the owner (admin) gets a bot message
// when the source has been failing for a while, when it recovers, and when prices haven't moved for a day.
// The app reads /api/status to warn users that prices may be stale.

import { fmt } from './rates.js';
import { tg } from './telegram.js';

const DOWN_AFTER_MS = 15 * 60_000;
const STALE_AFTER_MS = 24 * 60 * 60_000;

/** { lastOkAt, lastChangeAt, failingSince, lastError, downNotified, staleNotified } */
export async function getStatus(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'source_status'").first();
  return row ? JSON.parse(row.value) : {};
}

async function saveStatus(env, status) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('source_status', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify(status)).run();
}

export async function getAdmin(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_chat_id'").first();
  return row ? Number(row.value) : null;
}

export async function setAdmin(env, chatId) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('admin_chat_id', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(String(chatId)).run();
}

/** The code the owner sends as "/admin <code>"; derived from the bot token, so only its holder can know it. */
export async function adminCode(botToken) {
  const data = new TextEncoder().encode(`shkad-admin:${botToken}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest.slice(0, 5)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function notifyAdmin(env, text) {
  if (!env.BOT_TOKEN) return;
  const admin = await getAdmin(env);
  if (!admin) return;
  try {
    await tg(env, 'sendMessage', { chat_id: admin, text });
  } catch (err) {
    console.error('admin notify failed:', err.message);
  }
}

/** A good fetch. `changed` is true if any market's price differs from the last recorded one. */
export async function sourceOk(env, changed, now = Date.now()) {
  const s = await getStatus(env);
  const wasDown = s.downNotified;
  const outageMinutes = s.failingSince ? Math.round((now - s.failingSince) / 60_000) : 0;

  s.lastOkAt = now;
  s.failingSince = null;
  s.lastError = null;
  s.downNotified = false;
  if (changed || !s.lastChangeAt) {
    s.lastChangeAt = now;
    s.staleNotified = false;
  }

  const staleFor = now - s.lastChangeAt;
  const notifyStale = staleFor >= STALE_AFTER_MS && !s.staleNotified;
  if (notifyStale) s.staleNotified = true;
  await saveStatus(env, s);

  if (wasDown) await notifyAdmin(env, `✅ مصدر الأسعار عاد للعمل بعد توقف دام ${outageMinutes} دقيقة.`);
  if (notifyStale) {
    await notifyAdmin(env, `⚠️ الأسعار لم تتغيّر منذ ${Math.round(staleFor / 3_600_000)} ساعة. قد يكون المصدر عالقًا — تحقّق من iraqborsa.com.`);
  }
}

export async function sourceFailed(env, err, now = Date.now()) {
  const s = await getStatus(env);
  s.failingSince ??= now;
  s.lastError = String(err?.message ?? err).slice(0, 200);
  const notifyDown = now - s.failingSince >= DOWN_AFTER_MS && !s.downNotified;
  if (notifyDown) s.downNotified = true;
  await saveStatus(env, s);

  if (notifyDown) {
    await notifyAdmin(env, `🚨 مصدر الأسعار (iraqborsa.com) لا يعمل منذ ${Math.round((now - s.failingSince) / 60_000)} دقيقة.\nالخطأ: ${s.lastError}\nالتطبيق يُظهر تحذيرًا للمستخدمين.`);
  }
}

/** Text for the owner's /status command. */
export async function statusText(env, now = Date.now()) {
  const s = await getStatus(env);
  const ago = t => {
    if (!t) return 'غير معروف';
    const minutes = Math.round((now - t) / 60_000);
    return minutes < 1 ? 'الآن' : `قبل ${fmt(minutes)} دقيقة`;
  };
  return [
    '📡 حالة مصدر الأسعار',
    s.failingSince ? `🚨 متوقف منذ ${ago(s.failingSince)}\nالخطأ: ${s.lastError}` : '✅ يعمل',
    `آخر جلب ناجح: ${ago(s.lastOkAt)}`,
    `آخر تغيّر في الأسعار: ${ago(s.lastChangeAt)}`,
  ].join('\n');
}

/** Public, for the app's stale-data warning. */
export async function publicStatus(env) {
  const { lastOkAt = null, lastChangeAt = null, failingSince = null } = await getStatus(env);
  return { lastOkAt, lastChangeAt, failingSince };
}
