# Strickle app

The Strickle web app: a mobile-first Next.js app (App Router, React 19, Tailwind 4) that reflows to a side menu on large screens. It is served at https://app.strickle.xyz and is where every call to action of the landing leads.

## Layout

- `src/app/[lang]` holds the routes (`/`, `/activity`, `/boxes`, `/settings`, `/verify`, `/docs`) in `en`, `es` and `pt-br`. `src/proxy.ts` redirects a visit without a locale to the language in the `lang` query parameter, then to `Accept-Language`, keeping the query string the landing sends.
- `src/ui` holds the primitives (Amount, Button, Chip, Card, ListRow, EmptyState, AppShell).
- `src/i18n` holds the dictionaries; a test keeps the three languages in step.
- The palette, the locale helpers and the money and date formatting come from `@strickle/design`, shared with the landing.

## Scripts

- `npm run dev -w app` serves on port 3200.
- `npm test -w app` runs the offline unit and node tests; `npm run test:responsive -w app` runs the responsive gate at ten viewports; `npm run test:perf -w app` runs the Lighthouse budgets. All three run in CI.
- `npm run test:live -w app` and `npm run test:e2e:live -w app` run the tests that touch the network and are never part of the default run.

## Deployment

Vercel project `strickle-app` (repository root, Root Directory `apps/app`, Node 24, deploys on every push to `main`). The domain `app.strickle.xyz` is a CNAME at the registrar to the value Vercel reports for the project (`GET /v6/domains/app.strickle.xyz/config`, `recommendedCNAME`).

Verified on the live deployment: `/en` answers 200; `/?amount=3200&country=CO&goal=salary&lang=es` redirects to `/es?amount=3200&country=CO&goal=salary&lang=es`; `/es/verify`, `/en/docs`, `/pt-br/boxes` and `/en/settings` answer 200; the security headers are present; the landing's buttons lead here.

## Passkeys

Passkey wallets need the app's domain allowed for the Circle Modular Wallets client key. The key lives in the environment (`NEXT_PUBLIC_CIRCLE_CLIENT_KEY`), never in the repository.
