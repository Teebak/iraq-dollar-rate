# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Everyday people in Iraq checking the street (parallel-market) USD→IQD rate inside Telegram before exchanging cash, sending money, or making a purchase. Quick glances on a phone; big, unambiguous numbers matter more than density.

## Product Purpose
A Telegram Mini App that shows live buy/sell dollar prices for Baghdad, Erbil and Basra, refreshed automatically, with a converter. Success: a user opens it, sees the price for their city in under two seconds, and trusts it is current.

## Capabilities and Constraints
- Data source: `https://iraqborsa.com/borsa-api/summary.php` (keys `b` Baghdad, `n` North → shown as Erbil, `s` South → shown as Basra). Provides current and previous sell/buy only; no history. The API sends no CORS headers, so it is reached via a proxy.
- "Live" = polling every 15 s while visible.
- Price history is recorded by the Worker's 5-minute cron into D1 (on change, at least hourly; kept 90 days) and shared by all users. It starts from when recording began, is not official history, and the app says when recording started.
- Share rate to a Telegram chat via `t.me/share/url`.
- Price alerts (any city, sell or buy) are sent by the bot; set in the app or with /alert. A daily summary goes to /subscribe users.
- Source health is monitored; when iraqborsa.com fails for 10+ minutes the app warns that prices may be stale, and the owner is messaged.
- Arabic (RTL) is the default language; English is available.

## Brand Commitments
- User-pinned aesthetic: modern, glass (frosted, translucent) surfaces.
- Swipeable city cards with real photos of each city.

## Evidence on Hand
- City photos: Wikimedia Commons, freely licensed, credited in-app (`public/cities/CREDITS.md`).
- No testimonials, sources beyond iraqborsa.com, or official central-bank rates; do not invent them.

## Product Principles
1. The current price for the chosen city is the hero; everything else is secondary.
2. Freshness is visible: the user always knows when the price last updated.
3. Never imply precision or history the data does not have.
4. Native Telegram affordances (main button, haptics, theme) over web imitations.
