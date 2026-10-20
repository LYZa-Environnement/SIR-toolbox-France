/**
 * Several sampling campaigns of the same wells, for groundwater: wells
 * matched across the campaigns' files, compounds matched across the labs'
 * naming, and what changes from one campaign to the next — evolution of
 * each compound in each well, high-water / low-water contrast, and the sums
 * of the organic families (COHV, BTEX, PAH, petroleum hydrocarbons).
 */

import { CHAINES, compact as compactDiag, diagnosticHCT } from './expert/diagnostics.ts'
import { normaliser } from './guides.ts'
import type { Lecture, Mesure, Parametre } from './parse.ts'

export type Regime = 'HE' | 'BE' | null

export const LIBELLES_REGIME: Record<'HE' | 'BE', string> = { HE: 'Hautes eaux', BE: 'Basses eaux' }

export interface Campagne {
  lecture: Lecture
  fichier: string
  /** ISO date (yyyy-mm-dd), or empty. */
  date: string
  regime: Regime
  /** Samples that are not wells: blanks, duplicates. */
  controles: string[]
}

/** A well and its sample in each campaign (null: not sampled then). */
export interface Ouvrage {
  nom: string
  echantillons: (string | null)[]
}

export function libelleCampagne(c: Campagne, i: number): string {
  const date = c.date ? new Date(`${c.date}T12:00:00`).toLocaleDateString('fr-FR') : null
  return [`Campagne ${i + 1}`, date, c.regime ? LIBELLES_REGIME[c.regime].toLowerCase() : null].filter(Boolean).join(' — ')
}

/** Short label for a column or a chart legend: "12/03/2026 (HE)". */
export function libelleCourt(c: Campagne, i: number): string {
  const date = c.date ? new Date(`${c.date}T12:00:00`).toLocaleDateString('fr-FR') : `Campagne ${i + 1}`
  return c.regime ? `${date} (${c.regime})` : date
}

/** Well name as written across files: "PZ 01", "pz-1" and "Pz1" are one. */
export function cleOuvrage(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[\s_.\-/]+/g, '')
    .replace(/(\D)0+(\d)/g, '$1$2')
}

/** Wells of the first campaign, then those met only later, each matched
 *  by name in every campaign. Blanks and duplicates are left out. */
export function associer(campagnes: Campagne[]): Ouvrage[] {
  const ouvrages: Ouvrage[] = []
  const parCle = new Map<string, Ouvrage>()
  campagnes.forEach((c, i) => {
    for (const p of c.lecture.points) {
      if (c.controles.includes(p.nom)) continue
      const k = cleOuvrage(p.nom)
      let o = parCle.get(k)
      if (!o || o.echantillons[i] !== null) {
        o = { nom: p.nom, echantillons: campagnes.map(() => null) }
        ouvrages.push(o)
        if (!parCle.has(k)) parCle.set(k, o)
      }
      o.echantillons[i] = p.nom
    }
  })
  return ouvrages
}

/** Campaign indices from the oldest to the latest; undated ones keep their
 *  place after the dated ones. */
export function ordreChronologique(campagnes: Campagne[]): number[] {
  return campagnes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.date && b.c.date ? a.c.date.localeCompare(b.c.date) : a.c.date ? -1 : b.c.date ? 1 : a.i - b.i))
    .map((x) => x.i)
}

// ---- Compounds across files -----------------------------------------------------------

/** One compound across labs: by CAS number when given, else by name. */
export const cleCompose = (p: Parametre) => (p.cas && /^\d{2,7}-\d{2}-\d$/.test(p.cas) ? p.cas : `nom:${normaliser(p.nom)}`)

const estMasseVolume = (unite: string) => /g\s*\/\s*l/i.test(unite)

export interface Compose {
  cle: string
  nom: string
  famille: string
  unite: string
  somme: boolean
  /** The compound's row in each campaign, if analysed. */
  parametres: (Parametre | null)[]
}

