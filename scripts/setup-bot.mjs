#!/usr/bin/env node
// One-time (re-runnable) setup for @ShkadDollarBot. Run from tg-mini-app/:
//   npm run setup-bot
// It asks for the bot token without echoing it, then:
//   1. stores it as the Worker's encrypted BOT_TOKEN secret (via wrangler),
//   2. points the bot's webhook at the Worker,
//   3. sets the menu button, descriptions and /start command.
// The token is never written to disk or printed.

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { webhookSecret } from '../worker/telegram-secret.js';
import { adminCode } from '../worker/monitor.js';

const APP_ORIGIN = process.argv[2] ?? 'https://iraq-dollar-rate.launchpad-apps.workers.dev';

// Plain text: Telegram shows bot descriptions without formatting (no bold). Max 512 characters.
const DESCRIPTION = [
  'شكد الدولار؟ 💵',
  '',
  'سعر البيع والشراء مباشر في بغداد وأربيل والبصرة، مع حاسبة عملات ومشاركة السعر بضغطة واحدة. 📤',
].join('\n');
const SHORT_DESCRIPTION = 'شكد الدولار؟ سعر البيع والشراء مباشر في بغداد وأربيل والبصرة 💵';

async function main() {
  const token = process.env.BOT_TOKEN || (await askHidden('Bot token from @BotFather (input hidden): '));
  if (!/^\d+:[\w-]{30,}$/.test(token)) fail('That does not look like a bot token.');

  const me = await tg(token, 'getMe');
  console.log(`✓ Token works for @${me.username}`);

  await putWorkerSecret(token);
  console.log('✓ Saved as the Worker secret BOT_TOKEN');

  await tg(token, 'setWebhook', {
    url: `${APP_ORIGIN}/telegram/webhook`,
    secret_token: await webhookSecret(token),
    allowed_updates: ['message', 'callback_query', 'inline_query'],
    drop_pending_updates: true,
  });
  console.log('✓ Webhook set');

  await tg(token, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'الأسعار', web_app: { url: `${APP_ORIGIN}/` } },
  });
  await tg(token, 'setMyDescription', { description: DESCRIPTION });
  await tg(token, 'setMyShortDescription', { short_description: SHORT_DESCRIPTION });
  await tg(token, 'setMyCommands', {
    commands: [
      { command: 'start', description: 'سعر الدولار الآن' },
      { command: 'alert', description: 'نبّهني عند سعر معيّن في بغداد' },
      { command: 'alerts', description: 'تنبيهاتي' },
      { command: 'subscribe', description: 'ملخص يومي للأسعار' },
      { command: 'unsubscribe', description: 'إلغاء الملخص اليومي' },
    ],
  });
  console.log('✓ Menu button, descriptions and commands set');

  console.log(`\nDone. Open https://t.me/${me.username} and press Start.`);
  console.log('For sharing from any chat, also send /setinline to @BotFather once (placeholder: اكتب مبلغًا أو اختر مدينة).');
  console.log(`To get source-outage alerts, send this to your bot from your own account: /admin ${await adminCode(token)}`);
}

async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) fail(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result;
}

function putWorkerSecret(token) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'secret', 'put', 'BOT_TOKEN'], { stdio: ['pipe', 'ignore', 'inherit'] });
    child.stdin.end(token);
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`wrangler exited with ${code}`))));
  });
}

function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, answer => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

main().catch(err => fail(err.message));
