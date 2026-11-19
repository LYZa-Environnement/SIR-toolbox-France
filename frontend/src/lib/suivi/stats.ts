/**
 * Non-parametric statistics for groundwater monitoring time series.
 *
 * - Mann-Kendall trend test (Mann, 1945; Kendall, 1975): statistic S,
 *   variance corrected for ties, Z with continuity correction, p-value —
 *   exact (permutation distribution of S) for short series without ties,
 *   normal approximation otherwise. The test used by the BRGM tool HYPE
 *   (BRGM/RP-63066-FR) and by the European groundwater trend guidance.
 * - Theil-Sen slope (Theil, 1950; Sen, 1968) in units per year on the real
 *   sampling dates, with the confidence interval of Gilbert (1987, § 16.5)
 *   and the Conover intercept (median(x) − slope × median(t)).
 * - Seasonal Kendall test (Hirsch, Slack & Smith, 1982): one Mann-Kendall
 *   per season (high water / low water), statistics and variances added.
 * - Pettitt change-point test (Pettitt, 1979), approximate p-value
 *   2·exp(−6K²/(n³ + n²)).
 * - Kendall's tau-b between two variables (concentration against water
 *   level), variance with ties in both.
 * - LOWESS smoothing (Cleveland, 1979), tricube weights, robustness steps.
 *
 * Pure: plain numbers in, plain numbers out.
 */

// ---- Normal distribution --------------------------------------------------------------

/** Standard normal CDF. */
export function phi(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0
  return 0.5 * erfc(-z / Math.SQRT2)
}

/** Complementary error function (Numerical Recipes' erfcc, Chebyshev fit,
 *  relative error < 1.2e-7 everywhere — ample for p-values given to 3 digits). */
function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  return x >= 0 ? r : 2 - r
}

/** Quantile of the standard normal (Acklam's algorithm, relative error < 1.2e-9). */
export function phiInverse(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const bas = 0.02425
  if (p < bas) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - bas) return -phiInverse(1 - p)
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

// ---- Descriptive ------------------------------------------------------------------------

export function mediane(xs: number[]): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Quantile, linear interpolation between order statistics (type 7, as Excel's QUARTILE.INC). */
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const h = (s.length - 1) * q
  const i = Math.floor(h)
  return i + 1 < s.length ? s[i] + (h - i) * (s[i + 1] - s[i]) : s[i]
}

export function moyenne(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
}

/** Sample standard deviation (n − 1). */
export function ecartType(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = moyenne(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

// ---- Ties --------------------------------------------------------------------------------

/** Sizes of the groups of equal values (only groups of 2 or more). */
export function groupesEgaux(xs: number[]): number[] {
  const n = new Map<number, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n.values()].filter((t) => t > 1)
}

const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0)

// ---- Mann-Kendall -----------------------------------------------------------------------

export interface MannKendall {
  n: number
  S: number
  varS: number
  Z: number
  /** Kendall's tau (S over the number of pairs). */
  tau: number
  /** One-sided p-value in the direction of S (probability of an |S| at least as large in that direction by chance). */
  pUnilateral: number
  /** Two-sided p-value. */
  pBilateral: number
  /** Confidence that the sign of S is real, 1 − one-sided p (the "confidence factor" of MAROS). */
  confiance: number
  exact: boolean
  /** The series holds equal values (ties), the variance is corrected. */
  exAequo: boolean
}

/** Number of permutations of n items with k inversions (Mahonian numbers), k = 0…n(n−1)/2. */
function mahonien(n: number): number[] {
  let c = [1]
  for (let m = 2; m <= n; m++) {
    const max = c.length - 1 + (m - 1)
    const suite = new Array<number>(max + 1).fill(0)
    for (let k = 0; k <= max; k++) {
      let s = 0
      for (let i = 0; i <= Math.min(k, m - 1); i++) if (k - i < c.length) s += c[k - i]
      suite[k] = s
    }
    c = suite
  }
  return c
}

/** P(S ≥ s) under H0 for n untied values, from the permutation distribution. */
function queueExacte(n: number, s: number): number {
  const N = (n * (n - 1)) / 2
  const c = mahonien(n)
  const total = c.reduce((a, b) => a + b, 0)
  // S = N − 2·inv  ⇒  S ≥ s  ⇔  inv ≤ (N − s) / 2
  const borne = Math.floor((N - s) / 2)
  let p = 0
  for (let k = 0; k <= borne && k < c.length; k++) p += c[k]
  return p / total
}

/**
 * Mann-Kendall test on values in time order. Equal values count as ties
 * (sign 0) and the variance is corrected:
 * Var(S) = [n(n−1)(2n+5) − Σ t(t−1)(2t+5)] / 18.
 */
