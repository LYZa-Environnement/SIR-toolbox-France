/**
 * Time-series reading of a monitoring history, series by series (one well,
 * one compound), then for the whole network.
 *
 * Per series, on the analysis window and the results not set aside:
 * - quantification frequency, range, mean and median with results below
 *   the LQ at half the LQ (directive 2009/90/CE, art. 5), comparison to the
 *   reference value, exceedances;
 * - Mann-Kendall test and Theil-Sen slope with its confidence interval,
 *   seasonal Kendall when high- and low-water campaigns alternate, Pettitt
 *   change point, LOWESS smoothing;
 * - a trend class after MAROS (AFCEE, 2004) — the confidence in the sign
 *   of S and the coefficient of variation — with the significance level
 *   chosen by the user: "hausse"/"baisse" at p ≤ α (two-sided), "probable"
 *   at p ≤ 2α, else "stable" (COV < 1) or "sans tendance nette";
 * - for a significant decrease, a first-order decay constant and half-life
 *   (Theil-Sen on ln C), and the time the fitted decrease would take to
 *   reach the reference value — an indicative projection;
 * - doubtful results: residuals from the Theil-Sen line on log values
 *   beyond 4 robust standard deviations and a factor 3.
 *
 * Results below the LQ enter the rank tests by one of three conventions:
 * - "lq-max" (default): censored at the highest LQ of the series — every
 *   result below it, quantified or not, is a tie at that level (Helsel,
 *   2012): no trend can be produced by a change of LQ;
 * - "lq": the LQ itself (HYPE, BRGM);
 * - "demi-lq": half the LQ (directive 2009/90/CE, CIS guidance n° 18).
 * With one LQ throughout, the three give the same ranks, hence the same test.
 *
 * Network-wide: key facts ranked by importance, prompts for the monitoring
 * programme (to reinforce, keep, lighten), data quality notes, the
 * chloroethene dechlorination over time, water levels and their link with
 * concentrations, upgradient / downgradient comparison by campaign.
 *
 * Pure.
 */

import { CHAINES, compact } from '../resultats/expert/diagnostics.ts'
import { valeurGuideEn } from '../resultats/guides.ts'
import { formatDate } from './dates.ts'
import type { Base, Campagne, Compose, Corrections, Niveau, Ouvrage, Resultat } from './modele.ts'
import {
  ecartType,
  kendallSaisonnier,
  kendallTau,
  lowess,
  mannKendall,
  mediane,
  moyenne,
  pettitt,
  sen,
  type Correlation,
  type KendallSaisonnier,
  type MannKendall,
  type Sen,
} from './stats.ts'

// ---- Settings -----------------------------------------------------------------------------------

export type Censure = 'lq-max' | 'lq' | 'demi-lq'

export const LIBELLES_CENSURE: Record<Censure, { court: string; long: string }> = {
  'lq-max': {
    court: 'Censure à la LQ la plus élevée',
    long: 'Tout résultat inférieur à la LQ la plus élevée de la chronique, quantifié ou non, est traité comme un ex aequo à ce niveau (Helsel, 2012) : un changement de LQ ne peut pas créer de tendance.',
  },
  lq: { court: 'Remplacement par la LQ', long: 'Les résultats < LQ prennent la valeur de leur LQ (convention de l’outil HYPE du BRGM).' },
  'demi-lq': {
    court: 'Remplacement par LQ/2',
    long: 'Les résultats < LQ prennent la moitié de leur LQ (directive 2009/90/CE, art. 5 ; guide européen CIS n° 18).',
  },
}

export interface Reglages {
  /** Significance level of the trend tests (two-sided). */
  alpha: number
  /** Fewest results for a test. */
  nMin: number
  /** Results from which a series is long enough for a robust reading (HYPE asks 10). */
  nRobuste: number
  censure: Censure
  /** Analysis window (ISO), null for the whole history. */
  debut: string | null
  fin: string | null
  /** Share of the reference value from which a rising series calls for attention (arrêté du 17 décembre 2008, art. 9 : 75 %). */
  vigilance: number
  /** Coefficient of variation below which a series without trend is "stable" (MAROS). */
  covStable: number
}

export const REGLAGES_DEFAUT: Reglages = { alpha: 0.05, nMin: 4, nRobuste: 10, censure: 'lq-max', debut: null, fin: null, vigilance: 0.75, covStable: 1 }

// ---- Classes ------------------------------------------------------------------------------------

export type Classe = 'hausse' | 'hausse-probable' | 'sans-tendance' | 'stable' | 'baisse-probable' | 'baisse' | 'non-quantifie' | 'insuffisant'

export const CLASSES: Record<Classe, { libelle: string; court: string; symbole: string; couleur: string; fond: string; texte: string }> = {
  hausse: { libelle: 'Hausse significative', court: 'Hausse', symbole: '▲', couleur: '#B42318', fond: '#FBE3E0', texte: '#8A1C12' },
  'hausse-probable': { libelle: 'Hausse probable', court: 'Hausse prob.', symbole: '△', couleur: '#D9730D', fond: '#FCEBD7', texte: '#8A4A06' },
  'sans-tendance': { libelle: 'Sans tendance nette (variabilité forte)', court: 'Variable', symbole: '≈', couleur: '#8A6D3B', fond: '#F4EEDF', texte: '#5E4A26' },
  stable: { libelle: 'Stable', court: 'Stable', symbole: '●', couleur: '#5B6B7A', fond: '#E9EDF1', texte: '#3B4856' },
  'baisse-probable': { libelle: 'Baisse probable', court: 'Baisse prob.', symbole: '▽', couleur: '#3A8F6A', fond: '#E1F2E9', texte: '#1F5E42' },
  baisse: { libelle: 'Baisse significative', court: 'Baisse', symbole: '▼', couleur: '#1F6B45', fond: '#D3EBDD', texte: '#14482E' },
  'non-quantifie': { libelle: 'Jamais quantifié', court: '< LQ', symbole: '○', couleur: '#A6ADB4', fond: '#F4F5F6', texte: '#6B7480' },
  insuffisant: { libelle: 'Données insuffisantes', court: 'n insuffisant', symbole: '·', couleur: '#C3C8CD', fond: '#FAFAFA', texte: '#8A9199' },
}

export const ORDRE_CLASSES: Classe[] = ['hausse', 'hausse-probable', 'sans-tendance', 'stable', 'baisse-probable', 'baisse', 'non-quantifie', 'insuffisant']

// ---- Series -------------------------------------------------------------------------------------

export interface Reference {
  valeur: number
  source: string
  /** Chosen by the user rather than from the ERM table. */
  saisie: boolean
}

export interface PointSerie {
  resultat: Resultat
  t: number
  date: string
  valeur: number
  inferieur: boolean
  regime: 'HE' | 'BE' | null
  exclu: boolean
  dansFenetre: boolean
  atypique: boolean
  /** Value used by the rank tests (after the censoring convention). */
  rang: number
}

export interface Horizon {
  /** Decimal year at which the fitted line meets the reference value. */
  annee: number
  /** Range from the confidence interval of the slope (null when open-ended). */
  plusTot: number | null
  plusTard: number | null
  sens: 'sous' | 'au-dessus'
}

export interface AnalyseSerie {
  cle: string
  ouvrage: Ouvrage
  compose: Compose
  reference: Reference | null
  points: PointSerie[]
  retenus: PointSerie[]
  n: number
  nQ: number
  frequence: number
  premiere: PointSerie | null
  derniere: PointSerie | null
  min: number | null
  max: number | null
  maxPoint: PointSerie | null
  moyenne: number | null
  mediane: number | null
  cov: number | null
  ratioDernier: number | null
  ratioMax: number | null
  depassements: number
  /** Last campaigns in a row above the reference. */
  depassementsConsecutifs: number
  lqMin: number | null
  lqMax: number | null
  lqVariable: boolean
  lqSuperieureReference: boolean
  /** LQ of the latest result below the LQ. */
  lqDerniere: number | null
  statut: 'non-quantifie' | 'insuffisant' | 'teste'
  classe: Classe
  mk: MannKendall | null
  sen: Sen | null
  /** Theil-Sen slope over the median of the series, % per year. */
  senRelatif: number | null
  saisonnier: KendallSaisonnier | null
  rupture: { indice: number; entre: [string, string]; t: number; p: number; hausse: boolean; avant: number; apres: number } | null
  decroissance: { k: number; demiVie: number; kBas: number | null; kHaut: number | null } | null
  horizon: Horizon | null
  lissage: { t: number; v: number }[] | null
  apparition: boolean
  disparition: boolean
  /** Below the reference now, above it before in the window. */
  repasseSous: boolean
  /** Rising and at or above `vigilance` × reference. */
  vigilance: boolean
  courte: boolean
  avertissements: string[]
}

const quantifies = (ps: PointSerie[]) => ps.filter((p) => !p.inferieur)
const demiLQ = (p: PointSerie) => (p.inferieur ? p.valeur / 2 : p.valeur)

/** Values for the rank tests under the censoring convention. */
function rangs(ps: PointSerie[], censure: Censure): number[] {
  if (censure === 'lq') return ps.map((p) => p.valeur)
  if (censure === 'demi-lq') return ps.map(demiLQ)
  const lqs = ps.filter((p) => p.inferieur).map((p) => p.valeur)
  if (!lqs.length) return ps.map((p) => p.valeur)
  const L = Math.max(...lqs)
  return ps.map((p) => (p.inferieur || p.valeur < L ? L : p.valeur))
}

