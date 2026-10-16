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

## What to tell people

The app shows its disclosures to everyone who enters: the limits are low, the private mode is an unaudited contract that is off on mainnet, tax figures are estimates, and USDC can be frozen by its issuer. On testnet the first line says that the money has no real value and nobody compensates losses.
