/**
 * From a digitised GC-FID trace to a hydrocarbon profile on a carbon axis.
 *
 * 1. Carbon axis. With the temperature-programmed oven of the C10–C40
 *    methods, the retention time of the n-alkanes grows nearly linearly
 *    with their carbon number (linear retention indices). The user places
 *    C10 and C40, the markers printed by the labs (NF EN ISO 16703 /
 *    9377-2); the axis is then refined on the n-alkane peaks found, when
 *    there are enough of them.
 * 2. Baseline: lower convex hull of the trace ("rubber band"), which
 *    follows a drifting baseline or column bleed and passes under any hump.
 * 3. Unresolved complex mixture (UCM, "bosse"): morphological opening of
 *    the signal with a one-carbon window — narrow peaks are removed, the
 *    hump that spans several carbons stays (valley-to-valley envelope).
 *    Resolved = signal − UCM.
 * 4. Peaks of the resolved signal; n-alkanes at whole carbon numbers;
 *    pristane and phytane just after n-C17 and n-C18 (Kováts indices about
 *    1 707 and 1 811 on apolar columns, NIST WebBook).
 *
 * Peak heights are read above the hump, as the isoprenoid ratios are read
 * on GC-FID chromatograms when "the height of the separated peaks exceeds
 * the envelope of the unresolved compounds" (BRGM RP-64174-FR, § 6.2).
 */

export interface Trace {
  /** Abscissa: pixel column, or retention time for a numerical trace. Increasing. */
  x: number[]
  /** Detector signal, any unit. */
  y: number[]
}

export interface PointCalage {
  x: number
  /** Carbon number of the n-alkane at that abscissa (10 for n-decane…). */
  c: number
}

export interface Pic {
  /** Carbon position (retention index / 100). */
  c: number
  /** Height above the hump (resolved signal). */
  hauteur: number
  /** Height above the baseline. */
  brut: number
}

export type EtatDoublet = 'resolu' | 'non-resolu' | 'absent'

export interface Profil {
  /** Carbon axis, step PAS. */
  c: number[]
  /** Signal above the baseline. */
  signal: number[]
  /** Unresolved hump, ≤ signal. */
  ucm: number[]
  /** signal − ucm. */
  resolu: number[]
  bruit: number
  pics: Pic[]
  /** n-alkane peaks, indexed by carbon number (10 to 40). */
  alcanes: (Pic | null)[]
  pristane: Pic | null
  phytane: Pic | null
  doublets: { c17: EtatDoublet; c18: EtatDoublet }
  /** n-alkane peaks used to refine the carbon axis (0: the user's markers only). */
  recalage: number
  /** Points of the original trace per carbon (pixel columns for an image). */
  pointsParCarbone: number
  /** n-C10 and n-C40 added by the lab as markers / standards: their peaks, left out of the product. */
  etalons: { c10: Pic | null; c40: Pic | null } | null
}

export interface OptionsProfil {
  /**
   * The lab adds n-decane and n-tetracontane to the extract to mark the
   * C10–C40 window: their peaks anchor the axis but are not the product.
   */
  etalons?: boolean
}

/** Half-width, in carbons, of the window around C10 and C40 where a standard peak is taken out. */
export const DEMI_FENETRE_ETALON = 0.35

/**
 * Below this density, pristane (0.07 carbon after n-C17) falls within two
 * points of n-C17: the doublet cannot be split, and reading it anyway gives
 * wrong ratios (checked on digitised examples: 30 points per carbon fail,
 * 39 succeed).
 */
export const POINTS_PAR_CARBONE_MIN = 33

export const PAS = 0.01
export const DEBUT = 10
export const FIN = 40
/** Offset of the isoprenoids after their n-alkane, in carbon units (Kováts 1707 and 1811). */
export const DECALAGE_PR = 0.07
export const DECALAGE_PH = 0.11

// ---- Carbon axis ---------------------------------------------------------------------