function classer(mk: MannKendall | null, cov: number | null, r: Reglages): Classe {
  if (!mk) return 'insuffisant'
  if (mk.S > 0 && mk.pBilateral <= r.alpha) return 'hausse'
  if (mk.S < 0 && mk.pBilateral <= r.alpha) return 'baisse'
  if (mk.S > 0 && mk.pBilateral <= 2 * r.alpha) return 'hausse-probable'
  if (mk.S < 0 && mk.pBilateral <= 2 * r.alpha) return 'baisse-probable'
  return cov !== null && cov < r.covStable ? 'stable' : 'sans-tendance'
}

/** Doubtful results: far from the Theil-Sen line fitted on log values. */
function atypiques(ps: PointSerie[]): Set<PointSerie> {
  const q = ps.filter((p) => !p.inferieur && p.valeur > 0)
  const out = new Set<PointSerie>()
  if (q.length < 6) return out
  const t = q.map((p) => p.t)
  const y = q.map((p) => Math.log10(p.valeur))
  const s = sen(t, y)
  if (!s) return out
  const residus = y.map((v, i) => v - (s.ordonnee + s.pente * t[i]))
  const m = mediane(residus)
  const mad = mediane(residus.map((e) => Math.abs(e - m))) * 1.4826
  q.forEach((p, i) => {
    const e = residus[i] - m
    if (Math.abs(e) > Math.max(4 * mad, Math.log10(3))) out.add(p)
  })
  return out
}

function analyserSerie(ouvrage: Ouvrage, compose: Compose, resultats: Resultat[], reference: Reference | null, regimes: Map<string, 'HE' | 'BE' | null>, r: Reglages): AnalyseSerie {
  const dans = (date: string) => (!r.debut || date >= r.debut) && (!r.fin || date <= r.fin)
  const points: PointSerie[] = resultats.map((x) => ({
    resultat: x,
    t: x.t,
    date: x.date,
    valeur: x.valeur,
    inferieur: x.inferieur,
    regime: regimes.get(x.campagne) ?? null,
    exclu: x.exclu,
    dansFenetre: dans(x.date),
    atypique: false,
    rang: x.valeur,
  }))
  const fenetre = points.filter((p) => p.dansFenetre)
  for (const p of atypiques(fenetre.filter((x) => !x.exclu))) p.atypique = true
  const retenus = fenetre.filter((p) => !p.exclu)
  const rs = rangs(retenus, r.censure)
  retenus.forEach((p, i) => (p.rang = rs[i]))
  const q = quantifies(retenus)
  const n = retenus.length
  const nQ = q.length
  const avertissements: string[] = []
  const valeursDemi = retenus.map(demiLQ)
  const moy = n ? moyenne(valeursDemi) : null
  const sd = n > 1 ? ecartType(valeursDemi) : null
  const cov = moy && sd !== null && moy > 0 ? sd / moy : null
  const lqs = retenus.filter((p) => p.inferieur).map((p) => p.valeur)
  const lqMin = lqs.length ? Math.min(...lqs) : null
  const lqMax = lqs.length ? Math.max(...lqs) : null
  const lqVariable = lqMin !== null && lqMax !== null && lqMin > 0 && lqMax / lqMin >= 2
  const ref = reference?.valeur ?? null
  const lqSuperieureReference = ref !== null && lqMax !== null && lqMax > ref
  const derniereCensuree = [...retenus].reverse().find((p) => p.inferieur)
  const lqDerniere = derniereCensuree?.valeur ?? null
  const premiere = retenus[0] ?? null
  const derniere = retenus[n - 1] ?? null
  const maxPoint = q.length ? q.reduce((a, b) => (b.valeur > a.valeur ? b : a)) : null
  const depasse = (p: PointSerie) => ref !== null && !p.inferieur && p.valeur > ref
  let depassementsConsecutifs = 0
  for (let i = n - 1; i >= 0 && depasse(retenus[i]); i--) depassementsConsecutifs++

  let statut: AnalyseSerie['statut'] = 'teste'
  let mk: MannKendall | null = null
  let s: Sen | null = null
  if (nQ === 0) statut = 'non-quantifie'
  else if (n < r.nMin) statut = 'insuffisant'
  if (statut === 'teste') {
    mk = mannKendall(rs)
    s = mk ? sen(retenus.map((p) => p.t), rs, mk.varS, r.alpha) : null
  }
  const classe: Classe = statut === 'non-quantifie' ? 'non-quantifie' : statut === 'insuffisant' ? 'insuffisant' : classer(mk, cov, r)
  const med = n ? mediane(valeursDemi) : null
  const senRelatif = s && med && med > 0 ? (s.pente / med) * 100 : null

  // Seasonal Kendall: both regimes with 3 results at least.
  let saisonnier: KendallSaisonnier | null = null
  if (statut === 'teste') {
    const parRegime = (g: 'HE' | 'BE') => retenus.map((p, i) => ({ p, v: rs[i] })).filter((x) => x.p.regime === g)
    const he = parRegime('HE')
    const be = parRegime('BE')
    if (he.length >= 3 && be.length >= 3) {
      saisonnier = kendallSaisonnier([
        { saison: 'HE', t: he.map((x) => x.p.t), x: he.map((x) => x.v) },
        { saison: 'BE', t: be.map((x) => x.p.t), x: be.map((x) => x.v) },
      ])
    }
  }

  // Change point.
  let rupture: AnalyseSerie['rupture'] = null
  if (statut === 'teste' && n >= 8) {
    const pt = pettitt(rs)
    if (pt && pt.p <= r.alpha && pt.indice < n - 1) {
      const avant = retenus.slice(0, pt.indice + 1).map(demiLQ)
      const apres = retenus.slice(pt.indice + 1).map(demiLQ)
      rupture = {
        indice: pt.indice,
        entre: [retenus[pt.indice].date, retenus[pt.indice + 1].date],
        t: (retenus[pt.indice].t + retenus[pt.indice + 1].t) / 2,
        p: pt.p,
        hausse: pt.hausse,
        avant: mediane(avant),
        apres: mediane(apres),
      }
    }
  }

  // First-order decrease, and the time to the reference value.
  let decroissance: AnalyseSerie['decroissance'] = null
  let horizon: Horizon | null = null
  const positifs = retenus.every((p) => demiLQ(p) > 0)
  if (statut === 'teste' && nQ >= 4 && positifs && mk) {
    const ln = retenus.map((p) => Math.log(demiLQ(p)))
    const sl = sen(retenus.map((p) => p.t), ln, mk.varS, r.alpha)
    if (sl) {
      if ((classe === 'baisse' || classe === 'baisse-probable') && sl.pente < 0) {
        const k = -sl.pente
        decroissance = { k, demiVie: Math.LN2 / k, kBas: sl.haute !== null ? -sl.haute : null, kHaut: sl.basse !== null ? -sl.basse : null }
      }
      if (ref !== null && ref > 0 && derniere) {
        const lnRef = Math.log(ref)
        const ajuste = sl.ordonnee + sl.pente * derniere.t
        // Every line of the interval goes through the median point of the series.
        const tMed = mediane(retenus.map((p) => p.t))
        const yMed = sl.ordonnee + sl.pente * tMed
        const atteinte = (pente: number | null) => {
          if (!pente) return null
          const a = derniere.t + (lnRef - (yMed + pente * (derniere.t - tMed))) / pente
          return a >= derniere.t && a - derniere.t < 200 ? a : null
        }
        if ((classe === 'baisse' || classe === 'baisse-probable') && sl.pente < 0 && ajuste > lnRef) {
          const a = atteinte(sl.pente)
          const tot = sl.basse !== null && sl.basse < 0 ? atteinte(sl.basse) : null
          const tard = sl.haute !== null && sl.haute < 0 ? atteinte(sl.haute) : null
          if (a !== null) horizon = { annee: a, plusTot: tot, plusTard: tard, sens: 'sous' }
        } else if ((classe === 'hausse' || classe === 'hausse-probable') && sl.pente > 0 && ajuste < lnRef) {
          const a = atteinte(sl.pente)
          const tot = sl.haute !== null && sl.haute > 0 ? atteinte(sl.haute) : null
          const tard = sl.basse !== null && sl.basse > 0 ? atteinte(sl.basse) : null
          if (a !== null) horizon = { annee: a, plusTot: tot, plusTard: tard, sens: 'au-dessus' }
        }
      }
    }
  }

  // Smoothing on log values when all are positive (the charts are often logarithmic).
  let lissage: AnalyseSerie['lissage'] = null
  if (n >= 6 && nQ >= 3) {
    const v = retenus.map(demiLQ)
    const log = v.every((x) => x > 0)
    const y = log ? v.map((x) => Math.log10(x)) : v
    const l = lowess(retenus.map((p) => p.t), y, 0.6)
    lissage = retenus.map((p, i) => ({ t: p.t, v: log ? 10 ** l[i] : l[i] }))
  }

  // Appearance / disappearance at the end of the window.
  const fin = retenus.slice(-2)
  const debut = retenus.slice(0, -2)
  const apparition = n >= 4 && fin.some((p) => !p.inferieur) && debut.length >= 2 && debut.every((p) => p.inferieur)
  const disparition = n >= 4 && fin.length === 2 && fin.every((p) => p.inferieur) && debut.some((p) => !p.inferieur)
  const repasseSous = ref !== null && !!derniere && !depasse(derniere) && retenus.slice(0, -1).some(depasse) && fin.every((p) => !depasse(p))
  const ratio = (p: PointSerie | null) => (p && ref ? (p.inferieur ? 0 : p.valeur / ref) : null)
  const ratioDernier = ratio(derniere)
  const vigilance = (classe === 'hausse' || classe === 'hausse-probable') && ratioDernier !== null && ratioDernier >= r.vigilance

  const courte = statut === 'teste' && n < r.nRobuste
  if (courte) avertissements.push(`Chronique courte (${n} résultats, ${r.nRobuste} recommandés pour un test robuste).`)
  if (statut === 'teste' && nQ / n < 0.2) avertissements.push('Plus de 80 % de résultats < LQ : tendance peu informative.')
  if (lqVariable) avertissements.push(`LQ variables (${fr(lqMin!)} à ${fr(lqMax!)} ${compose.unite}).`)
  if (lqSuperieureReference) avertissements.push(`LQ (${fr(lqMax!)}) supérieure à la valeur de référence (${fr(ref!)}).`)

  return {
    cle: `${ouvrage.cle}|${compose.cle}`,
    ouvrage,
    compose,
    reference,
    points,
    retenus,
    n,
    nQ,
    frequence: n ? nQ / n : 0,
    premiere,
    derniere,
    min: q.length ? Math.min(...q.map((p) => p.valeur)) : null,
    max: maxPoint?.valeur ?? null,
    maxPoint,
    moyenne: moy,
    mediane: med,
    cov,
    ratioDernier,
    ratioMax: ratio(maxPoint),
    depassements: retenus.filter(depasse).length,
    depassementsConsecutifs,
    lqMin,
    lqMax,
    lqVariable,
    lqSuperieureReference,
    lqDerniere,
    statut,
    classe,
    mk,
    sen: s,
    senRelatif,
    saisonnier,
    rupture,
    decroissance,
    horizon,
    lissage,
    apparition,
    disparition,
    repasseSous,
    vigilance,
    courte,
    avertissements,
  }
}

