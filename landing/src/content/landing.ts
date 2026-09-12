/**
 * All copy and data for the plate below the hero, in one place.
 * Written for the primary visitor: the person at a battery or EV maker who must
 * show a recycled-content share to a notified body without handing over the
 * bill of materials. Their words, not ours: supplier, delivery, audit, passport.
 * Voice (BRANDING §5.4): short declaratives; "confidential", never "anonymous";
 * "result" or "verdict", never "score"; the absence of data is written out.
 * The mechanism is never named on this page; the memo and the code carry it.
 */

export const NAV = [
  { label: "Passport", href: "#marks" },
  { label: "Regulation", href: "#regulation" },
  { label: "How it works", href: "#how" },
  { label: "Screens", href: "#passport" },
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
  title: "Everything the passport shows.",
  items: [
    { id: "sponsor", shape: "oval", glyph: "sealed", name: "Suppliers", meaning: "Kept confidential. Never published." },
    { id: "fineness", shape: "octagon", glyph: "numerals", value: "≥16", name: "Recycled cobalt", meaning: "Meets the 16 % legal minimum." },
    { id: "assay", shape: "soft", glyph: "cupel", name: "Checked", meaning: "On your own systems. Nothing uploaded." },
    { id: "lots", shape: "soft", glyph: "lot", value: "8", name: "Deliveries", meaning: "Eight counted, each only once." },
    { id: "control", shape: "round", glyph: "control", name: "Compliant", meaning: "Reg. (EU) 2023/1542", verdict: true },
  ] satisfies Mark[],
  lines: [
    "A hallmark says the metal meets the standard. It never says which mine it came from.",
    "STRICKLE does the same for recycled content. Your suppliers sign what they delivered, the sum is checked against the legal minimum on your own systems, and only the result goes into the passport. Anyone can re-check that result. Nobody can read your bill of materials.",
  ],
};

