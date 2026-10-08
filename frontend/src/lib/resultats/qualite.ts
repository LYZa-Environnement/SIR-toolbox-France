/**
 * Quality control on a lab file: field and trip blanks, duplicates, and —
 * for sorbent tubes — breakthrough to the control layer.
 *
 * References:
 * - Guide pratique pour la caractérisation des gaz du sol et de l'air
 *   intérieur (BRGM RP-65870-FR / INERIS-DRC-16-156183-01401A, 2016),
 *   § 7.5 b, p. 115, after NF X 43-267: a sample is valid when the mass on
 *   the control layer is below 5 % of the mass on the measuring layer, for
 *   each compound and for the sum of detected compounds. Above that the
 *   sample is not conclusive (for that compound, or for all of them when
 *   the sum fails) and a result "≥ X µg/m³" may be kept, X computed from
 *   the masses of both layers.
 * - Same guide, § 6.4.4 d, p. 81-82: at least one field blank per sorbent
 *   type and sampling day, one trip blank per sorbent type and cool box.
 * - Duplicates: no French regulatory threshold; the relative percent
 *   difference is checked against the usual practice values (≤ 30 %
 *   waters, ≤ 50 % soils), editable by the user.
 */

import type { Lecture, Mesure, Parametre, Point } from './parse.ts'

export type TypeEchantillon = 'echantillon' | 'blanc-terrain' | 'blanc-transport' | 'doublon'

export interface Qualification {
  type: TypeEchantillon
  /** For a duplicate, the sample it duplicates. */
  de?: string
  /** True when the type was read from the name, not set by the user. */
  auto: boolean
}

export const LIBELLES_TYPE: Record<TypeEchantillon, string> = {
  echantillon: 'Échantillon',
  'blanc-terrain': 'Blanc de terrain',
  'blanc-transport': 'Blanc de transport',
  doublon: 'Doublon',
}

// "TP" followed by a number is far more often a trial pit (TP1) than a trip
// blank, hence the stricter pattern for it.
const BLANC_TRANSPORT = /(^|[^a-z0-9])(tb([^a-z]|$)|tp([^a-z0-9]|$))|blanc[\s_-]*(de[\s_-]*)?transport|trip[\s_-]*blank/i
const BLANC_TERRAIN = /(^|[^a-z0-9])fb([^a-z]|$)|blanc[\s_-]*(de[\s_-]*)?(terrain|site)|field[\s_-]*blank|blanc(?![a-z])/i
const DOUBLON = /doublon|duplicat|(^|[^a-z])dupl?([^a-z]|$)/i
const MARQUE_DOUBLON = /[\s_\-(]*(doublon|duplicate?|dupl?)[\s_\-)]*\d*[\s_\-)]*/i