// ---- Formatting -----------------------------------------------------------------------------------

export function fr(x: number | null | undefined, chiffres = 3): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–'
  if (x === 0) return '0'
  return Number(x.toPrecision(chiffres)).toLocaleString('fr-FR', { maximumFractionDigits: 10 })
}

export function frP(p: number | null | undefined): string {
  if (p === null || p === undefined) return '–'
  if (p < 0.001) return '< 0,001'
  return p.toLocaleString('fr-FR', { maximumFractionDigits: 3, minimumFractionDigits: 3 })
}

const annee = (t: number) => Math.floor(t)
/** "p = 0,033" or "p < 0,001". */
export const pTexte = (p: number | null | undefined) => (p === null || p === undefined ? 'p –' : p < 0.001 ? 'p < 0,001' : `p = ${frP(p)}`)

export const frAnnee = (t: number | null) => (t === null ? '–' : String(annee(t)))

/** "+12 µg/l/an (+8 %/an)" */
export function frPente(s: AnalyseSerie): string {
  if (!s.sen) return '–'
  const signe = s.sen.pente > 0 ? '+' : ''
  const rel = s.senRelatif !== null && Number.isFinite(s.senRelatif) ? ` (${s.senRelatif > 0 ? '+' : ''}${fr(s.senRelatif, 2)} %/an)` : ''
  return `${signe}${fr(s.sen.pente)} ${s.compose.unite}/an${rel}`
}

// ---- Network ---------------------------------------------------------------------------------------

export type NiveauFait = 'alerte' | 'vigilance' | 'favorable' | 'info'

export interface Fait {
  niveau: NiveauFait
  titre: string
  detail: string
  ouvrage?: string
  compose?: string
  /** For ranking: higher first. */
  poids: number
}

export type TypePiste = 'renforcer' | 'maintenir' | 'alleger' | 'retirer' | 'completer'

export const LIBELLES_PISTE: Record<TypePiste, { libelle: string; couleur: string }> = {
  renforcer: { libelle: 'À renforcer', couleur: '#B42318' },
  maintenir: { libelle: 'À maintenir', couleur: '#2F5F9E' },
  alleger: { libelle: 'Allègement envisageable', couleur: '#3A8F6A' },
  retirer: { libelle: 'Retrait envisageable', couleur: '#1F6B45' },
  completer: { libelle: 'À compléter', couleur: '#8A5A12' },
}

export interface Piste {
  type: TypePiste
  portee: 'ouvrage' | 'compose' | 'reseau'
  cible: string
  texte: string
  critere: string
}

export interface NoteQualite {
  niveau: 'alerte' | 'vigilance' | 'info'
  texte: string
}

export interface EspeceTemps {
  code: string
  libelle: string
  couleur: string
  chlores: number
}

export interface Degradation {
  ouvrage: Ouvrage
  especes: EspeceTemps[]
  /** Per campaign: µmol/l of each species (0 when < LQ), total, mean chlorine number. */
  campagnes: { campagne: Campagne; moles: number[]; total: number; chlores: number | null }[]
  tendanceChlores: MannKendall | null
  /** Trend of the total of the chloroethenes in moles: dilution or transformation. */
  tendanceTotal: MannKendall | null
  /** Ethene / ethane among the analyses (end of the chain). */
  finAnalysee: boolean
  /** Reading of the last campaigns. */
  stade: 'stagnation-dce' | 'accumulation-cv' | 'complete' | null
  /** Sentences explaining what the mean chlorine number and the total say. */
  lecture: string[]
}

export interface EcoulementCampagne {
  campagne: Campagne
  /** Wells used (coordinates and head known). */
  n: number
  /** Hydraulic gradient (m/m). */
  gradient: number
  /** Direction the water flows to, in degrees from north, clockwise. */
  azimut: number
  /** Fit of the plane through the heads. */
  r2: number
}

export interface Ecoulement {
  campagnes: EcoulementCampagne[]
  azimutMoyen: number
  /** Circular standard deviation of the directions (degrees). */
  dispersion: number
  gradientMedian: number
  /** Wells along the mean flow, upgradient first, with the position the flow gives them. */
  ordre: { ouvrage: Ouvrage; abscisse: number; attendue: 'amont' | 'droit' | 'aval' }[]
  /** Declared upgradient but downgradient along the flow, or the reverse. */
  incoherences: { ouvrage: Ouvrage; declaree: string; attendue: string }[]
}

export interface PiezoOuvrage {
  ouvrage: Ouvrage
  /** Head (m NGF) when known, else minus the depth to water. */
  serie: { t: number; date: string; v: number; campagne: string | null }[]
  enCharge: boolean
  amplitude: number | null
  mk: MannKendall | null
  sen: Sen | null
  correlations: { compose: Compose; c: Correlation }[]
}

export interface AmontAvalCompose {
  compose: Compose
  /** Per campaign: highest result upgradient, on site, downgradient (null: no well or not analysed). */
  campagnes: { campagne: Campagne; amont: PointMax | null; droit: PointMax | null; aval: PointMax | null }[]
  /** Share of campaigns where the compound is quantified upgradient. */
  frequenceAmont: number
}

export interface PointMax {
  valeur: number
  inferieur: boolean
  ouvrage: string
}

export interface IndicateurCampagne {
  campagne: Campagne
  prelevements: number
  quantifies: number
  depassements: number
  ouvragesDepassement: string[]
}

export interface Analyse {
  base: Base
  reglages: Reglages
  campagnes: Campagne[]
  ouvrages: Ouvrage[]
  series: AnalyseSerie[]
  parCle: Map<string, AnalyseSerie>
  references: Map<string, Reference | null>
  /** Compounds quantified at least once in the window. */
  composesQuantifies: Compose[]
  /** Analysed in the window, never quantified. */
  composesJamais: Compose[]
  comptes: Record<Classe, number>
  faits: Fait[]
  pistes: Piste[]
  qualite: NoteQualite[]
  indicateurs: IndicateurCampagne[]
  degradation: Degradation[]
  piezo: PiezoOuvrage[]
  ecoulement: Ecoulement | null
  amontAval: AmontAvalCompose[]
  /** First and last date of the window as analysed. */
  debut: string
  fin: string
}

export function reference(c: Compose, corrections: Corrections): Reference | null {
  if (c.cle in corrections.references) {
    const v = corrections.references[c.cle]
    return v === null ? null : { valeur: v, source: 'saisie', saisie: true }
  }
  if (c.terrain) return null
  const g = valeurGuideEn('eau', c.parametre, { metaux: 'sur site', repere: 'r1' }, c.unite)
  return g ? { valeur: g.valeur, source: g.source, saisie: false } : null
}

