---
name: STRICKLE landing
description: A struck steel plate under a pinned limestone hero; brass for the marks, one dark passage for the bench, green only on the verdict.
colors:
  # The Hallmark (src/app/plate.css :root) — the plate world below the hero
  steel-plate: "#dcdfe4"
  steel-50: "#e6e9ee"
  steel-100: "#d9dde3"
  steel-200: "#c7ccd4"
  steel-300: "#aeb5bf"
  steel-400: "#7c8794"
  steel-600: "#4a525c"
  steel-700: "#2a2f37"
  steel-800: "#1b1e23"
  steel-900: "#171a1f"
  steel-950: "#101216"
  engraved-ink: "#23272d"
  brass: "#a9842f"
  brass-hi: "#c9a24d"
  brass-lo: "#7a5a14"
  brass-ink: "#221a09"
  amber: "#e0a100"
  verdict: "#1b6b44"
  verdict-dark: "#7fd1a0"
  paper: "#fbfaf7"
  # Incumbent hero and chrome (src/app/globals.css :root, BRANDING.md §6)
  zinc-ground: "#eef0f3"
  panel: "#ffffff"
  edge: "#d3d8df"
  ink-muted: "#5b6470"
  strickle-brass: "#ab842b"
  bronze: "#7a5a14"
  ok-bg: "#e7f3ec"
  bad: "#a6291f"
  bad-bg: "#fbe6e3"
typography:
  display:
    fontFamily: "Bitter, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(44px, 9vw, 64px) / md: clamp(56px, 5.6vw, 88px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Bitter, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(34px, 7.5vw, 48px) / md: clamp(40px, 3.8vw, 60px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Bitter, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(22px, 4.5vw, 28px) / md: clamp(24px, 2.1vw, 32px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  numeral:
    fontFamily: "Bitter, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(40px, 4.6vw, 66px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  subtitle:
    fontFamily: "Bitter, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(18px, 2.2vw, 24px)"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "IBM Plex Sans, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px / md: 17px"
    fontWeight: 400
    lineHeight: 1.625
  body-small:
    fontFamily: "IBM Plex Sans, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.375
  caption:
    fontFamily: "IBM Plex Sans, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Bitter, Georgia, 'Times New Roman', serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "12px / ledger: 15px"
    fontWeight: 400
    fontFeature: "tabular-nums"
  wordmark:
    fontFamily: "Bitter, Georgia, 'Times New Roman', serif"
    fontSize: "17px"
    fontWeight: 800
    letterSpacing: "0.06em"
rounded:
  hero: "4px"
  plate: "6px"
  frame: "8px"
  soft: "18px"
  phone: "28px"
  round: "999px"
spacing:
  gutter-mobile: "22px"
  gutter: "clamp(24px, 4vw, 72px)"
  header: "68px"
  plate-y: "clamp(72px, 10vw, 128px)"
  plate-y-brass: "clamp(64px, 9vw, 120px)"
  after-heading: "clamp(36px, 5vw, 64px)"
  after-heading-wide: "clamp(40px, 6vw, 72px)"
  between-passages: "clamp(48px, 7vw, 96px)"
  clause-y: "36px / md: 48px"
  row-y: "14px"
  tool-pad: "16px"
  container: "1320px"