/** Compounds in the order of the first campaign that has them, each in
 *  the unit of the first campaign that has it. */
export function composes(campagnes: Campagne[]): Compose[] {
  const liste: Compose[] = []
  const parCle = new Map<string, Compose>()
  campagnes.forEach((c, i) => {
    for (const p of c.lecture.parametres.CM) {
      const k = cleCompose(p)
      let x = parCle.get(k)
      if (!x) {
        x = { cle: k, nom: p.nom, famille: p.famille, unite: p.unite, somme: p.somme, parametres: campagnes.map(() => null) }
        parCle.set(k, x)
        liste.push(x)
      }
      if (!x.parametres[i]) x.parametres[i] = p
    }
  })
  return liste
}

const formatFr = (x: number) => String(Number(x.toPrecision(3))).replace('.', ',')

/** A campaign's result for a compound in a well, in the compound's unit;
 *  null when the well or the compound was not analysed then, or when the
 *  units cannot be compared. */
export function mesure(campagne: Campagne, compose: Compose, i: number, echantillon: string | null): Mesure | null {
  const p = compose.parametres[i]
  if (!p || !echantillon) return null
  const m = campagne.lecture.valeurs.CM[echantillon]?.[p.cle]
  if (!m || m.valeur === null) return null
  if (p.unite.replace(/\s+/g, '').toLowerCase() === compose.unite.replace(/\s+/g, '').toLowerCase()) {
    return { ...m, brut: m.brut.replace(/(\d)\.(\d)/g, '$1,$2') }
  }
  if (!estMasseVolume(p.unite) || !estMasseVolume(compose.unite)) return null
  const ref = compose.parametres.find((x) => x && x.unite === compose.unite)
  const facteur = p.versMicrogrammes / (ref?.versMicrogrammes ?? 1)
  const valeur = m.valeur * facteur
  return { brut: `${m.inferieur ? '<' : ''}${formatFr(valeur)}`, valeur, inferieur: m.inferieur }
}

// ---- Evolution ------------------------------------------------------------------------

export type Evolution = 'hausse' | 'baisse' | 'stable' | 'apparition' | 'disparition' | 'non-quantifie' | 'non-conclusif'

export const LIBELLES_EVOLUTION: Record<Evolution, { court: string; long: string; couleur: string }> = {
  hausse: { court: 'Hausse', long: 'Hausse (rapport ≥ facteur retenu)', couleur: '#C0392B' },
  apparition: { court: 'Apparition', long: 'Non quantifié puis quantifié', couleur: '#E67E22' },
  stable: { court: 'Stable', long: 'Du même ordre (écart inférieur au facteur retenu)', couleur: '#7F8C8D' },
  baisse: { court: 'Baisse', long: 'Baisse (rapport ≤ 1 / facteur retenu)', couleur: '#1F6B45' },
  disparition: { court: 'Disparition', long: 'Quantifié puis non quantifié', couleur: '#2E75B6' },
  'non-quantifie': { court: '<LQ', long: 'Non quantifié aux deux campagnes', couleur: '#BFBFBF' },
  'non-conclusif': { court: 'Non conclusif', long: "Limite de quantification trop élevée d'un côté pour comparer", couleur: '#BFBFBF' },
}

/** From an earlier result to a later one. A gap is retained from the
 *  factor on (by default 2, beyond the analytical uncertainty); a compound
 *  appearing or vanishing must clear the other LQ by the same factor. */
export function evolution(avant: Mesure | null, apres: Mesure | null, facteur: number): Evolution | null {
  if (!avant || !apres || avant.valeur === null || apres.valeur === null) return null
  if (avant.inferieur && apres.inferieur) return 'non-quantifie'
  if (avant.inferieur) return apres.valeur >= facteur * avant.valeur ? 'apparition' : 'non-conclusif'
  if (apres.inferieur) return avant.valeur >= facteur * apres.valeur ? 'disparition' : 'non-conclusif'
  const r = apres.valeur / avant.valeur
  return r >= facteur ? 'hausse' : r <= 1 / facteur ? 'baisse' : 'stable'
}