/** A daughter product of the chlorinated solvents is kept while its parents are present. */
const FILLES: Record<string, string[]> = {
  chloruredevinyle: ['tetrachloroethylene', 'trichloroethylene', 'cis12dichloroethylene', '11dichloroethylene', 'trans12dichloroethylene'],
  chloroethylene: ['tetrachloroethylene', 'trichloroethylene', 'cis12dichloroethylene'],
  cis12dichloroethylene: ['tetrachloroethylene', 'trichloroethylene'],
  trans12dichloroethylene: ['tetrachloroethylene', 'trichloroethylene'],
  '11dichloroethylene': ['trichloroethylene', '111trichloroethane'],
  trichloroethylene: ['tetrachloroethylene'],
  '11dichloroethane': ['111trichloroethane'],
  chloroethane: ['11dichloroethane', '111trichloroethane'],
}

export function analyser(base: Base, corrections: Corrections, r: Reglages): Analyse {
  const ouvrages = base.ouvrages.filter((o) => !o.exclu)
  const dans = (date: string) => (!r.debut || date >= r.debut) && (!r.fin || date <= r.fin)
  const campagnes = base.campagnes.filter((c) => dans(c.date))
  const regimes = new Map(base.campagnes.map((c) => [c.id, c.regime]))
  const references = new Map(base.composes.map((c) => [c.cle, reference(c, corrections)]))

  const parSerie = new Map<string, Resultat[]>()
  for (const x of base.resultats) {
    const k = `${x.ouvrage}|${x.compose}`
    ;(parSerie.get(k) ?? parSerie.set(k, []).get(k)!).push(x)
  }
  const series: AnalyseSerie[] = []
  for (const c of base.composes) {
    for (const o of ouvrages) {
      const rs = parSerie.get(`${o.cle}|${c.cle}`)
      if (!rs?.length) continue
      series.push(analyserSerie(o, c, rs, references.get(c.cle) ?? null, regimes, r))
    }
  }
  const parCle = new Map(series.map((s) => [s.cle, s]))
  const actives = series.filter((s) => s.n > 0)
  const composesQuantifies = base.composes.filter((c) => actives.some((s) => s.compose === c && s.nQ > 0))
  const composesJamais = base.composes.filter((c) => !c.terrain && actives.some((s) => s.compose === c) && !actives.some((s) => s.compose === c && s.nQ > 0))
  const comptes = Object.fromEntries(ORDRE_CLASSES.map((k) => [k, 0])) as Record<Classe, number>
  for (const s of actives) if (!s.compose.terrain) comptes[s.classe]++

  const indicateurs: IndicateurCampagne[] = campagnes.map((c) => {
    const rs = base.resultats.filter((x) => x.campagne === c.id && !x.exclu && ouvrages.some((o) => o.cle === x.ouvrage))
    const dep = rs.filter((x) => {
      const ref = references.get(x.compose)
      const comp = base.composes.find((k) => k.cle === x.compose)
      return ref && !comp?.calcule && !x.inferieur && x.valeur > ref.valeur
    })
    return {
      campagne: c,
      prelevements: new Set(rs.map((x) => x.ouvrage)).size,
      quantifies: rs.filter((x) => !x.inferieur && !base.composes.find((k) => k.cle === x.compose)?.terrain).length,
      depassements: dep.length,
      ouvragesDepassement: [...new Set(dep.map((x) => x.ouvrage))],
    }
  })

  const degradation = degradations(base, ouvrages, campagnes, r)
  const piezo = piezometrie(base, ouvrages, actives, r)
  const ecoulement = ecoulements(base, ouvrages, campagnes)
  const amontAval = comparaisonAmontAval(base, ouvrages, campagnes, composesQuantifies)
  const faits = faitsMarquants(actives, composesJamais, campagnes, degradation, piezo, amontAval, r, ecoulement)
  const pistes = pistesSurveillance(actives, ouvrages, composesJamais, composesQuantifies, campagnes, base, references, r)
  const qualite = notesQualite(base, actives, ouvrages, campagnes, composesJamais, references)

  return {
    base,
    reglages: r,
    campagnes,
    ouvrages,
    series,
    parCle,
    references,
    composesQuantifies,
    composesJamais,
    comptes,
    faits,
    pistes,
    qualite,
    indicateurs,
    degradation,
    piezo,
    ecoulement,
    amontAval,
    debut: campagnes[0]?.date ?? '',
    fin: campagnes[campagnes.length - 1]?.date ?? '',
  }
}

// ---- Key facts ---------------------------------------------------------------------------------------

const nomSerie = (s: AnalyseSerie) => `${s.compose.nom} sur ${s.ouvrage.nom}`