components:
  button-primary:
    backgroundColor: "{colors.steel-900}"
    textColor: "{colors.zinc-ground}"
    typography: "{typography.body-small}"
    rounded: "{rounded.hero}"
    height: "44px"
    padding: "0 20px"
  button-primary-plate:
    backgroundColor: "linear-gradient(180deg, {colors.steel-700}, {colors.steel-900})"
    textColor: "{colors.steel-50}"
    typography: "{typography.body-small}"
    rounded: "{rounded.plate}"
    height: "48px"
    padding: "0 20px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.steel-900}"
    typography: "{typography.caption}"
    rounded: "{rounded.hero}"
    height: "40px"
    padding: "0 16px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.steel-100}"
    rounded: "{rounded.plate}"
    padding: "7px 10px"
  chip-selected:
    backgroundColor: "linear-gradient(180deg, {colors.brass-hi}, {colors.brass})"
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.plate}"
    padding: "7px 10px"
  state-tab:
    backgroundColor: "transparent"
    rounded: "{rounded.plate}"
    padding: "16px 18px 16px 20px"
  state-tab-selected:
    backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)"
    rounded: "{rounded.plate}"
    padding: "16px 18px 16px 20px"
  cartouche:
    backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)"
    size: "min(100%, 196px)"
  tool:
    backgroundColor: "linear-gradient(180deg, #24282e, #1f2328)"
    textColor: "{colors.steel-50}"
    rounded: "{rounded.frame}"
    padding: "28px / md: 32px"
  board:
    backgroundColor: "{colors.steel-900}"
    textColor: "{colors.steel-50}"
    rounded: "{rounded.frame}"
    padding: "16px 20px"
  frame:
    backgroundColor: "{colors.steel-900}"
    rounded: "{rounded.frame}"
  verdict-plate:
    backgroundColor: "rgba(127, 209, 160, 0.06)"
    textColor: "{colors.verdict-dark}"
    rounded: "{rounded.plate}"
    padding: "10px 12px"
  certificate:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.bronze}"
    padding: "28px"
    width: "min(100%, 340px)"
  phone:
    backgroundColor: "linear-gradient(180deg, #2a2f36, #1c2025)"
    rounded: "{rounded.phone}"
    padding: "10px"
    width: "min(100%, 280px)"
  nav-link:
    textColor: "{colors.steel-900}"
    typography: "{typography.caption}"
  nav-link-hover:
    textColor: "{colors.bronze}"
---

# Design System: STRICKLE landing

## Overview

**Creative North Star: "The Hallmark"**

A hallmark certifies that metal meets a legal fineness without saying which mine it came from. Below the pinned hero, the whole landing is one continuous sheet of brushed light steel with a single full-bleed brass nameplate for the five marks and one oxidised-steel passage for the bench. Nothing sits on the plate; everything that matters is struck into it. Headings are engraved (light edge below, dark edge above), marks are debossed cartouches, rules are scored hairlines, and section boundaries are seams where one sheet meets the next rather than boxes or cards.

The world is dense with metal and sparse with ornament. Hierarchy is carried by size alone: Bitter 800 at four scales, IBM Plex Sans for reading, IBM Plex Mono only for hashes, ledgers and references. There are no eyebrows, no icon tiles, no glass, no card grids. Colour is almost entirely tonal steel; brass is a material (one plate, the proving bar, the selected chip, the seal) rather than an accent sprinkled on text; amber lights exactly one lamp; green appears only with the word "Compliant" and a dot.

The incumbent hero above the plate is a separate, user-pinned surface (limestone video, zinc ground, steel ink, 4px radii, a translucent passport card) and the plate system coexists with it: same fonts, same steel, same brass family, same verdict green. The site header and hero keep their own tokens from `globals.css`; the plate never restyles them.

**Key Characteristics:**
- One continuous plate: sections are seams (`inset` highlight-then-shadow), never bordered containers.
- Struck, not placed: deboss shadows, engraved text-shadows and a 1.02–1.05 → 1 settle are the single motion grammar.
- Size-only hierarchy in Bitter 800; no kickers, no tracked uppercase labels in the plate world.
- Brass as material: matte `#a9842f` body with `#c9a24d` highlight and `#7a5a14` shadow, always in the same three-stop gradient or as a whole plate.
- Green and red exist only as a verdict, always with word and shape; amber only on the delayed clock.
- Reduced motion shows everything already struck and still.

## Colors

Tonal brushed steel from near-white to near-black, one matte brass, one amber lamp, one verdict green, and a warm paper for the certificate.

### Primary
- **Brass** ({colors.brass}): the material of the nameplate plate (`.plate-brass`), the proving bar, the selected chip, the assay progress hairline, text selection and the caret. Always shaded with **Brass Highlight** ({colors.brass-hi}) above and **Brass Shadow** ({colors.brass-lo}) below in a `180deg` gradient (bar, chip, seal). **Brass Ink** ({colors.brass-ink}) is the text colour on brass.
- **Strickle Brass** ({colors.strickle-brass}) is the incumbent hero's brass (`--strickle-brass`, `--accent`) used only in the hero's passport seal and header hover; it differs from the plate's brass by two hex steps. See drift note.

