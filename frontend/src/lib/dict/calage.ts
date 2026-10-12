import proj4 from 'proj4'

/** Coordinate systems met on French network plans. */
export type Crs = 'EPSG:2154' | `EPSG:39${42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50}` | 'EPSG:3857' | 'EPSG:27572'

const CC = [42, 43, 44, 45, 46, 47, 48, 49, 50] as const

proj4.defs('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
for (const z of CC) {
  proj4.defs(
    `EPSG:39${z}`,
    `+proj=lcc +lat_0=${z} +lon_0=3 +lat_1=${z - 0.75} +lat_2=${z + 0.75} +x_0=1700000 +y_0=${(z - 41) * 1000000 + 200000} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
  )
}
proj4.defs(
  'EPSG:27572',
  '+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 +a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs',
)

export function libelleCrs(crs: Crs): string {
  if (crs === 'EPSG:2154') return 'Lambert 93'
  if (crs === 'EPSG:3857') return 'Web Mercator'
  if (crs === 'EPSG:27572') return 'Lambert II étendu'
  return `Lambert CC${crs.slice(-2)}`
}

export const TOUS_CRS: Crs[] = ['EPSG:2154', ...CC.map((z) => `EPSG:39${z}` as Crs), 'EPSG:3857', 'EPSG:27572']

/** Coordinate system named on the plan, if any. */
export function crsIndique(texte: string): Crs | null {
  const cc = texte.match(/\bCC\s?(4[2-9]|50)\b/) ?? texte.match(/EPSG\s*:?\s*39(4[2-9]|50)\b/)
  if (cc) return `EPSG:39${cc[1]}` as Crs
  const zone = texte.match(/Lambert\s+(?:Zone|zone|CC)\s*(\d)\b/)
  if (zone && +zone[1] >= 1 && +zone[1] <= 9) return `EPSG:39${41 + +zone[1]}` as Crs
  if (/EPSG\s*:?\s*2154|Lambert[\s-]*93|\bL93\b|RGF\s?93\s*\/\s*L(?:ambert)?\s*93/i.test(texte)) return 'EPSG:2154'
  if (/EPSG\s*:?\s*3857|Pseudo[\s-]Mercator|Web\s?Mercator/i.test(texte)) return 'EPSG:3857'
  if (/EPSG\s*:?\s*27572|Lambert\s+(?:II|2)\s+[ée]tendu|\bLIIE\b/i.test(texte)) return 'EPSG:27572'
  return null
}

export function versL93(crs: Crs, e: number, n: number): [number, number] {
  return crs === 'EPSG:2154' ? [e, n] : (proj4(crs, 'EPSG:2154', [e, n]) as [number, number])
}

export const versMercator = (e: number, n: number) => proj4('EPSG:2154', 'EPSG:3857', [e, n]) as [number, number]

/** Page (PDF user space, points) to map: E = a·x + b·y + c, N = d·x + e·y + f. */
export type Affine = [number, number, number, number, number, number]

export const appliquer = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]]

export function inverse(m: Affine): Affine {
  const det = m[0] * m[4] - m[1] * m[3]
  return [m[4] / det, -m[1] / det, (m[1] * m[5] - m[4] * m[2]) / det, -m[3] / det, m[0] / det, (m[3] * m[2] - m[0] * m[5]) / det]
}

/** Metres per point of the page: 1:200 gives 0.0706. */
export const metresParPoint = (m: Affine) => Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3]))
export const echelleDe = (m: Affine) => Math.round(metresParPoint(m) / (0.0254 / 72))

export interface Etiquette {
  valeur: number
  /** Axis written on the label ("X=", "N :"…), if any. */
  axe: 'E' | 'N' | null
  /** Centre of the label, in PDF user space. */
  x: number
  y: number
}

export type Rect = [number, number, number, number]

const NOMBRE = /^(?:([XYEN])\s*[=:]?\s*)?(\d{1,3}(?:[\s ]\d{3}){1,2}|\d{5,8})(?:[.,]\d{1,3})?\s*m?$/i

/** Reads a grid label: "X=657792", "657 640", "N 6 868 655", "6261228 m". */
export function lireEtiquette(texte: string): { valeur: number; axe: 'E' | 'N' | null } | null {
  const m = texte.trim().match(NOMBRE)
  if (!m) return null
  const valeur = +m[2].replace(/[\s ]/g, '')
  if (valeur < 10000) return null
  const a = m[1]?.toUpperCase()
  return { valeur, axe: a === 'X' || a === 'E' ? 'E' : a === 'Y' || a === 'N' ? 'N' : null }
}

interface Ajustement {
  a: number
  b: number
  inliers: { p: number; v: number }[]
  residu: number
}

/** v = a·p + b over the labels of one axis, ignoring stray numbers
 *  (post codes, dimensions): every pair of labels proposes a line, the one
 *  most labels agree with wins, then a least-squares fit on those. */
function ajuster(points: { p: number; v: number }[]): Ajustement | null {
  let meilleur: { a: number; b: number; inliers: typeof points } | null = null
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dp = points[j].p - points[i].p
      if (Math.abs(dp) < 5 || points[i].v === points[j].v) continue
      const a = (points[j].v - points[i].v) / dp
      if (a <= 0 || a > 50) continue
      const b = points[i].v - a * points[i].p
      // A label may sit a few points off its line.
      const tol = a * 4
      const inliers = points.filter((q) => Math.abs(a * q.p + b - q.v) <= tol)
      if (new Set(inliers.map((q) => q.v)).size < 2) continue
      if (!meilleur || inliers.length > meilleur.inliers.length) meilleur = { a, b, inliers }
    }
  }
  if (!meilleur) return null
  const n = meilleur.inliers.length
  const mp = meilleur.inliers.reduce((s, q) => s + q.p, 0) / n
  const mv = meilleur.inliers.reduce((s, q) => s + q.v, 0) / n
  let num = 0
  let den = 0
  for (const q of meilleur.inliers) {
    num += (q.p - mp) * (q.v - mv)
    den += (q.p - mp) ** 2
  }
  const a = num / den
  const b = mv - a * mp
  return { a, b, inliers: meilleur.inliers, residu: Math.max(...meilleur.inliers.map((q) => Math.abs(a * q.p + b - q.v))) }
}

export interface CalageEtiquettes {
  m: Affine
  /** Largest gap between a label and the fitted grid, in metres. */
  residu: number
  /** Grid values read on the plan, for the record. */
  valeursE: number[]
  valeursN: number[]
  /** Map area inferred from the labels: label centres sit on grid lines. */
  enveloppe: Rect
}

/** Georeferences a north-up plan from its grid labels. Unlabelled values
 *  are told apart by size: in every French system the northing is the
 *  larger number. */
export function calerParEtiquettes(etiquettes: Etiquette[]): CalageEtiquettes | null {
  const sans = [...new Set(etiquettes.filter((e) => !e.axe).map((e) => e.valeur))].sort((a, b) => a - b)
  let seuil = Infinity
  let rapport = 1.5
  for (let i = 1; i < sans.length; i++) {
    if (sans[i] / sans[i - 1] > rapport) {
      rapport = sans[i] / sans[i - 1]
      seuil = sans[i]
    }
  }
  const estE = (e: Etiquette) => (e.axe ? e.axe === 'E' : e.valeur < seuil)
  const estN = (e: Etiquette) => (e.axe ? e.axe === 'N' : e.valeur >= seuil)
  const fe = ajuster(etiquettes.filter(estE).map((e) => ({ p: e.x, v: e.valeur })))
  const fn = ajuster(etiquettes.filter(estN).map((e) => ({ p: e.y, v: e.valeur })))
  if (!fe || !fn) return null
  // Same scale on both axes, or this is not a map grid.
  if (Math.abs(fe.a - fn.a) / fe.a > 0.03) return null
  const ps = (f: Ajustement) => f.inliers.map((q) => q.p)
  return {
    m: [fe.a, 0, fe.b, 0, fn.a, fn.b],
    residu: Math.max(fe.residu, fn.residu),
    valeursE: [...new Set(fe.inliers.map((q) => q.v))].sort((a, b) => a - b),
    valeursN: [...new Set(fn.inliers.map((q) => q.v))].sort((a, b) => a - b),
    enveloppe: [Math.min(...ps(fe)), Math.min(...ps(fn)), Math.max(...ps(fe)), Math.max(...ps(fn))],
  }
}

/** Systems whose value ranges fit the grid values. */
function crsPlausibles(e: number, n: number): Crs[] {
  const r: Crs[] = []
  if (e > 50000 && e < 1300000 && n > 6000000 && n < 7200000) r.push('EPSG:2154')
  if (e > 1000000 && e < 2400000 && n > 1000000 && n < 9400000) {
    const z = 41 + Math.round((n - 200000) / 1000000)
    if (z >= 42 && z <= 50) r.push(`EPSG:39${z}` as Crs)
  }
  if (e > -700000 && e < 1100000 && n > 5000000 && n < 6700000) r.push('EPSG:3857')
  if (e > 0 && e < 1300000 && n > 1500000 && n < 2800000) r.push('EPSG:27572')
  return r
}

/** Picks the plan's coordinate system: the one written on it, checked
 *  against the works' commune when known; otherwise the plausible one
 *  nearest to the commune. */
export function choisirCrs(indice: Crs | null, centre: [number, number], commune: [number, number] | null): Crs | null {
  const distance = (crs: Crs) => {
    if (!commune) return 0
    const [x, y] = versL93(crs, centre[0], centre[1])
    return Math.hypot(x - commune[0], y - commune[1])
  }
  if (indice && (!commune || distance(indice) < 30000)) return indice
  const candidats = crsPlausibles(centre[0], centre[1]).sort((a, b) => distance(a) - distance(b))
  if (!candidats.length) return indice
  return !commune || distance(candidats[0]) < 30000 ? candidats[0] : null
}

/** Solves the affine transform through three or more point pairs (least
 *  squares); with two, the similarity (scale, rotation, shift). */
export function calerParPoints(points: { x: number; y: number; e: number; n: number }[]): Affine | null {
  if (points.length < 2) return null
  if (points.length === 2) {
    const [p, q] = points
    const dx = q.x - p.x
    const dy = q.y - p.y
    const d2 = dx * dx + dy * dy
    if (d2 < 1) return null
    const de = q.e - p.e
    const dn = q.n - p.n
    // α = (z'q − z'p) / (zq − zp) with z = x + iy, z' = E + iN.
    const a = (de * dx + dn * dy) / d2
    const b = (dn * dx - de * dy) / d2
    return [a, -b, p.e - a * p.x + b * p.y, b, a, p.n - b * p.x - a * p.y]
  }
  const resoudre = (cible: (q: (typeof points)[number]) => number) => {
    const s = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    const t = [0, 0, 0]
    for (const q of points) {
      const v = [q.x, q.y, 1]
      for (let i = 0; i < 3; i++) {
        t[i] += v[i] * cible(q)
        for (let j = 0; j < 3; j++) s[i * 3 + j] += v[i] * v[j]
      }
    }
    const det = (m: number[]) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
    const d = det(s)
    if (Math.abs(d) < 1e-9) return null
    return [0, 1, 2].map((k) => det(s.map((val, idx) => (idx % 3 === k ? t[Math.floor(idx / 3)] : val))) / d)
  }
  const e = resoudre((q) => q.e)
  const n = resoudre((q) => q.n)
  return e && n ? [e[0], e[1], e[2], n[0], n[1], n[2]] : null
}

/** The plan's transform composed with the change of system, as a single
 *  affine map to Lambert 93: exact for Lambert 93, and within millimetres
 *  over a plan's extent for the other conformal projections. */
export function affineL93(m: Affine, crs: Crs, cadre: Rect): Affine {
  if (crs === 'EPSG:2154') return m
  const coins = [
    [cadre[0], cadre[1]],
    [cadre[2], cadre[1]],
    [cadre[0], cadre[3]],
    [cadre[2], cadre[3]],
  ].map(([x, y]) => {
    const [e, n] = appliquer(m, x, y)
    const [ex, ny] = versL93(crs, e, n)
    return { x, y, e: ex, n: ny }
  })
  return calerParPoints(coins) ?? m
}

/** Map frame: the large rectangle drawn on the plan that best matches the
 *  area spanned by the grid labels; the labels' own extent otherwise. */
export function choisirCadre(rectangles: Rect[], enveloppe: Rect, page: Rect): Rect {
  const pageAire = (page[2] - page[0]) * (page[3] - page[1])
  let meilleur: Rect = enveloppe
  let score = Infinity
  for (const r of rectangles) {
    const aire = (r[2] - r[0]) * (r[3] - r[1])
    if (aire < 0.2 * pageAire) continue
    // The frame must hold the labelled grid, give or take a label.
    if (r[0] > enveloppe[0] + 20 || r[1] > enveloppe[1] + 20 || r[2] < enveloppe[2] - 20 || r[3] < enveloppe[3] - 20) continue
    const s = Math.abs(r[0] - enveloppe[0]) + Math.abs(r[1] - enveloppe[1]) + Math.abs(r[2] - enveloppe[2]) + Math.abs(r[3] - enveloppe[3])
    if (s < score) {
      score = s
      meilleur = r
    }
  }
  return meilleur
}