function faitsMarquants(
  series: AnalyseSerie[],
  jamais: Compose[],
  campagnes: Campagne[],
  degr: Degradation[],
  piezo: PiezoOuvrage[],
  amontAval: AmontAvalCompose[],
  r: Reglages,
  ecoulement: Ecoulement | null,
): Fait[] {
  const faits: Fait[] = []
  const pAlpha = (s: AnalyseSerie) => (s.mk ? pTexte(s.mk.pBilateral) : '')
  const rupt = (s: AnalyseSerie) =>
    s.rupture
      ? `saut de niveau entre le ${formatDate(s.rupture.entre[0])} et le ${formatDate(s.rupture.entre[1])} (test de Pettitt, ${pTexte(s.rupture.p)}) : médiane ${fr(s.rupture.avant)} puis ${fr(s.rupture.apres)} ${s.compose.unite}`
      : ''
  const enHausse = (s: AnalyseSerie) => s.classe === 'hausse' || s.classe === 'hausse-probable'
  const enBaisse = (s: AnalyseSerie) => s.classe === 'baisse' || s.classe === 'baisse-probable'
  /** Wells with a rising individual compound: their family sums add nothing. */
  const ouvragesEnHausse = new Set(series.filter((s) => enHausse(s) && !s.compose.calcule && !s.compose.terrain).map((s) => s.ouvrage.cle))
  const lqInadaptees = new Map<string, AnalyseSerie[]>()
  for (const s of series) {
    if (s.compose.terrain) continue
    const ref = s.reference
    const derniere = s.derniere
    const base = { ouvrage: s.ouvrage.cle, compose: s.compose.cle }
    const valeurDerniere = derniere ? `${derniere.inferieur ? '<' : ''}${fr(derniere.valeur)} ${s.compose.unite}` : ''
    const posRef = ref && s.ratioDernier !== null && s.ratioDernier > 0 ? ` (${fr(s.ratioDernier, 2)} × la valeur de référence de ${fr(ref.valeur)})` : ''
    const ruptureMemeSens = !!s.rupture && ((s.rupture.hausse && enHausse(s)) || (!s.rupture.hausse && enBaisse(s)))
    // A monotonic trend always shows a Pettitt change point; it is worth telling only as a marked step.
    const palier = ruptureMemeSens && s.rupture!.avant > 0 && Math.max(s.rupture!.apres / s.rupture!.avant, s.rupture!.avant / Math.max(s.rupture!.apres, 1e-12)) >= 8
    if (enHausse(s) && !(s.compose.calcule && ouvragesEnHausse.has(s.ouvrage.cle))) {
      const forte = s.classe === 'hausse'
      const audessus = !!ref && s.ratioDernier !== null && s.ratioDernier > 1
      faits.push({
        ...base,
        niveau: audessus || s.vigilance ? 'alerte' : 'vigilance',
        titre: `${forte ? 'Hausse significative' : 'Hausse probable'} : ${nomSerie(s)}`,
        detail: `${frPente(s)}, ${pAlpha(s)} ; dernier résultat ${valeurDerniere}${posRef}.${palier ? ` Évolution par palier : ${rupt(s)}.` : ''}${s.horizon?.sens === 'au-dessus' ? ` À ce rythme, la valeur de référence serait atteinte vers ${frAnnee(s.horizon.annee)}.` : ''}${s.vigilance && !audessus ? ` Au-delà de ${Math.round(r.vigilance * 100)} % de la valeur de référence.` : ''}`,
        poids: (forte ? 90 : 70) + (audessus ? 10 : 0) + Math.min(9, Math.log10(1 + (s.ratioDernier ?? 0)) * 5),
      })
    }
    if (s.apparition) {
      faits.push({
        ...base,
        niveau: ref && s.ratioDernier !== null && s.ratioDernier > 1 ? 'alerte' : 'vigilance',
        titre: `Apparition : ${nomSerie(s)}`,
        detail: `Quantifié aux dernières campagnes après ${s.retenus.slice(0, -2).length} campagnes sous la LQ ; dernier résultat ${valeurDerniere}${posRef}.`,
        poids: 75,
      })
    }
    if (s.rupture && !ruptureMemeSens && !s.compose.calcule) {
      faits.push({
        ...base,
        niveau: s.rupture.hausse ? 'vigilance' : 'favorable',
        titre: `Rupture ${s.rupture.hausse ? 'à la hausse' : 'à la baisse'} : ${nomSerie(s)}`,
        detail: `${rupt(s).charAt(0).toUpperCase()}${rupt(s).slice(1)} ; sur l'ensemble de la période : ${CLASSES[s.classe].libelle.toLowerCase()}.`,
        poids: s.rupture.hausse ? 72 : 40,
      })
    }
    if (ref && s.depassementsConsecutifs > 0 && !enHausse(s) && !s.compose.calcule) {
      const n = s.depassementsConsecutifs
      faits.push({
        ...base,
        niveau: n > 1 ? 'alerte' : 'vigilance',
        titre: `${n > 1 ? 'Dépassement persistant' : 'Dépassement à la dernière campagne'} : ${nomSerie(s)}`,
        detail: `${n > 1 ? `Au-dessus de la valeur de référence (${fr(ref.valeur)} ${s.compose.unite}) aux ${n} dernières campagnes` : `Dernier résultat ${valeurDerniere}, au-dessus de la valeur de référence (${fr(ref.valeur)} ${s.compose.unite})${s.depassements > 1 ? ` — ${s.depassements} dépassements sur la période` : ' — premier dépassement de la période'}`} ; ${CLASSES[s.classe].libelle.toLowerCase()}${enBaisse(s) ? ` (${frPente(s)})` : ''}.${s.horizon?.sens === 'sous' ? ` Projection de la décroissance : valeur de référence atteinte vers ${frAnnee(s.horizon.annee)}${s.horizon.plusTot && s.horizon.plusTard ? ` (${frAnnee(s.horizon.plusTot)} à ${frAnnee(s.horizon.plusTard)})` : ''}.` : ''}`,
        poids: (n > 1 ? 60 : 52) + Math.min(9, Math.log10(1 + (s.ratioDernier ?? 0)) * 5),
      })
    }
    if (s.classe === 'baisse') {
      faits.push({
        ...base,
        niveau: 'favorable',
        titre: `Baisse significative : ${nomSerie(s)}`,
        detail: `${frPente(s)}, ${pAlpha(s)}${s.decroissance ? ` ; demi-vie apparente ${fr(s.decroissance.demiVie, 2)} an${s.decroissance.demiVie >= 2 ? 's' : ''}` : ''} ; dernier résultat ${valeurDerniere}${posRef}.${palier ? ` Évolution par palier : ${rupt(s)}.` : ''}`,
        poids: (s.compose.calcule ? 32 : 30) + Math.min(9, Math.log10(1 + (s.ratioMax ?? 0)) * 5),
      })
    }
    if (s.repasseSous) {
      faits.push({
        ...base,
        niveau: 'favorable',
        titre: `Retour sous la valeur de référence : ${nomSerie(s)}`,
        detail: `Sous ${fr(ref!.valeur)} ${s.compose.unite} aux deux dernières campagnes, après ${s.depassements} dépassement${s.depassements > 1 ? 's' : ''} sur la période.`,
        poids: 35,
      })
    }
    if (ref && s.nQ === 0 && s.lqDerniere !== null && s.lqDerniere > ref.valeur) {
      ;(lqInadaptees.get(s.compose.cle) ?? lqInadaptees.set(s.compose.cle, []).get(s.compose.cle)!).push(s)
    }
  }
  for (const ss of lqInadaptees.values()) {
    const s = ss[0]
    faits.push({
      compose: s.compose.cle,
      niveau: 'vigilance',
      titre: `LQ inadaptée : ${s.compose.nom}`,
      detail: `Jamais quantifié sur ${ss.map((x) => x.ouvrage.nom).join(', ')}, mais la LQ actuelle (${fr(Math.max(...ss.map((x) => x.lqDerniere!)))} ${s.compose.unite}) dépasse la valeur de référence (${fr(s.reference!.valeur)}) : l'absence de dépassement n'est pas démontrée.`,
      poids: 50,
    })
  }
  for (const d of degr) {
    if (d.stade === 'stagnation-dce' || d.stade === 'accumulation-cv') {
      faits.push({
        ouvrage: d.ouvrage.cle,
        niveau: 'vigilance',
        titre: `${d.stade === 'stagnation-dce' ? 'Déchloration bloquée au stade DCE ?' : 'Accumulation de chlorure de vinyle'} : ${d.ouvrage.nom}`,
        detail: d.lecture.filter((t) => /représente/.test(t)).join(' '),
        poids: 58,
      })
    }
    if (d.tendanceChlores && d.tendanceChlores.pBilateral <= r.alpha) {
      const baisse = d.tendanceChlores.S < 0
      faits.push({
        ouvrage: d.ouvrage.cle,
        niveau: baisse ? 'info' : 'vigilance',
        titre: `${baisse ? 'Déchloration en cours' : 'Composition plus chlorée'} : ${d.ouvrage.nom}`,
        detail: baisse
          ? `Le nombre moyen d'atomes de chlore des chloroéthènes baisse significativement (${pTexte(d.tendanceChlores.pBilateral)}) : les produits de dégradation prennent le pas sur les composés parents.`
          : `Le nombre moyen d'atomes de chlore des chloroéthènes augmente (${pTexte(d.tendanceChlores.pBilateral)}) : apport de composés parents ou dégradation ralentie.`,
        poids: baisse ? 38 : 55,
      })
    }
  }
  if (ecoulement) {
    for (const x of ecoulement.incoherences) {
      faits.push({
        ouvrage: x.ouvrage.cle,
        niveau: 'vigilance',
        titre: `Position à vérifier : ${x.ouvrage.nom}`,
        detail: `Déclaré ${x.declaree === 'amont' ? 'en amont' : 'en aval'}, mais situé ${x.attendue === 'amont' ? 'en amont' : 'en aval'} le long de l'écoulement déduit des cotes de la nappe (vers le ${direction(ecoulement.azimutMoyen)}) : la lecture amont / aval et les pistes qui en dépendent sont à revoir.`,
        poids: 56,
      })
    }
    faits.push({
      niveau: 'info',
      titre: `Écoulement vers le ${direction(ecoulement.azimutMoyen)}`,
      detail: `Gradient hydraulique médian ${fr(ecoulement.gradientMedian * 1000, 2)} ‰ sur ${ecoulement.campagnes.length} campagne${ecoulement.campagnes.length > 1 ? 's' : ''} (plan ajusté sur les cotes de la nappe) ; ${ecoulement.dispersion > 45 ? `direction variable d'une campagne à l'autre (écart circulaire ${Math.round(ecoulement.dispersion)}°) : le rôle amont / aval des ouvrages peut changer selon la saison.` : `direction stable (écart circulaire ${Math.round(ecoulement.dispersion)}°).`}`,
      poids: ecoulement.dispersion > 45 ? 45 : 18,
    })
  }
  for (const p of piezo) {
    for (const c of p.correlations) {
      if (c.c.p > r.alpha) continue
      faits.push({
        ouvrage: p.ouvrage.cle,
        compose: c.compose.cle,
        niveau: 'info',
        titre: `Lien avec le niveau de la nappe : ${c.compose.nom} sur ${p.ouvrage.nom}`,
        detail: `Concentrations ${c.c.tau > 0 ? 'plus fortes quand la nappe est haute (lessivage de la zone non saturée ou de la frange capillaire possible)' : 'plus fortes quand la nappe est basse (moindre dilution)'} — tau de Kendall ${fr(c.c.tau, 2)}, ${pTexte(c.c.p)}.`,
        poids: 25,
      })
    }
  }
  for (const a of amontAval) {
    if (a.frequenceAmont >= 0.5 && !a.compose.calcule && !a.compose.terrain) {
      faits.push({
        compose: a.compose.cle,
        niveau: 'info',
        titre: `Présent à l'amont : ${a.compose.nom}`,
        detail: `Quantifié à l'amont à ${Math.round(a.frequenceAmont * 100)} % des campagnes : un apport extérieur au site (ou un fond géochimique pour un métal) est à considérer.`,
        poids: 28,
      })
    }
  }
  const hors = jamais.filter((c) => !c.calcule)
  if (hors.length) {
    faits.push({
      niveau: 'info',
      titre: `${hors.length} composé${hors.length > 1 ? 's' : ''} jamais quantifié${hors.length > 1 ? 's' : ''} sur la période`,
      detail: hors.map((c) => c.nom).join(', ') + '.',
      poids: 20,
    })
  }
  if (campagnes.length && campagnes.length < r.nRobuste) {
    faits.push({
      niveau: 'info',
      titre: `Chronique de ${campagnes.length} campagne${campagnes.length > 1 ? 's' : ''}`,
      detail: `En dessous de ${r.nRobuste} résultats par série, les tests de tendance restent indicatifs (l'outil HYPE du BRGM en demande au moins 10).`,
      poids: 15,
    })
  }
  return faits.sort((a, b) => b.poids - a.poids)
}

// ---- Monitoring programme prompts ---------------------------------------------------------------

