/**
 * Statistics on left-censored environmental data (results below a
 * quantification limit), after the USEPA ProUCL technical guidance:
 *
 * - Kaplan-Meier mean and standard deviation, the recommended estimator
 *   when less than ~70 % of results are below the LQ (non-parametric, copes
 *   with several LQs). Computed by "flipping" the data (Helsel, 2012) so the
 *   usual right-censored product-limit estimator applies; standard error of
 *   the mean from Greenwood's formula;
 * - 95 % upper confidence limits on the mean: KM-t and KM-Chebyshev — the
 *   two ProUCL reports for skewed data (5.1 favoured Chebyshev for highly
 *   skewed data, 5.2 defaults to t when n < 28 or SD(log) > 1.5);
 * - outlier screening on log-transformed detects: Dixon's test for
 *   3 ≤ n ≤ 25, Rosner's generalised ESD test above, both at α = 5 %.
 *
 * These are screening statistics: a value flagged as an outlier is a value
 * to look at, never one to drop without a field or laboratory reason.
 */

// ---- Distributions ------------------------------------------------------------

function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const k of c) ser += k / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

/** Continued fraction for the incomplete beta function (Numerical Recipes). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200
  const EPS = 3e-12
  const FPMIN = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

function betaRegularisee(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

/** Cumulative distribution of Student's t with `nu` degrees of freedom. */
export function studentCDF(t: number, nu: number): number {
  const x = nu / (nu + t * t)
  const p = 0.5 * betaRegularisee(nu / 2, 0.5, x)
  return t >= 0 ? 1 - p : p
}

/** Quantile of Student's t (bisection on the CDF). */
export function studentQuantile(p: number, nu: number): number {
  let bas = -1000
  let haut = 1000
  for (let i = 0; i < 200; i++) {
    const milieu = (bas + haut) / 2
    if (studentCDF(milieu, nu) < p) bas = milieu
    else haut = milieu
  }
  return (bas + haut) / 2
}

// ---- Kaplan-Meier on left-censored data ------------------------------------------

export interface Observation {
  valeur: number
  /** True for a result below the LQ, `valeur` being the LQ. */
  censure: boolean
}

export interface KaplanMeier {
  moyenne: number
  ecartType: number
  erreurType: number
}

export function kaplanMeier(obs: Observation[]): KaplanMeier | null {
  const detects = obs.filter((o) => !o.censure)
  if (detects.length < 2) return null
  // Flip: y = M − x turns "x < LQ" into "y > M − LQ", a right censoring.
  const M = Math.max(...obs.map((o) => o.valeur)) + 1
  const y = obs.map((o) => ({ t: M - o.valeur, evenement: !o.censure })).sort((a, b) => a.t - b.t)
  const temps = [...new Set(y.filter((o) => o.evenement).map((o) => o.t))].sort((a, b) => a - b)
  const etapes: { t: number; n: number; d: number; S: number }[] = []
  let S = 1
  for (const t of temps) {
    const n = y.filter((o) => o.t >= t).length
    const d = y.filter((o) => o.evenement && o.t === t).length
    S *= 1 - d / n
    etapes.push({ t, n, d, S })
  }
  // Mean of y restricted to the last event: the mass left below the
  // smallest detect is placed on it, as ProUCL does.
  let moyY = 0
  let precedent = { t: 0, S: 1 }
  for (const e of etapes) {
    moyY += precedent.S * (e.t - precedent.t)
    precedent = e
  }
  const moyenne = M - moyY

  // Probability masses on the detected values, for the standard deviation.
  let Sprec = 1
  let variance = 0
  etapes.forEach((e, i) => {
    const masse = Sprec - e.S + (i === etapes.length - 1 ? e.S : 0)
    variance += masse * (M - e.t - moyenne) ** 2
    Sprec = e.S
  })

  // Greenwood: Var = Σ A_j² d_j / (n_j (n_j − d_j)), A_j the area under S
  // from t_j to the last event.
  let varMoyenne = 0
  for (let j = 0; j < etapes.length; j++) {
    const { n, d } = etapes[j]
    if (n === d) continue
    let A = 0
    for (let k = j; k < etapes.length - 1; k++) A += etapes[k].S * (etapes[k + 1].t - etapes[k].t)
    varMoyenne += (A * A * d) / (n * (n - d))
  }
  return { moyenne, ecartType: Math.sqrt(variance), erreurType: Math.sqrt(varMoyenne) }
}

// ---- Outliers --------------------------------------------------------------------

// Dixon's critical values at α = 5 % (two-sided use on one tail), n = 3…25.
const DIXON_05: Record<number, number> = {
  3: 0.941, 4: 0.765, 5: 0.642, 6: 0.56, 7: 0.507, 8: 0.554, 9: 0.512, 10: 0.477, 11: 0.576, 12: 0.546, 13: 0.521, 14: 0.546,
  15: 0.525, 16: 0.507, 17: 0.49, 18: 0.475, 19: 0.462, 20: 0.45, 21: 0.44, 22: 0.43, 23: 0.421, 24: 0.413, 25: 0.406,
}