/** Piecewise-linear map from abscissa to carbon number, extrapolated along the end segments. */
export function versCarbone(points: PointCalage[]): (x: number) => number {
  const p = [...points].sort((a, b) => a.x - b.x)
  if (p.length < 2) throw new Error('Il faut au moins deux repères (C10 et C40) pour caler l’axe des carbones.')
  if (p.some((q, i) => i > 0 && (q.x === p[i - 1].x || q.c <= p[i - 1].c))) {
    throw new Error('Les repères doivent être dans l’ordre des carbones croissants, de gauche à droite.')
  }
  return (x: number) => {
    let i = 0
    while (i < p.length - 2 && x > p[i + 1].x) i++
    const a = p[i]
    const b = p[i + 1]
    return a.c + ((x - a.x) * (b.c - a.c)) / (b.x - a.x)
  }
}

/** Linear interpolation of (xs, ys) — xs increasing — on a regular grid. */
function reechantillonner(xs: number[], ys: number[], debut: number, fin: number, pas: number): { c: number[]; y: number[] } {
  const c: number[] = []
  const y: number[] = []
  let j = 0
  for (let v = debut; v <= fin + 1e-9; v += pas) {
    while (j < xs.length - 2 && xs[j + 1] < v) j++
    const x0 = xs[j]
    const x1 = xs[j + 1]
    const t = x1 === x0 ? 0 : Math.min(1, Math.max(0, (v - x0) / (x1 - x0)))
    c.push(Math.round(v * 1000) / 1000)
    y.push(ys[j] + t * (ys[j + 1] - ys[j]))
  }
  return { c, y }
}

// ---- Baseline, hump, noise ----------------------------------------------------------------

/** Lower convex hull of the points, evaluated at every abscissa. */
export function ligneDeBase(c: number[], y: number[]): number[] {
  const h: number[] = []
  for (let i = 0; i < c.length; i++) {
    while (h.length >= 2) {
      const a = h[h.length - 2]
      const b = h[h.length - 1]
      // Keep b only if it lies below the segment a → i (strictly convex from below).
      if ((c[b] - c[a]) * (y[i] - y[a]) - (y[b] - y[a]) * (c[i] - c[a]) <= 0) h.pop()
      else break
    }
    h.push(i)
  }
  const base = new Array<number>(c.length)
  for (let k = 0; k < h.length - 1; k++) {
    const a = h[k]
    const b = h[k + 1]
    for (let i = a; i <= b; i++) base[i] = y[a] + ((y[b] - y[a]) * (i - a)) / (b - a || 1)
  }
  if (h.length === 1) base.fill(y[h[0]])
  return base
}

function glissant(y: number[], demi: number, f: (a: number, b: number) => number, init: number): number[] {
  return y.map((_, i) => {
    let v = init
    for (let k = Math.max(0, i - demi); k <= Math.min(y.length - 1, i + demi); k++) v = f(v, y[k])
    return v
  })
}

export function moyenneGlissante(y: number[], demi: number): number[] {
  const cum = [0]
  for (const v of y) cum.push(cum[cum.length - 1] + v)
  return y.map((_, i) => {
    const a = Math.max(0, i - demi)
    const b = Math.min(y.length - 1, i + demi)
    return (cum[b + 1] - cum[a]) / (b - a + 1)
  })
}

/** Hump under the peaks: opening (rolling min then max) over about one carbon, smoothed, kept under the signal. */
export function bosse(signal: number[], pas = PAS): number[] {
  const demi = Math.round(0.5 / pas)
  const ouvert = glissant(glissant(signal, demi, Math.min, Infinity), demi, Math.max, -Infinity)
  const lisse = moyenneGlissante(ouvert, Math.round(0.2 / pas))
  return lisse.map((v, i) => Math.max(0, Math.min(v, signal[i])))
}

/** Noise from the second differences (robust to slopes and peaks): σ ≈ median |Δ²| / 0.6745 / √6. */
export function bruitDe(y: number[]): number {
  const d: number[] = []
  for (let i = 1; i < y.length - 1; i++) d.push(Math.abs(y[i + 1] - 2 * y[i] + y[i - 1]))
  if (!d.length) return 0
  d.sort((a, b) => a - b)
  return d[Math.floor(d.length / 2)] / 0.6745 / Math.sqrt(6)
}

// ---- Peaks -----------------------------------------------------------------------------

