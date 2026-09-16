# STRICKLE

Confidential product passport on Midnight: a manufacturer proves that a product meets a legal recycled-content minimum from supplier-signed attestations, and only the verdict is published.

## Layout

| Workspace | What it is |
|---|---|
| `contract` | The Compact source and its compiled output in `contract/src/managed/<name>`. |
| `strickle-cli` | Local network, wallet and deployment scripts, and the devnet `docker-compose.yml`. |
| `landing` | The marketing site (Next.js). |

One `package-lock.json`, at the root. Root `scripts/` holds the repository's own checks, written in TypeScript and run by Node without a transpiler. A workspace is added by the change that first needs it, never empty. The simplest structure that matches the official Midnight examples wins; a layer the code does not yet need is not added in advance.

## Toolchain

Exact versions everywhere. The only range in the repository is `engines.node` (`>=24.11.1`).

| Component | Version | Pinned in |
|---|---|---|
| Compact compiler | 0.31.1 | `.compact-version` |
| Compact language | `pragma language_version 0.23;` | each `.compact` file |
| `@midnight-ntwrk/compact-runtime` | 0.16.0 | `strickle-cli/package.json` |
| `@midnight-ntwrk/midnight-js-*` | 4.1.1 | `strickle-cli/package.json`, checked against `toolchain.json` |
| `@midnight-ntwrk/wallet-sdk` | 1.2.0 | `strickle-cli/package.json`, checked against `toolchain.json` |
| Proof server · node · indexer | 8.1.0 · 1.0.2 · 4.3.3-hotfix | `toolchain.json` and the compose file |
| Node | 24.14.0 | `.nvmrc` |

The language and runtime versions have no second home in `toolchain.json`: they are read from the installed compiler and compared with what the files above declare. `.npmrc` keeps installs exact (`save-exact`) and refuses the wrong Node (`engine-strict`).

Three rules: never run `compact update` without a version; never add `@midnight-ntwrk/compact-js` as a direct dependency, it comes nested under `midnight-js-protocol`; develop against the local `undeployed` network.

Follow the official Midnight way: the documentation first, then the official example repositories. Where the documentation disagrees with a blog post, the documentation wins. Where an example repository disagrees with the documentation, settle it by running the compiler or a node — a claim is worth what they say about it.

**`npm run check:toolchain` must stay green.** It is what catches a compiler swapped underneath the build: the action that installs it succeeds as long as *some* compiler is present, so only this check notices it is the wrong one.

## Commands

| Command | What it does |
|---|---|
| `npm run check:toolchain` | Every pinned version matches. Prints `toolchain ok`, or one violation per line. |
| `npm run compact` | Compiles the contract with the pinned compiler. |
| `npm run devnet:up` / `status` / `down` / `reset` | The local network. `reset` also drops state left over from a previous chain. |
| `npm run setup` | Compiles and deploys locally. |
| `npm run test:e2e` | Reads the deployed contract back from the chain. |
| `npm run lint` · `typecheck` · `test` · `build` | Biome, types, tests, build. |

CI and the git hooks call these by name. Never `npx biome`, `npx tsc` or `npx vitest` directly, with one exception: the pre-commit hook checks only the staged files, which no script above expresses.

## Code

- Everything in English: code, identifiers, commits, docs, UI copy.
- Comments are rare and follow the language standard, JSDoc only where a type does not explain the contract. No commented-out code, no narrative comments.
- Tests before code. Negative tests assert the exact message. No flaky tests.
- Biome only, never ESLint or Prettier alongside it. One `biome.json`; indentation lives in `.editorconfig`. Never silence a rule with `biome-ignore` or an override: fix the code.
- Nothing shipped is a mock. What does not exist yet is stated as such, never simulated.
- Speed is part of the product: measure constraints, proof time, bundle size and page performance, and write the number down.
- Compiled output, wallet state and local chain state stay out of git.

## Compact

- One unconditional `disclose()` per public comparison. A `disclose()` inside a branch leaks which branch was taken.
- Never `Set.member` on private data. Never `ownPublicKey()` for authorization.
- Nullifiers are derived in-circuit from a secret, with domain separation.
- Security constants live in `sealed ledger`, never come from a witness.
- Poseidon-based hashes, never SHA-256 in circuit.
- No division or modulo: `+ - *` only. Compare ratios by cross-multiplication.
- Bounded loops, fixed-size types, no recursion. `assert` for validity, never `return`.

## Commits

Subject: `type(scope): summary`. Scope is optional and lowercase.

<!-- commit-types -->
`build` `chore` `ci` `docs` `feat` `fix` `perf` `refactor` `style` `test`
<!-- /commit-types -->

The summary starts in lowercase and does not end with a period. The subject is at most 72 characters. A `Merge …` subject is exempt.

This documents `scripts/commit-message.ts`, which enforces it on every commit; the checker is the source of truth. The hooks check the formatting of what is staged, this convention on the message, and the toolchain check, lint, types and tests before a push.

Pull requests carry tests and, when they touch cost or performance, a measured number.

## Product copy

- "Auditable confidentiality", never "anonymity". "Verdict" or "result", never "score". "Attestation", never "claim".
- Copy speaks to the buyer — the people responsible for regulatory compliance at a manufacturer — never to developers first.
- The absence of data is written out: "Suppliers and quantities not disclosed".
- No invented social proof: no logos, testimonials, ratings or usage figures.
- Design system: `landing/DESIGN.md`.

There is no `CONTRIBUTING.md`. This file is it.
