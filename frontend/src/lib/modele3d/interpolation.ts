/**
 * Interpolation over the site: inverse-distance weighting, a least-squares
 * plane, and regular grids. Coordinates in metres in the model's local
 * frame (x east, y north). Pure.
 */

export interface PointValeur {
  x: number
  y: number
  v: number
}

/** A regular grid: node (i, j) at (x0 + i·dx, y0 + j·dy), values row by row (j major). */
export interface Grille {
  x0: number
  y0: number
  dx: number
  dy: number
  nx: number
  ny: number
  valeurs: Float64Array
}

export function nouvelleGrille(x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): Grille {
  return { x0, y0, dx: (x1 - x0) / (nx - 1), dy: (y1 - y0) / (ny - 1), nx, ny, valeurs: new Float64Array(nx * ny) }
}

export const xNoeud = (g: Grille, i: number) => g.x0 + i * g.dx
export const yNoeud = (g: Grille, j: number) => g.y0 + j * g.dy

/** Fills every node with f(x, y). */
export function remplir(g: Grille, f: (x: number, y: number) => number): Grille {
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) g.valeurs[j * g.nx + i] = f(xNoeud(g, i), yNoeud(g, j))
  return g
}

/** Bilinear value of the grid at (x, y), clamped to its edges. */
export function valeurEn(g: Grille, x: number, y: number): number {
  const fi = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.dx))
  const fj = Math.min(g.ny - 1, Math.max(0, (y - g.y0) / g.dy))
  const i = Math.min(g.nx - 2, Math.floor(fi))
  const j = Math.min(g.ny - 2, Math.floor(fj))
  const u = fi - i
  const w = fj - j
  const v = (ii: number, jj: number) => g.valeurs[jj * g.nx + ii]
  if (g.nx < 2 || g.ny < 2) return g.valeurs[0]
  return (1 - u) * (1 - w) * v(i, j) + u * (1 - w) * v(i + 1, j) + (1 - u) * w * v(i, j + 1) + u * w * v(i + 1, j + 1)
}

/**
 * Inverse-distance weighting, power 2 by default. A point closer than a
 * centimetre gives its own value.
 */
export function idw(points: PointValeur[], x: number, y: number, puissance = 2): number {
  let sw = 0
  let sv = 0
  for (const p of points) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d2 < 1e-4) return p.v
    const w = 1 / d2 ** (puissance / 2)
    sw += w
    sv += w * p.v
  }
  return sw > 0 ? sv / sw : Number.NaN
}

export interface Plan {
  a: number
  b: number
  c: number
}

/**
 * Plane v = a·x + b·y + c through the points by least squares; null with
 * fewer than three points or points (nearly) aligned. Coordinates are
 * centred first so that Lambert 93 magnitudes do not ruin the solve.
 */
export function planMoindresCarres(points: PointValeur[]): Plan | null {
  const n = points.length
  if (n < 3) return null
  const xm = points.reduce((s, p) => s + p.x, 0) / n
  const ym = points.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  let sxv = 0
  let syv = 0
  let sv = 0
  for (const p of points) {
    const x = p.x - xm
    const y = p.y - ym
    sxx += x * x
    sxy += x * y
    syy += y * y
    sxv += x * p.v
    syv += y * p.v
    sv += p.v
  }
  const det = sxx * syy - sxy * sxy
  // Aligned wells: the determinant vanishes against the spread squared.
  if (Math.abs(det) < 1e-9 * (sxx + syy) ** 2 || sxx + syy === 0) return null
  const a = (sxv * syy - syv * sxy) / det
  const b = (syv * sxx - sxv * sxy) / det
  const c = sv / n - a * xm - b * ym
  return { a, b, c }
}

/**
 * Trend plus residuals: the least-squares plane through the points, and the
 * inverse-distance weighting of what it leaves at each point. The surface
 * passes through every point and keeps the regional slope between and
 * beyond them — a water table or a ground surface rather than the flat
 * plateaus of a bare inverse-distance weighting. Under three points (or
 * aligned points), the plain weighting.
 */
export function surfaceTendance(points: PointValeur[]): (x: number, y: number) => number {
  if (!points.length) return () => Number.NaN
  const plan = planMoindresCarres(points)
  if (!plan) return (x, y) => idw(points, x, y)
  const residus = points.map((p) => ({ x: p.x, y: p.y, v: p.v - (plan.a * p.x + plan.b * p.y + plan.c) }))
  return (x, y) => plan.a * x + plan.b * y + plan.c + idw(residus, x, y)
}

/** Distance from (x, y) to the nearest point. */
export function distancePlusProche(points: { x: number; y: number }[], x: number, y: number): number {
  let m = Number.POSITIVE_INFINITY
  for (const p of points) m = Math.min(m, Math.hypot(p.x - x, p.y - y))
  return m
}

/** Median distance from each point to its nearest neighbour (0 under two points). */
export function espacementMedian(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0
  const d = points
    .map((p, i) => Math.min(...points.filter((_, k) => k !== i).map((q) => Math.hypot(p.x - q.x, p.y - q.y))))
    .sort((a, b) => a - b)
  const m = Math.floor(d.length / 2)
  return d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2
}

/** Flow direction of a plane head = a·x + b·y + c: azimuth (° from north, clockwise) downslope, and gradient. */
export function ecoulementDuPlan(p: Plan): { azimut: number; gradient: number } | null {
  const gradient = Math.hypot(p.a, p.b)
  if (!(gradient > 0)) return null
  return { azimut: ((Math.atan2(-p.a, -p.b) * 180) / Math.PI + 360) % 360, gradient }
}

/** A "nice" step for grid spacing and axis ticks: 1, 2 or 5 × 10^n. */
export function pasRond(x: number): number {
  if (!(x > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(x))
  const m = x / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

/** Convex hull of points (monotone chain), counter-clockwise; fewer than three distinct points give what there is. */
export function enveloppeConvexe(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const croix = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const bas: { x: number; y: number }[] = []
  for (const q of p) {
    while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop()
    bas.push(q)
  }
  const haut: { x: number; y: number }[] = []
  for (const q of [...p].reverse()) {
    while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop()
    haut.push(q)
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)]
}

/** Inside a convex polygon given counter-clockwise (always false under three vertices). */
export function dansPolygoneConvexe(poly: { x: number; y: number }[], x: number, y: number): boolean {
  if (poly.length < 3) return false
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false
  }
  return true
}

/**
 * Where an interpolation between points is shown: inside their convex hull
 * (between the points), and within `portee` of one of them (beyond).
 */
export function zoneInterpolee(points: { x: number; y: number }[], portee: number): (x: number, y: number) => boolean {
  const poly = enveloppeConvexe(points)
  return (x, y) => dansPolygoneConvexe(poly, x, y) || distancePlusProche(points, x, y) <= portee
}

/** Inside a set of rings (polygons, holes, several parcels): even–odd rule. */
export function dansAnneaux(anneaux: [number, number][][], x: number, y: number): boolean {
  let dedans = false
  for (const a of anneaux)
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i]
      const [xj, yj] = a[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans
    }
  return dedans
}