export function detecterPics(c: number[], resolu: number[], signal: number[], seuil: number): Pic[] {
  const pics: Pic[] = []
  const demi = 2
  for (let i = demi; i < resolu.length - demi; i++) {
    const v = resolu[i]
    if (v <= seuil) continue
    let max = true
    for (let k = 1; k <= demi && max; k++) if (resolu[i - k] >= v || resolu[i + k] > v) max = false
    if (!max) continue
    // Sub-step position from the parabola through the three top points.
    const a = resolu[i - 1]
    const b = resolu[i + 1]
    const den = a - 2 * v + b
    const d = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - b)) / den)) : 0
    pics.push({ c: c[i] + d * (c[1] - c[0]), hauteur: v, brut: signal[i] })
  }
  return pics
}

const plusHaut = (pics: Pic[]) => pics.reduce<Pic | null>((m, p) => (!m || p.hauteur > m.hauteur ? p : m), null)

/** The isoprenoid doublet after n-C17 (pristane) or n-C18 (phytane). */
function doublet(pics: Pic[], n: number, decalage: number, cale: boolean, fin: boolean): { alcane: Pic | null; iso: Pic | null; etat: EtatDoublet } {
  const cands = pics.filter((p) => p.c >= n - 0.2 && p.c <= n + decalage + 0.2)
  if (!cands.length) return { alcane: null, iso: null, etat: 'absent' }
  if (!fin) return { alcane: plusHaut(cands.filter((p) => Math.abs(p.c - n) <= 0.25)), iso: null, etat: 'non-resolu' }
  const deux = [...cands].sort((a, b) => b.hauteur - a.hauteur).slice(0, 2).sort((a, b) => a.c - b.c)
  if (deux.length === 2) {
    const ecart = deux[1].c - deux[0].c
    if (ecart >= 0.03 && ecart <= 0.25) return { alcane: deux[0], iso: deux[1], etat: 'resolu' }
  }
  const p = plusHaut(cands)!
  // A single peak: an isoprenoid on its own if the axis is reliable and the
  // peak sits where the isoprenoid elutes (the n-alkane has been degraded).
  if (cale && p.c - n >= decalage * 0.65) return { alcane: null, iso: p, etat: 'resolu' }
  return { alcane: Math.abs(p.c - n) <= 0.25 ? p : null, iso: null, etat: 'non-resolu' }
}

// ---- Profile -----------------------------------------------------------------------------

interface Analyse {
  c: number[]
  signal: number[]
  ucm: number[]
  resolu: number[]
  bruit: number
  pics: Pic[]
}

function analyser(cs: number[], ys: number[]): Analyse {
  const debut = Math.max(cs[0], DEBUT - 1)
  const fin = Math.min(cs[cs.length - 1], FIN + 1)
  if (fin - debut < 2) throw new Error('Le chromatogramme calé couvre moins de deux carbones entre C9 et C41 : vérifiez les repères C10 et C40.')
  const r = reechantillonner(cs, ys, Math.ceil(debut / PAS) * PAS, fin, PAS)
  const base = ligneDeBase(r.c, r.y)
  const signal = r.y.map((v, i) => Math.max(0, v - base[i]))
  const ucm = bosse(signal)
  const resolu = signal.map((v, i) => v - ucm[i])
  const bruit = bruitDe(signal)
  const maxRes = Math.max(0, ...resolu)
  const pics = detecterPics(r.c, resolu, signal, Math.max(3 * bruit, 0.01 * maxRes))
  return { c: r.c, signal, ucm, resolu, bruit, pics }
}

interface Noeud {
  obs: number
  n: number
  /** Distance to the position predicted from the previous peaks, in carbons. */
  residu: number
}

/**
 * The n-alkane series followed peak by peak from C10: the next peak is
 * looked for one spacing after the last one found, the spacing being read
 * on the peaks already found. A curved oven program (isothermal start,
 * final hold) is thus followed, where a straight line between the C10 and
 * C40 markers can drift by close to a carbon. n-C17 and n-C18 are not used
 * as nodes (their isoprenoid doublets).
 */
