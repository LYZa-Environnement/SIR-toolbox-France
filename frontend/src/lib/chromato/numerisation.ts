/**
 * Digitising a chromatogram printed in a lab report: the page (PDF rendered
 * by pdf.js) or a screenshot becomes pixels, and the trace is read column
 * by column inside the plot frame chosen by the user.
 *
 * For each column, the trace value is its highest pixel (a peak is drawn
 * as a near-vertical line; its top is the apex). Rows crossed almost from
 * side to side (grid lines, axes) and columns crossed almost from top to
 * bottom (the C10 / C40 markers some labs draw) are ignored; isolated
 * pixels (text, specks) are skipped by asking for a neighbour.
 */

export interface Pixels {
  width: number
  height: number
  /** RGBA, row by row (ImageData.data). */
  data: Uint8ClampedArray | number[]
}

export interface Cadre {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Couleur {
  r: number
  g: number
  b: number
}

export interface TraceImage {
  /** Pixel columns. */
  x: number[]
  /** Height of the trace above the bottom of the frame, in pixels. */
  y: number[]
  /** Columns without a trace pixel (interpolated). */
  manquantes: number
  /** Image row of the zero of the signal (x axis found, else bottom of the frame). */
  zero: number
}

export function normaliserCadre(c: Cadre, img: Pixels): Cadre {
  const x0 = Math.max(0, Math.min(Math.round(c.x0), Math.round(c.x1)))
  const x1 = Math.min(img.width - 1, Math.max(Math.round(c.x0), Math.round(c.x1)))
  const y0 = Math.max(0, Math.min(Math.round(c.y0), Math.round(c.y1)))
  const y1 = Math.min(img.height - 1, Math.max(Math.round(c.y0), Math.round(c.y1)))
  return { x0, y0, x1, y1 }
}

function px(img: Pixels, x: number, y: number): Couleur {
  const i = (y * img.width + x) * 4
  // Transparent pixels (PNG) read as white paper.
  const a = img.data[i + 3] / 255
  return { r: img.data[i] * a + 255 * (1 - a), g: img.data[i + 1] * a + 255 * (1 - a), b: img.data[i + 2] * a + 255 * (1 - a) }
}

export const distance = (a: Couleur, b: Couleur) => Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)

const quantifier = (c: Couleur) => `${c.r >> 4},${c.g >> 4},${c.b >> 4}`

/** Most frequent colour of the frame: the paper. */
export function couleurFond(img: Pixels, cadreBrut: Cadre): Couleur {
  const cadre = normaliserCadre(cadreBrut, img)
  const compte = new Map<string, { n: number; c: Couleur }>()
  const pas = Math.max(1, Math.floor(Math.sqrt(((cadre.x1 - cadre.x0) * (cadre.y1 - cadre.y0)) / 40000)))
  for (let y = cadre.y0; y <= cadre.y1; y += pas) {
    for (let x = cadre.x0; x <= cadre.x1; x += pas) {
      const c = px(img, x, y)
      const k = quantifier(c)
      const e = compte.get(k)
      if (e) e.n++
      else compte.set(k, { n: 1, c })
    }
  }
  let best = { n: 0, c: { r: 255, g: 255, b: 255 } }
  for (const e of compte.values()) if (e.n > best.n) best = e
  return best.c
}

/**
 * Colour of the trace: among the colours clearly different from the paper,
 * the one present in the most pixel columns. A chromatogram runs across the
 * whole frame; the C10 / C40 markers, labels and legends, however crisp and
 * numerous their pixels, sit in a few columns only.
 */
