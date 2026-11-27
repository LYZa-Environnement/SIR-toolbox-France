/**
 * Kriging for the model's surfaces (water table, plume, contacts between
 * formations), with the reliability that inverse distance cannot give:
 *
 * - trend first: the least-squares plane through the points (the regional
 *   slope of a water table, the dip of a layer), then ordinary kriging of
 *   what it leaves — « krigeage des résidus » (regression kriging);
 * - experimental semivariogram of the residuals, γ(h) = ½ mean (zi − zj)²
 *   by distance classes, fitted with a nugget plus a spherical or
 *   exponential model by least squares weighted by the number of pairs;
 *   under 6 points, a spherical model of range half the largest distance
 *   and sill the variance (too few pairs to fit anything);
 * - at each node, the estimate and its kriging standard deviation (the
 *   uncertainty map);
 * - leave-one-out cross-validation: each point estimated from the others,
 *   the errors and their root mean square.
 *
 * References: G. Matheron, « Traité de géostatistique appliquée » (1962);
 * P. Goovaerts, « Geostatistics for Natural Resources Evaluation » (1997),
 * chapters 4 and 5; J.-P. Chilès, P. Delfiner, « Geostatistics » (2012).
 * Pure.
 */

import { idw, planMoindresCarres, type Plan, type PointValeur } from './interpolation.ts'

export type Methode = 'krigeage' | 'idw'

export const LIBELLES_METHODE: Record<Methode, string> = {
  krigeage: 'Krigeage (tendance plane et résidus)',
  idw: 'Inverse distance (tendance plane et résidus)',
}

export type Modele = 'spherique' | 'exponentiel'

export interface Variogramme {
  modele: Modele
  pepite: number
  palier: number
  portee: number
  /** Fitted on the data, or the default for too few points. */
  ajuste: boolean
  /** Experimental points (distance, semivariance, pairs). */
  experimental: { h: number; gamma: number; paires: number }[]
}

export function gamma(v: Variogramme, h: number): number {
  if (h <= 0) return 0
  const c = v.palier - v.pepite
  if (v.modele === 'spherique') return h >= v.portee ? v.palier : v.pepite + c * (1.5 * (h / v.portee) - 0.5 * (h / v.portee) ** 3)
  // Exponential: practical range (95 % of the sill) at `portee`.
  return v.pepite + c * (1 - Math.exp((-3 * h) / v.portee))
}

const variance = (vs: number[]) => {
  const m = vs.reduce((a, b) => a + b, 0) / vs.length
  return vs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vs.length - 1)
}

export function variogrammeExperimental(points: PointValeur[], classes = 8): Variogramme['experimental'] {
  const paires: { h: number; g: number }[] = []
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) paires.push({ h: Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y), g: 0.5 * (points[i].v - points[j].v) ** 2 })
  if (!paires.length) return []
  // Half the largest distance: beyond, too few pairs and edge effects.
  const hMax = Math.max(...paires.map((p) => p.h)) / 2
  const pas = hMax / classes
  const out: Variogramme['experimental'] = []
  for (let k = 0; k < classes; k++) {
    const dans = paires.filter((p) => p.h > k * pas && p.h <= (k + 1) * pas)
    if (dans.length) out.push({ h: dans.reduce((a, p) => a + p.h, 0) / dans.length, gamma: dans.reduce((a, p) => a + p.g, 0) / dans.length, paires: dans.length })
  }
  return out
}

/** Semivariogram model of the points (residuals). */
export function ajusterVariogramme(points: PointValeur[]): Variogramme {
  const vs = points.map((p) => p.v)
  const s2 = Math.max(variance(vs), 1e-12)
  const dMax = Math.max(1, ...points.flatMap((p, i) => points.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y))))
  const experimental = variogrammeExperimental(points)
  const defaut: Variogramme = { modele: 'spherique', pepite: 0, palier: s2, portee: dMax / 2, ajuste: false, experimental }
  if (points.length < 6 || experimental.length < 3) return defaut
  let meilleur: Variogramme | null = null
  let erreur = Number.POSITIVE_INFINITY
  for (const modele of ['spherique', 'exponentiel'] as Modele[])
    for (let ip = 0; ip <= 5; ip++)
      for (let ia = 1; ia <= 20; ia++) {
        const portee = (dMax * ia) / 20
        const pepite = (s2 * ip) / 10
        // Sill by weighted least squares for this shape: γ = c0 + c·g(h).
        const forme = { modele, pepite: 0, palier: 1, portee, ajuste: true, experimental }
        let num = 0
        let den = 0
        for (const e of experimental) {
          const g = gamma(forme, e.h)
          num += e.paires * (e.gamma - pepite) * g
          den += e.paires * g * g
        }
        const c = den > 0 ? Math.max(0, num / den) : 0
        const v: Variogramme = { modele, pepite, palier: pepite + c, portee, ajuste: true, experimental }
        let sse = 0
        for (const e of experimental) sse += e.paires * (e.gamma - gamma(v, e.h)) ** 2
        if (sse < erreur && v.palier > 0) [meilleur, erreur] = [v, sse]
      }
  return meilleur ?? defaut
}