function suivreSerie(a: Analyse): Noeud[] {
  const maxSignal = Math.max(0, ...a.signal)
  const forts = a.pics.filter((p) => p.hauteur >= Math.max(3 * a.bruit, 0.02 * maxSignal))
  if (forts.length < 4) return []
  const noeuds: Noeud[] = []
  let dernier = { obs: DEBUT, n: DEBUT }
  let pas = 1
  const fin = Math.floor(a.c[a.c.length - 1])
  for (let n = DEBUT; n <= Math.min(FIN, fin); n++) {
    const prevu = dernier.obs + pas * (n - dernier.n)
    const fenetre = 0.3 * pas
    const p = plusHaut(forts.filter((q) => Math.abs(q.c - prevu) <= fenetre && (!noeuds.length || q.c > noeuds[noeuds.length - 1].obs)))
    if (!p || n === 17 || n === 18) continue
    noeuds.push({ obs: p.c, n, residu: Math.abs(p.c - prevu) })
    const ancre = noeuds.length >= 3 ? noeuds[noeuds.length - 3] : null
    if (ancre && n > ancre.n) pas = Math.min(1.6, Math.max(0.6, (p.c - ancre.obs) / (n - ancre.n)))
    dernier = { obs: p.c, n }
  }
  return noeuds
}

/**
 * Curvature of the retention axis between the C10 and C40 markers: the
 * carbon number read on the straight line between the markers is modelled
 * as c + k (c − 10)(c − 40), and k is chosen so that the strong peaks fall
 * best on whole carbon numbers. Both markers stay fixed, so a series seen
 * only in the middle of the chromatogram (plant waxes C23–C33) is not
 * shifted by one carbon.
 */
function meilleureCourbure(a: Analyse): number {
  const maxSignal = Math.max(0, ...a.signal)
  const forts = a.pics.filter((p) => p.hauteur >= Math.max(3 * a.bruit, 0.02 * maxSignal))
  if (forts.length < 5) return 0
  const score = (k: number) => {
    let s = 0
    for (let n = DEBUT; n <= FIN; n++) {
      if (n === 17 || n === 18) continue
      const prevu = n + k * (n - DEBUT) * (n - FIN)
      let m = 0
      for (const p of forts) {
        const d = p.c - prevu
        if (Math.abs(d) < 0.3) m = Math.max(m, p.hauteur * Math.exp(-((d / 0.08) ** 2)))
      }
      s += m
    }
    return s
  }
  let best = 0
  let bestScore = score(0)
  for (let k = -0.006; k <= 0.006 + 1e-12; k += 0.0002) {
    const v = score(k)
    if (v > bestScore * 1.0001) {
      best = k
      bestScore = v
    }
  }
  // Fine step around the best value.
  for (let k = best - 0.0002; k <= best + 0.0002 + 1e-12; k += 0.00002) {
    const v = score(k)
    if (v > bestScore) {
      best = k
      bestScore = v
    }
  }
  return best
}

/** Inverse of c ↦ c + k (c − 10)(c − 40): the carbon number from the straight-line reading. */
function inverseCourbure(k: number): (lu: number) => number {
  if (Math.abs(k) < 1e-9) return (lu) => lu
  const b = 1 - (DEBUT + FIN) * k
  return (lu) => {
    const disc = b * b - 4 * k * (DEBUT * FIN * k - lu)
    return disc < 0 ? lu : (-b + Math.sqrt(disc)) / (2 * k)
  }
}

