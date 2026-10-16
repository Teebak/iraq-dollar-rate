# Design

Recorded from the built app (src/app/app.html, app.scss, src/styles.scss).

## World
Each market (Baghdad, Erbil, Basra) is a card in a horizontal, snap-scrolling rail, topped by a short photo strip of the city. The active city's photo, blurred and darkened, is the full-screen backdrop, and its tint colours every control. Glass has one job: let that photo show through.

## Tokens (src/styles.scss)
| Token | Value | Use |
|---|---|---|
| `--ink` | `#0b0f14` | Ground; Telegram header/background/bottom bar; text on tinted fills |
| `--text` | white 96% | Primary text |
| `--text-2` | white 70% | Secondary text, hints, inactive controls |
| `--edge` | white 14% | Glass edges, dividers, chart grid |
| `--up` / `--down` | `#7ee2a8` / `#ff9a9a` | Price change only |
| `--tint` | per city, registered `@property` | Accent; animates 0.7s when the active city changes |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | All motion |

City tints are sampled from each photo, set in `src/app/cities.ts`: Baghdad `#7fd0de`, Erbil `#e2bd7f`, Basra `#a4bde8`.

## Materials
- `.glass`: white 7%, blur 20px, saturate 160%, 1px `--edge`. Used for top-bar controls and panels.
- `.glass-strong`: ink 46%, blur 18px, saturate 170%, 1px white 16%. Used for the quote panel on photos and for the toast.
- Glass surfaces never carry drop shadows. Only city cards have one soft shadow (offset 18px, blur 40px).

## Type
Readex Pro (Google Fonts, 300–700), which covers Arabic and Latin. Prices use `tabular-nums` and are always set LTR inside RTL text, via `dir="ltr"` / `<bdi>`.
Sizes: city name 40/700; quote value `clamp(22px, 6.6vw, 30px)`/700; converter input 34/600; result 28/700; panel headings 15/600; body 14; hints 11.5–13.

## Shape
Cards and panels use a 16px radius, the quote panel 14px, and controls 12px (segment buttons 9px). Pills (999px) are used only for the city switcher.

## Components
- **City card**: full rail width (16px page gutters, border-box), sized by its content. The card body is `.glass-strong`. A 136px photo strip sits on top, with its framing set per city by `photoFocus` (object-position) in `cities.ts`, a ±32px parallax as you swipe, and the city name bottom-start (32/700). Any required photo credit is a small chip top-end. Below the strip are two columns, بيع | شراء. Each shows a short title in the card tint, the per-$1 price (`clamp(32px, 10vw, 42px)`/700, rolling), a chip (ثابت when steady, otherwise a signed per-$1 change in up/down colour), and the line "100 دولار = 167,250 د.ع" (12px, `--text-2`). Inactive neighbours sit at opacity 0.5.
- **Alert sheet**: a 🔔 glass button (40px, 12px radius) sits bottom-end on each card's photo strip and opens a bottom sheet (ink 92% glass, 20px top radius, slides up): sell/buy segmented control, current price, a target field in the same boxed style as the converter, four quick-pick chips (±5, ±10), a full-width `--tint` create button, a success/error message in up/down colours, and the user's alerts across all cities with delete buttons. Outside Telegram it explains alerts need Telegram and links to the Mini App.
- **City switcher**: text pills; the active one is filled with `--tint` and uses `--ink` text.
- **Converter**: a segmented "I have dollars / I have dinars" control; a labelled amount field drawn as a filled, outlined box (white 6%, 1.5px white-22% border, 12px radius) with a pencil icon, whose border turns `--tint` with a 3px tint ring on focus; and the result in `--tint`. It uses the buy rate when you have dollars and the sell rate when you have dinars.
- **Trend**: shared server history (`/api/history`) with a 24h / week / month switch (small segmented control in the panel header). Step lines (sell solid `--tint`, buy dashed `--text-2`) over a soft area fill, High above and Low below, legend underneath, and a note with when recording started while the history is shorter than the range.
- **Icons**: Lucide geometry, 2px stroke (`icon.component.ts`). No emoji or Unicode glyphs in the UI.

## Motion
- **Swipe**: the backdrop cross-fades over 0.9s, `--tint` transitions, and the photo parallax follows the scroll. Each new city triggers a selection haptic.
- **Price change**: numbers roll over 700ms (ease-out-quart), a light sweep passes over the quote panel, and Telegram plays a warning haptic.
- **Entrance**: cards rise 14px with a 60ms stagger. Content stays visible from the first frame.
- **Reduced motion**: when the device asks for it, all of the above collapses to 1ms.

## Footer
A public-prices disclaimer (information only, not an offer or financial advice, shop prices may differ) above the source link, both 11px `--text-2`.

## Telegram integration
- Sharing draws a 1080×1080 rate card on the device (`src/app/rate-card.ts`: city photo under an ink fade, brand and date, city name 120/700, sell | buy at 128/700 with tint labels and the 100 USD line, `@ShkadDollarBot` footer) and opens Telegram's share sheet (`shareMessage`, Bot API 8.0+), falling back to the device share sheet, then a text share. The button is the app's own fixed bottom button (`--tint` fill, share icon, 52px, 14px radius) over an ink fade, because Telegram's native main button can't show an icon.
- Telegram's header, background and bottom bar are painted `--ink`.
- Vertical swipe-to-close is disabled.