// ---- High water / low water -------------------------------------------------------------

export interface ContrasteRegime {
  compose: Compose
  /** Wells where the compound is higher in high water, in low water, alike. */
  plusHE: string[]
  plusBE: string[]
  comparable: string[]
  /** Median of the high-water / low-water ratios, wells quantified at both. */
  rapportMedian: number | null
}

/** Compares, well by well, the highest high-water result to the highest
 *  low-water one. Only compounds quantified at least once take part. */
export function contrasteRegimes(campagnes: Campagne[], ouvrages: Ouvrage[], liste: Compose[], facteur: number): ContrasteRegime[] | null {
  const he = campagnes.map((c, i) => (c.regime === 'HE' ? i : -1)).filter((i) => i >= 0)
  const be = campagnes.map((c, i) => (c.regime === 'BE' ? i : -1)).filter((i) => i >= 0)
  if (!he.length || !be.length) return null
  const max = (comp: Compose, o: Ouvrage, indices: number[]) => {
    const ms = indices.map((i) => mesure(campagnes[i], comp, i, o.echantillons[i])).filter((m): m is Mesure => !!m)
    if (!ms.length) return null
    const q = ms.filter((m) => !m.inferieur)
    return q.length ? { valeur: Math.max(...q.map((m) => m.valeur!)), inferieur: false } : { valeur: Math.min(...ms.map((m) => m.valeur!)), inferieur: true }
  }
  const r: ContrasteRegime[] = []
  for (const comp of liste) {
    if (!estMasseVolume(comp.unite)) continue
    const ligne: ContrasteRegime = { compose: comp, plusHE: [], plusBE: [], comparable: [], rapportMedian: null }
    const rapports: number[] = []
    for (const o of ouvrages) {
      const a = max(comp, o, he)
      const b = max(comp, o, be)
      if (!a || !b || (a.inferieur && b.inferieur)) continue
      if (a.inferieur) {
        if (b.valeur >= facteur * a.valeur) ligne.plusBE.push(o.nom)
        continue
      }
      if (b.inferieur) {
        if (a.valeur >= facteur * b.valeur) ligne.plusHE.push(o.nom)
        continue
      }
      const x = a.valeur / b.valeur
      rapports.push(x)
      if (x >= facteur) ligne.plusHE.push(o.nom)
      else if (x <= 1 / facteur) ligne.plusBE.push(o.nom)
      else ligne.comparable.push(o.nom)
    }
    if (!ligne.plusHE.length && !ligne.plusBE.length && !ligne.comparable.length) continue
    rapports.sort((x, y) => x - y)
    ligne.rapportMedian = rapports.length ? (rapports.length % 2 ? rapports[(rapports.length - 1) / 2] : (rapports[rapports.length / 2 - 1] + rapports[rapports.length / 2]) / 2) : null
    r.push(ligne)
  }
  return r
}

// ---- Sums of organic families ------------------------------------------------------------

export type Famille = 'COHV' | 'BTEX' | 'HAP' | 'HCT'

export const LIBELLES_FAMILLE: Record<Famille, string> = {
  COHV: 'Somme des COHV',
  BTEX: 'Somme des BTEX',
  HAP: 'Somme des HAP (16 HAP US EPA)',
  HCT: 'Hydrocarbures C10–C40',
}