### Secondary
- **Amber Lamp** ({colors.amber}): one 8px lamp and its row's date on the clocks board, only on the delayed clock (`.is-delayed`). Nowhere else.

### Tertiary
- **Verdict Green** ({colors.verdict}) on steel and paper, **Verdict Green (dark)** ({colors.verdict-dark}) on dark passages, `#0f4a2c` on brass: the word "Compliant" and its dot. **Bad** ({colors.bad}) / **Bad ground** ({colors.bad-bg}) are declared for "Non-compliant" and are unused on this route.

### Neutral
- **Plate Steel** ({colors.steel-plate}): the base colour under the brush raster of every light plate; the visible plate reads as the `steel-100` family after the sheen gradients.
- **Steel 50–950** ({colors.steel-50} → {colors.steel-950}): the tonal ramp. `steel-50` is text on dark plates and tools; `steel-100` chip text and board body copy; `steel-200` hairline dividers on paper; `steel-300` muted text on dark; `steel-400` scrollbar thumb and lot numbers; `steel-600` muted text on light plates (`.muted`); `steel-700` reading paragraphs and the dark seam edge; `steel-800` the dark passage plate; `steel-900` ink on light plates, the board, the frame, the phone chrome, the CTA; `steel-950` the dark-theme ground.
- **Engraved Ink** ({colors.engraved-ink}): the fill of engraved headings on light steel, one step warmer than `steel-900` so the deboss shadows read.
- **Paper** ({colors.paper}): the assay certificate and the passport phone screen.
- **Bronze** ({colors.bronze}): certificate ink and double rules; also the light-mode focus ring and hero link hover (`--focus`, `--accent-text`).
- Incumbent hero neutrals: **Zinc Ground** ({colors.zinc-ground}), **Panel** ({colors.panel}), **Edge** ({colors.edge}), **Ink Muted** ({colors.ink-muted}), **OK ground** ({colors.ok-bg}).

### Named Rules
**The Struck Verdict Rule.** Green appears only as "Compliant" (or red as "Non-compliant"), always as word plus dot, with the regulation cited beneath. Never as a status colour, tick, badge or background wash on its own.
**The One Lamp Rule.** Amber is one 8px lamp plus the date beside it, on the delayed clock only.
**The Brass Is Material Rule.** Brass is never a text accent on steel. It is a plate, a bar, a selected chip, a seal, the selection highlight; always modelled hi → body → lo.
**The No Blue Rule.** No blue anywhere on the site; it would make STRICKLE read as a TÜV or Midnight sub-brand (PRODUCT.md standing constraint).

## Typography

**Display Font:** Bitter (with Georgia, "Times New Roman", serif); weights 700 and 800, italic loaded for the hero's second line.
**Body Font:** IBM Plex Sans (with "Helvetica Neue", Arial, sans-serif); weights 400, 500, 600.
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, Menlo, monospace); weights 400, 500.

**Character:** A heavy slab that reads as struck metal, set tight (leading 0.98, tracking -0.02em) and always in weight 800 for headings and numerals, against a plain, patient grotesk for the reading. Hierarchy is carried by size, never by case, colour or a kicker.

### Hierarchy
- **Display** (800, `clamp(44px,9vw,64px)` → md `clamp(56px,5.6vw,88px)`, 0.98): the brass nameplate heading only ("Read the mark.").
- **Headline** (800, `clamp(34px,7.5vw,48px)` → md `clamp(40px,3.8vw,60px)`, 0.98): every other plate heading; one per plate.
- **Title** (800, `clamp(22px,4.5vw,28px)` → md `clamp(24px,2.1vw,32px)`, 0.98): sub-headings inside a plate (clocks board title, the three limits, "See the code.").
- **Numeral** (800, `clamp(40px,4.6vw,66px)`, tabular, -0.03em): struck numerals inside cartouches; law references use the same weight at `clamp(38px,8vw,52px)` → md `clamp(48px,4.6vw,72px)`; assay state names at `clamp(22px,2.4vw,30px)`; portal value 30px.
- **Subtitle** (700, `clamp(18px,2.2vw,24px)`, 1.375): quoted law clauses, mark names (`clamp(18px,2vw,22px)`), FAQ questions (`clamp(17px,1.6vw,20px)`), the brass nameplate's closing line (`clamp(20px,2.4vw,28px)`).
- **Body** (400, 16px → md 17px, 1.625, max 52–58ch): reading paragraphs.
- **Body small** (400, 15px, 1.375–1.625, max 54–56ch): state descriptions, register notes, link lists.
- **Caption** (400, 13px / 12.5px / 12px): tool copy, disclosures, media captions, statuses.
- **Label** (Bitter 700, 13px): engraved tool headers, footer column titles, "Built on Midnight".
- **Mono** (400, 12px; ledger rows 15px / 14px; hero rail 11.5px): references, hashes, register keys and values, contract address.
- **Wordmark** (Bitter 800, 17px, uppercase, 0.06em) with the 28px measure-and-strickle glyph; 12px inside the phone chrome.

