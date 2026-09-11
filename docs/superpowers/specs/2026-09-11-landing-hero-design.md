# Landing de STRICKLE · Hero «El rasero animado»

**Fecha:** 11 de septiembre de 2026 · **Estado:** aprobado por David en chat, pendiente de revisión escrita
**Alcance:** solo la sección hero (cabecera incluida) de `landing/`, el proyecto Next.js dentro de este repo.
**Documentos madre:** `../../../../BRANDING.md` (sistema «Assay», secciones 5 y 6) y `../../../../PROYECTO.md` (producto). Viven fuera del repo, en `~/templo/midnight/`.

---

## 1 · Objetivo

Un hero moderno y dinámico que un responsable de cumplimiento acepte junto a un informe de TÜV, y que el jurado del buildathon reconozca como oficio. Cuenta el producto sin explicarlo: varios proveedores vierten, el rasero enrasa al umbral legal, y lo único que queda a la vista es el veredicto.

## 2 · Decisiones tomadas y por qué

Se revisaron 21 heros de referencia (`~/templo/midnight/Refs`). Cuatro familias: vídeo claro con texto a la izquierda (ALTURA, GLASSLINE, SAVA…), vídeo oscuro con neón (NOCTRA, KINETICA, AERORUN…), fondo procedural en canvas (AURORA, SEDA, CELDAS, ENJAMBRE, OLEAJE) y SaaS con mockup (BRUJULA).

| Decisión | Elegido | Descartado y motivo |
|---|---|---|
| Layout | Familia clara: texto a la izquierda, asset a la derecha, pie con datos en mono (GLASSLINE, ALTURA) | Centrado con mockup (BRUJULA): es el cliché del sector según la auditoría del branding |
| Técnica del movimiento | Canvas 2D procedural, sin asset externo (como CELDAS y AURORA) | Vídeo real: no existe asset de baterías o cobalto y generarlo es una dependencia externa |
| Motivo | El símbolo de la marca a gran escala: cuenco de medida, granos y rasero | Malla geométrica abstracta: más sobria pero no cuenta el producto |
| Paleta | Modo claro, Zinc/Steel, Brass una sola vez (el rasero) | Oscuro con neón: el ecosistema lo premia, el comprador lo castiga (BRANDING §3) |
| Titular | Bitter 800 recta + Bitter 700 itálica, heredando el patrón recta + itálica de las refs con nuestra slab | Sans + serif itálica de las refs: no son nuestras familias |
| Idioma del copy | Inglés | Los lemas aprobados están en inglés y el jurado es internacional |

**Desviación consciente del branding:** BRANDING §5.6 dice «animación solo en la barra de progreso». Se aplica al producto; el hero es una pieza de marketing y David pidió un hero dinámico. La consola y el pasaporte siguen la regla.

**Regla de Brass:** el rasero del instrumento es la única aparición de Brass en la vista. El lockup de la cabecera va a una tinta, en Steel.

## 3 · Composición

