/**
 * Upgradient versus downgradient reading of groundwater results: the
 * upgradient wells stand for the water reaching the site, outside its
 * influence (the "milieu témoin" of the French national methodology); a
 * contribution of the site shows as a concentration higher at or below the
 * site than above it.
 */

import type { Lecture, Mesure, Parametre, Point } from '../parse.ts'
import { CHAINES, compact } from './diagnostics.ts'

export type Position = 'amont' | 'droit' | 'aval'

export const LIBELLES_POSITION: Record<Position, string> = {
  amont: 'Amont hydraulique',
  droit: 'Au droit du site',
  aval: 'Aval hydraulique',
}

/** Position read from the sample name when it says so ("PZ amont", "Pz-aval 2"). */
export function positionsAuto(points: Point[]): Record<string, Position> {
  const r: Record<string, Position> = {}
  for (const p of points) {
    const n = p.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (/(^|[^a-z])(amont|upgradient|upstream)([^a-z]|$)/.test(n)) r[p.nom] = 'amont'
    else if (/(^|[^a-z])(aval|downgradient|downstream)([^a-z]|$)/.test(n)) r[p.nom] = 'aval'
  }
  return r
}

export interface Groupe {
  n: number
  quantifies: number
  /** Highest quantified value, and where. */
  max: { valeur: number; echantillon: string } | null
  /** Highest LQ when nothing is quantified. */
  lq: number | null
}

export type Verdict = 'site' | 'hausse' | 'comparable' | 'baisse' | 'amont-seul' | 'non-conclusif'

export const LECTURES: Record<Verdict, { libelle: string; couleur: string }> = {
  site: { libelle: 'Absent en amont, quantifié au droit ou en aval : contribution du site probable', couleur: '#C0392B' },
  hausse: { libelle: "Plus élevé au droit ou en aval qu'en amont : contribution du site probable, en plus d'un apport amont", couleur: '#E67E22' },
  comparable: { libelle: 'Comparable en amont et en aval : pas de contribution marquée du site (bruit de fond ou apport amont)', couleur: '#7F8C8D' },
  baisse: { libelle: 'Plus élevé en amont : apport extérieur au site, atténué ou dilué en aval', couleur: '#2E75B6' },
  'amont-seul': { libelle: 'Quantifié en amont seulement : origine extérieure au site', couleur: '#2E75B6' },
  'non-conclusif': {
    libelle: "Non conclusif : la limite de quantification de l'autre côté est trop élevée (dilution, effet de matrice) pour comparer",
    couleur: '#BFBFBF',
  },
}

export interface LigneAmontAval {
  p: Parametre
  amont: Groupe
  droit: Groupe
  aval: Groupe
  /** Highest value at or below the site over highest upgradient value; a
   *  lower bound (`borne`) when nothing is quantified upgradient. */
  rapport: { valeur: number; borne: boolean } | null
  verdict: Verdict
  guide: number | null
  /** Exceedance of the comparison value, upgradient and at / below the site. */
  depasseAmont: boolean
  depasseSite: boolean
  /** Daughter product rising while its parents fall: an upgradient plume
   *  degrading on its way, rather than a release from the site. */
  degradation?: string[]
}

export interface AnalyseAmontAval {
  ouvrages: Record<Position, string[]>
  lignes: LigneAmontAval[]
  /** Parameters analysed but never quantified in a positioned well. */
  nonQuantifies: number
  facteur: number
}

/** Concentrations only: a ratio of pH or temperature means nothing. */
const estConcentration = (p: Parametre) => /g\s*\/\s*l/i.test(p.unite)

function groupe(mesures: [string, Mesure][]): Groupe {
  const q = mesures.filter(([, m]) => !m.inferieur && m.valeur !== null)
  const max = q.reduce<Groupe['max']>((a, [e, m]) => (a && a.valeur >= (m.valeur as number) ? a : { valeur: m.valeur as number, echantillon: e }), null)
  const lqs = mesures.filter(([, m]) => m.inferieur && m.valeur !== null).map(([, m]) => m.valeur as number)
  return { n: mesures.length, quantifies: q.length, max, lq: max || !lqs.length ? null : Math.max(...lqs) }
}

