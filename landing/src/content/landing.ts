/**
 * All copy and data for the sections under the hero, in one place.
 * Voice rules (BRANDING §5.4): short declaratives; "auditable confidentiality",
 * never "anonymity"; "verdict", never "score"; absence of data is written out.
 */

export const NAV = [
  { label: "Regulation", href: "#regulation" },
  { label: "How it works", href: "#how" },
  { label: "Passport", href: "#passport" },
  { label: "Memo", href: "#memo" },
] as const;

export const regulation = {
  id: "regulation",
  kicker: "Regulation (EU) 2023/1542",
  title: ["Publish the number.", "Protect the evidence."],
  intro:
    "The Batteries Regulation makes the recycled-content share public, requires the supplier ledger behind it, and asks for confidentiality without saying how.",
  clauses: [
    {
      ref: "Annex XIII · 1(e)",
      quote: "recycled content information as contained in the documentation referred to in Article 8(1)",
      reading: "Public. Anyone who scans the QR sees the share.",
    },
    {
      ref: "Art. 49(2)",
      quote:
        "the name and address of the supplier […] the quantities of the raw material present in the battery placed on the market",
      reading: "The evidence behind the share names every supplier and every quantity.",
    },
    {
      ref: "Art. 52(2)",
      quote: "with due regard for business confidentiality and other competitive concerns",
      reading: "The instruction. No mechanism.",
    },
  ],
  clocks: [
    { when: "18 Feb 2027", what: "Battery passport mandatory", ref: "Art. 77(1)", status: "unchanged" },
    { when: "Q4 2026", what: "Access-rights implementing act", ref: "Art. 77(9)", status: "delayed" },
    { when: "2028", what: "Recycled-content declaration", ref: "Art. 8(1)", status: "moves with the delegated act" },
    { when: "18 Aug 2031", what: "Binding minimums · 16 % Co · 85 % Pb · 6 % Li · 6 % Ni", ref: "Art. 8(2)", status: "unchanged" },
  ],
};

export type Step = {
  n: string;
  title: string;
  body: string;
  visible: string;
  media: { kind: "video" | "image"; src: string; alt: string };
};

export const how = {
  id: "how",
  kicker: "How it works",
  title: ["Four parties. One verdict.", "Nothing leaves the plant."],
  steps: [
    {
      n: "01",
      title: "The supplier signs a lot.",
      body: "One attestation per delivery: total mass, recycled mass, signed with an accredited key.",
      visible: "Visible to others: nothing.",
      media: { kind: "video", src: "/media/steps/01-supplier.mp4", alt: "Battery pack sliding out from under the car" },
    },
    {
      n: "02",
      title: "The manufacturer aggregates on its own device.",
      body: "Eight attestations summed inside a zero-knowledge circuit and checked against the legal minimum. Suppliers, quantities and prices stay on the device.",
      visible: "Visible to others: nothing.",
      media: { kind: "video", src: "/media/steps/02-manufacturer.mp4", alt: "Front bumper floating off the car and returning" },
    },
    {
      n: "03",
      title: "One verdict goes on chain.",
      body: "Compliant, with the regulation and the minimum it was checked against. Never the share itself.",
      visible: "Visible to others: model · material · minimum · Compliant.",
      media: { kind: "image", src: "/media/steps/03-verdict.jpg", alt: "The car whole on the square" },
    },
    {
      n: "04",
      title: "The notified body checks the proof. It can ask for one field.",
      body: "Selective disclosure, one field per request, chosen as a public parameter so the request itself reveals nothing else.",
      visible: "Visible to the body: the field it asked for.",
      media: { kind: "image", src: "/media/steps/04-verifier.jpg", alt: "Detail of the car's charge port" },
    },
  ] satisfies Step[],
};