### 3.1 Escritorio (≥ 900 px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ▣ STRICKLE          Product   Proof   Docs          [Open the console]│ 68 px
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CONFIDENTIAL PRODUCT PASSPORT · BATTERIES      ┌───────────────┐   │
│                                                 │   ▾   ▾    ▾  │   │
│  Prove the threshold.                           │ ──────────────│◄ rasero
│  Keep the recipe.            (itálica)          │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│   │
│                                                 │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│   │
│  Signed supplier attestations, aggregated       └───────────────┘   │
│  inside a zero-knowledge circuit, become one                        │
│  verdict on chain …                               ◉ Compliant        │
│                                                   Meets the 16 % …   │
│  [Open the console]   Read how it works →                           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ REGULATION (EU) 2023/1542 · PASSPORT MANDATORY 18 FEB 2027 · 16 % CO… │ BUILT ON MIDNIGHT
└─────────────────────────────────────────────────────────────────────┘
```

- Sección `min-height: 100svh`, fondo Zinc, sin marco ni radios de sección. Márgenes laterales 4vw (mín. 24 px, máx. 64 px).
- Cabecera 68 px: lockup horizontal a la izquierda (símbolo `strickle-mark.svg` 28 px + wordmark STRICKLE en Bitter 800, mayúsculas, tracking 0,06 em, ambos Steel); navegación centrada-derecha en Plex Sans 500 15 px; botón primario Steel.
- Cuerpo: rejilla de dos columnas, 46 % / 54 %, hueco 48 px, centrado verticalmente en el espacio restante.
- Columna izquierda: etiqueta, H1, lead (máx. 460 px), fila de acciones.
- Columna derecha: el instrumento en una caja cuadrada de lado `min(560px, 42vw)`, con el bloque de veredicto debajo, alineado a la izquierda de la caja.
- Pie: fila en Plex Mono 12 px mayúsculas tracking 0,08 em, color texto atenuado; separador `·`; a la derecha «BUILT ON MIDNIGHT» precedido de un punto de 6 px en Steel. Altura 56 px, filete superior 1 px en borde.

### 3.2 Móvil (< 900 px)

- Una columna: cabecera, texto, instrumento, veredicto, pie. Altura natural, sin forzar 100svh.
- Cabecera: solo lockup y botón primario; la navegación se oculta.
- Instrumento a todo el ancho, proporción 4:3, veredicto debajo.
- Pie: solo «REGULATION (EU) 2023/1542» y «BUILT ON MIDNIGHT».
- Márgenes laterales 22 px. H1 `clamp(38px, 10vw, 56px)`.

## 4 · Copy (definitivo, inglés)

| Elemento | Texto |
|---|---|
| Navegación | Product · Proof · Docs |
| Botón primario | Open the console |
| Etiqueta | CONFIDENTIAL PRODUCT PASSPORT · BATTERIES |
| H1 línea 1 | Prove the threshold. |
| H1 línea 2 (itálica) | Keep the recipe. |
| Lead | Signed supplier attestations, aggregated inside a zero-knowledge circuit, become one verdict on chain: the recycled-content minimum is met. Suppliers, quantities and prices never leave your device. |
| Acción secundaria | Read how it works → |
| Marca del borde del cuenco | 16 % · threshold |
| Rótulo de boca (hover) | Supplier 03 · signed · not disclosed (el número es el índice de la boca, con dos cifras) |
| Estado «probando» | Proving · 00:04 (mm:ss desde el inicio del ciclo) |
| Veredicto | **Compliant** y debajo: Meets the 16 % minimum · Regulation (EU) 2023/1542 |
| Pie | REGULATION (EU) 2023/1542 · PASSPORT MANDATORY 18 FEB 2027 · 16 % CO · 85 % PB · 6 % LI · 6 % NI · BUILT ON MIDNIGHT |
| `<title>` | STRICKLE — Prove the threshold. Keep the recipe. |

Todos los enlaces y botones sin destino definido apuntan a `#`. No se crean páginas ni secciones para ellos.

## 5 · El instrumento

### 5.1 Geometría (unidades normalizadas 0–1 sobre la caja del canvas)

- Cuenco: rectángulo x 0,18–0,82, borde superior (rim) y = 0,36, fondo y = 0,86, radio 2 px, trazo Steel 3,5 px a escala del símbolo.
- Rasero: barra horizontal Brass de 6 px de alto y 0,84 de ancho, más larga que el cuenco, siempre apoyada en el rim cuando es visible. Solo existe en las fases `sweeping`, `verdict` y `draining`; durante el vertido no hay barra. En `verdict` ocupa x 0,08–0,92: el fotograma final de cada ciclo es exactamente el símbolo de la marca. Es el único elemento Brass.
- Marca «16 % · threshold»: tick de 8 px a la izquierda del cuenco a la altura del rim, con el texto en Plex Mono 11 px, texto atenuado, como HTML posicionado, no en canvas.
- Bocas: de 3 a 4 por ciclo, x dentro de 0,24–0,76 con separación mínima 0,12, elegidas con RNG con semilla por ciclo. Cada boca es un pequeño tramo vertical Steel de 14 px sobre el rim, en y = 0,22.
- Relleno: campo de alturas de 96 columnas entre los lados interiores del cuenco. Se dibuja como área Steel al 22 % de opacidad con la superficie en línea Steel 1,5 px.
- Granos en el aire: círculos Steel de radio 2,2 px.