export function couleurTrace(img: Pixels, cadreBrut: Cadre, fond: Couleur): Couleur | null {
  const cadre = normaliserCadre(cadreBrut, img)
  const l = cadre.x1 - cadre.x0 + 1
  const compte = new Map<string, { colonnes: Uint8Array; n: number; r: number; g: number; b: number }>()
  for (let y = cadre.y0; y <= cadre.y1; y++) {
    for (let x = cadre.x0; x <= cadre.x1; x++) {
      const c = px(img, x, y)
      if (distance(c, fond) < 90) continue
      const k = quantifier(c)
      let e = compte.get(k)
      if (!e) {
        e = { colonnes: new Uint8Array(l), n: 0, r: 0, g: 0, b: 0 }
        compte.set(k, e)
      }
      e.colonnes[x - cadre.x0] = 1
      e.n++
      e.r += c.r
      e.g += c.g
      e.b += c.b
    }
  }
  let best: { couverture: number; n: number; r: number; g: number; b: number } | null = null
  for (const e of compte.values()) {
    const couverture = e.colonnes.reduce((s, v) => s + v, 0)
    if (!best || couverture > best.couverture || (couverture === best.couverture && e.n > best.n)) best = { couverture, n: e.n, r: e.r, g: e.g, b: e.b }
  }
  return best ? { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n } : null
}

export function couleurEn(img: Pixels, x: number, y: number): Couleur {
  return px(img, Math.min(img.width - 1, Math.max(0, Math.round(x))), Math.min(img.height - 1, Math.max(0, Math.round(y))))
}

/**
 * Rows lit across most of the frame width, grouped into lines (a line can
 * be several pixels thick): the x axis and the horizontal grid.
 */
function lignesHorizontales(masque: Uint8Array, l: number, h: number): [number, number][] {
  const lignes: [number, number][] = []
  for (let y = 0; y < h; y++) {
    let n = 0
    for (let x = 0; x < l; x++) n += masque[y * l + x]
    if (n <= 0.6 * l) continue
    const derniere = lignes[lignes.length - 1]
    if (derniere && derniere[1] === y - 1) derniere[1] = y
    else lignes.push([y, y])
  }
  return lignes
}

/**
 * Whether a pixel belongs to the trace: close to its colour, or a blend of
 * the trace and the paper — a thin line is anti-aliased into lighter
 * shades, which a plain distance to the trace colour misses.
 */
function correspondance(trace: Couleur, fond: Couleur, tolerance: number): (c: Couleur) => boolean {
  const d = { r: trace.r - fond.r, g: trace.g - fond.g, b: trace.b - fond.b }
  const n2 = d.r * d.r + d.g * d.g + d.b * d.b
  return (c) => {
    if (distance(c, trace) <= tolerance) return true
    if (n2 < 90 * 90) return false
    // Position along paper → trace, and distance off that segment.
    const t = ((c.r - fond.r) * d.r + (c.g - fond.g) * d.g + (c.b - fond.b) * d.b) / n2
    if (t < 0.35) return false
    const proche = { r: fond.r + t * d.r, g: fond.g + t * d.g, b: fond.b + t * d.b }
    return distance(c, proche) <= tolerance / 2
  }
}