/** Chain and number of chlorines of a chlorinated solvent, if it is one. */
function espece(p: Parametre) {
  if (p.somme) return null
  const n = compact(p.nom)
  for (const chaine of CHAINES) {
    const e = chaine.especes.find((x) => x.variantes.includes(n))
    if (e) return { chaine: chaine.nom, chlores: e.chlores }
  }
  return null
}

function marquerDegradation(lignes: LigneAmontAval[]) {
  const especes = lignes.map((l) => ({ l, e: espece(l.p) }))
  for (const { l, e } of especes) {
    if (!e || (l.verdict !== 'site' && l.verdict !== 'hausse')) continue
    const parents = especes.filter((x) => x.e?.chaine === e.chaine && x.e.chlores > e.chlores && (x.l.verdict === 'baisse' || x.l.verdict === 'amont-seul'))
    if (parents.length) l.degradation = parents.map((x) => x.l.p.nom)
  }
}

const ORDRE: Verdict[] = ['site', 'hausse', 'comparable', 'baisse', 'amont-seul', 'non-conclusif']

export function analyseAmontAval(
  lecture: Lecture,
  echantillons: string[],
  positions: Record<string, Position>,
  guides: Record<string, { valeur: number } | null>,
  facteur = 2,
): AnalyseAmontAval | null {
  const ouvrages: Record<Position, string[]> = { amont: [], droit: [], aval: [] }
  for (const e of echantillons) if (positions[e]) ouvrages[positions[e]].push(e)
  if (!ouvrages.amont.length || !(ouvrages.droit.length + ouvrages.aval.length)) return null

  const lignes: LigneAmontAval[] = []
  let nonQuantifies = 0
  const valeurs = lecture.valeurs.CM
  for (const p of lecture.parametres.CM) {
    if (!estConcentration(p)) continue
    const de = (liste: string[]) => liste.flatMap((e): [string, Mesure][] => (valeurs[e]?.[p.cle] ? [[e, valeurs[e][p.cle]]] : []))
    const amont = groupe(de(ouvrages.amont))
    const droit = groupe(de(ouvrages.droit))
    const aval = groupe(de(ouvrages.aval))
    if (!amont.n || !(droit.n + aval.n)) continue
    const maxSite = Math.max(droit.max?.valeur ?? 0, aval.max?.valeur ?? 0)
    if (!amont.max && !maxSite) {
      nonQuantifies++
      continue
    }
    let rapport: LigneAmontAval['rapport'] = null
    let verdict: Verdict
    if (!maxSite) {
      // Not quantified at or below the site: telling only if that LQ is
      // clearly under the upgradient value.
      const lqSite = Math.max(droit.lq ?? 0, aval.lq ?? 0)
      verdict = lqSite && amont.max!.valeur < facteur * lqSite ? 'non-conclusif' : 'amont-seul'
    } else if (!amont.max) {
      // Absent upgradient: the gap with the upgradient LQ must reach the
      // factor, otherwise the LQ is too high (dilution) to compare.
      rapport = amont.lq ? { valeur: maxSite / amont.lq, borne: true } : null
      verdict = !rapport || rapport.valeur >= facteur ? 'site' : 'non-conclusif'
      if (rapport && rapport.valeur < 1) rapport = null
    } else {
      rapport = { valeur: maxSite / amont.max.valeur, borne: false }
      verdict = rapport.valeur >= facteur ? 'hausse' : rapport.valeur <= 1 / facteur ? 'baisse' : 'comparable'
    }
    const guide = guides[p.cle]?.valeur ?? null
    lignes.push({
      p,
      amont,
      droit,
      aval,
      rapport,
      verdict,
      guide,
      depasseAmont: guide !== null && (amont.max?.valeur ?? 0) > guide,
      depasseSite: guide !== null && maxSite > guide,
    })
  }
  if (!lignes.length) return null
  marquerDegradation(lignes)
  lignes.sort((a, b) => ORDRE.indexOf(a.verdict) - ORDRE.indexOf(b.verdict) || (b.rapport?.valeur ?? 0) - (a.rapport?.valeur ?? 0))
  return { ouvrages, lignes, nonQuantifies, facteur }
}
