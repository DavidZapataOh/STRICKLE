# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the person inside a European battery, EV or electronics manufacturer who must demonstrate a recycled-content share to a notified body without handing over the bill of materials. Titles today: Head of Responsible Sourcing, ESG Business Partner, Regulatory Affairs Manager, Circular Economy Manager. Situation: the battery passport becomes mandatory on 18 February 2027; they hold CMRT/EMRT spreadsheets from suppliers, have seen Circulor, Circularise or Catena-X demos, and their tier-2 suppliers refuse plant-level data. They arrive from the project README, deck or demo video, not from search.

Second reader: a Midnight Buildathon judge scoring, among other things, whether the team knows who its user is. Served by the same page, never addressed first.

Not served on this surface: developers, consumers scanning a QR, suppliers (each gets its own screen inside the product).

## Product Purpose

STRICKLE proves that a product meets a legal minimum of composition (first case: 16 % recycled cobalt under Regulation (EU) 2023/1542) from supplier attestations signed with accredited keys, aggregated inside a zero-knowledge circuit on the manufacturer's own device, and publishes one verdict on chain: Compliant. Suppliers, quantities and prices never leave the device. Success for this landing: the primary user understands within seconds that the threshold can be proven without revealing the recipe, believes a notified body could accept it because the proof is mathematics and not a platform's promise, and takes the technical memo to their committee. Feeling to produce: relief with authority, the certificate in hand before the audit.

## Positioning

The regulation makes the share public (Annex XIII), requires the supplier ledger behind it (Art. 49(2): supplier name and address, quantities) and asks for "due regard for business confidentiality and other competitive concerns" (Art. 52) without a mechanism. Every competitor asks the manufacturer to upload the ledger to a third-party platform; STRICKLE never sees it. The enemy is the central repository, not any vendor. Framing is "auditable confidentiality", never "anonymity". The engine is generic (threshold, material and regulation are deployment parameters; second case: 15 % recycled plastic in vehicles, Reg. (EU) 2026/1738), but every pitch opens with the concrete battery case.

## Operating Context

The buyer reads EUR-Lex, TÜV/Intertek/DEKRA reports, EMRT spreadsheets, Battery Pass guidance and Catena-X decks; vocabulary used without explanation: notified body, conformity assessment, CMRT/EMRT, mass balance, chain of custody, data sovereignty. Four regulatory clocks: passport mandatory 18 Feb 2027; access-rights implementing act delayed to Q4 2026; recycled-content declaration ~2028 (moves with the delegated act); binding minimums 18 Aug 2031 (16 % Co, 85 % Pb, 6 % Li, 6 % Ni). Product roles: supplier signs one attestation per lot; manufacturer aggregates eight attestations and certifies from a console with a 12–25 s proving step; notified body can request one field per query as a public parameter; consumer scans a QR and sees verdicts only. Fees are sponsored so the manufacturer never touches a wallet.

## Capabilities and Constraints

- Compact contract on Midnight: eight attestations per certification, Merkle-accredited issuers, per-lot nullifiers, cross-multiplied threshold check, only the boolean verdict published. Multi-tier chains, threshold vectors and the regulator portal are later waves.
- Declared limits that must be stated, never hidden: a signature does not make the data true (fraud becomes attributable, not impossible); values are hidden but the attestation graph is not; the proof server sees the witness in clear.
- No fraud-prevention claims anywhere.
- Undecided / not yet existing (12 Sep 2026): public repository, deployed Preprod contract address, the technical memo PDF, demo video. The landing may only link to placeholders and must say so plainly.
- Stack: Next 16.3, React 19, Tailwind v4, TypeScript, Vitest; static prerender; no backend.

## Brand Commitments

- Name STRICKLE; wordmark in Bitter 800 uppercase with the square measure-and-strickle mark.
- The hero is fixed and untouchable: full-bleed video of a matte grey electric sedan on a pale limestone square at dawn, the battery pack and the front bumper floating out with passport labels, copy "Prove the threshold. / Keep the recipe.", CTAs "Read the technical memo" and "See the code", metadata rail.
- Below the hero David released the visual system on 12 Sep 2026: the page may adopt its own coherent world, distinct from the hero, as long as it reads as one site. Standing preferences that survive: no blue as a brand color (it makes STRICKLE a sub-brand of TÜV or Midnight); green and red reserved for the verdict, always with word and shape; no locks, shields, globes, node networks or floating dashboards; light mode is the buyer's register, dark is allowed as a deliberate passage.
- Voice: two short declaratives with a full stop. "Compliant" / "Non-compliant" written the same way every time, regulation cited beneath. "Verdict" not "score", "attestation" not "claim". The absence of data is written out: "Suppliers and quantities not disclosed". English.
- The H1 and section titles never say blockchain, zero-knowledge or Midnight; the mechanism is named once, below the fold, and "Built on Midnight" lives in a small line.

## Evidence on Hand

- Real: the regulation text (articles quoted verbatim from EUR-Lex), the audience research (`~/templo/midnight/PUBLICO.md`, `research-audience-*.md`), the product design (`~/templo/midnight/PROYECTO.md`), the hero loop and poster (`public/media/`), cropped step clips (`public/media/steps/`).
- Not available and never to be fabricated: customer logos, testimonials, ratings, usage figures, ISO badges, press, pricing, a working demo. David will generate stills or video on request when a section needs them (image editor, Veo 3.1, Kling 3.0); prompts already delivered for the square at dusk and the printed memo.

## Product Principles

1. The buyer first, the judge second, the developer never on this surface.
2. Prove, do not claim: show the law, the three screens and the two ledgers; state every limit out loud.
3. Nothing invented: no social proof, no numbers, no partners; placeholders say they are placeholders.
4. Nothing static: the page moves the way the hero moves, with authored motion and video, not scattered effects.
5. Not a SaaS template: no rows of identical cards, no generic icons, no single grey ground from top to bottom.