### 5.2 Ciclo (aprox. 9 s)

| Fase | Duración | Qué ocurre |
|---|---|---|
| `pouring` | ~4 s | Las bocas se abren escalonadas (0, 400, 800, 1200 ms). Cada boca emite granos con gravedad y un pequeño jitter en x. Al tocar la superficie, el grano se absorbe y suma volumen a su columna; el exceso de pendiente entre columnas vecinas se reparte (ángulo de reposo), formando montones bajo cada boca. Las bocas cierran cuando el volumen total alcanza 1,18 × el volumen del cuenco hasta el rim. |
| `settling` | ≤ 0,6 s | Sin bocas; se absorben los granos que quedan en el aire. |
| `sweeping` | 1,1 s | El rasero entra por la izquierda apoyado en el rim: su borde derecho va de x = 0,08 a 0,92 con ease-in-out. Para cada columna a la izquierda de ese borde, altura = min(altura, rim). La masa retirada se convierte en granos barridos con velocidad hacia la derecha y arriba, que caen fuera del cuenco y se desvanecen en 0,7 s. |
| `verdict` | 2,4 s | Medida exactamente enrasada, rasero en x 0,08–0,92. El bloque de veredicto pasa a Compliant. |
| `draining` | 0,8 s | Las alturas bajan a 0 con ease-in y el rasero sale por la derecha (borde derecho de 0,92 a 1,92, ease-in). Nueva semilla, nuevas bocas, vuelta a `pouring`. |

El contador «Proving · mm:ss» cuenta desde el inicio de `pouring` y se congela al entrar en `verdict`.

### 5.3 Interacción

- Hover sobre una boca (a ≤ 24 px en CSS de su x, con y entre 0,14 y 0,36): aparece el rótulo «Supplier NN · signed · not disclosed» en Plex Mono 11 px, panel blanco, borde 1 px, radio 4 px, 12 px a la derecha de la boca. Desaparece al salir. En pantallas táctiles no hay hover; no se añade sustituto.
- No hay otra interacción con el cursor. Nada reacciona al scroll.

### 5.4 Estados especiales

- **Movimiento reducido (`prefers-reduced-motion: reduce`):** no hay bucle. Estado fijo: cuenco enrasado, rasero apoyado en el rim en su posición final, tres bocas cerradas, veredicto Compliant visible. Los textos del hero aparecen sin animación de entrada.
- **Fuera del viewport o pestaña oculta:** el bucle se pausa (IntersectionObserver con umbral 0 y `visibilitychange`) y se reanuda sin saltos: el `dt` se recorta a 50 ms máximo.
- **Sin canvas o sin JS:** el contenedor muestra el símbolo estático `strickle-mark.svg` en Steel a 160 px y el veredicto Compliant. Es también el estado de servidor antes de hidratar.

### 5.5 Bloque de veredicto (HTML)

Región `aria-live="polite"`. Dos presentaciones, con transición de opacidad de 400 ms:

- **Proving:** reloj (icono de 16 px, trazo Steel) + «Proving · 00:04» en Plex Mono 13 px, texto Steel atenuado, sin color de fondo.
- **Compliant:** caja `--ok-bg` con borde 1 px `--ok`, radio 4 px, relleno 12 × 16 px. Dentro: círculo con check de 20 px en `--ok`, «Compliant» en Bitter 700 20 px color `--ok`, y debajo «Meets the 16 % minimum · Regulation (EU) 2023/1542» en Plex Sans 13,5 px, texto Steel.

Palabra + forma + color, siempre. Nunca se muestra Non-compliant en el hero.

## 6 · Estilo

### 6.1 Tokens

Los de BRANDING §6, copiados literalmente a `landing/src/app/globals.css`, más el mapeo Tailwind v4 en `@theme inline`:

