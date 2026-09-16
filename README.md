# STRICKLE

**Prove the threshold. Keep the recipe.**

> [!NOTE]
> This project is built on the Midnight Network.

A manufacturer proves that a product meets a legal recycled-content minimum from supplier-signed attestations, and only the verdict is published.

A hallmark says the metal meets the standard. It never says which mine it came from. STRICKLE does the same for recycled content: your suppliers sign what they delivered, the sum is checked against the legal minimum on your own systems, and only the result goes into the passport. Anyone can re-check that result. Nobody can read your bill of materials.

Suppliers and quantities not disclosed.

## Status

Today this repository is the foundation, not the product. Three workspaces build: the contract, the command-line tools and the landing page. The contract that compiles is still the `hello-world` template from `create-mn-app`; the certification circuit is not written yet. There is no console, no passport page and no notified-body portal: the landing describes them, this repository does not contain them. Nothing has been deployed to a public test network, so there is no contract address to cite. Each of these lines will be replaced by the thing itself, and never before.

## The regulation asks for both

Regulation (EU) 2023/1542 makes your recycled-content share public, requires the supplier records behind it, and asks you to protect confidentiality without saying how.

| Date | What | Article |
|---|---|---|
| 18 Feb 2027 | Battery passport becomes mandatory | Art. 77(1) |
| Q4 2026 | Rules on who may read the passport (delayed) | Art. 77(9) |
| 2028 | Recycled-content declaration due | Art. 8(1) |
| 18 Aug 2031 | Minimums become binding · 16 % Co · 85 % Pb · 6 % Li · 6 % Ni | Art. 8(2) |

## What is public, what stays yours

| Public · in the passport | Private · on your systems |
|---|---|
| Material, legal minimum, result | Supplier names |
| Signing keys, all registered | Quantities per delivery |
| Deliveries counted | Recycled mass per delivery, prices, who supplies whom |

Everything on the left can be checked by anyone. Everything on the right stays on your systems, and is still counted correctly in the result.

## Repository layout

| Workspace | What it is |
|---|---|
| `contract` | The Compact contract and its compiled output. Today: the `hello-world` template. |
| `strickle-cli` | Local network, wallet and deployment scripts. |
| `landing` | The marketing site (Next.js). |

## Prerequisites

- Node ≥ 24.11.1 (this repository pins 24.14.0 in `.nvmrc`)
- Docker, for the local network
- The Compact CLI with compiler 0.31.1 (pinned in `.compact-version`)

## Run it locally

```bash
npm ci                    # install
npm run check:toolchain   # every pinned version matches, prints "toolchain ok"
npm run devnet:up         # local undeployed network: node, indexer, proof server
npm run setup             # compile the contract and deploy it locally
npm run test:e2e          # read the deployed contract back from the chain
npm run devnet:down
```

Checks:

```bash
npm run lint       # Biome, the only linter
npm run typecheck
npm test           # 66 tests
npm run build
```

Measured on an Apple Silicon laptop, median of three runs: clean install 7.6 s, toolchain check 0.9 s, local network up 13 s, compile and deploy 37 s, read-back 4 s, lint 0.2 s, typecheck 1.9 s, tests 1.4 s, build 4.6 s from an empty `.next` cache.

## Toolchain

Pinned exactly, never with ranges. `npm run check:toolchain` fails if any of these drifts.

| Component | Version |
|---|---|
| Compact compiler | 0.31.1 (`pragma language_version 0.23;`) |
| `@midnight-ntwrk/compact-runtime` | 0.16.0 |
| `@midnight-ntwrk/midnight-js-*` | 4.1.1 |
| `@midnight-ntwrk/wallet-sdk` | 1.2.0 |
| Proof server | 8.1.0 |
| Midnight node | 1.0.2 |
| Indexer | 4.3.3-hotfix |
| Node | 24.14.0 |

Two rules the check enforces: never run `compact update` without a version, and never add `@midnight-ntwrk/compact-js` as a direct dependency.

## What this does not do

- **It does not make a supplier's figures true.** A signed delivery proves who declared it and that it is counted once. A false declaration is still false, but it is now attributable to a named, registered key.
- **It does not hide who supplies you from a determined observer.** The figures stay sealed. The pattern of who signs, and how often, can still be studied. Reducing that is planned work, and we say so.
- **It runs on your systems, so your systems must be trusted.** The check happens on the machine you run it on. That machine sees your bill of materials. Nobody else does.

## License

Copyright 2026 David Zapata. Licensed under Apache-2.0; see [LICENSE](LICENSE).
