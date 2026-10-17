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
- `tests/live/pay.live.test.ts` and `tests/live/pay.live.spec.ts` pay a real invoice on Arc testnet with a Memo from the shared deployer key (`PRIVATE_KEY`). They run only with `RUN_PAY_LIVE=1`; the browser one also needs `RUN_LIVE=1` and the Circle client key.
- `tests/live/card.live.spec.ts` mints a real sandbox card session and loads the hosted widget under the payer page's headers. It needs `RUN_LIVE=1`, `ONRAMP_API_KEY`, `ONRAMP_REFERRER_DOMAIN`, `DATABASE_URL` and `INVOICE_SECRET`, and runs with `npx playwright test --config playwright.live.config.ts card.live.spec.ts`. Completing a purchase inside the widget is a manual step (`HEADED=1`).
- `tests/integration/pay-perf.test.ts` starts the production build, so run `npm run build -w app` before `npm run test:integration -w app`.
- `tests/live/deposit.live.test.ts` and `tests/live/deposit.live.spec.ts` send real testnet USDC from Avalanche Fuji and Base Sepolia into a vault. They are skipped unless `DEPOSIT_TEST_KEY` (a throwaway key funded from faucet.circle.com with USDC and native gas on both chains) and, for the API-level one, `DATABASE_URL` are set; the browser one also needs `RUN_LIVE=1` and the Circle client key.

## Deployment

Vercel project `strickle-app` (repository root, Root Directory `apps/app`, Node 24, deploys on every push to `main`). The domain `app.strickle.xyz` is a CNAME at the registrar to the value Vercel reports for the project (`GET /v6/domains/app.strickle.xyz/config`, `recommendedCNAME`).

Verified on the live deployment: `/en` answers 200; `/?amount=3200&country=CO&goal=salary&lang=es` redirects to `/es?amount=3200&country=CO&goal=salary&lang=es`; `/es/verify`, `/en/docs`, `/pt-br/boxes` and `/en/settings` answer 200; the security headers are present; the landing's buttons lead here.

## Passkeys

Passkey wallets need the app's domain allowed for the Circle Modular Wallets client key. The key lives in the environment (`NEXT_PUBLIC_CIRCLE_CLIENT_KEY`), never in the repository.

## Onboarding on testnet

Proven end to end on Arc testnet with a Chromium virtual passkey (`npm run test:e2e:live -w app`, Playwright headless Chromium, the default viewport): a brand-new user walks the wizard, creates a passkey, sees the recovery code **before** anything is sent and types two groups back, and ends with their vault created, the salary payee approved, the agent delegated and registered, and the sealed profile submitted, all in **one sponsored batch of five calls** signed with the passkey.

