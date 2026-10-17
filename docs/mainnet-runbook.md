# Mainnet runbook

## What Strickle can and cannot do

Strickle cannot move or freeze the funds in a user's vault. Only the vault's owner can withdraw, and any agent role is bounded by the vault's own caps, approved recipients and floors. Strickle can close the app, stop issuing invitations, revoke invitations and sessions, freeze the advance of the wave, and stop an agent service if one exists. Circle, the issuer of USDC, can freeze USDC. The private pool is off on mainnet: its contract has not been audited, and the deploy script refuses to put it there.

## Before you start

```bash
npm run probe -w @strickle/arc -- mainnet
```

## Close the app

Set `ACCESS_MODE=closed` in the app's environment and redeploy. Pages show the maintenance page and every API route answers 503, including the agent relay.

## The wave

The ceilings, the tranches, the holds between them and the team's share of seats live in `apps/app/src/config/early-access.json`; the owner confirms that file's digest before anything opens. Every command prints the database it runs against first.

```bash
npm run wave -w app -- status
npm run wave -w app -- open
npm run wave -w app -- invite "wave 1" 3
npm run wave -w app -- next /path/to/waitlist.json
npm run wave -w app -- advance
npm run wave -w app -- incident
npm run wave -w app -- resolve
npm run wave -w app -- revoke "wave 1"
```

`open` starts tranche 1. `invite` refuses more people than the open tranche has seats, refuses the team's seats beyond its share (a team seat is an invitation whose label starts with `team`) and writes the codes to a file in `INVITE_CODES_DIR`, never to the terminal. `next` lists, in order of arrival, who to invite from a waitlist file. `advance` opens the next tranche only when the open one has run its hold without an unresolved incident. `incident` freezes both advancing and new invitations until `resolve`; after `resolve` the hold starts again from that moment. `revoke` ends the sessions issued from one label.

## Check the database

```bash
npm run migrate -w @strickle/db
npm run db:ping -w @strickle/db
```

`migrate` prints the target host and refuses a remote one until you repeat it with `--confirm-host=<host>`. `db:ping` shows whether the app's connection is the pooled one and how long a round trip takes.

## Look at the numbers

```bash
npm run record-metrics -w app -- mainnet
```

records a snapshot from the last one onward (`--rebuild` rereads everything, which is needed after the team list changes). The team is the listed addresses plus whoever received USDC or EURC directly from them. `/api/metrics` and the metrics page show the latest snapshot and name what is not measured.

## Deposit route

`/[lang]/deposit` and `/api/deposits` let a person bring USDC from another chain into their vault through Circle's CCTP with the forwarding service. What they depend on:

- Circle's Iris API reachable (`iris-api-sandbox.circle.com` on testnet, `iris-api.circle.com` on mainnet). The route reads the burn message from it and never trusts the browser's claim about a burn.
- The pinned `@circle-fin/bridge-kit` and `@circle-fin/adapter-viem-v2` versions in `packages/arc/package.json`; a bump needs the quote tests and the funded live proof again.
- The source-chain endpoints in `packages/arc/src/bridge/chains.ts` (the page's policy allows exactly these origins on this route and no others).
- Circle's forwarding fee, which the quote shows before the person confirms, and the fast-transfer allowance: when it is exhausted Circle delivers a fast request as a standard transfer, and the screen says so afterwards.
- `DATABASE_URL` (the deposit records and the per-address and per-vault limits) and `RELAY_IP_PEPPER`. Without either the routes answer 503.

The route is served only where an agent runs: on a network without one the page answers the unavailable screen, and `/api/deposits` is closed by the same access rules as the rest of the app. The funded live proof (`DEPOSIT_TEST_KEY`, see the app README) is not part of any default run.

## USDT deposits

A person holding USDT on Ethereum, Base, Arbitrum, Optimism, Polygon or Avalanche can convert it to USDC and carry it to their vault in one confirmation. How it works and what it depends on:

- Circle's Swap Kit converts on the source chain. Its swap service routes through LI.FI, a third party chosen by Circle, not by Strickle; the quote names the route. The converted USDC goes only to the signer's own wallet, and the forwarded CCTP transfer then carries what the swap really delivered to the vault.
- The quote shows the conversion fee, the network fee, the worst case (a stop limit of 0.5%) and every fee of the transfer. A conversion that costs more than 1% of the amount is refused.
- If the conversion succeeds but the transfer can no longer keep the quoted amount, the person keeps the USDC in their wallet, is told so, and can send it with one action. A reload finds the held USDC again by reading the wallet's balance.
- The USDT addresses per chain are in `packages/arc/src/bridge/chains.ts` and are checked against the swap service's own route by the keyless live test `usdt-quote.live.test.ts` (run by the `arc-live` job). Base uses a bridged USDT and Arbitrum's is USDT0.
- No swap quote exists on testnet, so the option never appears there, and the deposit screen is served only where an agent runs; until an agent runs on mainnet the path cannot be reached by a real user. The conversion has not been executed on mainnet: only its quotes are verified against the live service.
- Public copy does not mention USDT until an execution on mainnet has been proven.

## Payment links

A freelancer creates an invoice in `/[lang]/invoices` and shares a private link, `/[lang]/pay/<token>`. A client pays it in USDC on Arc (a call to the predeployed Memo contract that carries the invoice's reference), from another chain through the deposit flow bound to the link, or by sending USDC to the vault address, which the freelancer confirms by hand.

Dependencies and rules:

- The Memo contract (`0x5294E9927c3306DcBaDb03fe70b92e01cCede505` on Arc testnet) must be reachable. A Memo is only a claim: the server credits it when the same transaction holds a USDC transfer from the memo's sender whose call data matches the Memo's hash. A Circle passkey smart account cannot use Memo (the contract refuses it); such a payer is told to use the address.
- Arc's RPC must serve `getLogs` over the scan window (`maxBlocks` in `payment-deps.ts`); the live payment test prints what a 5,000- and a 50,000-block window return.
- `INVOICE_SECRET` (32 random bytes, base64) seals what a freelancer typed (label, payee name, note) and derives the link tokens. Generate it with `openssl rand -base64 32`, keep it in `.env`, and upload it to the Vercel project and to GitHub only through stdin, never on a command line. Rotating it is a migration, not a rotation: every issued link changes and every sealed text becomes unreadable.
- The payer's page reveals the payee name, label, note, amounts, status and vault address, never a client name or any client data. It is `noindex`, `no-store` and `no-referrer`, and an unknown or rotated token answers one uniform 404.
- A leaked link is closed from the invoices screen: "New link" kills the old URL, "Void" closes the invoice. Payments already on their way still credit (as extra once void). Neither action touches the payments already recorded.
- The page and its API stay reachable when access is `closed`: a client who received a link must still be able to pay, and a transfer to a vault cannot be refused on chain anyway.
- Invoices are denominated in USDC only.

## Card payments

A client can pay an invoice with a debit card, Apple Pay or Google Pay through Circle's hosted Onramp. The card option appears on the payer's page only when the server is configured for it; without configuration the page is exactly what it is without this option.

- **Environment follows the network.** Testnet uses Circle's sandbox (`api-test.circle.com`, widget `onramp-sandbox.arc.io`) and mainnet uses production (`api.circle.com`, `onramp.arc.io`). Nothing overrides it, and a key of the other environment is refused at startup (a `TEST_` key on mainnet, a `LIVE_` key on testnet).
- **Variables.** `ONRAMP_API_KEY` (server secret, `TEST_API_KEY:<id>:<secret>` in the sandbox) and `ONRAMP_REFERRER_DOMAIN` (the bare host that embeds the widget, `app.strickle.xyz`; the widget refuses any other host, so preview deployments cannot show it). They live in `/Users/david/tameion/.env` and in the Vercel project's production environment, uploaded through stdin. The pay page's headers (the frame and permission grants for the widget) are baked in at build time, so both variables must be present when the app is built. CI never mints a session and builds with made-up values.
- **Sandbox findings.** The sandbox accepted the normal Circle API key for Onramp (no separate kit key was needed). Its answer carries no `sessionId` field: the id is a claim of the session token, and the server reads it from there. The browser kit defaults to the production widget and refuses a sandbox session, so the page passes the configured widget origin to it. The session endpoint accepted `Arc_Testnet`, `ARC-TESTNET` and `arc` as chain strings; the widget's own asset scope (USDC on Arc only) is what limits what a buyer can choose. At load the widget embeds no frame other than its own origin; the provider's frames that appear during a purchase were not observed.
- **Settlement.** A purchase is credited by Circle's `onramp.deposit.settled` notification to `/api/webhooks/circle`: the signature is verified (ECDSA SHA-256 over the raw body, key fetched by id), the event is deduplicated, the transaction it names is read from Arc, and only the USDC the chain shows credited to the vault counts. A 403 means a bad or foreign signature; a 500 means a failure that may pass (the event is released and Circle retries); a 200 with `applied: "unresolved"` is stored and never credited (the freelancer's scan can still propose it). The notification's real shape is not documented: the parser fails closed and keeps the raw verified payload in `circle_webhook_events`.
- **Where no notification arrives.** The sandbox may not emit the settled event. A transfer into a vault with exactly one open card session is offered to the freelancer as a possible card payment and credited only when they confirm. With two sessions open nothing is guessed.
- **Fees.** The card service's fees come out of what the payer buys, so the invoice shows the amount that arrived, usually partial. No fee, limit or country is stated on the page because none is documented.
- **Launch checklist (production).** KYB approved; the production key (`LIVE_API_KEY:...`); a notification subscription for the production URL; `ONRAMP_REFERRER_DOMAIN` set to the production host; one real small purchase; the captured production notification compared with `apps/app/tests/fixtures/onramp/settled.json` (provisional until then). No public copy mentions card payments before that purchase has succeeded.

## Arrival classification

The agent reads each deposit as it arrives and decides whether it is income (taxes are set aside) or the person's own money (they are not). Everything else in the split is the same either way.

- **Evidence.** Money counts as not income only with affirmative evidence: a passkey-signed declaration ("this deposit is my own money", a size window and a two-hour expiry), or a return of money the vault sent out within the last 90 days. Anything else is income. An arrival that looks doubtful (an address the person marked as their own, a size ten times their usual, the same amount they sent out, a sender nobody can see) is still split as income and raises one notice, "check this deposit", that the person answers with one signature.
- **Who sent it.** The sender of a bridged or card deposit is Circle's contract, never the depositor, so it is never read as the person's own address. A declaration is matched by amount window and expiry only.
- **Windows.** Outflows are remembered for 180 days and matched for 90. The sealed state keeps the newest 12 outflows, 8 owner addresses, 4 declarations and 40 arrivals; when it grows past its budget the oldest arrivals go first, then the oldest history, never a declaration or a checkpoint.
- **Log window.** One run reads at most 50,000 blocks of transfers (the public Arc node returned 100,000 blocks in 241 ms and refused 200,000). A vault whose checkpoint is older than that reads only the newest window, and the older remainder is income flagged as unattributed: it is never lost and never blocks the vault. A transfer newer than about ten minutes that the balance read has not caught up with makes the run skip that vault until the next one.
- **Corrections.** "It was my own money" and "Undo" are signed actions the agent applies to the history and the learned owner addresses. Taxes already set aside for a corrected arrival stay in the taxes box until the next tax date and come back with the usual settlement refund; turning money that never had tax set aside into income asks the next income for a catch-up once; an arrival that was income at first owes nothing when it is put back.
- **A declaration that is never used.** A declaration lasts two hours and cannot be revoked. If the person declares and then abandons the deposit, an unrelated income of a similar size inside that window is read as their own money and skips taxes; the doubt notice does not fire because the evidence was signed.
- **Not yet remembered.** Only salary payments are recorded as outflows, so a refund from a supplier the agent paid in another way is income. Money the owner withdraws directly from the vault, without the agent, is not recorded either, so sending it back is income unless the address is already known. A follow-up can scan the vault's withdrawal events now that the log window is measured.

## Euro boxes

A person can declare payroll, operating, emergency or profit in euros. The agent then converts what that box holds from USDC to EURC (and back when the box is set to dollars) through Circle's swap adapter, one conversion per run. Taxes and salary stay in dollars: euros that land there (income paid in euros) are converted back, last.

- **What the vault enforces.** Only the agent can swap. It may call one function (`execute`, selector `0xaa3e079c`) on one adapter the owner approved, and the approval takes effect after a day and can be revoked at once. The call carries no ETH. The output must be at least the feed-implied amount less the vault's slippage setting (at most 100 bps) and 50 bps of feed lag, rounded up, so the widest bound is 1.5%. Both feeds must be fresh. The approval for the adapter is reset to zero after every call, the ledger moves only by the balances actually received, and a box never falls below its floor. The swap counts against its own rolling cap.
- **What the enclave adds.** It checks Circle's quote against the reference in both directions (a quote worse than the reference is refused; one much better is refused too, because it signals a mispriced pool), refuses a quote whose beneficiary, tokens or deadline differ from the instruction, caps conversions at US$5,000 a day and ignores boxes under US$25. A box changed today is not converted until tomorrow, so flipping a currency back and forth costs nothing. After three failures conversions stop until the owner changes a currency setting. Each hold is a notice with its reason, once per reason per day.
- **What the person can do.** Tighten the slippage, revoke the adapter, pause the agent, or set the box back to dollars.
- **Feeds.** On mainnet the vault reads Chainlink's USDC/USD and EURC/USD proxies (`0x84EA90AC252Dc437031461836DB5164219147905`, `0x361b95c10b76Ca3f35C686d423e43A951755Bf23`) and rejects an answer older than 26 hours. Testnet has no Chainlink feed for EURC, so the deploy creates two `ReferenceFeed` contracts the owner refreshes with `contracts/scripts/set-reference-rate.mjs` (the ECB rate) and accepts them for 30 days. Testnet also runs with `sandboxFx`: Circle's testnet pool quotes about 33% more euros than the market, so the "much better than reference" refusal is switched off there and only there (the configuration is rejected on chain 5042).
- **Adapter.** The adapter is Circle's contract and its code can change, so the oracle bound is the protection, not the adapter. Replacing the approved adapter is a new approval and another day.
- **Accounts.** A vault created before the redeploy cannot hold euros; it keeps working on the old contracts.
- **Privacy.** The request to Circle's service names the vault, the tokens and the amount. It is the same data the swap publishes on chain moments later.

Known limits:

- The swap cap adds raw units of both assets, which have the same six decimals, so it is a count of units and not of dollars. The enclave's own daily cap is in dollars.
- The vault's investment limit does not separate the two assets: a box holding euros counts against the same limit as dollars.
- The sealed state records the intent and the counters, never balances. The executor's `Swapped` event reports the amount requested; only the vault's `Swapped` event reports what was received, so use that one to audit a conversion.
- A conversion cannot be undone at the same price: setting the box back to dollars converts it again at that day's rate.

## Yield

A person can put part of a box to work in a Morpho vault listed by Circle's Earn Kit and take it back. Nothing is promised: the rate changes and the value can go down, and the app says so beside every number.

- **What the vault enforces.** Only the agent puts money in, through the one approved Circle adapter (the same one swaps use, so its approval covers both) and one of the vaults the owner approved, which takes a day to take effect. The output must be at least the yield vault's own preview of the shares or assets, less the vault's slippage setting (at most 100 bps, the same setting that bounds swaps). The ledger moves only by balances the vault measured, the approval is zero after every call, a deposit cannot pass the box's investable share or take it under its floor, and a deposit that returns no shares fails. The salary box is never offered.
- **Getting money out.** The owner can always take a box's money out, with or without the agent and with no vault approval, so revoking a vault or pausing the agent never traps it. If the adapter is revoked, the older direct `redeem` remains.
- **What the agent adds.** It checks every bundle Circle returns before it signs: the target is the yield vault, the function is `deposit` or `redeem`, the adapter is both receiver and owner, every beneficiary is the box vault, the amounts match, the deadline is two to sixty minutes away. A withdrawal must redeem within 1% of the shares the amount needs. A request waits at most a day; three failures in a row clear the requests and tell the owner; a hold is told once a day.
- **Limits and exits.** When the agent spreads money over several vaults the limits are written in code: at most 60% of the money in vaults in one vault and 80% in one protocol (each enforced only when two or more are eligible; with one, the box's investable share bounds the exposure), a position never above 20% of the vault's available liquidity, and no vault paying under 0.5% a year. The agent looks at each vault an account holds every run and takes everything out of one that shows a share price down by more than 1%, a rate that tripled above 25%, a status that is not active, or less liquidity than the position; the owner is told in Activity and nothing waits for them. The first look at a vault only records it.
- **Just in time.** For an account that switched yield on (the owner's choice, made with a signed setting; people who already get paid in digital dollars start with it on), the agent looks once a day for money to put to work: a box keeps its floor and everything that falls due within sixty days (payrolls, the next tax date) in cash, never puts more than the share the vault allows (the taxes box defaults to half), and never touches the salary box. Every run, whether yield is on or off, it brings money back for a payment inside the lead window: five business days before the due date, or at once when it is already due, the shortfall plus one percent. Business days are Monday to Friday and no holiday calendar is used, so a due date after a holiday is simply earlier in practice. Each decision is told in Activity with its numbers: what was kept and why, or which payment and which date.
- **Defaults and the fee.** An account created by someone who already gets paid in digital dollars starts with yield on; every other account starts with it off, and after twenty-eight days of history, once, the agent quotes the best open vault's rate and says the value can also go down; the person switches it on in Settings. The ten percent fee is calculated on the gain of each withdrawal (what the shares come back worth above the same share of the principal that went in, never below zero), rounded down, shown in Activity and in a running total, and **not charged**: collecting it needs a recipient the owner approves and the guarantee fund it partly feeds is not part of this build. The screens say so.
- **Vaults.** The app and the agent list the same vault (`EarnKit USDC Vault`, Morpho, on Arc testnet); a test fails if the two lists differ. Mainnet lists none.
- **Accounts.** A vault created before the redeploy has no `EARN_VERSION` and shows "not available"; an account whose read failed shows "could not be read", not that.
- **Known limits.** `invested` (the principal) is kept per box, not per yield vault, so with two vaults in one box a full withdrawal from one wipes the other's principal and loosens the investable-share check. The app offers one vault per box today. The contract has about 60 bytes of runtime size left, so anything new goes into a library or a new implementation. The agent's request to Circle names the box vault, the yield vault and the amount, which the move publishes on chain a moment later.

## What to tell people

The app shows its disclosures to everyone who enters: the limits are low, the private mode is an unaudited contract that is off on mainnet, tax figures are estimates, and USDC can be frozen by its issuer. On testnet the first line says that the money has no real value and nobody compensates losses.