```css
@theme inline {
  --color-ground: var(--ground);
  --color-panel: var(--panel);
  --color-edge: var(--edge);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-accent: var(--accent);
  --color-accent-text: var(--accent-text);
  --color-ok: var(--ok);
  --color-ok-bg: var(--ok-bg);
  --font-display: var(--font-bitter), Georgia, "Times New Roman", serif;
  --font-body: var(--font-plex-sans), "Helvetica Neue", Arial, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, Menlo, monospace;
}
```

El hero fija `data-theme="light"` en `<html>`: la landing es clara siempre. Los bloques oscuros del branding quedan definidos para la futura sección «built on Midnight», pero no se activan aquí.

### 6.2 Tipografía

`next/font/google`, subconjunto `latin`, `display: swap`, expuestas como variables CSS:

| Variable | Familia | Pesos / estilos |
|---|---|---|
| `--font-bitter` | Bitter | 700, 800, 700 itálica |
| `--font-plex-sans` | IBM Plex Sans | 400, 500, 600 |
| `--font-plex-mono` | IBM Plex Mono | 400, 500 |

| Elemento | Especificación |
|---|---|
| H1 | Bitter 800, `clamp(44px, 5.4vw, 84px)`, line-height 1,0, letter-spacing −0,01 em, `text-wrap: balance`. Línea 2 en `<em>` Bitter 700 itálica, mismo tamaño |
| Etiqueta | Plex Sans 500 12 px, mayúsculas, tracking 0,10 em, texto atenuado |
| Lead | Plex Sans 400 17 px, line-height 1,5, máx. 460 px |
| Botón primario | Plex Sans 500 15 px, alto 44 px, relleno 0 20 px, fondo Steel, texto Zinc, radio 4 px |
| Enlace secundario | Plex Sans 500 15 px, color Bronze, subrayado al hover |
| Navegación | Plex Sans 500 15 px, Steel; hover Bronze |
| Pie | Plex Mono 400 12 px, mayúsculas, tracking 0,08 em, texto atenuado, `tabular-nums` |

### 6.3 Movimiento de entrada

Etiqueta, H1, lead y acciones: opacidad 0→1 y `translateY(18px→0)`, 750 ms, `cubic-bezier(.2,.7,.2,1)`, retrasos 0 / 80 / 160 / 240 ms. El instrumento no tiene animación de entrada: empieza a verter directamente. Con movimiento reducido, todo visible desde el primer fotograma.

### 6.4 Foco y contraste

Anillo de foco 2 px Bronze, desplazamiento 2 px, en todo elemento interactivo. Todo texto cumple AA sobre su fondo (ratios en BRANDING §5.1). Cero scroll horizontal a cualquier ancho desde 360 px.

## 7 · Arquitectura de código

Todo bajo `landing/src/`.

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `app/layout.tsx` | servidor | Carga las tres fuentes, fija `lang="en"` y `data-theme="light"`, metadatos |
| `app/globals.css` | — | Tokens de BRANDING §6, `@theme inline`, reset mínimo, foco, reveal de entrada |
| `app/page.tsx` | servidor | Renderiza `<SiteHeader />` y `<Hero />` |
| `components/site/SiteHeader.tsx` | servidor | Lockup, navegación, botón primario. Oculta la navegación < 900 px |
| `components/site/Wordmark.tsx` | servidor | Símbolo SVG inline (`currentColor`) + wordmark |
| `components/hero/Hero.tsx` | servidor | Sección, rejilla, columna de texto, pie. Monta `<Instrument />` |
| `components/hero/Instrument.tsx` | cliente | Canvas, bucle rAF, tamaño y DPR, IntersectionObserver, `matchMedia` de movimiento reducido, hover de bocas, rótulos HTML, marca del rim. Delega en `sim` y `draw` |
| `components/hero/Verdict.tsx` | cliente | Bloque Proving / Compliant a partir de `phase` y `elapsedMs` |
| `components/hero/instrument/sim.ts` | puro | Estado y `step(state, dtMs)`. Sin DOM, sin canvas. Determinista dada la semilla |
| `components/hero/instrument/draw.ts` | puro sobre `CanvasRenderingContext2D` | Dibuja un `SimState` en un contexto. Sin estado propio |
| `components/hero/instrument/rng.ts` | puro | RNG con semilla (mulberry32) |
| `public/brand/strickle-mark.svg` | asset | Copia de `~/templo/midnight/brand/strickle-mark.svg` |

