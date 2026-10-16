// Minimal Telegram Bot API client. TELEGRAM_API can point at a mock server for local testing.

export class TelegramError extends Error {
  constructor(method, status, description) {
    super(`${method}: ${status} ${description}`);
    this.status = status;
  }
}

export async function tg(env, method, body) {
  const base = env.TELEGRAM_API || 'https://api.telegram.org';
  const res = await fetch(`${base}/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new TelegramError(method, data.error_code ?? res.status, data.description ?? '');
  return data.result;
}

/** 403 means the user blocked the bot or deleted their account: stop messaging them. */
export const isGone = err => err instanceof TelegramError && err.status === 403;

export function openAppKeyboard(appUrl, extraRows = []) {
  return { inline_keyboard: [...extraRows, [{ text: 'افتح الأسعار 💵', web_app: { url: appUrl } }]] };
}