export const surfaces = {
  id: "passport",
  kicker: "Three screens, one proof",
  title: ["What each party holds.", "Nothing more."],
  console: {
    label: "Console · manufacturer",
    model: "BX-27 · cobalt · min. 16 %",
    lots: [
      { supplier: 62, total: "1 240 kg", recycled: "214 kg" },
      { supplier: 48, total: "980 kg", recycled: "171 kg" },
      { supplier: 55, total: "1 105 kg", recycled: "162 kg" },
      { supplier: 40, total: "760 kg", recycled: "140 kg" },
      { supplier: 66, total: "1 310 kg", recycled: "201 kg" },
      { supplier: 52, total: "1 020 kg", recycled: "158 kg" },
      { supplier: 44, total: "890 kg", recycled: "152 kg" },
      { supplier: 58, total: "1 175 kg", recycled: "190 kg" },
    ],
    note: "The bill of materials never leaves this device.",
    button: "Certify",
    proving: "Proving",
    done: "Compliant · Meets the 16 % minimum",
  },
  passport: {
    label: "Passport · consumer",
    model: "Battery model BX-27",
    verdict: "Compliant",
    basis: "Meets the 16 % minimum · Regulation (EU) 2023/1542",
    rows: [
      ["Material", "Cobalt"],
      ["Minimum", "16 %"],
      ["Lots counted", "8"],
      ["Suppliers", "not disclosed"],
      ["Quantities", "not disclosed"],
    ],
    footer: "Verified on Midnight",
  },
  portal: {
    label: "Portal · notified body",
    hint: "One field per request. The selector is a public parameter.",
    fields: [
      { key: "Recycled share", value: "17.2 %", note: "proven against the 16 % minimum" },
      { key: "Lot count", value: "8", note: "each lot counted once" },
      { key: "Accreditation root", value: "0x91b0…e4", note: "all eight keys are members" },
    ],
  },
};

export const ledger = {
  id: "ledger",
  kicker: "Two ledgers",
  title: ["What a check looks like.", "One line between them."],
  publicSide: {
    label: "Public ledger · verified by consensus",
    rows: [
      ["modelId", "0x7f3a…c1"],
      ["materialId", "cobalt"],
      ["thresholdPct", "16"],
      ["compliant", "true"],
      ["accreditationRoot", "0x91b0…e4"],
      ["lotsCounted", "8"],
    ],
  },
  privateSide: {
    label: "Private state · on the manufacturer's device",
    rows: [
      ["supplier", "sealed"],
      ["lotMass", "sealed"],
      ["recycledMass", "sealed"],
      ["unitPrice", "sealed"],
      ["structure", "sealed"],
    ],
  },
  note: "Everything on the left is verified by consensus. Everything on the right is private and, inside the circuit, proven correct.",
};

export const limits = {
  id: "limits",
  kicker: "Declared limits",
  title: ["What this does not do.", "Said out loud."],
  items: [
    {
      title: "A signature does not make the data true.",
      body: "An attestation proves an accredited supplier said it, and that the lot is counted once. Fraud becomes attributable and auditable, not impossible.",
    },
    {
      title: "We hide values, not the graph.",
      body: "Who attests, and how often, is a pattern. Batching and decoy attestations are scheduled work, with the leak measured before and after.",
    },
    {
      title: "The prover sees the witness.",
      body: "The machine that builds the proof sees the bill of materials in clear. Run your own.",
    },
  ],
};

export const faq = {
  id: "faq",
  kicker: "Questions",
  title: ["Before the audit.", "Not after."],
  items: [
    {
      q: "Do I need to know anything about blockchain?",
      a: "No. The manufacturer uploads attestations, presses Certify and reads a verdict. Fees are sponsored, so there is no wallet and no token.",
    },
    {
      q: "Would a notified body accept this?",
      a: "The proof is public and independently checkable, and the body can request one field at a time on top of it. Acceptance is the body's call; the memo sets out the argument article by article.",
    },
    {
      q: "What does my supplier have to do?",
      a: "Sign one attestation per lot with an accredited key: total mass and recycled mass. Nothing else leaves their side.",
    },
    {
      q: "Where does the bill of materials live?",
      a: "On the manufacturer's device. It is the private input to the proof and is never uploaded.",
    },
    {
      q: "What if STRICKLE disappears?",
      a: "The contract and the proof format are open source. Verdicts already on chain keep verifying without us.",
    },
    {
      q: "What does it cost the manufacturer?",
      a: "Nothing in crypto. Transaction fees are sponsored by the registry operator; the manufacturer never touches a wallet.",
    },
  ],
};

export const closing = {
  id: "memo",
  kicker: "Technical memo",
  title: ["Read the memo.", "Article by article."],
  body: "Eight to twelve pages for your committee and your notified body: the legal seam, the circuit, what the verifier sees, the threat model and the test suite.",
  toc: [
    "1 · The legal seam",
    "2 · The circuit",
    "3 · What the verifier sees",
    "4 · Threat model and declared limits",
    "5 · Test suite",
  ],
  cta: { label: "Download the memo (PDF)", href: "#memo" },
  code: {
    id: "code",
    title: "See the code.",
    links: [
      { label: "Repository", href: "#code" },
      { label: "Compact contract", href: "#code" },
      { label: "Test suite", href: "#code" },
    ],
    address: "Preprod contract address · pending deployment",
  },
};

export const footer = {
  quote: "“with due regard for business confidentiality and other competitive concerns” · Art. 52(2)",
  built: "Built on Midnight",
  copyright: "© 2026 STRICKLE",
};