export function construireProfil(trace: Trace, calage: PointCalage[], options: OptionsProfil = {}): Profil {
  if (trace.x.length < 20) throw new Error('Trace trop courte pour être interprétée.')
  const f = versCarbone(calage)
  const paires = trace.x.map((x, i) => ({ c: f(x), y: trace.y[i] })).sort((a, b) => a.c - b.c)
  const cs = paires.map((p) => p.c)
  const ys = paires.map((p) => p.y)
  let a = analyser(cs, ys)

  // Refine the axis on the n-alkane series when it is clearly there: the
  // curvature first, then peak by peak; kept only if at least five peaks
  // each fall close to where the previous ones predicted them — a regular
  // series, not scattered peaks of something else.
  let recalage = 0
  const k = meilleureCourbure(a)
  const cs1 = cs.map(inverseCourbure(k))
  const a1 = k ? analyser(cs1, ys) : a
  const noeuds = suivreSerie(a1)
  const residus = noeuds.map((q) => q.residu).sort((x, y) => x - y)
  if (noeuds.length >= 5 && residus[Math.floor(residus.length / 2)] < 0.08) {
    const g = (c: number) => {
      if (c <= noeuds[0].obs) return c + noeuds[0].n - noeuds[0].obs
      const d = noeuds[noeuds.length - 1]
      if (c >= d.obs) return c + d.n - d.obs
      let i = 0
      while (c > noeuds[i + 1].obs) i++
      const u = noeuds[i]
      const v = noeuds[i + 1]
      return u.n + ((c - u.obs) * (v.n - u.n)) / (v.obs - u.obs)
    }
    a = analyser(cs1.map(g), ys)
    recalage = noeuds.length
  }

  // Standards: their peaks (the tallest near C10 and near C40) are taken
  // out of the signal — the hump under them is kept — once they have
  // served to place the axis.
  let etalons: Profil['etalons'] = null
  if (options.etalons) {
    const pres = (n: number) => plusHaut(a.pics.filter((p) => Math.abs(p.c - n) <= DEMI_FENETRE_ETALON))
    etalons = { c10: pres(DEBUT), c40: pres(FIN) }
    const dansFenetre = (c: number) => Math.abs(c - DEBUT) <= DEMI_FENETRE_ETALON || Math.abs(c - FIN) <= DEMI_FENETRE_ETALON
    for (let i = 0; i < a.c.length; i++) {
      if (!dansFenetre(a.c[i])) continue
      a.signal[i] = a.ucm[i]
      a.resolu[i] = 0
    }
    a.pics = a.pics.filter((p) => !dansFenetre(p.c))
  }

  const alcanes: (Pic | null)[] = new Array(FIN + 1).fill(null)
  for (let n = DEBUT; n <= FIN; n++) {
    if (n === 17 || n === 18) continue
    if (etalons && (n === DEBUT || n === FIN)) continue
    alcanes[n] = plusHaut(a.pics.filter((p) => Math.abs(p.c - n) <= 0.25))
  }
  const ecarts = cs
    .slice(1)
    .map((v, i) => v - cs[i])
    .filter((v) => v > 0)
    .sort((x, y) => x - y)
  const pointsParCarbone = ecarts.length ? 1 / ecarts[Math.floor(ecarts.length / 2)] : 0
  const fin = pointsParCarbone >= POINTS_PAR_CARBONE_MIN
  const d17 = doublet(a.pics, 17, DECALAGE_PR, recalage >= 5, fin)
  const d18 = doublet(a.pics, 18, DECALAGE_PH, recalage >= 5, fin)
  alcanes[17] = d17.alcane
  alcanes[18] = d18.alcane
  // No regular series: peaks at whole carbon numbers would be chance, not n-alkanes.
  const serie = recalage > 0
  return {
    ...a,
    alcanes: serie ? alcanes : alcanes.map(() => null),
    pristane: serie ? d17.iso : null,
    phytane: serie ? d18.iso : null,
    doublets: { c17: d17.etat, c18: d18.etat },
    recalage,
    pointsParCarbone,
    etalons,
  }
}

/** Highest point of the resolved signal near a carbon position (a peak picked by hand). */
export function picPres(p: Profil, c: number, rayon = 0.08): Pic | null {
  let best = -1
  for (let i = 0; i < p.c.length; i++) {
    if (Math.abs(p.c[i] - c) > rayon) continue
    if (best < 0 || p.resolu[i] > p.resolu[best]) best = i
  }
  return best < 0 || p.resolu[best] <= 0 ? null : { c: p.c[best], hauteur: p.resolu[best], brut: p.signal[best] }
}

// ---- Distribution by carbon number -------------------------------------------------------

export interface Distribution {
  /** Area between n and n + 1 (n = 10 … 39), total and hump. */
  bins: { n: number; total: number; ucm: number | null }[]
  aire: number
  /** Share of the hump in the area, null when unknown (lab fractions). */
  partUcm: number | null
  q05: number
  q10: number
  q50: number
  q90: number
  q95: number
  /** Carbon of the highest point of the smoothed profile. */
  mode: number
  /** Distinct maxima of the profile smoothed over three carbons (bimodal products, mixtures). */
  lobes: number[]
  /** Where the unresolved hump lies: its highest point and the range holding 90 % of it. */
  bosse: { mode: number; q05: number; q95: number } | null
}

function quantile(c: number[], cum: number[], q: number): number {
  const total = cum[cum.length - 1]
  const cible = q * total
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= cible) {
      const t = cum[i] === cum[i - 1] ? 0 : (cible - cum[i - 1]) / (cum[i] - cum[i - 1])
      return c[i - 1] + t * (c[i] - c[i - 1])
    }
  }
  return c[c.length - 1]
}

