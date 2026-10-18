In Athens, the misthos was the wage that let a rowing hand live from their work. Strickle proposes that pay follow the work: when a freelancer's work arrives in bursts, their agent turns irregular income into a steady salary, with taxes set aside and the cushion protected, all in private.

<p align="center">
  <img src="apps/landing/public/favicon.svg" alt="Strickle" width="96" />
</p>

<h1 align="center">Strickle</h1>

<p align="center"><strong>Irregular income. Regular life.</strong></p>

An AI agent for people paid from abroad in dollars. It splits every payment into boxes inside a vault you own, sets taxes aside under your country's rules, and pays you the same salary on the same day each month. It cannot take your money: only you can withdraw, and everything the agent may do is bounded by limits the contract itself enforces.

[Live app](https://app.strickle.xyz) · [Three ways in](https://app.strickle.xyz/en/judges) · [Proof page](https://app.strickle.xyz/en/proof) · [Docs](https://app.strickle.xyz/en/docs) · [How it works](#how-it-works) · [Run it](#run-it) · [Contracts](#deployed-contracts)

Built on Arc with Circle's USDC, Gas Station and passkey wallets, and Chainlink CRE, for the Tameion Agents Hackathon.

---

## The problem

A freelancer paid from abroad earns in bursts, owes taxes under rules that differ by country, and has no payslip. The money lands on one balance, the tax bill arrives months later, and the month with no client still has rent. Doing the arithmetic by hand every time is the job Strickle's agent takes over.

What makes that agent worth trusting is where its limits live. Strickle's limits are not a promise in a terms page: they are functions and errors of the vault contract, each with a test that pins it, and anyone can read them on the [proof page](https://app.strickle.xyz/en/proof).

---

## How it works

A payment arrives at the person's vault. The agent reads it from the chain and splits it in a fixed order: the share set aside for taxes first, then payroll and bills due in the next 30 days, the liquidity floor, what the salary box is owed, the liquidity target and the emergency cushion. Each step comes with a receipt that says what was done and why.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Person (passkey)                                                        │
│   │ signs actions                                                        │
│   ▼                                                                      │
│  App (Next.js) ──► relay ──► CRE workflow (confidential enclave)         │
│                                 │ opens the sealed profile               │
│                                 │ reads deposits and prices from Arc     │
│                                 │ decides by rule (packages/brain)       │
│                                 ▼                                        │
│                      DON-signed report ──► CRE forwarder                 │
│                                 ▼                                        │
│                          AgentExecutor ──► BoxVault (one per person)     │
│                                 │            boxes · caps · floors       │
│                                 ▼            approved recipients         │
│                           AgentState (sealed profile, encrypted)         │
└──────────────────────────────────────────────────────────────────────────┘
```

- **The vault** (`contracts/src/vault`): `BoxVault` holds the boxes of one owner and `BoxVaultFactory` creates them. The owner can always withdraw. The agent works inside caps, approved recipients and floors the owner sets, and the owner can pause or remove it in one transaction.
- **The agent** (`workflows/agent`): a Chainlink CRE workflow that runs in a confidential enclave. It keeps the person's profile sealed, applies only actions the person signed, and writes back through the forwarder to `AgentExecutor` (`contracts/src/cre`).
- **The brain** (`packages/brain`): the rules that decide a split, a salary and a reserve, with the receipts that explain each decision. The split order lives in `packages/core/src/cascade.ts` and the salary smoothing in `packages/brain/src/salary.ts`.
- **The tax engine** (`packages/tax-engine`): versioned rules per country, each with its public source and a verification status that is shown next to every number.
- **The private pool** (`contracts/src/pool`, `circuits`, `packages/pool`): a shielded pool whose notes carry their own rules, proven in zero knowledge with Noir. It runs on testnet only.

**What is public:** the vault, its balances by box and every transaction. Anyone with a vault address can open it read-only.
**What stays private:** the person's country, regime, goals and forecast live sealed inside the enclave and are never written to the chain or to a log.

---

## What the agent does

| Capability | What happens | Where |
| --- | --- | --- |
| Split by rule | Each payment is divided into six boxes in a fixed order, with a receipt per step | `packages/core/src/cascade.ts` |
| Regular salary | A fixed amount on the same day each month, held back by named limits (taxes not covered, little history, cushion floor) | `packages/brain/src/salary.ts` |
| Tax reserve | Per-country rules for Mexico, Argentina, Colombia, Brazil, the United States, the Philippines and Pakistan, with sources | `packages/tax-engine` |
| Euro boxes | A box can hold EURC; conversions use Circle's swap and the vault refuses a swap worse than its oracle bound | `contracts/src/vault/BoxVault.sol` |
| Idle money earns | Money a box will not need for 60 days can work in an Earn Kit vault and comes back five business days before a payment; the 10% fee is shown, not charged, on testnet | `apps/app/src/yield` |
| Proposals | Above an amount the owner chooses, the agent proposes and nothing moves until the owner approves | `packages/brain/src/autonomy.ts` |
| Circuit breaker | An action that would break an invariant of the box accounts is refused and the agent halts | `packages/brain/src/breaker.ts` |

---

## Chainlink services

| Service | What it does here | Where |
| --- | --- | --- |
| **CRE workflow** | One workflow holds every handler: deposit poll, daily tick, signed user actions, proof requests | `workflows/agent/main.ts` |
| **Confidential compute** | The sealed profile is opened, rules are applied and decisions are made inside the enclave, with no logging | `workflows/agent/enclave` |
| **Vault DON secrets** | The master key that seals profiles and the service tokens are held in the Vault DON, never in the repository | `workflows/secrets.yaml` |
| **EVM read and write** | The enclave reads vault balances, prices and logs, and writes signed reports through the forwarder to the receivers | `contracts/src/cre/AgentExecutor.sol` |
| **Report verification** | The proof page checks that the contracts accept one workflow ID and that the newest report carries valid DON signatures | `apps/app/src/server/attestation.ts` |

The workflow ID the contracts accept is `0x0012000b12b842f2ec22c07f3900a84f583d8067793c7d52315c8a0b25dbe9e0`. Anyone can recompute it from the published source with `cre workflow hash ./workflows/agent --public_key <workflow owner>`.

## Circle tools

| Tool | What it does here | Where |
| --- | --- | --- |
| **USDC and EURC on Arc** | The vault's two assets; USDC is also the gas token | `contracts/src/vault` |
| **Gas Station** | Sponsors gas, so a person never needs to hold a gas token | `packages/arc/src/sponsorship.ts` |
| **Passkey smart accounts** | The owner signs with a passkey; no seed phrase | `packages/arc/src/passkey.ts` |
| **App Kit swap** | Converts a box between USDC and EURC through Circle's adapter | `contracts/src/vault/BoxVault.sol` |
| **Earn Kit** | Puts idle money to work in an approved vault and takes it back | `apps/app/src/yield` |
| **CCTP and bridge** | Receives USDT and USDC from other chains | `packages/arc/src/bridge` |

---

## Deployed contracts

Arc testnet (chain 5042002). The proof page reads these addresses from the chain and shows, live, whether code is deployed and whether the source is verified.

| Contract | Address |
| --- | --- |
| BoxVault (implementation) | [`0xd2A7cF1581cd68413bC14Df7e0D79059ccD6DB4A`](https://explorer.testnet.arc.io/address/0xd2A7cF1581cd68413bC14Df7e0D79059ccD6DB4A) |
| BoxVaultFactory | [`0x55418C284B92a7E5AC369E1f8FB8b5446737AC8f`](https://explorer.testnet.arc.io/address/0x55418C284B92a7E5AC369E1f8FB8b5446737AC8f) |
| AgentExecutor | [`0x22f24aD5A88B12fbd49D71616d685DCce38805a4`](https://explorer.testnet.arc.io/address/0x22f24aD5A88B12fbd49D71616d685DCce38805a4) |
| AgentState | [`0xc8224D78e864476258785646a93a6884967b3973`](https://explorer.testnet.arc.io/address/0xc8224D78e864476258785646a93a6884967b3973) |
| AgentHeartbeat | [`0xf70A7B7F3980ad337a11096e28f7ADa73Eb91ef9`](https://explorer.testnet.arc.io/address/0xf70A7B7F3980ad337a11096e28f7ADa73Eb91ef9) |
| PolicyPool | [`0x20a16Ea01dC22D834CcC4962BB9153eeBa733D9F`](https://explorer.testnet.arc.io/address/0x20a16Ea01dC22D834CcC4962BB9153eeBa733D9F) |
| ReferenceFeed (USDC) | [`0x16e39cCC0c0F489477EDA348C17eD84103351318`](https://explorer.testnet.arc.io/address/0x16e39cCC0c0F489477EDA348C17eD84103351318) |
| ReferenceFeed (EURC) | [`0xee2013E4D05A8d6630C83Fd889866008068C0Ad9`](https://explorer.testnet.arc.io/address/0xee2013E4D05A8d6630C83Fd889866008068C0Ad9) |

The full manifest, with deployment transactions, is `contracts/deployments/arc-testnet.json`.

---

## Open kits

Three parts work on their own and install from packed tarballs:

- [`@strickle/pool`](packages/pool/README.md): the shielded pool client.
- [`@strickle/tax-engine`](packages/tax-engine/README.md): versioned tax rules with sources.
- [`@strickle/proof-of-income`](packages/proof-of-income/README.md): verifies the DKIM signature of an email against the key in DNS.

Build the tarballs with `npm run kits:pack -- @strickle/tax-engine`.

---

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

### Check it

```sh
npm test
npm run typecheck
npm run circuits:test
npm run test -w @strickle/contracts
```

The contract tests run against Arc testnet. Each guarantee on the proof page names the test that pins it. `docs/mainnet-runbook.md` describes how the system is operated and what each component enforces.

---

## Repository map

| Path | What is there |
| --- | --- |
| `apps/app` | The product (Next.js), in English, Spanish and Brazilian Portuguese |
| `apps/landing` | The marketing site |
| `apps/prover` | The proving service |
| `contracts` | Vault, factory, CRE receivers, the shielded pool and the payer registry (Solidity, Foundry) |
| `circuits` | The Noir circuits and their verifiers |
| `workflows/agent` | The Chainlink CRE workflow |
| `packages` | Shared code: `core`, `brain`, `tax-engine`, `pool`, `prover`, `arc`, `llm`, `db`, `compliance`, `payers`, `proof-of-income`, `design`, `gates` |
| `docs` | The operating runbook |

---

## Status and limits

These are unaudited contracts on Arc testnet, and the USDC there is test USDC with no value. The private pool is off on mainnet because its contract has not had an audit. Nobody outside the team has used the product yet.

Not built: certificates of income, the twelve-month history import and the public verifier. What exists on that path: the DKIM verifier, the known-payer registry and the dataset behind it, and server routes that open and check zkTLS proof requests for Upwork and Fiverr.

---

## Licence

MIT. See `LICENSE`.