### Named Rules
**The Size-Only Rule.** In the plate world, hierarchy is size and weight in one face. No eyebrows, no uppercase tracked labels, no coloured lead-ins above a heading.
**The One Heading Per Plate Rule.** Each plate carries exactly one Headline (or the single Display); everything below it steps down through Title, Subtitle and Body.
**The Mono For Hashes Rule.** Mono is reserved for references, identifiers, hashes and ledger values; never for headings, labels or prose.

## Layout

One column of full-bleed plates, each a `<section>` with an inner container of max 1320px and gutters `clamp(24px,4vw,72px)` (22px below 768px). Vertical rhythm inside a plate: padding `clamp(72px,10vw,128px)` top and bottom (the brass nameplate `clamp(64px,9vw,120px)`), heading to content `clamp(36px,5vw,64px)` (law and marks `clamp(40px,6vw,72–80px)`), passage to passage `clamp(48px,7vw,96px)`. Sections scroll to 68px below the top, the header's height.

Plates split into asymmetric two-column grids at 768px: 7/5 (law intro, register), 5/7 (law clauses, assay states beside a 16:10 frame at 1024px), 4/8 (limits, questions), 3/9 (clocks board), 1/1 (certificate). The bench goes 1 → 2 → `1.15fr 0.9fr 1fr` at 768 / 1280px. The marks row is 2 → 3 → 5 columns at 640 / 1024px with the fifth mark spanning two on the smallest grid. Reading measure is enforced with `max-w-[52–58ch]`. The clocks board reflows its five-column row into a three-area grid (lamp · date · status / what / ref) below 768px.

Breakpoints are Tailwind's (640, 768, 1024, 1280) plus one custom `max-width: 767px` in CSS. The hero above is `min-h-[100svh]` with its own 640px text column and `pb-[14vh]`.

## Elevation & Depth

Depth is relief, not elevation. Nothing floats above the plate; things are pressed into it. Three recipes, reused everywhere:

### Shadow Vocabulary
- **Engrave** (`text-shadow: 0 1px 0 rgba(255,255,255,.55), 0 -1px 0 rgba(0,0,0,.3), 0 -1px 2px rgba(0,0,0,.12)`): headings and struck labels on light steel; warm variant on brass (`rgba(255,240,200,.4)` / `rgba(40,25,0,.5)`); inverted on dark (`0 -1px 0 rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.1)`).
- **Deboss** (`inset 7px 9px 16px rgba(0,0,0,.42), inset 2px 3px 4px rgba(0,0,0,.3), inset -4px -5px 10px rgba(255,255,255,.3), inset -1px -2px 2px rgba(255,255,255,.45), 0 1px 0 rgba(255,255,255,.55), 0 -1px 0 rgba(0,0,0,.12)`): the struck cartouche; lighter for the selected assay tab (`inset 5px 7px 14px .3 …`), the question mark square and the verdict plate; darker on dark plates (`.8 / .6 / .06`).
- **Seam** (`inset 0 1px 0 rgba(255,255,255,.7), inset 0 3px 0 rgba(255,255,255,.25), inset 0 4px 0 rgba(0,0,0,.22), inset 0 10px 10px -6px rgba(0,0,0,.22)`): the top edge of every plate that follows another; dark variant `inset 0 1px 0 .22, inset 0 3px 0 rgba(0,0,0,.6), inset 0 12px 14px -8px rgba(0,0,0,.7)`.
- **Score** (`height: 2px; background: linear-gradient(180deg, rgba(0,0,0,.22), rgba(255,255,255,.55))`): hairline rules; also as ledger row edges (`inset 0 -1px 0 rgba(255,255,255,.6), inset 0 -2px 0 rgba(0,0,0,.16)`).
- **Tool on bench** (`inset 0 1px 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(0,0,0,.5), 0 30px 50px -36px rgba(0,0,0,.9)`): the only cast shadow in the world, a long low pool under objects resting on the dark passage (tools, phone, board `-40px .7`, certificate `-30px rgba(23,26,31,.55)`, the plate CTA `0 10px 20px -14px .6`).
- **Sheen** (per plate: `radial-gradient(140% 55% at 22% -10%, rgba(255,255,255,.55) → 0 60%)` screened, a `180deg` 0.18 → 0 → -0.08 falloff, then `brush.png` 512px soft-light; brass and dark use warm / low-alpha variants and `brush-fine.png`): the brushed-metal surface itself.