export function mannKendall(x: number[]): MannKendall | null {
  const n = x.length
  if (n < 3) return null
  let S = 0
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += sgn(x[j] - x[i])
  const ties = groupesEgaux(x)
  const varS = (n * (n - 1) * (2 * n + 5) - ties.reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0)) / 18
  const Z = varS > 0 ? (S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0) : 0
  const exact = !ties.length && n <= 10
  let pUnilateral: number
  if (S === 0) pUnilateral = 0.5
  else if (exact) pUnilateral = queueExacte(n, Math.abs(S))
  else pUnilateral = 1 - phi(Math.abs(Z))
  const pBilateral = Math.min(1, 2 * pUnilateral)
  return {
    n,
    S,
    varS,
    Z,
    tau: S / ((n * (n - 1)) / 2),
    pUnilateral: S === 0 ? 0.5 : pUnilateral,
    pBilateral: S === 0 ? 1 : pBilateral,
    confiance: S === 0 ? 0 : 1 - pUnilateral,
    exact,
    exAequo: ties.length > 0,
  }
}

// ---- Seasonal Kendall ---------------------------------------------------------------------

export interface KendallSaisonnier {
  S: number
  varS: number
  Z: number
  pBilateral: number
  /** Seasons that took part (3 values at least). */
  saisons: string[]
  /** Seasonal Sen slope: median of the within-season pairwise slopes (per year). */
  pente: number | null
}

/** Seasonal Kendall: Mann-Kendall within each season, S and Var(S) added (seasons taken as independent). */
export function kendallSaisonnier(series: { saison: string; t: number[]; x: number[] }[]): KendallSaisonnier | null {
  let S = 0
  let varS = 0
  const saisons: string[] = []
  const pentes: number[] = []
  for (const s of series) {
    const mk = mannKendall(s.x)
    if (!mk) continue
    S += mk.S
    varS += mk.varS
    saisons.push(s.saison)
    for (let i = 0; i < s.x.length - 1; i++)
      for (let j = i + 1; j < s.x.length; j++) if (s.t[j] !== s.t[i]) pentes.push((s.x[j] - s.x[i]) / (s.t[j] - s.t[i]))
  }
  if (saisons.length < 2 || varS <= 0) return null
  const Z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0
  return { S, varS, Z, pBilateral: S === 0 ? 1 : Math.min(1, 2 * (1 - phi(Math.abs(Z)))), saisons, pente: pentes.length ? mediane(pentes) : null }
}

// ---- Theil-Sen ------------------------------------------------------------------------------

export interface Sen {
  /** Units per year. */
  pente: number
  /** Value at t = 0 of the fitted line: x = ordonnee + pente × t. */
  ordonnee: number
  /** Confidence interval of the slope (Gilbert, 1987), at the level asked. */
  basse: number | null
  haute: number | null
  paires: number
}

/**
 * Theil-Sen slope: median of the slopes between every pair of results
 * taken at different dates. t in decimal years. The confidence interval
 * ranks the slopes and takes the order statistics around the median
 * C = z(1−α/2)·√Var(S) apart (Gilbert, 1987).
 */
export function sen(t: number[], x: number[], varS?: number, alpha = 0.05): Sen | null {
  const pentes: number[] = []
  for (let i = 0; i < x.length - 1; i++) for (let j = i + 1; j < x.length; j++) if (t[j] !== t[i]) pentes.push((x[j] - x[i]) / (t[j] - t[i]))
  if (!pentes.length) return null
  pentes.sort((a, b) => a - b)
  const pente = mediane(pentes)
  const ordonnee = mediane(x) - pente * mediane(t)
  let basse: number | null = null
  let haute: number | null = null
  if (varS !== undefined && varS > 0) {
    const N = pentes.length
    const C = phiInverse(1 - alpha / 2) * Math.sqrt(varS)
    const m1 = Math.round((N - C) / 2)
    const m2 = Math.round((N + C) / 2) + 1
    if (m1 >= 1 && m2 <= N) {
      basse = pentes[m1 - 1]
      haute = pentes[m2 - 1]
    }
  }
  return { pente, ordonnee, basse, haute, paires: pentes.length }
}

// ---- Pettitt ----------------------------------------------------------------------------------

export interface Pettitt {
  /** Index of the last value before the change (0-based). */
  indice: number
  K: number
  p: number
  /** The values after the change are mostly higher. */
  hausse: boolean
}

/** Pettitt's change-point test: U(t) = Σ_{i≤t} Σ_{j>t} sgn(x_i − x_j), K = max |U(t)|. */
export function pettitt(x: number[]): Pettitt | null {
  const n = x.length
  if (n < 4) return null
  let K = 0
  let indice = 0
  let U = 0
  let signe = 0
  for (let t = 0; t < n - 1; t++) {
    // U(t) = U(t−1) + Σ_j sgn(x_t − x_j)
    for (let j = 0; j < n; j++) U += sgn(x[t] - x[j])
    if (Math.abs(U) > K) {
      K = Math.abs(U)
      indice = t
      signe = U
    }
  }
  const p = Math.min(1, 2 * Math.exp((-6 * K * K) / (n ** 3 + n ** 2)))
  return { indice, K, p, hausse: signe < 0 }
}