function pistesSurveillance(
  series: AnalyseSerie[],
  ouvrages: Ouvrage[],
  jamais: Compose[],
  quantifies: Compose[],
  campagnes: Campagne[],
  base: Base,
  references: Map<string, Reference | null>,
  r: Reglages,
): Piste[] {
  const pistes: Piste[] = []
  const nC = campagnes.length
  const enHausse = (s: AnalyseSerie) => s.classe === 'hausse' || s.classe === 'hausse-probable'
  const labo = (s: AnalyseSerie) => !s.compose.terrain && !s.compose.calcule

  // Wells.
  for (const o of ouvrages) {
    const ss = series.filter((s) => s.ouvrage === o && labo(s))
    if (!ss.length) continue
    const prelevees = new Set(ss.flatMap((s) => s.retenus.map((p) => p.resultat.campagne))).size
    const hausse = ss.filter(enHausse)
    const depasse = ss.filter((s) => s.depassementsConsecutifs > 0)
    const rien = ss.every((s) => s.nQ === 0)
    if (hausse.length || depasse.length) {
      pistes.push({
        type: hausse.some((s) => s.classe === 'hausse') ? 'renforcer' : 'maintenir',
        portee: 'ouvrage',
        cible: o.nom,
        texte: `${hausse.length ? `Tendance à la hausse (${hausse.map((s) => s.compose.nom).join(', ')})` : ''}${hausse.length && depasse.length ? ' ; ' : ''}${depasse.length ? `dépassement à la dernière campagne (${depasse.map((s) => s.compose.nom).join(', ')})` : ''} : maintenir l'ouvrage${hausse.some((s) => s.classe === 'hausse') ? ', voire resserrer la fréquence le temps de confirmer la tendance' : ''}.`,
        critere: 'Hausse significative ou probable, ou dépassement de la valeur de référence à la dernière campagne.',
      })
    } else if (rien && prelevees >= 4) {
      pistes.push({
        type: o.position === 'amont' ? 'maintenir' : 'alleger',
        portee: 'ouvrage',
        cible: o.nom,
        texte:
          o.position === 'amont'
            ? `Aucun composé quantifié sur ${prelevees} campagnes : ouvrage de référence amont, à conserver pour situer les apports extérieurs.`
            : `Aucun composé quantifié sur ${prelevees} campagnes : son rôle dans le réseau (contrôle aval, latéral, sentinelle d'un captage) décide de son maintien ; un espacement des prélèvements peut se discuter.`,
        critere: 'Tous les composés < LQ sur au moins 4 campagnes de la période.',
      })
    }
    const manquees = nC - prelevees
    if (manquees >= 2) {
      pistes.push({
        type: 'completer',
        portee: 'ouvrage',
        cible: o.nom,
        texte: `Non prélevé à ${manquees} des ${nC} campagnes de la période : en rechercher la cause (ouvrage sec, inaccessible, détérioré) — un contrôle de l'état de l'ouvrage peut être nécessaire.`,
        critere: 'Au moins 2 campagnes manquantes.',
      })
    }
  }

  // Compounds.
  const quantifiesNoms = new Set(quantifies.map((c) => compact(c.nom)))
  for (const c of jamais) {
    if (c.calcule) continue
    const ss = series.filter((s) => s.compose === c)
    const nMax = Math.max(0, ...ss.map((s) => s.n))
    const ref = references.get(c.cle)
    const lqMax = Math.max(0, ...ss.map((s) => s.lqMax ?? 0))
    const parents = FILLES[compact(c.nom)]?.filter((p) => quantifiesNoms.has(p))
    if (parents?.length) {
      pistes.push({
        type: 'maintenir',
        portee: 'compose',
        cible: c.nom,
        texte: `Jamais quantifié, mais produit de dégradation de composés présents sur le site : à conserver dans le programme analytique.`,
        critere: 'Filiation de déchloration (USEPA, 1998).',
      })
    } else if (ref && lqMax > ref.valeur) {
      pistes.push({
        type: 'completer',
        portee: 'compose',
        cible: c.nom,
        texte: `Jamais quantifié, mais avec une LQ (${fr(lqMax)} ${c.unite}) au-dessus de la valeur de référence (${fr(ref.valeur)}) : demander au laboratoire une LQ inférieure avant toute conclusion.`,
        critere: 'Les limites de quantification doivent être inférieures aux valeurs de comparaison (guides BRGM/INERIS de surveillance des eaux souterraines).',
      })
    } else if (nMax >= 4) {
      pistes.push({
        type: 'retirer',
        portee: 'compose',
        cible: c.nom,
        texte: `Jamais quantifié sur ${nMax} campagnes, sur aucun ouvrage, avec une LQ adaptée : son retrait du programme analytique peut être proposé s'il n'est pas un traceur de la source.`,
        critere: '< LQ sur au moins 4 campagnes et tous les ouvrages ; LQ ≤ valeur de référence.',
      })
    }
  }
  for (const c of quantifies) {
    if (c.calcule || c.terrain) continue
    const ss = series.filter((s) => s.compose === c && s.n > 0)
    const ref = references.get(c.cle)
    if (ss.some(enHausse)) {
      pistes.push({
        type: ss.some((s) => s.classe === 'hausse') ? 'renforcer' : 'maintenir',
        portee: 'compose',
        cible: c.nom,
        texte: `Tendance à la hausse sur ${ss.filter(enHausse).map((s) => s.ouvrage.nom).join(', ')} : à maintenir au programme.`,
        critere: 'Hausse significative ou probable sur au moins un ouvrage.',
      })
      continue
    }
    if (!ref) continue
    const nMin = Math.min(...ss.map((s) => s.n))
    const tousSous = ss.every((s) => s.ratioMax !== null && s.ratioMax < 0.5) && ss.every((s) => s.depassements === 0)
    if (tousSous && nMin >= 8 && ss.every((s) => s.classe !== 'sans-tendance')) {
      pistes.push({
        type: 'alleger',
        portee: 'compose',
        cible: c.nom,
        texte: `Toujours sous la moitié de la valeur de référence (${fr(ref.valeur)} ${c.unite}) sur ${nMin} campagnes au moins, sans hausse : un allègement (fréquence, ouvrages) peut être proposé.`,
        critere: 'Maximum < 50 % de la valeur de référence sur au moins 8 campagnes, aucune hausse.',
      })
    }
  }

  // Network.
  const regimes = new Set(campagnes.map((c) => c.regime).filter(Boolean))
  if (nC >= 4 && regimes.size < 2) {
    pistes.push({
      type: 'completer',
      portee: 'reseau',
      cible: 'Calendrier',
      texte: 'Les campagnes de la période ne couvrent pas à la fois les hautes et les basses eaux : le suivi devrait alterner les deux régimes pour saisir les variations saisonnières.',
      critere: 'Au moins une campagne de hautes eaux et une de basses eaux par an (pratique courante, guide BRGM/INERIS « Surveillance de la qualité des eaux souterraines »).',
    })
  }
  if (!base.niveaux.length && nC) {
    pistes.push({
      type: 'completer',
      portee: 'reseau',
      cible: 'Piézométrie',
      texte: "Aucun niveau d'eau chargé : la piézométrie de chaque campagne permet de vérifier le sens d'écoulement et le rôle (amont / aval) de chaque ouvrage, et d'interpréter les variations de concentration.",
      critere: 'Relevé piézométrique à chaque campagne.',
    })
  }
  if (nC && nC < r.nRobuste) {
    pistes.push({
      type: 'completer',
      portee: 'reseau',
      cible: 'Durée',
      texte: `${nC} campagnes sur la période : les tendances restent fragiles en dessous de ${r.nRobuste} résultats par série ; toute demande d'arrêt ou d'allègement appuyée sur elles est à étayer.`,
      critere: 'Au moins 10 résultats par série (outil HYPE, BRGM).',
    })
  }
  if (series.some((s) => s.compose.terrain === null && s.classe === 'hausse' && /vinyle|chloroethylene/.test(compact(s.compose.nom)))) {
    pistes.push({
      type: 'completer',
      portee: 'reseau',
      cible: 'Paramètres',
      texte: "Le chlorure de vinyle augmente : l'analyse de l'éthène et de l'éthane (fin de la déchloration) et des indicateurs redox (O2, nitrates, fer II, sulfates, méthane) permet de juger si la dégradation va à son terme.",
      critere: 'Atténuation naturelle des solvants chlorés (USEPA, 1998).',
    })
  }
  const ordre: TypePiste[] = ['renforcer', 'maintenir', 'completer', 'alleger', 'retirer']
  return pistes.sort((a, b) => ordre.indexOf(a.type) - ordre.indexOf(b.type))
}

// ---- Data quality -------------------------------------------------------------------------------------