/** Maxima of a profile standing clear of each other (valley under 80 % of the smaller one). */
function trouverLobes(c: number[], y: number[], demiFenetre: number): number[] {
  const max = Math.max(...y)
  if (max <= 0) return []
  const cands: number[] = []
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] < 0.25 * max) continue
    let ok = true
    for (let k = Math.max(0, i - demiFenetre); k <= Math.min(y.length - 1, i + demiFenetre) && ok; k++) if (y[k] > y[i] || (y[k] === y[i] && k < i)) ok = false
    if (ok) cands.push(i)
  }
  const lobes: number[] = []
  for (const i of cands) {
    const j = lobes[lobes.length - 1]
    if (j === undefined) {
      lobes.push(i)
      continue
    }
    let creux = Infinity
    for (let k = j; k <= i; k++) creux = Math.min(creux, y[k])
    if (creux < 0.8 * Math.min(y[i], y[j])) lobes.push(i)
    else if (y[i] > y[j]) lobes[lobes.length - 1] = i
  }
  return lobes.map((i) => c[i])
}

function distributionSurGrille(c: number[], y: number[], ucm: number[] | null): Distribution {
  const cum = [0]
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + ((y[i] + y[i - 1]) / 2) * (c[i] - c[i - 1]))
  const aire = cum[cum.length - 1]
  const bins = []
  for (let n = DEBUT; n < FIN; n++) {
    let total = 0
    let u = 0
    for (let i = 1; i < c.length; i++) {
      const m = (c[i] + c[i - 1]) / 2
      if (m < n || m >= n + 1) continue
      total += ((y[i] + y[i - 1]) / 2) * (c[i] - c[i - 1])
      if (ucm) u += ((ucm[i] + ucm[i - 1]) / 2) * (c[i] - c[i - 1])
    }
    bins.push({ n, total, ucm: ucm ? u : null })
  }
  const pas = c[1] - c[0]
  const lisse = moyenneGlissante(y, Math.round(1 / pas))
  let iMode = 0
  for (let i = 1; i < lisse.length; i++) if (lisse[i] > lisse[iMode]) iMode = i
  const aireUcm = ucm ? bins.reduce((s, b) => s + (b.ucm ?? 0), 0) : null
  let bosse: Distribution['bosse'] = null
  if (ucm && aireUcm && aireUcm > 0.05 * aire) {
    const cumU = [0]
    for (let i = 1; i < c.length; i++) cumU.push(cumU[i - 1] + ((ucm[i] + ucm[i - 1]) / 2) * (c[i] - c[i - 1]))
    let iMax = 0
    for (let i = 1; i < ucm.length; i++) if (ucm[i] > ucm[iMax]) iMax = i
    bosse = { mode: c[iMax], q05: quantile(c, cumU, 0.05), q95: quantile(c, cumU, 0.95) }
  }
  return {
    bosse,
    bins,
    aire,
    partUcm: aireUcm === null || !aire ? null : Math.min(1, aireUcm / aire),
    q05: quantile(c, cum, 0.05),
    q10: quantile(c, cum, 0.1),
    q50: quantile(c, cum, 0.5),
    q90: quantile(c, cum, 0.9),
    q95: quantile(c, cum, 0.95),
    mode: c[iMode],
    lobes: trouverLobes(c, moyenneGlissante(y, Math.round(1.5 / pas)), Math.round(2 / pas)),
  }
}

/** Distribution of a profile within the C10–C40 window. */
export function distributionProfil(p: Profil): Distribution | null {
  const idx = p.c.map((_, i) => i).filter((i) => p.c[i] >= DEBUT && p.c[i] <= FIN)
  if (idx.length < 10) return null
  const c = idx.map((i) => p.c[i])
  const y = idx.map((i) => p.signal[i])
  if (Math.max(...y) <= 0) return null
  return distributionSurGrille(
    c,
    y,
    idx.map((i) => p.ucm[i]),
  )
}

export interface Fraction {
  bas: number
  haut: number
  valeur: number
}

