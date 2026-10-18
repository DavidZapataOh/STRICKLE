In Athens, the misthos was the wage that let a rowing hand live from their work. Strickle proposes that pay follow the work: when a freelancer's work arrives in bursts, their agent turns irregular income into a steady salary, with taxes set aside and the cushion protected, all in private.

# Strickle

Strickle is an AI agent for people who are paid from abroad in dollars. Every payment that arrives is split by rule into boxes that live in a vault the person owns: operating money, a salary paid on the same day each month, taxes, payroll, an emergency cushion and profit. The agent does the arithmetic and the paperwork. It cannot take the money: only the owner can withdraw, and anything the agent is allowed to do is bounded by the vault's own caps, approved recipients and floors.

Built on Arc with Circle's USDC, Gas Station and passkey wallets, and Chainlink CRE.

## How it works

- **The vault** (`contracts/src/vault`): `BoxVault` holds the boxes of one owner; `BoxVaultFactory` creates them. The owner can always withdraw. The agent works inside the caps, approved recipients and floors the owner sets.
- **The agent** (`workflows/agent`): a Chainlink CRE workflow that runs in a confidential enclave. It keeps the person's profile sealed, applies the actions the person signs, reads deposits from the chain and writes its decisions back through the CRE forwarder to `AgentExecutor` (`contracts/src/cre`).
- **The brain** (`packages/brain`): the rules that decide a split, a salary and a reserve, and the plain-language receipts that explain each decision.
- **The tax engine** (`packages/tax-engine`): versioned rules per country with their public sources.
- **The private pool** (`contracts/src/pool`, `circuits`, `packages/pool`): a shielded pool whose notes carry their own rules, proven in zero knowledge with Noir and Barretenberg. It is off on mainnet because its contract has not had an audit.
- **The app** (`apps/app`): the product, in English, Spanish and Brazilian Portuguese. **The landing** (`apps/landing`) is the marketing site.

## Open kits

Two parts work on their own and install from packed tarballs:

- [`@strickle/pool`](packages/pool/README.md): the shielded pool client.
- [`@strickle/tax-engine`](packages/tax-engine/README.md): versioned tax rules with sources.

Build the tarballs with `npm run kits:pack -- @strickle/tax-engine`.

## Run it

Node 24 or newer, Docker for the database, and the toolchain pinned in `toolchain.json`.

```sh
npm install
cp .env.example .env
npm run db:up
npm run migrate -w @strickle/db
npm run dev -w app
```

The app serves on port 3200. `.env.example` lists the keys it reads; the Circle and RPC values come from your own accounts.

## Check it

```sh
npm test
npm run typecheck
npm run circuits:test
npm run test -w @strickle/contracts
```

The contract tests run against Arc testnet. `docs/mainnet-runbook.md` describes how the system is operated, what Strickle can and cannot do, and what each component enforces.

## Repository map

| Path | What is there |
| --- | --- |
| `apps/app` | The product (Next.js) |
| `apps/landing` | The marketing site |
| `apps/prover` | The proving service |
| `contracts` | Vault, factory, CRE receivers and the shielded pool (Solidity, Foundry) |
| `circuits` | The Noir circuits and their verifiers |
| `workflows/agent` | The Chainlink CRE workflow |
| `packages` | Shared code: `core`, `brain`, `tax-engine`, `pool`, `prover`, `arc`, `llm`, `db`, `compliance`, `design`, `gates` |
| `docs` | The operating runbook |

## What is private and what is public

The boxes, the vault and every transaction are public on Arc. The agent's view of a person (country, regime, goals, forecast) is sealed inside the enclave and is never written to the chain or to a log. The shielded pool hides amounts, owners and which note a spend consumes.

## Status and limits

These are unaudited contracts on Arc testnet. The USDC on testnet is test USDC, with no value. The private pool is off on mainnet.

## Licence

MIT. See `LICENSE`.
