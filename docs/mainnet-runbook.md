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

## What to tell people

The app shows its disclosures to everyone who enters: the limits are low, the private mode is an unaudited contract that is off on mainnet, tax figures are estimates, and USDC can be frozen by its issuer. On testnet the first line says that the money has no real value and nobody compensates losses.
