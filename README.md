# شكد الدولار؟ — Iraq dollar rate

Telegram Mini App and bot ([@ShkadDollarBot](https://t.me/ShkadDollarBot)) showing live USD → IQD
buy/sell prices for Baghdad, Erbil and Basra, with a converter, sharing, price alerts and a daily summary.
Arabic (RTL) by default, English available. Prices come from iraqborsa.com's public summary.

Live: https://iraq-dollar-rate.launchpad-apps.workers.dev · Mini App: https://t.me/ShkadDollarBot/rates

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Mini App | `src/` (Angular 20) | City cards, converter, trend chart, share button |
| Worker | `worker/` (Cloudflare) | Serves the app, proxies the rates API (no CORS upstream), handles the bot webhook |
| Bot jobs | `worker/bot.js` + cron in `wrangler.jsonc` | Price alerts every 5 min, daily summary 10:00 Baghdad time |
| Database | Cloudflare D1, schema in `migrations/` | Alerts, subscribers, de-duplication of Telegram updates |
| Bot setup | `scripts/setup-bot.mjs` | Stores the bot token as a Worker secret, sets webhook, menu, descriptions, commands |

Design notes: `DESIGN.md`. Product notes: `PRODUCT.md`.

## Develop

```bash
npm install
npm start            # http://localhost:4200, rates proxied by proxy.conf.json
npm test
npm run cf:dev       # build + run the real Worker locally (wrangler dev)
```

## Deploy

```bash
npx wrangler login                                        # once
npx wrangler d1 migrations apply iraq-dollar-rate-db --remote   # after adding a migration
npm run deploy                                            # build + upload app and Worker
npm run setup-bot                                         # once, or after changing commands/descriptions
```

The bot token is only ever typed into `npm run setup-bot` (hidden prompt) and stored as the Worker secret
`BOT_TOKEN`. It is never committed.
