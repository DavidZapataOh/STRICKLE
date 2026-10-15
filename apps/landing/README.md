# Strickle — landing

**Irregular income. Regular life.**

Strickle is an AI agent for global freelancers. Every payment that comes in is struck level: taxes, a cushion and goals are set aside in boxes, and you get the same salary on the same day each month. This app is the marketing site; every call to action leads to the Strickle app (`https://app.strickle.money`).

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack) with React 19 and TypeScript
- Tailwind CSS v4
- GSAP + ScrollTrigger for the hero arrival and the pinned "how it works" sequence
- Fonts via `next/font`: Bricolage Grotesque (display), Manrope (text), Geist Mono (figures)

## Getting started

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Visitors to `/` are redirected to their language based on `Accept-Language`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run test:responsive` | Check every route at every required viewport: text ≥ 12 px, no horizontal overflow, centered content |
| `npm run test:copy` | Check the copy against the brand's word budget and banned phrases, in every language |

## Languages

| Route | Language |
| --- | --- |
| `/en` | English (default) |
| `/es` | Neutral Latin American Spanish |
| `/pt-br` | Brazilian Portuguese |

All copy lives in `src/i18n/dictionaries/*.json`. Locale detection and the redirect are in `src/proxy.ts`.

## Structure

```
src/
  app/[lang]/        layout and page for each locale
  components/        one component per section
    Hero.tsx         headline and the "pour and level" mechanism drawing
    Sequence.tsx     pinned four-act sequence: uneven income → struck level → boxes → payday
    Simulator.tsx    "Try your amount": enter a payment, get a leveled receipt
    Bento.tsx        features: certificate, pause, receipts, taxes, private boxes, mirror mode, guarantee
    Close.tsx        closing section and footer
  i18n/              locale config and dictionaries
  lib/design.ts      design helpers (drawing units, money formatting, app URL)
scripts/
  word-budget.mjs    copy checks used by `test:copy`
```

## Responsive system

Layouts are fluid and mobile-first; nothing is a fixed-width canvas scaled to the window.

- Type sizes are `clamp()` tokens in `src/app/globals.css` (`--fs-*`), with legible minimums. No text renders below 12px at any width.
- Page content sits in `.wrap`, which caps the width and keeps it centered on large screens.
- Illustrations (the hero mechanism, the sequence chart) are `.drawing` containers. They scale with their own container (`cqw`) and their labels have minimum sizes.
- Check every change across the full width range, at least 320, 390, 768, 1024, 1280, 1440, 1920 and 2560px, plus a short laptop (1280×720) and a landscape phone.

## Motion and accessibility

- All animation respects `prefers-reduced-motion`. With reduced motion the sequence is stepped with buttons instead of being pinned to scroll.
- Without JavaScript the sequence renders its final state.
- Interactive controls work from the keyboard, and option groups follow the radio-group pattern.
- Touch targets are at least 44px.
- Screen readers get a text summary of the sequence chart.

## Notes

Figures on the page are illustrative examples. Tax rates in the simulator are rough estimates per country, not tax advice.