export const law = {
  id: "regulation",
  title: "The regulation asks for both.",
  intro:
    "Regulation (EU) 2023/1542 makes your recycled-content share public, requires the supplier records behind it, and asks you to protect confidentiality without saying how.",
  clauses: [
    {
      ref: "Annex XIII",
      sub: "point 1(e)",
      quote: "recycled content information as contained in the documentation referred to in Article 8(1)",
      reading: "Public. Anyone who scans the QR sees the share, competitors included.",
    },
    {
      ref: "Art. 49(2)",
      sub: "points (b) and (d)",
      quote: "the name and address of the supplier […] the quantities of the raw material present in the battery placed on the market",
      reading: "The evidence behind that share names every supplier and every quantity.",
    },
    {
      ref: "Art. 52(2)",
      sub: "",
      quote: "with due regard for business confidentiality and other competitive concerns",
      reading: "The instruction to protect it. No method for doing so.",
    },
  ],
  boardTitle: "Four dates.",
  clocks: [
    { when: "18 Feb 2027", what: "Battery passport becomes mandatory", ref: "Art. 77(1)", status: "unchanged", delayed: false },
    { when: "Q4 2026", what: "Rules on who may read the passport", ref: "Art. 77(9)", status: "delayed", delayed: true },
    { when: "2028", what: "Recycled-content declaration due", ref: "Art. 8(1)", status: "moves with the delegated act", delayed: false },
    { when: "18 Aug 2031", what: "Minimums become binding · 16 % Co · 85 % Pb · 6 % Li · 6 % Ni", ref: "Art. 8(2)", status: "unchanged", delayed: false },
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
  title: "How a certification runs.",
  dwellMs: 6000,
  states: [
    {
      key: "sample",
      label: "Supplier",
      title: "Your supplier signs each delivery.",
      body: "Total mass and recycled mass for that lot, signed with a key registered under the scheme. Nothing else leaves their side.",
      visible: "Visible to others: nothing.",
      media: { kind: "video", src: "/media/steps/01-supplier.mp4", alt: "Battery pack sliding out from under the car" },
    },
    {
      key: "assay",
      label: "You",
      title: "You run the check on your own systems.",
      body: "The eight signed deliveries are summed and compared with the legal minimum. Suppliers, quantities and prices never leave your device.",
      visible: "Visible to others: nothing.",
      media: { kind: "video", src: "/media/steps/02-manufacturer.mp4", alt: "Front bumper floating off the car and returning" },
    },
    {
      key: "strike",
      label: "Passport",
      title: "The passport shows one result.",
      body: "Compliant, with the regulation and the minimum it was checked against. Never the share itself, never the records behind it.",
      visible: "Visible to anyone: model · material · minimum · Compliant.",
      media: { kind: "image", src: "/media/steps/03-verdict.jpg", alt: "The car whole on the square" },
    },
    {
      key: "register",
      label: "Notified body",
      title: "The notified body re-checks it, and can ask for one field.",
      body: "The result can be verified independently, without trusting us or any platform. If the body needs more, it requests one field at a time. Everything else stays sealed.",
      visible: "Visible to the body: only the field it asked for.",
      media: { kind: "image", src: "/media/steps/04-verifier.jpg", alt: "Detail of the car's charge port" },
    },
  ] satisfies AssayState[],
};

export const bench = {
  id: "passport",
  title: "Three screens. Three roles.",
  disclosure: "Example data. BX-27 is a fictional model; the figures illustrate the screens, not a real certification.",
  console: {
    label: "Your console",
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
    proving: "Checking",
    accepted: "Result ready",
    done: "Compliant · Meets the 16 % minimum",
  },
  passport: {
    label: "The public passport",
    model: "Battery model BX-27",
    verdict: "Compliant",
    basis: "Meets the 16 % minimum · Regulation (EU) 2023/1542",
    rows: [
      ["Material", "Cobalt"],
      ["Minimum", "16 %"],
      ["Deliveries counted", "8"],
      ["Suppliers", "not disclosed"],
      ["Quantities", "not disclosed"],
    ],
    footer: "Verified on Midnight",
  },
  portal: {
    label: "The notified body's view",
    passportId: "0x7f3a…c1",
    prompt: "Request one field",
    hint: "One field per request. The request itself is on record.",
    fields: [
      { key: "Recycled share", value: "17.2 %", note: "checked against the 16 % minimum" },
      { key: "Deliveries counted", value: "8", note: "each counted once" },
      { key: "Signing keys", value: "8 of 8", note: "all registered under the scheme" },
    ],
  },
};

export const register = {
  id: "public",
  title: "What is public. What stays yours.",
  publicSide: {
    label: "Public · in the passport",
    rows: [
      ["Battery model", "BX-27"],
      ["Material", "Cobalt"],
      ["Legal minimum", "16 %"],
      ["Result", "Compliant"],
      ["Signing keys", "8, all registered"],
      ["Deliveries counted", "8"],
    ],
  },
  privateSide: {
    label: "Private · on your systems",
    rows: [
      ["Supplier names", "kept by you"],
      ["Quantities per delivery", "kept by you"],
      ["Recycled mass per delivery", "kept by you"],
      ["Prices", "kept by you"],
      ["Who supplies whom", "kept by you"],
    ],
  },
  note: "Everything on the left can be checked by anyone. Everything on the right stays on your systems, and is still counted correctly in the result.",
};

export const limits = {
  id: "limits",
  title: "What this does not do.",
  items: [
    {
      title: "It does not make a supplier's figures true.",
      body: "A signed delivery proves who declared it and that it is counted once. A false declaration is still false, but it is now attributable to a named, registered key.",
    },
    {
      title: "It does not hide who supplies you from a determined observer.",
      body: "The figures stay sealed. The pattern of who signs, and how often, can still be studied. Reducing that is planned work, and we say so.",
    },
    {
      title: "It runs on your systems, so your systems must be trusted.",
      body: "The check happens on the machine you run it on. That machine sees your bill of materials. Nobody else does.",
    },
  ],
};

export const questions = {
  id: "faq",
  title: "Before the audit.",
  items: [
    {
      q: "Is this another platform we upload supplier data to?",
      a: "No. The bill of materials stays on your systems. Only the result enters the passport, and that result can be re-checked by anyone without trusting us.",
    },
    {
      q: "Would a notified body accept this?",
      a: "The result is public and independently verifiable, and the body can request one field at a time on top of it. Acceptance is the body's call; the memo sets out the argument article by article.",
    },
    {
      q: "What does my supplier have to do?",
      a: "Sign one declaration per delivery with a key registered under the scheme: total mass and recycled mass. Nothing else leaves their side.",
    },
    {
      q: "Does this replace CMRT and EMRT?",
      a: "No. It sits after them. The figures you already collect become signed deliveries, and the sum becomes the passport result.",
    },
    {
      q: "What if STRICKLE disappears?",
      a: "The method is open and documented. Results already issued keep verifying without us.",
    },
    {
      q: "Does my team need wallets or crypto expertise?",
      a: "No. Fees are handled by the registry operator. Your team uploads the signed deliveries, presses Certify and reads the result.",
    },
  ],
};

export const certificate = {
  id: "memo",
  title: "Take the memo to your committee.",
  body: "Eight to twelve pages for your committee and your notified body: what the regulation asks, how the check works, what an auditor sees, what it does not protect, and how it was tested.",
  paperTitle: "Technical memorandum",
  toc: ["1 · What the regulation asks", "2 · How the check works", "3 · What the auditor sees", "4 · What it does not protect", "5 · How it was tested"],
  paperFoot: "Suppliers and quantities not disclosed",
  cta: { label: "Download the memo (PDF)", href: "#memo", note: "In preparation. This link will carry the file." },
  code: {
    id: "code",
    title: "For your technical reviewers.",
    links: [
      { label: "Source code", href: "#code", status: "not yet public" },
      { label: "The contract", href: "#code", status: "not yet public" },
      { label: "Test suite", href: "#code", status: "not yet public" },
    ],
    address: "Public test-network address · pending deployment",
  },
};

export const footer = {
  quote: "“with due regard for business confidentiality and other competitive concerns” · Art. 52(2)",
  built: "Built on Midnight",
  copyright: "© 2026 STRICKLE",
};

/** Sections in page order, for tests and the footer. */
export const SECTIONS = [marks, law, assay, bench, register, limits, questions, certificate] as const;
