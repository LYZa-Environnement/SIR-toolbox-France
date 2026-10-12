import { appliquer, inverse, type Affine, type Rect } from './calage'

/** A page rendered to pixels. */
export interface Rendu {
  rgba: Uint8ClampedArray
  largeur: number
  hauteur: number
  /** PDF user space to image pixel (corner-based). */
  versPixel: Affine
}

/** The coloured part of a plan, as a georeferenced mask. */
export interface Masque {
  /** Opacity 0–255, row by row. */
  alpha: Uint8Array
  /** Colour of each pixel, as 1 + its index in `palette` (0: none). */
  classes: Uint8Array
  /** Main colours of the plan's networks, with their share of pixels. */
  palette: { couleur: string; part: number }[]
  /** Number of coloured pixels kept. */
  pixels: number
  largeur: number
  hauteur: number
  /** Mask pixel (column, row; corner-based) to Lambert 93. */
  versL93: Affine
  /** Pixel size, in metres. */
  resolution: number
  /** Share of the map frame painted in colour: high for a photograph or a
   *  coloured background, which is not a network. */
  partColoree: number
  /** Lambert 93 box of the coloured pixels, null when there are none. */
  emprise: Rect | null
}

/** Grid drawn on the plan, to remove it when it is coloured. */
export interface Grille {
  /** User space to the plan's own system (north up). */
  m: Affine
  valeursE: number[]
  valeursN: number[]
}

/** Network lines are coloured; the base map (cadastre, buildings, text,
 *  grid) is black or grey. Opacity follows saturation, which keeps the
 *  anti-aliased edges of a line soft. */
function opacite(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  if (max < 40) return 0
  const sat = (max - Math.min(r, g, b)) / max
  return sat < 0.3 ? 0 : Math.min(255, Math.round(((sat - 0.2) / 0.5) * 255))
}