function notesQualite(base: Base, series: AnalyseSerie[], ouvrages: Ouvrage[], campagnes: Campagne[], jamais: Compose[], references: Map<string, Reference | null>): NoteQualite[] {
  const notes: NoteQualite[] = []
  if (base.sansDate.length) notes.push({ niveau: 'alerte', texte: `${base.sansDate.length} campagne${base.sansDate.length > 1 ? 's' : ''} sans date, hors analyse : saisissez leur date à l'étape 2.` })
  for (const n of base.notes) notes.push({ niveau: 'info', texte: n })
  const lqVar = new Map<string, AnalyseSerie[]>()
  for (const s of series) if (s.lqVariable) (lqVar.get(s.compose.nom) ?? lqVar.set(s.compose.nom, []).get(s.compose.nom)!).push(s)
  for (const [nom, ss] of lqVar) {
    notes.push({
      niveau: 'vigilance',
      texte: `${nom} : LQ variables au cours du temps (${fr(Math.min(...ss.map((s) => s.lqMin!)))} à ${fr(Math.max(...ss.map((s) => s.lqMax!)))} ${ss[0].compose.unite}) — changement de laboratoire ou de méthode, à garder en tête pour lire les tendances.`,
    })
  }
  const lqRef = series.filter((s) => s.lqSuperieureReference)
  const parC = new Map<string, AnalyseSerie[]>()
  for (const s of lqRef) (parC.get(s.compose.nom) ?? parC.set(s.compose.nom, []).get(s.compose.nom)!).push(s)
  for (const [nom, ss] of parC) {
    const ref = references.get(ss[0].compose.cle)
    notes.push({ niveau: 'vigilance', texte: `${nom} : LQ jusqu'à ${fr(Math.max(...ss.map((s) => s.lqMax!)))} ${ss[0].compose.unite}, au-dessus de la valeur de référence (${fr(ref?.valeur)}) sur ${ss.map((s) => s.ouvrage.nom).join(', ')}.` })
  }
  const atyp = series.flatMap((s) => s.points.filter((p) => p.atypique && !p.exclu).map((p) => ({ s, p })))
  for (const { s, p } of atyp) {
    notes.push({ niveau: 'vigilance', texte: `Résultat atypique : ${s.compose.nom} sur ${s.ouvrage.nom} le ${formatDate(p.date)} (${p.resultat.brut} ${s.compose.unite}), très éloigné du reste de la chronique — à vérifier (rapport du laboratoire, conditions de prélèvement) ; il peut être écarté d'un clic sur le graphique.` })
  }
  const exclus = series.flatMap((s) => s.points.filter((p) => p.exclu).map((p) => ({ s, p })))
  if (exclus.length) notes.push({ niveau: 'info', texte: `${exclus.length} résultat${exclus.length > 1 ? 's' : ''} écarté${exclus.length > 1 ? 's' : ''} par l'utilisateur : ${exclus.map(({ s, p }) => `${s.compose.nom} ${s.ouvrage.nom} ${formatDate(p.date)}`).join(' ; ')}.` })
  for (const o of ouvrages) {
    const prelevees = new Set(base.resultats.filter((x) => x.ouvrage === o.cle && campagnes.some((c) => c.id === x.campagne)).map((x) => x.campagne))
    const manquees = campagnes.filter((c) => !prelevees.has(c.id))
    if (manquees.length && manquees.length < campagnes.length) notes.push({ niveau: 'info', texte: `${o.nom} : pas de résultat aux campagnes du ${manquees.map((c) => formatDate(c.date)).join(', ')}.` })
  }
  const ctrl = base.controles.filter((c) => campagnes.some((k) => k.id === c.campagne))
  if (ctrl.length) notes.push({ niveau: 'info', texte: `${ctrl.length} échantillon${ctrl.length > 1 ? 's' : ''} de contrôle (blancs, doublons) mis à part : ${[...new Set(ctrl.map((c) => c.echantillon))].join(', ')}.` })
  const nonCompares = jamais.length
  if (nonCompares) notes.push({ niveau: 'info', texte: `${nonCompares} composé${nonCompares > 1 ? 's' : ''} jamais quantifié${nonCompares > 1 ? 's' : ''} : pas de test de tendance.` })
  const sansRef = base.composes.filter((c) => !c.terrain && !c.calcule && !references.get(c.cle) && series.some((s) => s.compose === c && s.nQ > 0))
  if (sansRef.length) notes.push({ niveau: 'info', texte: `Sans valeur de référence (à saisir si besoin) : ${sansRef.map((c) => c.nom).join(', ')}.` })
  return notes
}

// ---- Dechlorination over time -----------------------------------------------------------------------

/** End of the reductive dechlorination: no chlorine left. */
const FIN_CHAINE = [
  { code: 'Éthène', libelle: 'Éthène (éthylène)', variantes: ['ethylene', 'ethene'], masseMolaire: 28.05, chlores: 0, couleur: '#7f8c8d' },
  { code: 'Éthane', libelle: 'Éthane', variantes: ['ethane'], masseMolaire: 30.07, chlores: 0, couleur: '#b7bec4' },
]

/**
 * Chloroethenes in moles, campaign by campaign. The mean number of chlorine
 * atoms per molecule — Σ(moles × Cl) / Σ moles, PCE 4, TCE 3, DCE 2, vinyl
 * chloride 1, ethene and ethane 0 — falls as reductive dechlorination
 * proceeds. Read with the total in moles: a falling chlorine number with a
 * steady total is a transformation, a falling total with a steady
 * composition is rather dilution, dispersion or source depletion.
 */
function degradations(base: Base, ouvrages: Ouvrage[], campagnes: Campagne[], r: Reglages): Degradation[] {
  const especes = [...CHAINES[0].especes, ...FIN_CHAINE]
  const composesEspece = especes.map((e) => base.composes.find((c) => !c.calcule && e.variantes.includes(compact(c.nom))) ?? null)
  if (composesEspece.slice(0, CHAINES[0].especes.length).filter(Boolean).length < 2) return []
  const iDCE = especes.map((e, i) => (/DCE/.test(e.code) ? i : -1)).filter((i) => i >= 0)
  const iCV = especes.findIndex((e) => e.code === 'CV')
  const iFin = especes.map((e, i) => (e.chlores === 0 ? i : -1)).filter((i) => i >= 0)
  const out: Degradation[] = []
  for (const o of ouvrages) {
    const lignes: Degradation['campagnes'] = []
    for (const c of campagnes) {
      const moles = especes.map((e, i) => {
        const comp = composesEspece[i]
        if (!comp) return 0
        const x = base.resultats.find((y) => y.ouvrage === o.cle && y.compose === comp.cle && y.campagne === c.id && !y.exclu)
        if (!x || x.inferieur) return 0
        const ug = /mg/i.test(comp.unite) ? x.valeur * 1000 : /ng/i.test(comp.unite) ? x.valeur / 1000 : x.valeur
        return ug / e.masseMolaire
      })
      const total = moles.reduce((a, b) => a + b, 0)
      const analysee = composesEspece.some((comp) => comp && base.resultats.some((y) => y.ouvrage === o.cle && y.compose === comp.cle && y.campagne === c.id))
      if (!analysee) continue
      lignes.push({ campagne: c, moles, total, chlores: total > 0 ? moles.reduce((s2, m, i) => s2 + m * especes[i].chlores, 0) / total : null })
    }
    const quantifiees = lignes.filter((l) => l.total > 0)
    if (quantifiees.length < 3) continue
    const presentes = especes.map((_, i) => quantifiees.some((l) => l.moles[i] > 0))
    if (presentes.filter(Boolean).length < 2) continue
    const tendanceChlores = quantifiees.length >= 4 ? mannKendall(quantifiees.map((l) => l.chlores!)) : null
    const tendanceTotal = quantifiees.length >= 4 ? mannKendall(quantifiees.map((l) => l.total)) : null
    const finAnalysee = iFin.some((i) => composesEspece[i] !== null)
    // Composition of the last three campaigns.
    const fin = quantifiees.slice(-3)
    const part = (is: number[]) => fin.reduce((a, l) => a + is.reduce((b, i) => b + l.moles[i], 0) / l.total, 0) / fin.length
    const pDCE = part(iDCE)
    const pCV = iCV >= 0 ? part([iCV]) : 0
    const pFin = part(iFin)
    const signif = (mk: MannKendall | null, sens: number) => !!mk && mk.pBilateral <= r.alpha && Math.sign(mk.S) === sens
    let stade: Degradation['stade'] = null
    if (pFin >= 0.1) stade = 'complete'
    else if (pCV >= 0.3) stade = 'accumulation-cv'
    else if (pDCE >= 0.6 && pCV < 0.1 && !signif(tendanceChlores, -1)) stade = 'stagnation-dce'
    const clFin = fin.reduce((a, l) => a + l.chlores!, 0) / fin.length
    const lecture: string[] = []
    lecture.push(
      `Nombre moyen d'atomes de chlore aux dernières campagnes : ${fr(clFin, 2)} (4 = PCE seul, 3 = TCE, 2 = DCE, 1 = chlorure de vinyle, 0 = éthène / éthane)${tendanceChlores ? ` ; ${signif(tendanceChlores, -1) ? 'en baisse significative' : signif(tendanceChlores, 1) ? 'en hausse significative' : 'sans tendance significative'} (${pTexte(tendanceChlores.pBilateral)})` : ''}.`,
    )
    if (tendanceTotal) {
      const cl = signif(tendanceChlores, -1)
      const tb = signif(tendanceTotal, -1)
      const th = signif(tendanceTotal, 1)
      lecture.push(
        cl && !tb && !th
          ? `Total des chloroéthènes (en moles) sans tendance (${pTexte(tendanceTotal.pBilateral)}) : la composition se décale vers les produits de dégradation sans perte de matière dissoute — une transformation (déchloration) plutôt qu'une dilution.`
          : cl && tb
            ? `Total des chloroéthènes en baisse (${pTexte(tendanceTotal.pBilateral)}) en même temps que le chlore moyen : déchloration et diminution de la masse dissoute.`
            : !cl && tb
              ? `Total des chloroéthènes en baisse (${pTexte(tendanceTotal.pBilateral)}) sans changement de composition : dilution, dispersion, épuisement ou traitement de la source plutôt que déchloration réductrice.`
              : th
                ? `Total des chloroéthènes en hausse (${pTexte(tendanceTotal.pBilateral)}) : apport depuis la source ou arrivée du panache.`
                : `Total des chloroéthènes sans tendance nette (${pTexte(tendanceTotal.pBilateral)}).`,
      )
    }
    if (stade === 'stagnation-dce')
      lecture.push(
        `Le DCE représente ${Math.round(pDCE * 100)} % des moles aux dernières campagnes et le chlorure de vinyle reste minoritaire : la déchloration peut être bloquée au stade DCE (milieu insuffisamment réducteur ou populations déchlorantes absentes, Dehalococcoides notamment).`,
      )
    if (stade === 'accumulation-cv')
      lecture.push(
        `Le chlorure de vinyle représente ${Math.round(pCV * 100)} % des moles aux dernières campagnes${finAnalysee ? '' : " et l'éthène / l'éthane ne sont pas analysés"} : la dernière étape (CV → éthène) est à vérifier — c'est le composé le plus toxique de la chaîne.`,
      )
    if (stade === 'complete') lecture.push(`L'éthène / l'éthane représentent ${Math.round(pFin * 100)} % des moles : la déchloration va jusqu'à son terme sur cet ouvrage.`)
    if (!finAnalysee) lecture.push("Éthène et éthane non analysés : la fin de la chaîne n'est pas visible et le chlore moyen ne peut pas descendre sous 1.")
    out.push({
      ouvrage: o,
      especes: especes.map((e) => ({ code: e.code, libelle: e.libelle, couleur: e.couleur, chlores: e.chlores })),
      campagnes: lignes,
      tendanceChlores,
      tendanceTotal,
      finAnalysee,
      stade,
      lecture,
    })
  }
  return out
}