- Account `0x4ec30E719B6a50Bb229a3911822Ea67FC9CC3514` ([explorer](https://explorer.testnet.arc.io/address/0x4ec30E719B6a50Bb229a3911822Ea67FC9CC3514)), vault `0x339b096EFf707b37978140f63530e2Bbc32e6D2b` ([explorer](https://explorer.testnet.arc.io/address/0x339b096EFf707b37978140f63530e2Bbc32e6D2b)), creation transaction `0x6ff5820c6a64f5c89d70f7f9542e8bc83f27c3c978225e652f895838e398aa2f`.
- The whole run, from the first page to the restored key, took 16 seconds.
- The notice key sits wrapped in IndexedDB (the wrapped bytes do not contain the secret); after wiping the storage, signing in with the passkey offers the restore form and the recovery code brings the key back.
- The one-day wait is real: the salary payee's approval takes effect exactly 86,400 seconds after the vault's creation block (`approvedFrom` 1792219909, block timestamp 1792133509), which is what the review and the final screens tell the user.
- Not yet proven: that the enclave opens the delivered profile. The CRE workflow is paused between proofs and activating it is an action on a shared resource, so that check (`EXPECT_ENCLAVE=1`, `apps/app/scripts/read-state.mjs`) runs with the next activation. What a cancelled passkey prompt throws in a real browser was not recorded either; the app treats `NotAllowedError` and `AbortError` as a cancellation.
- Found by running it live: the content security policy of the first version blocked the browser's calls to Circle's wallet service and to the RPC endpoint (`Failed to fetch`); the policy now takes both origins from the network configuration.

## Agent relay

`POST /api/agent-action` receives an envelope that the browser already sealed to the enclave and signed with the passkey, checks what it can check without reading it, and forwards it to the Chainlink CRE gateway. The gateway key never reaches the browser.

Server environment (none of these is `NEXT_PUBLIC_`, none appears in a response or a log):

- `CRE_GATEWAY_KEY`: the private key whose address is `gatewayAddress` in `workflows/agent/config.production.json`.
- `CRE_GATEWAY_URL`: the gateway endpoint (`https://01.gateway.zone-a.cre.chain.link` for the current zone).
- `CRE_WORKFLOW_ID`: the deployed workflow's ID. It changes at every `cre workflow deploy` and must equal `AgentExecutor.expectedWorkflowId()`; the relay refuses to run when it does not.
- `DATABASE_URL`: a Postgres with the migrations applied. The per-address and per-vault limits live there, so they hold across instances. Without it the relay answers 503, and a database outage closes it instead of opening it.
- `RELAY_IP_PEPPER`: a random string; client addresses are stored only as a keyed hash.

`node --env-file=/Users/david/tameion/.env apps/app/scripts/check-relay-config.mjs` checks all of this against the chain and the database. Run it after every workflow redeploy.

The gateway lets one request per 30 seconds through per workflow, shared by every user, so the relay admits one accepted request per vault and one per workflow in that interval and tells the caller how long to wait. Fairness between users is first come, first served; a real queue is a launch decision.

## Activity on testnet

The Activity tab shows the agent's receipts (read from the vault's and the executor's events through the cached `/api/logs` route, with the private payment's public amount read from its own transaction receipt), the proposals waiting for the user (sealed notices opened with the notice key on this device, each one re-checked against its own digest) and lets the user approve or reject with their passkey. Approving signs the exact request with the smart account (ERC-1271), seals it to the enclave and sends it through the relay. Only a decision notice on chain confirms an action: the relay and the gateway only say that a request was taken.

The live proof takes two sittings a day apart (a new payee approval applies after a day), so it needs the shared workflow to be active and a proof vault with funds. It is never part of a default run:

1. `node --env-file=/Users/david/tameion/.env apps/app/scripts/activity-live-prepare.mjs` reports what is missing (relay variables, database, workflow binding, the five-minute daily schedule).
2. Day one: `RUN_LIVE=1 LIVE_PHASE=onboard npm run test:e2e:live -w app`, then `node --env-file=/Users/david/tameion/.env apps/app/scripts/activity-live-fund.mjs <vault>` to send the proof vault 2 USDC from the shared wallet. Both the funding and activating the workflow need the owner's go-ahead.
3. On the payday set in step 2 (tomorrow's day of the month): `RUN_LIVE=1 LIVE_PHASE=approve npm run test:e2e:live -w app`. It waits for the agent's proposal, approves it with the replayed passkey, waits for the decision and the salary receipt, checks the relay's refusals and saves screenshots at ten viewports.

## Pause, settings and the accountant's view

- **Pause** is in the header of every screen once this device has an account. It is an owner transaction on the vault (`pauseAgent`, `resumeAgent`), so it works when the workflow is down. While the vault is paused the executor refuses every report for it, so the agent's own settings (how much it decides, salary, cushion) are shown but disabled with the reason; the vault's own limits, box rules and recipients stay editable. A private payment the owner signs still goes through while paused, and the screen says so.
- **Settings** separates three kinds of change: owner transactions on the vault (cap and window, which apply at once; box rules, where a stricter rule applies now and a looser one waits at least a day and is applied by the owner afterwards; recipient approvals, which wait), signed `adjust` requests to the agent (confirmed only by the fresh `plan` notice the enclave publishes after applying them), and reads. A change that is not confirmed is never shown as saved.
- **`/view/<vault>`** is a public, `noindex` page of what anyone can read about a vault on the network. **`/accountant`** lets an accountant create or import a view key that stays in this browser and read only the section the pool sealed for the accountant tier.

The live proof (`tests/live/settings.live.spec.ts`, `tests/live/accountant.live.spec.ts`, with `RUN_LIVE=1`) needs the shared workflow redeployed and active, funds from the shared test wallet and one shielded note made with the shared deployer key, so it runs only with the owner's go-ahead:

1. `NEXT_PUBLIC_CIRCLE_CLIENT_KEY` and the relay variables set as in the agent relay section.
2. `RUN_LIVE=1 npm run test:e2e:live -w app -- tests/live/settings.live.spec.ts` onboards a new passkey account, pauses it and checks on the chain that a deposit stays unsplit and that the executor reverts with `NotDelegated()`, edits the cap while paused and checks it stays paused, resumes, confirms a settings change by the agent's own plan, and checks that a stricter rule applies now while a looser one waits. It saves screenshots at ten viewports under `test-results/live/`.
3. `RUN_LIVE=1 npm run test:e2e:live -w app -- tests/live/accountant.live.spec.ts` shields one real USDC sealed for a new accountant key and checks that this key sees exactly that note and a different key sees none.

Not run in the same sitting: applying the looser rule after its day, and a pause while the paymaster's quota is spent (the fallback is covered by `tests/settings-send.test.ts` and the arc passkey live suite).

## Early access, the capability gate and the numbers

- **Access.** `ACCESS_MODE` is `open`, `invite` or `closed`; on mainnet it must be set explicitly. In `invite` mode every page and API route needs a session cookie except the public set (`access`, `closed`, `unavailable`, `verify`, `docs`, `metrics`, `view`, `accountant` and the `/api/access`, `/api/metrics`, `/api/logs`, `/api/pool-notes` routes); in `closed` mode pages go to the maintenance page and every other API route, the agent relay included, answers 503. An invitation code is stored only as a hash, redeems once, and its session can be revoked; the gate fails closed when the session store cannot be reached. Variables: `ACCESS_MODE`, `ACCESS_COOKIE_SECRET` (at least 32 characters), `RELAY_IP_PEPPER`, `DATABASE_URL`.
- **The wave.** The ceilings, tranches, holds and the team's share of seats live in `src/config/early-access.json`; `npm run wave -w app -- <command>` (see `docs/mainnet-runbook.md`) opens tranches, issues invitations whose codes go to a file and never to the terminal, and records incidents. Testnet has no limits and no money guarantee; the policy applies to mainnet.
- **The capability gate.** The agent runs on Chainlink CRE, which lists Arc testnet only, so on mainnet there is no agent. `agentMode(network)` is `cre-testnet` on testnet and `none` on mainnet; with `none` the app's own screens answer one honest page and the agent-dependent parts of the public pages show a one-line reason instead of a dead control. `deploymentsFor()` returns the core contracts and `agentDeploymentsFor()` the agent's, and throws where there is none.
- **Metrics.** `npm run record-metrics -w app -- <testnet|mainnet>` records a snapshot of what the chain says (vaults, held and split amounts, the team's share, what is not measured) from the previous snapshot onward; `/api/metrics` and `/metrics` serve the latest one. The team is the addresses in `src/config/team.json` plus whoever received USDC or EURC directly from them.
- **Database.** `npm run migrate -w @strickle/db` and `npm run db:ping -w @strickle/db` take their target from `DATABASE_URL_DIRECT` or `DATABASE_URL`, print the host and refuse a remote database until `--confirm-host=<host>` repeats it. The Vercel functions run in `iad1`, next to Neon's `aws-us-east-1`.
- **Preflight.** `node --env-file=<env file> scripts/mainnet-preflight.mjs mainnet before-deploy` (from the repository root) prints one line per check. It stays red on the agent line until an agent can run on mainnet, and a check a machine cannot make stays red until the owner records an approval with their own words (`npm run approve -- <id>` in a terminal).