const VARIANTES_HAP = [
  'naphtalene', 'naphthalene', 'acenaphtylene', 'acenaphthylene', 'acenaphtene', 'acenaphthene', 'fluorene', 'phenanthrene',
  'anthracene', 'fluoranthene', 'pyrene', 'benzoaanthracene', 'benzaanthracene', 'chrysene', 'benzobfluoranthene',
  'benzokfluoranthene', 'benzoapyrene', 'dibenzoahanthracene', 'dibenzahanthracene', 'benzoghiperylene', 'indeno123cdpyrene',
]
const BTEX_SIMPLES = ['benzene', 'toluene', 'ethylbenzene']
const XYLENES_TOTAL = ['xylenes', 'xylenestotaux', 'sommedesxylenes']
const XYLENES = ['orthoxylene', 'oxylene', 'paraetmetaxylene', 'metaetparaxylene', 'mpxylene', 'xylenemetapara']
const FAMILLE_COHV = /halog|cohv|organo.?chlor/i
const ESPECES_COHV = new Set(CHAINES.filter((c) => c.nom !== 'Chlorobenzènes').flatMap((c) => c.especes.flatMap((e) => e.variantes)))
const TOTAL_HCT = /hydrocarbures?.*c\s*10\s*[-–àa]+\s*c\s*40|indice\s+(d.)?hydrocarbure|^hct\b/i

/** The rows a family sum adds up, in a campaign: individual compounds,
 *  never the lab's own totals. */
function composants(lecture: Lecture, famille: Famille): Parametre[] {
  const ps = lecture.parametres.CM.filter((p) => !p.somme && estMasseVolume(p.unite))
  const n = (p: Parametre) => compactDiag(p.nom)
  const total = (p: Parametre) => /total|somme|\bsum/i.test(p.nom)
  if (famille === 'COHV') return ps.filter((p) => !total(p) && (ESPECES_COHV.has(n(p)) || (FAMILLE_COHV.test(p.famille) && !/benz/i.test(p.nom))))
  if (famille === 'BTEX') {
    const xt = ps.find((p) => XYLENES_TOTAL.includes(n(p)))
    return ps.filter((p) => BTEX_SIMPLES.includes(n(p)) || (xt ? p === xt : XYLENES.includes(n(p))))
  }
  if (famille === 'HAP') return ps.filter((p) => VARIANTES_HAP.includes(n(p)))
  return []
}

export interface Somme {
  /** Sum of the quantified results, in µg/l; 0 when none is. */
  valeur: number
  /** Nothing quantified among the components. */
  nonQuantifie: boolean
}

/** A family's sum for one sample, in µg/l; null when no component was
 *  analysed. Petroleum hydrocarbons: the lab's C10–C40 index, else the sum
 *  of its carbon fractions. */
export function somme(lecture: Lecture, famille: Famille, echantillon: string): Somme | null {
  const v = lecture.valeurs.CM[echantillon]
  if (!v) return null
  if (famille === 'HCT') {
    const p = lecture.parametres.CM.find((x) => TOTAL_HCT.test(x.nom) && estMasseVolume(x.unite))
    const m = p && v[p.cle]
    if (p && m && m.valeur !== null) return { valeur: m.inferieur ? 0 : m.valeur * p.versMicrogrammes, nonQuantifie: m.inferieur }
    const d = diagnosticHCT(lecture, [echantillon])
    if (d) return { valeur: d.echantillons[0].total * (d.fractions[0].p.versMicrogrammes ?? 1), nonQuantifie: false }
    return null
  }
  const cs = composants(lecture, famille)
  const ms = cs.map((p) => ({ p, m: v[p.cle] })).filter((x) => x.m && x.m.valeur !== null)
  if (!ms.length) return null
  const q = ms.filter((x) => !x.m!.inferieur)
  return { valeur: q.reduce((s, x) => s + x.m!.valeur! * x.p.versMicrogrammes, 0), nonQuantifie: !q.length }
}

export const FAMILLES: Famille[] = ['COHV', 'BTEX', 'HAP', 'HCT']

/** Families present in at least one campaign. */
export function famillesPresentes(campagnes: Campagne[], ouvrages: Ouvrage[]): Famille[] {
  return FAMILLES.filter((f) => ouvrages.some((o) => o.echantillons.some((e, i) => e && somme(campagnes[i].lecture, f, e))))
}