// ---- Water levels ----------------------------------------------------------------------------------------

function piezometrie(base: Base, ouvrages: Ouvrage[], series: AnalyseSerie[], r: Reglages): PiezoOuvrage[] {
  const out: PiezoOuvrage[] = []
  const dans = (date: string) => (!r.debut || date >= r.debut) && (!r.fin || date <= r.fin)
  for (const o of ouvrages) {
    const ns: Niveau[] = base.niveaux.filter((n) => n.ouvrage === o.cle && dans(n.date))
    if (!ns.length) continue
    // Heads when they are the most complete record, else depths — never the two mixed in one series.
    const enCharge = ns.filter((n) => n.charge !== null).length >= ns.filter((n) => n.profondeur !== null).length
    const serie = ns
      .map((n) => ({ t: n.t, date: n.date, v: enCharge ? (n.charge ?? NaN) : n.profondeur !== null ? -n.profondeur : NaN, campagne: n.campagne }))
      .filter((x) => Number.isFinite(x.v))
    if (!serie.length) continue
    const vs = serie.map((x) => x.v)
    const mk = serie.length >= 4 ? mannKendall(vs) : null
    const correlations: PiezoOuvrage['correlations'] = []
    for (const s of series) {
      if (s.ouvrage !== o || s.nQ < 4 || s.compose.terrain) continue
      const paires = s.retenus
        .map((p) => ({ c: p.rang, n: serie.find((x) => x.campagne === p.resultat.campagne)?.v }))
        .filter((x): x is { c: number; n: number } => x.n !== undefined)
      if (paires.length < 6) continue
      const c = kendallTau(paires.map((x) => x.n), paires.map((x) => x.c))
      if (c) correlations.push({ compose: s.compose, c })
    }
    correlations.sort((a, b) => a.c.p - b.c.p)
    out.push({
      ouvrage: o,
      serie,
      enCharge,
      amplitude: vs.length > 1 ? Math.max(...vs) - Math.min(...vs) : null,
      mk,
      sen: mk ? sen(serie.map((x) => x.t), vs, mk.varS) : null,
      correlations,
    })
  }
  return out
}

// ---- Groundwater flow ----------------------------------------------------------------------------------

/**
 * Flow direction and hydraulic gradient of each campaign: the plane
 * h = a·x + b·y + c fitted by least squares through the heads of the wells
 * whose coordinates are known (3 wells at least, not aligned). The water
 * flows down the slope, towards −(a, b). Coordinates in metres (Lambert 93
 * or any projected system).
 */
function ecoulements(base: Base, ouvrages: Ouvrage[], campagnes: Campagne[]): Ecoulement | null {
  const places = ouvrages.filter((o) => o.x !== null && o.y !== null)
  if (places.length < 3) return null
  const xm = places.reduce((a, o) => a + o.x!, 0) / places.length
  const ym = places.reduce((a, o) => a + o.y!, 0) / places.length
  const parCampagne: EcoulementCampagne[] = []
  for (const c of campagnes) {
    const pts = places.flatMap((o) => {
      const n = base.niveaux.find((x) => x.ouvrage === o.cle && x.campagne === c.id && x.charge !== null)
      return n ? [{ x: o.x! - xm, y: o.y! - ym, h: n.charge! }] : []
    })
    if (pts.length < 3) continue
    // Normal equations for [a, b, c].
    let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sh = 0, sxh = 0, syh = 0
    for (const p of pts) {
      sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; sx += p.x; sy += p.y; sh += p.h; sxh += p.x * p.h; syh += p.y * p.h
    }
    const n = pts.length
    const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]]
    const v = [sxh, syh, sh]
    const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    const D = det(M)
    const echelle = (sxx + syy) ** 1.5 * n || 1
    if (Math.abs(D) < 1e-9 * echelle) continue // wells aligned
    const col = (k: number) => M.map((ligne, i) => ligne.map((x, j) => (j === k ? v[i] : x)))
    const a = det(col(0)) / D
    const b = det(col(1)) / D
    const c0 = det(col(2)) / D
    const hm = sh / n
    const ssTot = pts.reduce((s2, p) => s2 + (p.h - hm) ** 2, 0)
    const ssRes = pts.reduce((s2, p) => s2 + (p.h - (a * p.x + b * p.y + c0)) ** 2, 0)
    const gradient = Math.hypot(a, b)
    if (gradient === 0) continue
    const azimut = ((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360
    parCampagne.push({ campagne: c, n, gradient, azimut, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 })
  }
  if (!parCampagne.length) return null
  const rad = parCampagne.map((e) => (e.azimut * Math.PI) / 180)
  const S = rad.reduce((s2, x) => s2 + Math.sin(x), 0) / rad.length
  const C = rad.reduce((s2, x) => s2 + Math.cos(x), 0) / rad.length
  const azimutMoyen = ((Math.atan2(S, C) * 180) / Math.PI + 360) % 360
  const R = Math.min(1, Math.hypot(S, C))
  const dispersion = R > 0 ? (Math.sqrt(-2 * Math.log(R)) * 180) / Math.PI : 180
  const ux = Math.sin((azimutMoyen * Math.PI) / 180)
  const uy = Math.cos((azimutMoyen * Math.PI) / 180)
  const abscisses = places.map((o) => ({ ouvrage: o, abscisse: (o.x! - xm) * ux + (o.y! - ym) * uy }))
  const amin = Math.min(...abscisses.map((x) => x.abscisse))
  const amax = Math.max(...abscisses.map((x) => x.abscisse))
  const tiers = (amax - amin) / 3
  const ordre = abscisses
    .sort((p, q) => p.abscisse - q.abscisse)
    .map((x) => ({ ...x, attendue: (x.abscisse <= amin + tiers ? 'amont' : x.abscisse >= amax - tiers ? 'aval' : 'droit') as 'amont' | 'droit' | 'aval' }))
  const incoherences =
    parCampagne.length >= 2 && dispersion <= 60
      ? ordre
          .filter((x) => (x.ouvrage.position === 'amont' && x.attendue === 'aval') || (x.ouvrage.position === 'aval' && x.attendue === 'amont'))
          .map((x) => ({ ouvrage: x.ouvrage, declaree: x.ouvrage.position, attendue: x.attendue }))
      : []
  const gs = parCampagne.map((e) => e.gradient).sort((p, q) => p - q)
  return { campagnes: parCampagne, azimutMoyen, dispersion, gradientMedian: gs[Math.floor(gs.length / 2)], ordre, incoherences }
}

const ROSE = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
/** "SE (135°)" */
export const direction = (azimut: number) => `${ROSE[Math.round(azimut / 22.5) % 16]} (${Math.round(azimut)}°)`

// ---- Upgradient / downgradient -------------------------------------------------------------------------

function comparaisonAmontAval(base: Base, ouvrages: Ouvrage[], campagnes: Campagne[], composes: Compose[]): AmontAvalCompose[] {
  const groupes = { amont: ouvrages.filter((o) => o.position === 'amont'), droit: ouvrages.filter((o) => o.position === 'droit'), aval: ouvrages.filter((o) => o.position === 'aval') }
  if (!groupes.amont.length && !groupes.aval.length) return []
  const out: AmontAvalCompose[] = []
  for (const c of composes) {
    if (c.terrain) continue
    const lignes = campagnes.map((k) => {
      const max = (os: Ouvrage[]): PointMax | null => {
        const rs = base.resultats.filter((x) => x.compose === c.cle && x.campagne === k.id && !x.exclu && os.some((o) => o.cle === x.ouvrage))
        if (!rs.length) return null
        const q = rs.filter((x) => !x.inferieur)
        const m = q.length ? q.reduce((a, b) => (b.valeur > a.valeur ? b : a)) : rs.reduce((a, b) => (b.valeur < a.valeur ? b : a))
        return { valeur: m.valeur, inferieur: m.inferieur, ouvrage: ouvrages.find((o) => o.cle === m.ouvrage)?.nom ?? m.ouvrage }
      }
      return { campagne: k, amont: max(groupes.amont), droit: max(groupes.droit), aval: max(groupes.aval) }
    })
    const avecAmont = lignes.filter((l) => l.amont)
    out.push({ compose: c, campagnes: lignes, frequenceAmont: avecAmont.length ? avecAmont.filter((l) => !l.amont!.inferieur).length / avecAmont.length : 0 })
  }
  return out
}