/** Distribution rebuilt from the lab's carbon fractions (each spread evenly over its range). */
export function distributionFractions(fractions: Fraction[]): Distribution | null {
  const fr = fractions.filter((f) => f.haut > f.bas && f.valeur > 0 && f.haut > DEBUT && f.bas < FIN)
  if (!fr.length) return null
  const c: number[] = []
  const y: number[] = []
  for (let v = DEBUT; v <= FIN + 1e-9; v += PAS) {
    const x = Math.round(v * 1000) / 1000
    c.push(x)
    y.push(fr.reduce((s, f) => s + (x >= f.bas && x < f.haut ? f.valeur / (f.haut - f.bas) : 0), 0))
  }
  return distributionSurGrille(c, y, null)
}

// ---- Indicators read on the profile -------------------------------------------------------

export interface IndicateursProfil {
  /** Share of whole carbon numbers between the 10th and 90th percentiles carrying an n-alkane peak. */
  serie: number
  nAlcanes: number
  /** Share of the three tallest peaks in the summed peak heights: a few isolated peaks, not a series. */
  dominance: number
  /** Bray and Evans (1961) carbon preference index on C24–C34 peak heights. */
  cpi: number | null
  /**
   * How far the n-alkanes rise above the hump: median, over the carbons of
   * the distribution, of the n-alkane height above the hump divided by the
   * hump height at that place (0 where the n-alkane is missing). Above 1,
   * the peaks are taller than the hump, the condition the BRGM sets to read
   * them (RP-64174-FR, § 6.2).
   */
  emergence: number | null
}

export function cpiBrayEvans(h: (n: number) => number): number | null {
  const somme = (de: number, a: number) => {
    let s = 0
    for (let n = de; n <= a; n += 2) s += h(n)
    return s
  }
  const impairs = somme(25, 33)
  const pairsBas = somme(24, 32)
  const pairsHaut = somme(26, 34)
  if (!impairs || !pairsBas || !pairsHaut) return null
  return 0.5 * (impairs / pairsBas + impairs / pairsHaut)
}

export function indicateursProfil(p: Profil, d: Distribution): IndicateursProfil {
  const maxAlc = Math.max(0, ...p.alcanes.map((a) => a?.hauteur ?? 0))
  // A peak counts as an n-alkane when it stands out of the noise and is not
  // negligible next to the whole signal (specks on a hump are not a series).
  const seuil = Math.max(3 * p.bruit, 0.03 * maxAlc, 0.02 * Math.max(0, ...p.signal))
  const present = (n: number) => !!p.alcanes[n] && p.alcanes[n]!.hauteur >= seuil
  const de = Math.max(DEBUT, Math.round(d.q10))
  const a = Math.min(FIN, Math.round(d.q90))
  let n = 0
  let tot = 0
  for (let k = de; k <= a; k++) {
    if (p.etalons && (k === DEBUT || k === FIN)) continue
    tot++
    if (present(k)) n++
  }
  const hauteurs = p.pics.map((q) => q.hauteur).sort((x, y) => y - x)
  const somme = hauteurs.reduce((s, v) => s + v, 0)
  let nCpi = 0
  for (let k = 24; k <= 34; k++) if (present(k)) nCpi++
  const rapports: number[] = []
  const maxSignal = Math.max(0, ...p.signal)
  for (let k = de; k <= a; k++) {
    if (p.etalons && (k === DEBUT || k === FIN)) continue
    const q = p.alcanes[k]
    if (!q || !present(k)) {
      rapports.push(0)
      continue
    }
    const i = Math.min(p.c.length - 1, Math.max(0, Math.round((q.c - p.c[0]) / (p.c[1] - p.c[0]))))
    rapports.push(Math.min(20, q.hauteur / Math.max(p.ucm[i], 0.01 * maxSignal)))
  }
  rapports.sort((x, y) => x - y)
  return {
    serie: tot ? n / tot : 0,
    nAlcanes: p.alcanes.filter((x, k) => k >= DEBUT && x && x.hauteur >= seuil).length,
    dominance: somme ? hauteurs.slice(0, 3).reduce((s, v) => s + v, 0) / somme : 0,
    cpi: nCpi >= 6 ? cpiBrayEvans((k) => (present(k) ? p.alcanes[k]!.hauteur : 0)) : null,
    emergence: rapports.length && p.recalage ? rapports[Math.floor(rapports.length / 2)] : rapports.length ? 0 : null,
  }
}