/** Dixon's test on the largest value (r10, r11, r21 or r22 depending on n). */
function dixon(x: number[]): boolean {
  const s = [...x].sort((a, b) => a - b)
  const n = s.length
  const crit = DIXON_05[n]
  if (!crit) return false
  const etendue = (bas: number, haut: number) => s[n - 1 - haut] - s[bas]
  let r: number
  if (n <= 7) r = (s[n - 1] - s[n - 2]) / etendue(0, 0)
  else if (n <= 10) r = (s[n - 1] - s[n - 2]) / etendue(1, 0)
  else if (n <= 13) r = (s[n - 1] - s[n - 3]) / etendue(1, 0)
  else r = (s[n - 1] - s[n - 3]) / etendue(2, 0)
  return Number.isFinite(r) && r > crit
}

/** Rosner's generalised ESD: indices of the values found to be outliers. */
function rosner(x: number[], rMax: number): Set<number> {
  const restants = x.map((v, i) => ({ v, i }))
  const candidats: { i: number; R: number; lambda: number }[] = []
  for (let k = 1; k <= rMax && restants.length > 2; k++) {
    const n = restants.length
    const moy = restants.reduce((a, o) => a + o.v, 0) / n
    const sd = Math.sqrt(restants.reduce((a, o) => a + (o.v - moy) ** 2, 0) / (n - 1))
    if (!sd) break
    let pire = 0
    restants.forEach((o, j) => {
      if (Math.abs(o.v - moy) > Math.abs(restants[pire].v - moy)) pire = j
    })
    const R = Math.abs(restants[pire].v - moy) / sd
    const N = x.length
    const p = 1 - 0.05 / (2 * (N - k + 1))
    const t = studentQuantile(p, N - k - 1)
    const lambda = ((N - k) * t) / Math.sqrt((N - k - 1 + t * t) * (N - k + 1))
    candidats.push({ i: restants[pire].i, R, lambda })
    restants.splice(pire, 1)
  }
  let nombre = 0
  candidats.forEach((c, k) => {
    if (c.R > c.lambda) nombre = k + 1
  })
  return new Set(candidats.slice(0, nombre).map((c) => c.i))
}

export interface ResultatAtypiques {
  test: 'Dixon' | 'Rosner' | null
  /** Indices (in the detects array given) of potential outliers. */
  indices: Set<number>
}

/** Screens the detects (on their logarithm) for unusually high values. */
export function valeursAtypiques(detects: number[]): ResultatAtypiques {
  const positifs = detects.filter((v) => v > 0)
  if (positifs.length !== detects.length || detects.length < 3) return { test: null, indices: new Set() }
  const logs = detects.map(Math.log10)
  if (detects.length <= 25) {
    if (!dixon(logs)) return { test: 'Dixon', indices: new Set() }
    const max = Math.max(...logs)
    return { test: 'Dixon', indices: new Set([logs.indexOf(max)]) }
  }
  return { test: 'Rosner', indices: rosner(logs, Math.min(10, Math.floor(detects.length / 5))) }
}

// ---- Summary per compound ----------------------------------------------------------

export interface StatsExpertes {
  n: number
  detectes: number
  partCensuree: number
  km: KaplanMeier | null
  uclT: number | null
  uclChebyshev: number | null
  coefVariation: number | null
  asymetrie: number | null
  ecartTypeLog: number | null
  atypiques: { test: string | null; echantillons: string[] }
  avertissement: string | null
}

export function statsExpertes(valeurs: { echantillon: string; valeur: number; inferieur: boolean }[]): StatsExpertes {
  const n = valeurs.length
  const detects = valeurs.filter((v) => !v.inferieur)
  const k = detects.length
  const partCensuree = n ? ((n - k) / n) * 100 : 0
  const km = kaplanMeier(valeurs.map((v) => ({ valeur: v.valeur, censure: v.inferieur })))
  const x = detects.map((v) => v.valeur)
  const moy = k ? x.reduce((a, b) => a + b, 0) / k : 0
  const sd = k > 1 ? Math.sqrt(x.reduce((a, v) => a + (v - moy) ** 2, 0) / (k - 1)) : null
  const asymetrie = k > 2 && sd ? (k / ((k - 1) * (k - 2))) * x.reduce((a, v) => a + ((v - moy) / sd) ** 3, 0) : null
  const logs = x.filter((v) => v > 0).map(Math.log)
  const mlog = logs.length ? logs.reduce((a, b) => a + b, 0) / logs.length : 0
  const ecartTypeLog = logs.length > 1 ? Math.sqrt(logs.reduce((a, v) => a + (v - mlog) ** 2, 0) / (logs.length - 1)) : null
  const assezDeDetects = k >= 8
  const t = n > 1 ? studentQuantile(0.95, n - 1) : null
  const uclT = km && assezDeDetects && t ? km.moyenne + t * km.erreurType : null
  const uclChebyshev = km && assezDeDetects ? km.moyenne + Math.sqrt(1 / 0.05 - 1) * km.erreurType : null
  const atyp = valeursAtypiques(x)
  let avertissement: string | null = null
  if (!k) avertissement = 'Aucun résultat quantifié.'
  else if (k < 8) avertissement = 'Moins de 8 résultats quantifiés : UCL non calculée (ProUCL recommande au moins 8 à 10 détections).'
  else if (partCensuree > 70) avertissement = 'Plus de 70 % de résultats <LQ : statistiques indicatives.'
  return {
    n,
    detectes: k,
    partCensuree,
    km,
    uclT,
    uclChebyshev,
    coefVariation: sd && moy ? sd / moy : null,
    asymetrie,
    ecartTypeLog,
    atypiques: { test: atyp.test, echantillons: [...atyp.indices].map((i) => detects[i].echantillon) },
    avertissement,
  }
}
