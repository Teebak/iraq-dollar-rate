// Shared by the Worker and scripts/setup-bot.mjs.
// The webhook secret is derived from the bot token, so the token is the only secret to manage:
// Telegram sends it back in X-Telegram-Bot-Api-Secret-Token on every update, proving the request is genuine.
export async function webhookSecret(botToken) {
  const data = new TextEncoder().encode(`shkad-webhook:${botToken}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
