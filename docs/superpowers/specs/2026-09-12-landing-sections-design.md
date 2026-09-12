# Landing de STRICKLE · Secciones bajo el hero

**Fecha:** 12 de septiembre de 2026 · **Estado:** estructura aprobada por David en chat; **la ejecución visual descrita en §3–§4 fue sustituida el mismo día** por el mundo «The Hallmark» construido con la skill Impeccable (ver `landing/PRODUCT.md`, `landing/DESIGN.md` y el contrato de dirección en `landing/.impeccable/surfaces/`). El orden de secciones y el copy se conservan en espíritu; los componentes viven ahora en `landing/src/components/plate/`.
**Alcance:** todo lo que va debajo del hero de vídeo en `landing/` (Next 16, Tailwind v4). El hero queda como está (`HeroScene`, `PassportCard`, `timeline.ts`).
**Documentos madre:** `~/templo/midnight/BRANDING.md` (§4.4, §5.4–5.7, §6), `~/templo/midnight/PUBLICO.md` (Parte 3 y 4), `~/templo/midnight/PROYECTO.md` (§1, §4, §5.4, §7, §8), `~/templo/midnight/research-audience-strickle.md` (§0, §1.3–1.5, §4, §5.5).

---

## 1 · Qué se aprendió de los seis sitios

Minespider, Cofinity-X, Vanta, Glemo, Certifier y CertifyMe comparten un esqueleto: prueba social con logos → problema en una frase → cómo funciona en 4–6 pasos → producto como visual → testimonios → FAQ → cierre con CTA → pie denso. Se copia el esqueleto y dos gestos: el problema dicho en dos frases secas (Glemo, «A PDF proves nothing. So nobody checks.») y «lo que ve quien comprueba» (Glemo, «What a check looks like»); y el producto real como visual (Vanta, Certifier), no ilustraciones.

No se copia nada que no tengamos: logos de clientes, testimonios, valoraciones, cifras de uso, sellos ISO, formularios de venta, precios. Ninguno se inventa. La prueba social de STRICKLE es el texto del reglamento citado por artículo (PUBLICO §4, regla 3).

## 2 · Reglas que gobiernan todas las secciones

- Mismo mundo que el hero: plaza de piedra caliza, luz de amanecer, el coche, las piezas. Todo visual nuevo o sale del propio vídeo del hero o se genera editando la imagen A.
- Modo claro por defecto. Una sola sección oscura, la del producto, donde vive «Verified on Midnight» (BRANDING §4.4.3, §5.5).
- Brass una vez por vista: en la sección del producto, la barra de progreso; en el pasaporte, el sello; en el resto, ninguna.
- Verde y rojo solo en el veredicto, siempre con palabra y forma.
- Voz: declarativas cortas con punto. «Confidencialidad auditable», nunca «anonimato». «Verdict», «attestation». La ausencia de dato se escribe: «Suppliers and quantities not disclosed».
- «Zero-knowledge» aparece una vez, en la sección de cómo funciona. «Midnight» aparece en la sección oscura y en el pie. Ninguno en titulares.
- Tipografía: Bitter 800 para titulares de sección con segunda línea en itálica 700 cuando haya dos frases; IBM Plex Sans para cuerpo; IBM Plex Mono para citas legales, datos y etiquetas.
- Sin degradados, brillos, candados, escudos, globos, dashboards flotantes.
- Movimiento: entrada suave por scroll (opacidad + 18 px) con `IntersectionObserver`; nada más, salvo los vídeos recortados y la barra de progreso de la consola. `prefers-reduced-motion` lo apaga todo.
- Responsive desde 360 px. Sin scroll horizontal.

## 3 · Secciones, en orden

### 3.1 La costura legal · `#regulation`

Titular: **The law asks you to publish the number.** / *And to protect the evidence.*
Intro (una frase): «Regulation (EU) 2023/1542 makes the recycled-content share public, requires the supplier ledger behind it, and asks for confidentiality without saying how.»

Tres columnas, cada una con etiqueta mono, cita en mono y una línea de lectura en Sans:

| Etiqueta | Cita | Lectura |
|---|---|---|
| Annex XIII · 1(e) | «recycled content information as contained in the documentation referred to in Article 8(1)» | Public. Anyone who scans the QR sees the share. |
| Art. 49(2) | «the name and address of the supplier […] the quantities of the raw material present in the battery» | The evidence behind the share names every supplier and every quantity. |
| Art. 52(2) | «with due regard for business confidentiality and other competitive concerns» | The instruction, with no mechanism. |

