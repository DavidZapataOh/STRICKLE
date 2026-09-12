/**
 * Timeline of the hero loop (public/media/hero-loop.mp4).
 *
 * The loop is two Kling clips joined with 0.5 s fades. Windows below were
 * measured frame by frame on 12 Sep 2026 and mark the span in which each
 * piece is fully out of the car and still. Anchors are percentages of the
 * 1928 × 1072 frame and point at the floating piece.
 */

export const LOOP_SECONDS = 15.12;
export const FRAME_ASPECT = 1928 / 1072;

export type FramePoint = { x: number; y: number };

export type SealedRow = { label: string; width: number };

export type Piece = {
  id: "battery" | "bumper";
  name: string;
  regulation: string;
  clause: string;
  /** [start, end] in seconds of the loop, piece out and still. */
  window: [number, number];
  /** Where the piece floats, in frame %. */
  anchor: FramePoint;
  /** Where its label sits, in frame %, and which corner of the label is pinned there. */
  label: FramePoint & { pin: "right-center" | "left-top" };
  sealed: SealedRow[];
  disclosed: { label: string; value: string; minimum: string };
};

export const PIECES: readonly Piece[] = [
  {
    id: "battery",
    name: "Battery pack",
    regulation: "Reg. (EU) 2023/1542",
    clause: "Annex XIII · Art. 49(2)",
    window: [3.0, 5.8],
    anchor: { x: 33.5, y: 79 },
    label: { x: 31, y: 79, pin: "right-center" },
    sealed: [
      { label: "Supplier", width: 62 },
      { label: "Quantity", width: 38 },
      { label: "Price", width: 30 },
    ],
    disclosed: { label: "Recycled cobalt", value: "16 %", minimum: "min. 16 %" },
  },
  {
    id: "bumper",
    name: "Front bumper",
    regulation: "Reg. (EU) 2026/1738",
    clause: "Plastic part · recycled content",
    window: [10.2, 13.6],
    anchor: { x: 34, y: 62 },
    label: { x: 34, y: 69.5, pin: "left-top" },
    sealed: [
      { label: "Supplier", width: 54 },
      { label: "Quantity", width: 44 },
      { label: "Price", width: 26 },
    ],
    disclosed: { label: "Recycled plastic", value: "15 %", minimum: "min. 15 %" },
  },
];

export function activePiece(time: number): Piece | null {
  let t = time % LOOP_SECONDS;
  if (t < 0) t += LOOP_SECONDS;
  for (const piece of PIECES) {
    const [start, end] = piece.window;
    if (t >= start && t < end) return piece;
  }
  return null;
}

export type Box = { left: number; top: number; width: number; height: number };

/**
 * The rectangle a media of `aspect` occupies when it covers a container of
 * `width × height`. `focusX` (0..1) says which part of the frame survives a
 * horizontal crop: 0.7 keeps the car on the right in view on narrow screens.
 */
export function coverBox(width: number, height: number, aspect: number, focusX: number): Box {
  const containerAspect = width / height;
  if (containerAspect >= aspect) {
    const h = width / aspect;
    return { left: 0, top: (height - h) / 2, width, height: h };
  }
  const w = height * aspect;
  return { left: (width - w) * focusX, top: 0, width: w, height };
}

export function toScreen(point: FramePoint, box: Box): { x: number; y: number } {
  return {
    x: box.left + (box.width * point.x) / 100,
    y: box.top + (box.height * point.y) / 100,
  };
}