export function extraireTrace(img: Pixels, cadreBrut: Cadre, couleur: Couleur, tolerance = 80): TraceImage {
  const cadre = normaliserCadre(cadreBrut, img)
  const l = cadre.x1 - cadre.x0 + 1
  const h = cadre.y1 - cadre.y0 + 1
  const masque = new Uint8Array(l * h)
  const correspond = correspondance(couleur, couleurFond(img, cadre), tolerance)
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) if (correspond(px(img, cadre.x0 + x, cadre.y0 + y))) masque[y * l + x] = 1

  // The x axis: the lowest long horizontal line under which the trace does
  // not go — only sparse tick marks and labels (C10, C40, axis title) are
  // found there, in a minority of columns, whereas a grid line has the
  // trace under it almost everywhere. It is the zero of the signal and
  // everything under it is ignored. Without one, the bottom of the frame
  // is the zero.
  const lignes = lignesHorizontales(masque, l, h)
  const colonnesSous = (fin: number) => {
    let n = 0
    for (let x = 0; x < l; x++) {
      for (let y = fin + 1; y < h; y++) {
        if (masque[y * l + x]) {
          n++
          break
        }
      }
    }
    return n
  }
  const axe = [...lignes].reverse().find(([debut, fin]) => debut >= 0.3 * h && colonnesSous(fin) < 0.4 * l)
  const zero = axe ? axe[0] : h
  // Grid lines above the axis, and the axis itself, are erased.
  for (const [debut, fin] of lignes) for (let y = debut; y <= fin; y++) for (let x = 0; x < l; x++) masque[y * l + x] = 0
  const hauteurUtile = Math.max(1, zero)

  // Vertical lines over most of the height: the y axis and dashed markers
  // are ignored; a single continuous line is kept, as it may be a tall
  // peak drawn as a vertical stroke.
  const colonnesExclues = new Uint8Array(l)
  for (let x = 0; x < l; x++) {
    let n = 0
    let traits = 0
    for (let y = 0; y < hauteurUtile; y++) {
      const v = masque[y * l + x]
      n += v
      if (v && (y === 0 || !masque[(y - 1) * l + x])) traits++
    }
    const pointille = traits >= 4 && n > 0.3 * hauteurUtile
    const axeY = n > 0.85 * hauteurUtile && x < 0.1 * l
    if (pointille || axeY) colonnesExclues[x] = 1
  }
  const allume = (x: number, y: number) => x >= 0 && x < l && y >= 0 && y < hauteurUtile && masque[y * l + x] === 1

  const xs: number[] = []
  const ys: (number | null)[] = []
  const exclues: boolean[] = []
  for (let x = 0; x < l; x++) {
    let haut: number | null = null
    if (!colonnesExclues[x]) {
      for (let y = 0; y < hauteurUtile; y++) {
        if (!allume(x, y)) continue
        // A real trace pixel has a lit neighbour (below, or beside); on the
        // row just above the axis the trace may be one pixel thin.
        if (y === hauteurUtile - 1 || allume(x, y + 1) || allume(x - 1, y) || allume(x + 1, y) || allume(x - 1, y + 1) || allume(x + 1, y + 1)) {
          haut = y
          break
        }
      }
    }
    xs.push(cadre.x0 + x)
    ys.push(haut === null ? null : hauteurUtile - 1 - haut)
    exclues.push(!!colonnesExclues[x])
  }

  // Empty columns: gaps filled linearly. With a detected axis, the trace
  // lies on it (hidden by the erased axis line) at the ends of the frame,
  // and between two points that are on the axis: those are zero and do not
  // count as missing.
  let manquantes = 0
  const y: number[] = new Array(ys.length)
  for (let i = 0; i < ys.length; i++) {
    if (ys[i] !== null) {
      y[i] = ys[i]!
      continue
    }
    let a = i - 1
    while (a >= 0 && ys[a] === null) a--
    let b = i + 1
    while (b < ys.length && ys[b] === null) b++
    const va = a >= 0 ? ys[a]! : null
    const vb = b < ys.length ? ys[b]! : null
    if (axe && !exclues[i] && (va === null || vb === null || (va <= 3 && vb <= 3))) {
      y[i] = va !== null && vb !== null ? va + ((vb - va) * (i - a)) / (b - a) : 0
      continue
    }
    manquantes++
    y[i] = va !== null && vb !== null ? va + ((vb - va) * (i - a)) / (b - a) : (va ?? vb ?? 0)
  }
  return { x: xs, y, manquantes, zero: cadre.y0 + zero - 1 }
}

/** A numerical trace (CSV / text exported by the chromatography software): two numeric columns, time and signal. */
export function lireTraceTexte(texte: string): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (const ligne of texte.split(/\r?\n/)) {
    const t = ligne.trim()
    // "12,5;300" (decimal comma, semicolon) or "12.5,300" / "12.5 300".
    const champs = (/[;\t]/.test(t) ? t.split(/[;\t]+/) : t.split(/[,\s]+/)).map((s) => s.trim().replace(',', '.')).filter(Boolean)
    if (champs.length < 2) continue
    const a = Number(champs[0])
    const b = Number(champs[1])
    if (Number.isFinite(a) && Number.isFinite(b)) {
      x.push(a)
      y.push(b)
    }
  }
  if (x.length < 20) throw new Error('Moins de 20 lignes numériques (temps ; signal) dans le fichier.')
  const ordre = x.map((_, i) => i).sort((i, j) => x[i] - x[j])
  return { x: ordre.map((i) => x[i]), y: ordre.map((i) => y[i]) }
}