### Named Rules
**The Pressed-In Rule.** Depth goes into the plate. The only cast shadows belong to objects that physically rest on the dark bench (tools, phone, board, certificate) and to the memo CTA.
**The Two-Edge Rule.** Every engraved element has a light edge below and a dark edge above on light metal, and the reverse on dark. One edge alone is a drop shadow and is not this world.

## Shapes

Rectilinear plates with no radius; objects on the plate are softly squared: 6px for tabs, chips, verdict plates and the memo CTA, 8px for frames, tools and the board, 28px/20px for the phone shell and screen. The incumbent hero and header use 4px. Cartouches carry the hallmark shapes literally: oval (`50% / 46%`) for the sponsor, octagon (`clip-path: polygon(14% 0, 86% 0, 100% 18%, 100% 82%, 86% 100%, 14% 100%, 0 82%, 0 18%)`) for fineness numerals, rounded square (18px) for assay and lot count, circle (999px) for the control mark. Sealed values are hatched (`repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 5px)`, 8px tall, 0.55 alpha; block fill `0 2px / 2px 7px` at 0.6), never a lock. Lamps and verdict dots are 8px circles. The certificate is edged with `3px double` bronze rules and a 44px radial brass seal.

## Components

### Buttons
- **Shape:** softly squared (6px) in the plate world; 4px in the hero and header.
- **Plate primary (memo CTA):** steel gradient `linear-gradient(180deg, #2a2f37, #171a1f)`, `steel-50` text, Plex Sans 15px/500, 48px tall, 20px sides, `inset 0 1px 0 rgba(255,255,255,.12), 0 1px 0 rgba(255,255,255,.5), 0 10px 20px -14px rgba(0,0,0,.6)`. One per page.
- **Hero primary:** solid ink `#171a1f` on zinc, 44px tall, 4px radius (incumbent).
- **Outline (header "See the code"):** 1px `ink/40` border, 40px tall, 4px, hover border to full ink.
- **Text link:** Plex Sans 500, hover to bronze; disabled placeholders underline in `steel-300` at 6px offset with a status word beside.
- **Focus:** `outline: 2px solid var(--focus)` (bronze; brass-hi in dark), 2px offset. No transitions on buttons beyond colour.

### Chips
- **Style:** transparent, 6px, 7px × 10px, `steel-100` text, `inset 0 0 0 1px rgba(255,255,255,.14)` ring; hover ring to `.35`. 160ms ease-out.
- **Selected:** brass gradient hi → body with `brass-ink` text and `inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.35)`. Used as `role="tab"` in the regulator portal; the console's Certify control is a non-interactive chip in its selected state.

### Cards / Containers
There are no cards. Containers are:
- **Plate** (`.plate`, `.plate-brass`, `.plate-dark`): the sheet itself, full-bleed, seam on top.
- **Tool** (`.tool`): a dark object resting on the bench, 8px, `linear-gradient(180deg, #24282e, #1f2328)`, header strip `12px 16px` under a `rgba(0,0,0,.55)` rule; internal padding 16px, 28–32px when used as the sponsor's book.
- **Frame** (`.frame`): 8px steel-900 well for media, `inset 0 0 0 1px rgba(0,0,0,.35), inset 0 2px 6px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.5)`; media fades 500ms.
- **Board** (`.board`): steel-900 ruled table, rows `16px 20px` with `rgba(255,255,255,.08)` rules.
- **Certificate** (`.certificate`): paper, bronze ink, double rules, seal bottom-right at 22px.
- **Phone** (`.phone`): 28px shell, 10px bezel, 20px paper screen with steel-900 chrome.