// ---- Kendall correlation -------------------------------------------------------------------

export interface Correlation {
  n: number
  tau: number
  p: number
}

/** Kendall's tau-b between two paired series, two-sided p from the normal approximation with ties in both. */
export function kendallTau(x: number[], y: number[]): Correlation | null {
  const n = Math.min(x.length, y.length)
  if (n < 4) return null
  let S = 0
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += sgn(x[j] - x[i]) * sgn(y[j] - y[i])
  const n0 = (n * (n - 1)) / 2
  const tx = groupesEgaux(x.slice(0, n))
  const ty = groupesEgaux(y.slice(0, n))
  const n1 = tx.reduce((s, t) => s + (t * (t - 1)) / 2, 0)
  const n2 = ty.reduce((s, t) => s + (t * (t - 1)) / 2, 0)
  const den = Math.sqrt((n0 - n1) * (n0 - n2))
  if (!den) return null
  const v0 = n * (n - 1) * (2 * n + 5)
  const vt = tx.reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0)
  const vu = ty.reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0)
  const v1 = tx.reduce((s, t) => s + t * (t - 1), 0) * ty.reduce((s, t) => s + t * (t - 1), 0)
  const v2 = tx.reduce((s, t) => s + t * (t - 1) * (t - 2), 0) * ty.reduce((s, t) => s + t * (t - 1) * (t - 2), 0)
  const varS = (v0 - vt - vu) / 18 + v1 / (2 * n * (n - 1)) + (n > 2 ? v2 / (9 * n * (n - 1) * (n - 2)) : 0)
  const Z = varS > 0 ? (S > 0 ? S - 1 : S < 0 ? S + 1 : 0) / Math.sqrt(varS) : 0
  return { n, tau: S / den, p: S === 0 ? 1 : Math.min(1, 2 * (1 - phi(Math.abs(Z)))) }
}

// ---- LOWESS -----------------------------------------------------------------------------------

/**
 * LOWESS smoothing (Cleveland, 1979): at each point, a weighted linear fit
 * on the fraction `f` of nearest points (tricube weights), then `iterations`
 * robustness passes down-weighting large residuals (bisquare). Returns the
 * smoothed value at each x (x sorted ascending).
 */
export function lowess(x: number[], y: number[], f = 2 / 3, iterations = 2): number[] {
  const n = x.length
  if (n < 3) return [...y]
  const r = Math.max(2, Math.min(n, Math.ceil(f * n)))
  const lisse = new Array<number>(n).fill(0)
  let robustesse = new Array<number>(n).fill(1)
  for (let it = 0; it <= iterations; it++) {
    for (let i = 0; i < n; i++) {
      const distances = x.map((xi) => Math.abs(xi - x[i])).sort((a, b) => a - b)
      const h = Math.max(distances[r - 1], 1e-12)
      let sw = 0
      let swx = 0
      let swy = 0
      let swxx = 0
      let swxy = 0
      for (let j = 0; j < n; j++) {
        const u = Math.abs(x[j] - x[i]) / h
        const w = (u < 1 ? (1 - u ** 3) ** 3 : 0) * robustesse[j]
        sw += w
        swx += w * x[j]
        swy += w * y[j]
        swxx += w * x[j] * x[j]
        swxy += w * x[j] * y[j]
      }
      if (sw <= 0) {
        lisse[i] = y[i]
        continue
      }
      const mx = swx / sw
      const my = swy / sw
      const vx = swxx / sw - mx * mx
      const b = vx > 1e-12 ? (swxy / sw - mx * my) / vx : 0
      lisse[i] = my + b * (x[i] - mx)
    }
    if (it === iterations) break
    const residus = y.map((yi, i) => Math.abs(yi - lisse[i]))
    const s = mediane(residus)
    if (s <= 1e-12) break
    robustesse = residus.map((e) => {
      const u = e / (6 * s)
      return u < 1 ? (1 - u * u) ** 2 : 0
    })
  }
  return lisse
}

// ---- Dates ----------------------------------------------------------------------------------

/** ISO date (yyyy-mm-dd) as decimal years: 2024-07-02 → 2024.5. */
export function anneeDecimale(iso: string): number {
  const [a, m, j] = iso.split('-').map(Number)
  const debut = Date.UTC(a, 0, 1)
  const fin = Date.UTC(a + 1, 0, 1)
  return a + (Date.UTC(a, (m || 1) - 1, j || 1) - debut) / (fin - debut)
}

/** Decimal years back to an ISO date. */
export function dateDepuisAnnee(t: number): string {
  const a = Math.floor(t)
  const debut = Date.UTC(a, 0, 1)
  const fin = Date.UTC(a + 1, 0, 1)
  return new Date(debut + (t - a) * (fin - debut)).toISOString().slice(0, 10)
}
