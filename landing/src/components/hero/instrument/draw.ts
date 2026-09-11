import { GEOMETRY, TIMING, columnX, type SimState } from "./sim";

export interface InstrumentColors {
  ink: string;
  accent: string;
}

const BOWL_STROKE = 3.5;
const SURFACE_STROKE = 1.5;
const GRAIN_RADIUS = 2.2;
const STRICKLE_HEIGHT = 6;
const SPOUT_HEIGHT = 14;
const BOWL_RADIUS = 2;

export function drawInstrument(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  width: number,
  height: number,
  colors: InstrumentColors,
): void {
  const X = (v: number) => v * width;
  const Y = (v: number) => v * height;
  const depth = Y(GEOMETRY.bottom) - Y(GEOMETRY.rim);

  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1. Fill area under the heightfield, 22 % ink (the tint of the brand mark).
  ctx.beginPath();
  ctx.moveTo(X(GEOMETRY.bowlLeft), Y(GEOMETRY.bottom));
  for (let i = 0; i < GEOMETRY.columns; i++) {
    ctx.lineTo(X(columnX(i)), Y(GEOMETRY.bottom) - state.columns[i] * depth);
  }
  ctx.lineTo(X(GEOMETRY.bowlRight), Y(GEOMETRY.bottom));
  ctx.closePath();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = colors.ink;
  ctx.fill();
  ctx.globalAlpha = 1;

  // 2. Surface line.
  ctx.beginPath();
  for (let i = 0; i < GEOMETRY.columns; i++) {
    const x = X(columnX(i));
    const y = Y(GEOMETRY.bottom) - state.columns[i] * depth;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = SURFACE_STROKE;
  ctx.stroke();

  // 3. Bowl: three sides, open at the top, small corner radius at the bottom.
  const l = X(GEOMETRY.bowlLeft);
  const r = X(GEOMETRY.bowlRight);
  const top = Y(GEOMETRY.rim);
  const bot = Y(GEOMETRY.bottom);
  ctx.beginPath();
  ctx.moveTo(l, top);
  ctx.lineTo(l, bot - BOWL_RADIUS);
  ctx.quadraticCurveTo(l, bot, l + BOWL_RADIUS, bot);
  ctx.lineTo(r - BOWL_RADIUS, bot);
  ctx.quadraticCurveTo(r, bot, r, bot - BOWL_RADIUS);
  ctx.lineTo(r, top);
  ctx.lineWidth = BOWL_STROKE;
  ctx.strokeStyle = colors.ink;
  ctx.stroke();

  // 4. Spouts: short vertical ticks above the rim.
  for (const spout of state.spouts) {
    const x = X(spout.x);
    const y = Y(GEOMETRY.spoutY);
    ctx.beginPath();
    ctx.moveTo(x, y - SPOUT_HEIGHT);
    ctx.lineTo(x, y);
    ctx.lineWidth = spout.open ? BOWL_STROKE : 2;
    ctx.strokeStyle = colors.ink;
    ctx.stroke();
  }

  // 5. Grains.
  ctx.fillStyle = colors.ink;
  for (const g of state.grains) {
    ctx.globalAlpha = g.swept ? Math.max(0, g.life / TIMING.sweptLife) : 1;
    ctx.beginPath();
    ctx.arc(X(g.x), Y(g.y), GRAIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 6. Strickle: the single brass element, resting on the rim, longer than the bowl.
  if (state.phase === "sweeping" || state.phase === "verdict" || state.phase === "draining") {
    const right = X(state.strickleX);
    const left = right - X(GEOMETRY.strickleWidth);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(left, top - STRICKLE_HEIGHT / 2, right - left, STRICKLE_HEIGHT);
  }
}