### 7.1 Interfaz de `sim.ts`

```ts
export type Phase = "pouring" | "settling" | "sweeping" | "verdict" | "draining";

export interface Spout { x: number; opensAt: number; open: boolean }
export interface Grain { x: number; y: number; vx: number; vy: number; swept: boolean; life: number }

export interface SimState {
  phase: Phase;
  phaseElapsed: number;      // ms dentro de la fase
  cycleElapsed: number;      // ms desde el inicio de pouring (se congela en verdict)
  seed: number;
  columns: Float32Array;     // 96 alturas normalizadas, 0 = fondo del cuenco, 1 = rim
  grains: Grain[];
  spouts: Spout[];
  strickleX: number;         // x del borde derecho del rasero; solo tiene sentido en sweeping, verdict y draining
}

export const GEOMETRY = {
  bowlLeft: 0.18, bowlRight: 0.82, rim: 0.36, bottom: 0.86,
  spoutY: 0.22, spoutMinX: 0.24, spoutMaxX: 0.76, spoutMinGap: 0.12,
  strickleWidth: 0.84, strickleRestRight: 0.92,
  columns: 96, overfill: 1.18, maxGrains: 400,
} as const;

export function createSim(seed: number, opts?: { reducedMotion?: boolean }): SimState;
export function step(state: SimState, dtMs: number): void;  // muta el estado
export function spoutAt(state: SimState, x: number, y: number, toleranceX: number): number | null;
```

Con `reducedMotion: true`, `createSim` devuelve el estado de `verdict` ya enrasado y `step` es una no-op.

## 8 · Accesibilidad y rendimiento

- Canvas con `aria-hidden="true"`; el significado lo dan el texto y el bloque de veredicto.
- Región viva solo en el veredicto; los rótulos de boca son decorativos (`aria-hidden`).
- Canvas dimensionado al tamaño CSS de su caja por `ResizeObserver`, escala `min(devicePixelRatio, 1.5)`.
- Presupuesto: ≤ 400 granos vivos a la vez; el bucle no asigna objetos por fotograma salvo al emitir granos.
- Sin dependencias nuevas de runtime. Una sola dependencia nueva de desarrollo: `vitest`. No hace falta entorno DOM porque los tests cubren módulos puros.

## 9 · Pruebas

Vitest sobre `sim.ts`, sin DOM:

1. Determinismo: dos simulaciones con la misma semilla y los mismos `dt` producen el mismo estado.
2. El vertido termina: tras avanzar ≤ 8 s, la fase ha pasado por `sweeping`.
3. Tras `sweeping`, ninguna columna supera el rim (tolerancia 1e-6) y la fase es `verdict`.
4. Antes de `sweeping`, al menos una columna supera el rim (hubo exceso que enrasar).
5. Con `reducedMotion`, `createSim` devuelve `verdict` con todas las columnas exactamente en el rim, y `step` no cambia nada.
6. `spoutAt` devuelve el índice de la boca dentro de la tolerancia y `null` fuera.
7. Un ciclo completo vuelve a `pouring` con una semilla distinta y bocas nuevas.

Verificación de aceptación, manual y por comandos: `npm run lint`, `npm run build`, `npm test`; comprobación visual a 1440, 1024, 768 y 390 px; `prefers-reduced-motion` activado en DevTools; ninguna barra de scroll horizontal.

## 10 · Fuera de alcance

Secciones posteriores de la landing, la sección oscura «built on Midnight», favicon y social card, versión en español, analítica, y cualquier destino real de los enlaces. El estado Non-compliant no aparece en el hero.