Debajo, la franja de relojes (mono, cuatro hitos con fecha y estado, de `research-audience-strickle.md` §0.3):
18 Feb 2027 · Battery passport mandatory, Art. 77(1) · unchanged — Q4 2026 · Access-rights implementing act, Art. 77(9) · delayed — 2028 · Recycled-content declaration, Art. 8(1) · moves with the delegated act — 18 Aug 2031 · Binding minimums, Art. 8(2) · 16 % Co · 85 % Pb · 6 % Li · 6 % Ni.

Visual: ninguno. La ley es el visual.

### 3.2 Cómo funciona · `#how`

Titular: **Four parties. One verdict.** / *The bill of materials never leaves the plant.*

Cuatro pasos en fila (columna en móvil), numerados 01–04, cada uno con un vídeo recortado del bucle del hero (silencioso, en bucle, `IntersectionObserver` para pausar), título, dos líneas y una línea mono «Visible to others: …»:

1. **The supplier signs a lot.** One attestation per delivery: total mass, recycled mass, signed by an accredited key. · Visible to others: nothing.
   Vídeo: recorte de la batería saliendo (clip 3781, región de la pieza).
2. **The manufacturer aggregates on its own device.** Eight attestations summed inside a zero-knowledge circuit against the legal minimum. Suppliers, quantities and prices stay on the device. · Visible to others: nothing.
   Vídeo: recorte del frontal volviendo al coche (clip 3722).
3. **One verdict goes on chain.** Compliant, with the regulation and the minimum it was checked against. Never the share itself. · Visible to others: model · material · minimum · Compliant.
   Vídeo: recorte del coche entero, quieto (fotograma A con la etiqueta).
4. **The notified body checks the proof. It can ask for one field.** Selective disclosure, one field per request, chosen as a public parameter. · Visible to the body: the field it asked for.
   Vídeo: recorte del pasaporte del hero (misma etiqueta) o fotograma quieto.

### 3.3 Tres superficies · `#passport` · sección oscura

Fondo: imagen de la plaza de noche (edición de A, pendiente de David). Hasta que llegue: `--ground` oscuro liso.
Titular (en Zinc sobre oscuro): **What each party holds.** / *Three screens, one proof.*

Tres paneles construidos en HTML, no capturas:

- **Console · manufacturer.** Lista de 8 atestaciones con proveedor sellado (trama) y masas en mono; botón «Certify»; barra de progreso Brass con «Proving · 00:14»; nota «The bill of materials never leaves this device». La barra anima de 0 a 100 % en 14 s cuando entra en pantalla y termina en el veredicto.
- **Passport · consumer.** Marco de móvil: barra Steel con símbolo Brass; veredicto **Compliant** en Bitter dentro de su caja; «Meets the 16 % minimum · Regulation (EU) 2023/1542»; «Suppliers and quantities not disclosed»; pie «Verified on Midnight».
- **Portal · notified body.** Selector de campo (public parameter): Recycled share · Lot count · Accreditation root; resultado en mono para un solo campo; aviso «One field per request».

Los tres son estáticos salvo la barra. Interacción mínima: el selector del portal cambia el campo mostrado (tres valores fijos).

### 3.4 Lo que ve quien comprueba · `#ledger`

Titular: **What a check looks like.** / *Two ledgers, one line between them.*
Dos columnas en mono, estilo registro:

Public ledger — modelId `0x7f3a…c1`, materialId `cobalt`, thresholdPct `16`, compliant `true`, accreditationRoot `0x91b0…e4`, lotsCounted `8`.
Private state, on the manufacturer's device — supplier `sealed`, lotMass `sealed`, recycledMass `sealed`, unitPrice `sealed`, structure `sealed`.
Debajo, una frase: «Everything on the left is verified by consensus. Everything on the right is private and, inside the circuit, proven correct.»

### 3.5 Limitaciones declaradas · `#limits`

Titular: **What this does not do.** / *Said out loud.*
Tres tarjetas planas (borde hairline, sin sombra):

