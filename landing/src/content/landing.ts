/**
 * All copy and data for the plate below the hero, in one place.
 * Voice (BRANDING §5.4): short declaratives; "auditable confidentiality",
 * never "anonymity"; "verdict", never "score"; absence of data is written out.
 */

export const NAV = [
  { label: "The mark", href: "#marks" },
  { label: "Regulation", href: "#regulation" },
  { label: "How it works", href: "#how" },
  { label: "Passport", href: "#passport" },
  { label: "Memo", href: "#memo" },
] as const;

export type Mark = {
  id: string;
  shape: "oval" | "octagon" | "soft" | "round";
  glyph: "sealed" | "numerals" | "cupel" | "lot" | "control";
  value?: string;
  name: string;
  meaning: string;
  verdict?: boolean;
};

export const marks = {
  id: "marks",
  title: "Read the mark.",
  items: [
    { id: "sponsor", shape: "oval", glyph: "sealed", name: "Supplier", meaning: "Sealed. Never struck." },
    { id: "fineness", shape: "octagon", glyph: "numerals", value: "≥16", name: "Recycled cobalt", meaning: "Meets the 16 % minimum." },
    { id: "assay", shape: "soft", glyph: "cupel", name: "Assay", meaning: "On the manufacturer's device." },
    { id: "lots", shape: "soft", glyph: "lot", value: "8", name: "Lots", meaning: "Eight counted, each once." },
    { id: "control", shape: "round", glyph: "control", name: "Compliant", meaning: "Reg. (EU) 2023/1542", verdict: true },
  ] satisfies Mark[],
  lines: [
    "Europe has struck fineness into metal since 1300. The mark says the standard is met. It never says the mine.",
    "STRICKLE strikes the same kind of mark for recycled content: supplier attestations, signed with accredited keys, are summed inside a zero-knowledge circuit on the manufacturer's own device. Only the verdict is struck on chain.",
  ],
};

export const law = {
  id: "regulation",
  title: "The law asks for both.",
  intro:
    "Regulation (EU) 2023/1542 makes the recycled-content share public, requires the supplier ledger behind it, and asks for confidentiality without saying how.",
  clauses: [
    {
      ref: "Annex XIII",
      sub: "point 1(e)",
      quote: "recycled content information as contained in the documentation referred to in Article 8(1)",
      reading: "Public. Anyone who scans the QR sees the share.",
    },
    {
      ref: "Art. 49(2)",
      sub: "points (b) and (d)",
      quote: "the name and address of the supplier […] the quantities of the raw material present in the battery placed on the market",
      reading: "The evidence behind the share names every supplier and every quantity.",
    },
    {
      ref: "Art. 52(2)",
      sub: "",
      quote: "with due regard for business confidentiality and other competitive concerns",
      reading: "The instruction. No mechanism.",
    },
  ],
  boardTitle: "Four clocks.",
  clocks: [
    { when: "18 Feb 2027", what: "Battery passport mandatory", ref: "Art. 77(1)", status: "unchanged", delayed: false },
    { when: "Q4 2026", what: "Access-rights implementing act", ref: "Art. 77(9)", status: "delayed", delayed: true },
    { when: "2028", what: "Recycled-content declaration", ref: "Art. 8(1)", status: "moves with the delegated act", delayed: false },
    { when: "18 Aug 2031", what: "Binding minimums · 16 % Co · 85 % Pb · 6 % Li · 6 % Ni", ref: "Art. 8(2)", status: "unchanged", delayed: false },
  ],
};

export type AssayState = {
  key: string;
  label: string;
  title: string;
  body: string;
  visible: string;
  media: { kind: "video" | "image"; src: string; alt: string };
};

export const assay = {
  id: "how",
  title: "One object. Four states.",
  dwellMs: 6000,
  states: [
    {
      key: "sample",
      label: "Sample",
      title: "The supplier signs a lot.",
      body: "One attestation per delivery: total mass, recycled mass, signed with an accredited key.",
      visible: "Visible to others: nothing.",
      media: { kind: "video", src: "/media/steps/01-supplier.mp4", alt: "Battery pack sliding out from under the car" },
    },
    {
      key: "assay",
      label: "Assay",
      title: "The manufacturer sums eight lots on its own device.",
      body: "Checked against the legal minimum. Suppliers, quantities and prices stay on the device.",
      visible: "Visible to others: nothing.",
      media: { kind: "video", src: "/media/steps/02-manufacturer.mp4", alt: "Front bumper floating off the car and returning" },
    },
    {
      key: "strike",
      label: "Strike",
      title: "One verdict goes on chain.",
      body: "Compliant, with the regulation and the minimum it was checked against. Never the share itself.",
      visible: "Visible to others: model · material · minimum · Compliant.",
      media: { kind: "image", src: "/media/steps/03-verdict.jpg", alt: "The car whole on the square" },
    },
    {
      key: "register",
      label: "Register",
      title: "The notified body checks the proof and may ask for one field.",
      body: "Selective disclosure, one field per request, chosen as a public parameter so the request itself reveals nothing else.",
      visible: "Visible to the body: the field it asked for.",
      media: { kind: "image", src: "/media/steps/04-verifier.jpg", alt: "Detail of the car's charge port" },
    },
  ] satisfies AssayState[],
};

export const bench = {
  id: "passport",
  title: "Three screens on the bench.",
  disclosure: "Example data. BX-27 is a fictional model; the figures illustrate the screens, not a real certification.",
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
    accepted: "Proof accepted",
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
    passportId: "0x7f3a…c1",
    prompt: "Request one field",
    hint: "One field per request. The selector is a public parameter.",
    fields: [
      { key: "Recycled share", value: "17.2 %", note: "proven against the 16 % minimum" },
      { key: "Lot count", value: "8", note: "each lot counted once" },
      { key: "Accreditation root", value: "0x91b0…e4", note: "all eight keys are members" },
    ],
  },
};

export const register = {
  id: "ledger",
  title: "Struck in public. Kept in the book.",
  publicSide: {
    label: "Public register",
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
    label: "Sponsor's book · on the manufacturer's device",
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
  title: "What the mark does not say.",
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

export const questions = {
  id: "faq",
  title: "Before the audit.",
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

export const certificate = {
  id: "memo",
  title: "Take the certificate.",
  body: "Eight to twelve pages for your committee and your notified body: the legal seam, the circuit, what the verifier sees, the threat model and the test suite.",
  paperTitle: "Technical memorandum",
  toc: ["1 · The legal seam", "2 · The circuit", "3 · What the verifier sees", "4 · Threat model and declared limits", "5 · Test suite"],
  paperFoot: "Suppliers and quantities not disclosed",
  cta: { label: "Download the memo (PDF)", href: "#memo", note: "In preparation. This link will carry the file." },
  code: {
    id: "code",
    title: "See the code.",
    links: [
      { label: "Repository", href: "#code", status: "not yet public" },
      { label: "Compact contract", href: "#code", status: "not yet public" },
      { label: "Test suite", href: "#code", status: "not yet public" },
    ],
    address: "Preprod contract address · pending deployment",
  },
};

export const footer = {
  quote: "“with due regard for business confidentiality and other competitive concerns” · Art. 52(2)",
  built: "Built on Midnight",
  copyright: "© 2026 STRICKLE",
};

/** Sections in page order, for tests and the footer. */
export const SECTIONS = [marks, law, assay, bench, register, limits, questions, certificate] as const;