const hex = (r: number, g: number, b: number) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`

export function rvb(couleur: string): [number, number, number] {
  const n = parseInt(couleur.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const ecart = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** How far a pixel is from colour c laid over white at some opacity: an
 *  anti-aliased edge of a line stays that line's colour. */
function ecartSurBlanc(r: number, g: number, b: number, c: [number, number, number]): number {
  const u = [c[0] - 255, c[1] - 255, c[2] - 255]
  const q = [r - 255, g - 255, b - 255]
  const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2] || 1
  const a = Math.max(0, Math.min(1, (q[0] * u[0] + q[1] * u[1] + q[2] * u[2]) / uu))
  return Math.hypot(q[0] - a * u[0], q[1] - a * u[1], q[2] - a * u[2])
}

/** Main colours among the fully coloured pixels, similar shades merged. */
function palette(rendu: Rendu, alpha: Uint8Array, zone: [number, number, number, number]) {
  const [x0, y0, x1] = zone
  const w = x1 - x0
  const bacs = new Map<number, { n: number; r: number; g: number; b: number }>()
  let forts = 0
  for (let k = 0; k < alpha.length; k++) {
    if (alpha[k] < 255) continue
    const i = ((Math.floor(k / w) + y0) * rendu.largeur + (k % w) + x0) * 4
    const [r, g, b] = [rendu.rgba[i], rendu.rgba[i + 1], rendu.rgba[i + 2]]
    const cle = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const bac = bacs.get(cle) ?? { n: 0, r: 0, g: 0, b: 0 }
    bac.n++
    bac.r += r
    bac.g += g
    bac.b += b
    bacs.set(cle, bac)
    forts++
  }
  const groupes: { c: [number, number, number]; n: number }[] = []
  for (const bac of [...bacs.values()].sort((p, q) => q.n - p.n)) {
    const c: [number, number, number] = [bac.r / bac.n, bac.g / bac.n, bac.b / bac.n]
    // A lighter tint of a colour (anti-aliasing) belongs to that colour.
    const proche = groupes.find((g) => ecart(g.c, c) < 48 || ecartSurBlanc(c[0], c[1], c[2], g.c) < 30)
    if (proche) proche.n += bac.n
    else groupes.push({ c, n: bac.n })
  }
  return groupes
    .filter((g) => g.n >= Math.max(20, forts * 0.003))
    .slice(0, 16)
    .map((g) => ({ c: g.c.map(Math.round) as [number, number, number], n: g.n }))
}

const pas = (valeurs: number[]) => {
  let p = Infinity
  for (let i = 1; i < valeurs.length; i++) p = Math.min(p, valeurs[i] - valeurs[i - 1])
  return Number.isFinite(p) && p > 0 ? p : null
}

/** Erases a coloured grid: along every grid line, if most of the line is
 *  coloured, the pixels of that colour within three pixels are cleared —
 *  networks of another colour crossing it stay whole. */
function effacerGrille(rendu: Rendu, alpha: Uint8Array, zone: [number, number, number, number], grille: Grille, cadre: Rect) {
  const versPage = inverse(grille.m)
  const [x0, y0, x1, y1] = zone
  const w = x1 - x0
  const lignes: [[number, number], [number, number]][] = []
  const [eMin, nMin] = appliquer(grille.m, cadre[0], cadre[1])
  const [eMax, nMax] = appliquer(grille.m, cadre[2], cadre[3])
  const pe = pas(grille.valeursE)
  const pn = pas(grille.valeursN)
  if (pe) for (let v = grille.valeursE[0] - Math.ceil((grille.valeursE[0] - eMin) / pe) * pe; v <= eMax; v += pe) lignes.push([appliquer(versPage, v, nMin), appliquer(versPage, v, nMax)])
  if (pn) for (let v = grille.valeursN[0] - Math.ceil((grille.valeursN[0] - nMin) / pn) * pn; v <= nMax; v += pn) lignes.push([appliquer(versPage, eMin, v), appliquer(versPage, eMax, v)])

  for (const [a, b] of lignes) {
    const [ax, ay] = appliquer(rendu.versPixel, a[0], a[1])
    const [bx, by] = appliquer(rendu.versPixel, b[0], b[1])
    const long = Math.hypot(bx - ax, by - ay)
    if (long < 10) continue
    const [dx, dy] = [(bx - ax) / long, (by - ay) / long]
    const echantillons: number[] = []
    let colores = 0
    // A label may stand a pixel or two off its line.
    for (let t = 0; t <= long; t++) {
      for (let o = -2; o <= 2; o++) {
        const x = Math.round(ax + dx * t - dy * o)
        const y = Math.round(ay + dy * t + dx * o)
        if (x < x0 || y < y0 || x >= x1 || y >= y1) continue
        if (alpha[(y - y0) * w + (x - x0)]) {
          colores++
          echantillons.push((y * rendu.largeur + x) * 4)
          break
        }
      }
    }
    // Dashed grids are coloured over a fair share of their length.
    if (colores < long * 0.25) continue
    const mediane = (k: number) => echantillons.map((i) => rendu.rgba[i + k]).sort((p, q) => p - q)[echantillons.length >> 1]
    const [gr, gg, gb] = [mediane(0), mediane(1), mediane(2)]
    for (let t = 0; t <= long; t++) {
      for (let o = -3; o <= 3; o++) {
        const x = Math.round(ax + dx * t - dy * o)
        const y = Math.round(ay + dy * t + dx * o)
        if (x < x0 || y < y0 || x >= x1 || y >= y1) continue
        const i = (y * rendu.largeur + x) * 4
        // Lighter, anti-aliased edges of the grid included.
        if (ecartSurBlanc(rendu.rgba[i], rendu.rgba[i + 1], rendu.rgba[i + 2], [gr, gg, gb]) < 40) alpha[(y - y0) * w + (x - x0)] = 0
      }
    }
  }
}

/** Keeps the coloured pixels of the map frame and georeferences them.
 *  `versL93` maps the page's user space to Lambert 93. */
export function extraireMasque(rendu: Rendu, cadre: Rect, versL93: Affine, grille: Grille | null): Masque {
  const coins = [
    [cadre[0], cadre[1]],
    [cadre[2], cadre[1]],
    [cadre[0], cadre[3]],
    [cadre[2], cadre[3]],
  ].map(([x, y]) => appliquer(rendu.versPixel, x, y))
  // One pixel inside the frame, so that its own border line is left out.
  const x0 = Math.max(0, Math.ceil(Math.min(...coins.map((c) => c[0]))) + 2)
  const y0 = Math.max(0, Math.ceil(Math.min(...coins.map((c) => c[1]))) + 2)
  const x1 = Math.min(rendu.largeur, Math.floor(Math.max(...coins.map((c) => c[0]))) - 2)
  const y1 = Math.min(rendu.hauteur, Math.floor(Math.max(...coins.map((c) => c[1]))) - 2)
  const w = Math.max(0, x1 - x0)
  const h = Math.max(0, y1 - y0)
  const alpha = new Uint8Array(w * h)
  let colores = 0
  for (let y = 0; y < h; y++) {
    let i = ((y + y0) * rendu.largeur + x0) * 4
    for (let x = 0; x < w; x++, i += 4) {
      const a = opacite(rendu.rgba[i], rendu.rgba[i + 1], rendu.rgba[i + 2])
      if (a) {
        alpha[y * w + x] = a
        colores++
      }
    }
  }
  if (grille) effacerGrille(rendu, alpha, [x0, y0, x1, y1], grille, cadre)

  const couleurs = palette(rendu, alpha, [x0, y0, x1, y1])
  const classes = new Uint8Array(w * h)
  const comptes = couleurs.map(() => 0)
  if (couleurs.length) {
    for (let k = 0; k < alpha.length; k++) {
      if (!alpha[k]) continue
      const i = ((Math.floor(k / w) + y0) * rendu.largeur + (k % w) + x0) * 4
      let best = 0
      let d = Infinity
      couleurs.forEach((c, j) => {
        const e = ecartSurBlanc(rendu.rgba[i], rendu.rgba[i + 1], rendu.rgba[i + 2], c.c)
        if (e < d) {
          d = e
          best = j
        }
      })
      classes[k] = best + 1
      comptes[best]++
    }
  }
  const totalClasses = comptes.reduce((a, b) => a + b, 0) || 1

  // Cropped to the coloured pixels: plans are mostly empty.
  let cx0 = w
  let cy0 = h
  let cx1 = -1
  let cy1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!alpha[y * w + x]) continue
      if (x < cx0) cx0 = x
      if (x > cx1) cx1 = x
      if (y < cy0) cy0 = y
      if (y > cy1) cy1 = y
    }
  }
  const versUser = inverse(rendu.versPixel)
  const resolution = Math.sqrt(Math.abs(versL93[0] * versL93[4] - versL93[1] * versL93[3])) * Math.sqrt(Math.abs(versUser[0] * versUser[4] - versUser[1] * versUser[3]))
  const partColoree = w * h ? colores / (w * h) : 0
  if (cx1 < 0) {
    return { alpha: new Uint8Array(0), classes: new Uint8Array(0), palette: [], pixels: 0, largeur: 0, hauteur: 0, versL93, resolution, partColoree, emprise: null }
  }
  const cw = cx1 - cx0 + 1
  const ch = cy1 - cy0 + 1
  const recadre = new Uint8Array(cw * ch)
  const recadreClasses = new Uint8Array(cw * ch)
  for (let y = 0; y < ch; y++) {
    recadre.set(alpha.subarray((y + cy0) * w + cx0, (y + cy0) * w + cx0 + cw), y * cw)
    recadreClasses.set(classes.subarray((y + cy0) * w + cx0, (y + cy0) * w + cx0 + cw), y * cw)
  }

  // Mask pixel → image pixel → user space → Lambert 93.
  const ox = x0 + cx0
  const oy = y0 + cy0
  const p: Affine = [versUser[0], versUser[1], versUser[0] * ox + versUser[1] * oy + versUser[2], versUser[3], versUser[4], versUser[3] * ox + versUser[4] * oy + versUser[5]]
  const m: Affine = [
    versL93[0] * p[0] + versL93[1] * p[3],
    versL93[0] * p[1] + versL93[1] * p[4],
    versL93[0] * p[2] + versL93[1] * p[5] + versL93[2],
    versL93[3] * p[0] + versL93[4] * p[3],
    versL93[3] * p[1] + versL93[4] * p[4],
    versL93[3] * p[2] + versL93[4] * p[5] + versL93[5],
  ]
  const bords = [
    [0, 0],
    [cw, 0],
    [0, ch],
    [cw, ch],
  ].map(([c, r]) => appliquer(m, c, r))
  return {
    alpha: recadre,
    classes: recadreClasses,
    palette: couleurs.map((c, j) => ({ couleur: hex(...c.c), part: comptes[j] / totalClasses })),
    pixels: totalClasses,
    largeur: cw,
    hauteur: ch,
    versL93: m,
    resolution,
    partColoree,
    emprise: [Math.min(...bords.map((b) => b[0])), Math.min(...bords.map((b) => b[1])), Math.max(...bords.map((b) => b[0])), Math.max(...bords.map((b) => b[1]))],
  }
}

/** Pixel scale for rendering a plan: about 4 cm a pixel on the ground,
 *  between 100 and 220 dpi. */
export function echelleRendu(metresParPoint: number, largeurPt: number, hauteurPt: number): number {
  let s = Math.min(3, Math.max(1.4, metresParPoint / 0.04))
  // Keep the bitmap under 24 million pixels.
  const max = Math.sqrt(24e6 / (largeurPt * hauteurPt))
  if (s > max) s = max
  return s
}