### Inputs / Fields
None on this route. Interactive controls are tabs (`.state`, `.chip`) and `<details>` with a struck plus/minus square (`.q-mark`, 22px, 4px, rotates 200ms).

### Navigation
- **Header:** 68px, wordmark left, Plex Sans 14px/500 links (hidden below 768px), hover to bronze; outline CTA right. Sits on the hero's zinc ground.
- **Footer:** a dark plate, three columns (`1.3fr 1fr 1fr`) at 768px, engraved 13px Bitter column titles, 14px links hover to `brass-hi`, "Built on Midnight" with a 6px brass-hi dot.

### The Strike (signature motion)
Elements render visible and flat, then are struck once when their `Strike` wrapper enters the viewport (`IntersectionObserver`, threshold 0.18 plates / 0.3 default / 0.35 marks / 0.5 board, `rootMargin -8%` bottom, disconnects after the first hit). The `struck` class drives everything in CSS:
- **Heading strike:** `scale(1.02) → 1`, 320ms `cubic-bezier(0.2, 0.9, 0.2, 1)`, engrave text-shadow fades in over 320ms ease-out.
- **Cartouche strike:** `scale(1.05) → 1`, 260ms same ease, deboss deepens over 320ms; staggered `--i × 120ms` across the row of five.
- **Flap cascade (clocks board):** each character `rotateX(-90deg) → 12deg → 0`, 380ms `cubic-bezier(0.2, 0.8, 0.2, 1)`, delay `--i × 28ms + --r × 140ms`. Once.
- **Assay dwell:** four `role="tab"` states auto-advance every 6000ms while in view; the selected tab's 2px hairline fills brass with `scaleX` linear over the dwell; hover or focus pauses (`.assay.paused`); tab selection 200ms ease-out; frame media cross-fades 500ms.
- **Proving bar:** 8px well `#121417` with a brass hi → body → lo fill, `scaleX` updated per frame (120ms linear), 14s prove then 6s hold (`PROVE_MS`, `HOLD_MS`); the verdict plate then strikes in (`scale(1.04) → 1`, 260ms) with the green word and dot.
- **Reduced motion:** every transition off, cartouches flat-struck, flaps still, the assay bar full, the proving bar complete and the verdict shown.
- **Incumbent hero motion:** `reveal` 750ms `cubic-bezier(0.2, 0.7, 0.2, 1)` with 80ms stagger; passport card 380ms fade-and-lift. Not part of the plate grammar.

## Do's and Don'ts

### Do:
- **Do** build every new section as a `Plate` with one engraved heading and a seam; let the plate tone (steel / brass / dark) be the only container.
- **Do** strike anything that enters: heading 320ms, cartouche 260ms + 120ms stagger, ease `cubic-bezier(0.2, 0.9, 0.2, 1)`, from an already-visible flat state.
- **Do** write absences out ("Suppliers and quantities not disclosed") and draw sealed values as hatch, 8px tall at 0.55 alpha.
- **Do** keep brass modelled (hi → body → lo) and give it a whole object: a plate, a bar, a chip, a seal.
- **Do** keep reading copy at 16–17px Plex Sans, 1.625 leading, 52–58ch, in `steel-700` or `steel-600`.
- **Do** honour `prefers-reduced-motion` with the struck-and-still state, never a blank one.

### Don't:
- **Don't** use blue anywhere, or green/red outside the "Compliant" / "Non-compliant" word-and-dot pair.
- **Don't** add eyebrows, kickers or tracked uppercase labels above headings in the plate world; the hero's own small rail is the incumbent surface, not a licence.
- **Don't** put cards, icon tiles, glass panels, locks, shields, globes, node graphs or floating dashboards on the plate.
- **Don't** cast drop shadows from things on light steel; only objects on the dark bench (and the memo CTA) may pool a shadow beneath them.
- **Don't** light more than the one delayed clock with amber, or add motion outside the four grammars (strike, flap cascade, assay dwell, proving bar).
- **Don't** set headings in any weight but Bitter 800, or use mono outside references, hashes and ledger values.