/** Inverse of a square matrix (Gauss–Jordan with partial pivoting); null when singular. */
export function inverser(M: number[][]): number[][] | null {
  const n = M.length
  const a = M.map((l, i) => [...l, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    if (Math.abs(a[p][c]) < 1e-12) return null
    ;[a[c], a[p]] = [a[p], a[c]]
    const d = a[c][c]
    for (let k = 0; k < 2 * n; k++) a[c][k] /= d
    for (let r = 0; r < n; r++) {
      if (r === c || a[r][c] === 0) continue
      const f = a[r][c]
      for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]
    }
  }
  return a.map((l) => l.slice(n))
}

export interface Estimation {
  v: number
  /** Kriging standard deviation (NaN with inverse distance). */
  ecart: number
}

export interface Validation {
  /** Each point estimated from the others. */
  erreurs: { x: number; y: number; observe: number; estime: number }[]
  /** Root mean square error. */
  rmse: number
  /** Mean error (bias). */
  biais: number
}

export interface Interpolateur {
  methode: Methode
  /** Trend plane (null under three points or for aligned points). */
  plan: Plan | null
  variogramme: Variogramme | null
  estimer: (x: number, y: number) => Estimation
  validation: Validation | null
}

/** Ordinary kriging of the points with a variogram: the system inverted once, then any number of estimates. */
function krigeur(points: PointValeur[], v: Variogramme): ((x: number, y: number) => Estimation) | null {
  const n = points.length
  // Ordinary kriging system in semivariances, with the Lagrange multiplier row.
  const K = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === n || j === n ? (i === n && j === n ? 0 : 1) : gamma(v, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)))),
  )
  const Ki = inverser(K)
  if (!Ki) return null
  const k = new Float64Array(n + 1)
  return (x, y) => {
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(points[i].x - x, points[i].y - y)
      if (d < 1e-6) return { v: points[i].v, ecart: 0 }
      k[i] = gamma(v, d)
    }
    k[n] = 1
    let est = 0
    let s2 = 0
    for (let i = 0; i <= n; i++) {
      let w = 0
      const ligne = Ki[i]
      for (let j = 0; j <= n; j++) w += ligne[j] * k[j]
      if (i < n) est += w * points[i].v
      // σ² = Σ λi γ(xi, x) + μ
      s2 += w * k[i]
    }
    return { v: est, ecart: Math.sqrt(Math.max(0, s2)) }
  }
}

function construire(points: PointValeur[], methode: Methode): Omit<Interpolateur, 'validation'> {
  const plan = points.length >= 3 ? planMoindresCarres(points) : null
  const tendance = (x: number, y: number) => (plan ? plan.a * x + plan.b * y + plan.c : 0)
  const residus = points.map((p) => ({ x: p.x, y: p.y, v: p.v - tendance(p.x, p.y) }))
  if (methode === 'krigeage' && points.length >= 3) {
    const variogramme = ajusterVariogramme(residus)
    const k = krigeur(residus, variogramme)
    if (k)
      return {
        methode,
        plan,
        variogramme,
        estimer: (x, y) => {
          const e = k(x, y)
          return { v: tendance(x, y) + e.v, ecart: e.ecart }
        },
      }
  }
  const moyenne = residus.reduce((a, p) => a + p.v, 0) / Math.max(1, residus.length)
  return {
    methode: 'idw',
    plan,
    variogramme: null,
    estimer: (x, y) => ({ v: tendance(x, y) + (residus.length ? idw(residus, x, y) : moyenne), ecart: Number.NaN }),
  }
}

/** Leave-one-out: each point estimated from all the others (with the same method). */
export function validationCroisee(points: PointValeur[], methode: Methode): Validation | null {
  if (points.length < 4) return null
  const erreurs = points.map((p, i) => {
    const autres = points.filter((_, j) => j !== i)
    return { x: p.x, y: p.y, observe: p.v, estime: construire(autres, methode).estimer(p.x, p.y).v }
  })
  const ecarts = erreurs.map((e) => e.estime - e.observe)
  return { erreurs, rmse: Math.sqrt(ecarts.reduce((a, b) => a + b * b, 0) / ecarts.length), biais: ecarts.reduce((a, b) => a + b, 0) / ecarts.length }
}

/** The interpolation of a set of points with its trend, variogram and cross-validation. */
export function interpoler(points: PointValeur[], methode: Methode, avecValidation = true): Interpolateur {
  return { ...construire(points, methode), validation: avecValidation ? validationCroisee(points, methode) : null }
}