1. **A signature does not make the data true.** An attestation proves an accredited supplier said it and that the lot is counted once. Fraud becomes attributable and auditable, not impossible.
2. **We hide values, not the graph.** Who attests, and how often, is a pattern. The mitigation (batching and decoy attestations) is Wave 3 work and is budgeted against the anonymity trilemma.
3. **The prover sees the witness.** The machine that builds the proof sees the bill of materials in clear. Run your own.

### 3.6 Preguntas · `#faq`

Acordeón nativo (`<details>`), seis entradas:

- Do I need to know anything about blockchain? — No. The manufacturer uploads attestations, presses Certify, and reads a verdict. Fees are sponsored; no wallet, no tokens.
- Would a notified body accept this? — The proof is public and independently checkable; the body can additionally request one field at a time. Acceptance is the body's call; the memo sets out the argument article by article.
- What does my supplier have to do? — Sign one attestation per lot with an accredited key: total mass and recycled mass. Nothing else leaves their side.
- Where does the bill of materials live? — On the manufacturer's device. It is the private input to the proof; it is never uploaded.
- What if STRICKLE disappears? — The contract and the proof format are open source; the verdicts already on chain keep verifying without us.
- What does it cost the manufacturer? — Nothing in crypto. Transaction fees are sponsored by the registry operator; the manufacturer never touches a wallet.

### 3.7 Cierre · `#memo` y `#code`

Dos columnas. Izquierda: imagen del memorándum sobre la piedra (pendiente de David; hasta entonces, una tarjeta tipográfica del índice). Derecha: **Read the technical memo.** / *Eight to twelve pages, article by article.* Índice en mono: 1 · The legal seam · 2 · The circuit · 3 · What the verifier sees · 4 · Threat model and declared limits · 5 · Test suite. Botón Steel «Download the memo (PDF)» → `#` hasta que exista.
Bajo el índice, para el juez: **See the code.** Tres enlaces en mono: Repository · Compact contract · Test suite; y una línea «Preprod contract address: pending deployment». Enlaces a `#` hasta que existan.

### 3.8 Pie

Wordmark; anclas Regulation · How it works · Passport · Ledger · Limits · FAQ · Memo; cita Art. 52 en mono; «Built on Midnight»; «© 2026 STRICKLE». Sin sellos, sin redes.

## 4 · Componentes y archivos

```
src/components/sections/
  Section.tsx          contenedor con ancla, padding, ancho máximo y reveal por scroll
  SectionTitle.tsx     kicker mono + titular Bitter en dos líneas (recta + itálica)
  Regulation.tsx       3.1
  HowItWorks.tsx       3.2 (usa StepVideo.tsx)
  StepVideo.tsx        <video> recortado, muted, loop, pausa fuera de pantalla
  Surfaces.tsx         3.3 (Console.tsx, PassportPhone.tsx, RegulatorPortal.tsx)
  Ledger.tsx           3.4
  Limits.tsx           3.5
  Faq.tsx              3.6
  Closing.tsx          3.7
src/components/site/SiteFooter.tsx   3.8
src/components/reveal/useReveal.ts   IntersectionObserver → clase .in
src/content/landing.ts               todo el copy y los datos (citas, relojes, pasos, FAQ) en un solo sitio
public/media/steps/*.mp4             recortes del bucle (ffmpeg), 640 px de ancho, sin audio
public/media/square-night.jpg        imagen 1 de David (cuando llegue)
public/media/memo.jpg                imagen 2 de David (cuando llegue)
```

`page.tsx` compone: Hero → Regulation → HowItWorks → Surfaces → Ledger → Limits → Faq → Closing → SiteFooter. La cabecera del hero cambia sus anclas a Regulation · How it works · Passport · Memo.

## 5 · Pruebas

- Vitest: `landing.ts` no contiene las palabras prohibidas («anonymity», «anonymous», «score», «claim» como sustantivo, «blockchain» fuera de la FAQ); cada sección tiene ancla única; las citas legales llevan artículo.
- `Console` progreso: función pura `progressAt(ms)` testeada (0 a 14 s, tope 100).
- Build de producción, tipado y lint limpios. Capturas a 1440, 1280 y 400 px con el arnés temporal (se borra antes del commit).

## 6 · Fuera de alcance

Formularios, precios, blog, páginas secundarias, modo oscuro global, generación del PDF del memo, despliegue en Preprod.