/** Reads the sample type from its name ("PZ4-DUP", "FB", "Blanc de transport"…). */
export function qualifierAuto(points: Point[]): Record<string, Qualification> {
  const q: Record<string, Qualification> = {}
  for (const p of points) {
    if (BLANC_TRANSPORT.test(p.nom)) q[p.nom] = { type: 'blanc-transport', auto: true }
    else if (DOUBLON.test(p.nom)) {
      const base = p.nom.replace(MARQUE_DOUBLON, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
      const de = points.find((x) => x.nom !== p.nom && x.nom.trim().toLowerCase() === base)?.nom
      q[p.nom] = { type: 'doublon', de, auto: true }
    } else if (BLANC_TERRAIN.test(p.nom)) q[p.nom] = { type: 'blanc-terrain', auto: true }
    else q[p.nom] = { type: 'echantillon', auto: true }
  }
  return q
}

export const estControle = (q: Qualification | undefined) => !!q && q.type !== 'echantillon'

const quantifie = (m: Mesure | undefined): m is Mesure & { valeur: number } => !!m && !m.inferieur && m.valeur !== null

// ---- Blanks ------------------------------------------------------------------

export interface DetectionBlanc {
  blanc: string
  type: TypeEchantillon
  /** Compounds quantified in the blank, raw lab values. */
  composes: { parametre: Parametre; mesure: Mesure }[]
}

export function controleBlancs(lecture: Lecture, q: Record<string, Qualification>): DetectionBlanc[] {
  return lecture.points
    .filter((p) => q[p.nom]?.type === 'blanc-terrain' || q[p.nom]?.type === 'blanc-transport')
    .map((p) => ({
      blanc: p.nom,
      type: q[p.nom].type,
      composes: (['CM', 'CC'] as const).flatMap((c) =>
        lecture.parametres[c]
          .filter((pa) => !pa.somme)
          .map((pa) => ({ parametre: pa, mesure: lecture.valeurs[c][p.nom]?.[pa.cle] }))
          .filter((x): x is { parametre: Parametre; mesure: Mesure } => quantifie(x.mesure))
          .filter((x, i, tous) => tous.findIndex((y) => y.parametre.cle === x.parametre.cle) === i),
      ),
    }))
}

// ---- Duplicates ----------------------------------------------------------------

export interface EcartDoublon {
  parametre: Parametre
  original: Mesure | undefined
  doublon: Mesure | undefined
  /** |a − b| / ((a + b) / 2) × 100, when both are quantified. */
  ecart: number | null
  conforme: boolean | null
}

export interface ComparaisonDoublon {
  doublon: string
  original: string
  ecarts: EcartDoublon[]
}

export function ecartRelatif(a: number, b: number): number {
  return a + b === 0 ? 0 : (Math.abs(a - b) / ((a + b) / 2)) * 100
}

export function controleDoublons(lecture: Lecture, q: Record<string, Qualification>, seuil: number): ComparaisonDoublon[] {
  return lecture.points
    .filter((p) => q[p.nom]?.type === 'doublon' && q[p.nom].de)
    .map((p) => {
      const de = q[p.nom].de!
      const ecarts = lecture.parametres.CM.filter((pa) => !pa.somme).map((pa) => {
        const a = lecture.valeurs.CM[de]?.[pa.cle]
        const b = lecture.valeurs.CM[p.nom]?.[pa.cle]
        const ecart = quantifie(a) && quantifie(b) ? ecartRelatif(a.valeur, b.valeur) : null
        return { parametre: pa, original: a, doublon: b, ecart, conforme: ecart === null ? null : ecart <= seuil }
      })
      return { doublon: p.nom, original: de, ecarts }
    })
}

// ---- Breakthrough (sorbent tubes) ----------------------------------------------

export const SEUIL_PERCEE = 5

export interface PerceeCompose {
  parametre: Parametre
  cm: Mesure | undefined
  cc: Mesure | undefined
  /** Mass on the control layer as a % of the measuring layer. */
  ratio: number | null
  /** Control layer quantified above 5 % of the measuring layer (or with
   *  nothing quantified on the measuring layer). */
  percee: boolean
  /** CM + CC mass in µg, the "≥ X" basis when `percee`. */
  masseTotale: number | null
}

export interface PerceePoint {
  point: string
  composes: PerceeCompose[]
  sommeCM: number
  sommeCC: number
  /** Whole sample not conclusive: sum CC > 5 % of sum CM. */
  perceeGlobale: boolean
}

export function controlePercee(lecture: Lecture): PerceePoint[] {
  if (!lecture.coucheControle) return []
  return lecture.points.map((p) => {
    const composes: PerceeCompose[] = []
    let sommeCM = 0
    let sommeCC = 0
    for (const pa of lecture.parametres.CM) {
      if (pa.somme) continue
      const cm = lecture.valeurs.CM[p.nom]?.[pa.cle]
      const paCC = lecture.parametres.CC.find((x) => x.cle === pa.cle)
      const cc = paCC ? lecture.valeurs.CC[p.nom]?.[pa.cle] : undefined
      const mCM = quantifie(cm) ? cm.valeur * pa.versMicrogrammes : 0
      const mCC = quantifie(cc) ? cc.valeur * (paCC?.versMicrogrammes ?? 1) : 0
      sommeCM += mCM
      sommeCC += mCC
      const ratio = mCC > 0 && mCM > 0 ? (mCC / mCM) * 100 : null
      const percee = mCC > 0 && (mCM === 0 || (ratio ?? 0) > SEUIL_PERCEE)
      composes.push({ parametre: pa, cm, cc, ratio, percee, masseTotale: mCM + mCC > 0 ? mCM + mCC : null })
    }
    return { point: p.nom, composes, sommeCM, sommeCC, perceeGlobale: sommeCC > 0 && (sommeCM === 0 || (sommeCC / sommeCM) * 100 > SEUIL_PERCEE) }
  })
}
