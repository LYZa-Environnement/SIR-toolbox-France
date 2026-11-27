/**
 * Colours of the results in the model. Against a comparison value, the
 * classes of modele.ts (CLASSES_CONCENTRATION, read with their labels);
 * without one, a single-hue scale from light to dark on the range of the
 * data — on its logarithm for concentrations, on the values themselves for
 * field readings (pH, redox).
 */

import { classeConcentration, CLASSES_CONCENTRATION, positionLog } from './modele.ts'

/** Light to dark, one hue (orange-brown), stepped for a light background. */
export const RAMPE = ['#fcd9b8', '#f6a46c', '#e5703a', '#c0461c', '#862a0d']

export const COULEUR_NQ = CLASSES_CONCENTRATION.nq.couleur

function melange(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16))
  const cb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16))
  return `#${ca.map((x, i) => Math.round(x + (cb[i] - x) * t).toString(16).padStart(2, '0')).join('')}`
}

/** Colour at position t (0–1) of the ramp. */
export function rampe(t: number): string {
  const u = Math.min(1, Math.max(0, t)) * (RAMPE.length - 1)
  const i = Math.min(RAMPE.length - 2, Math.floor(u))
  return melange(RAMPE[i], RAMPE[i + 1], u - i)
}

export interface Echelle {
  reference: number | null
  /** Range of the quantified values, for the ramp. */
  min: number
  max: number
  lineaire: boolean
}

/** Range of quantified values (positive ones only on a log scale). */
export function etendue(valeurs: { valeur: number | null; inferieur: boolean }[], lineaire: boolean): { min: number; max: number } {
  const v = valeurs.filter((x) => !x.inferieur && x.valeur !== null && (lineaire || x.valeur > 0)).map((x) => x.valeur!)
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : { min: 0, max: 1 }
}

export function couleurValeur(valeur: number | null, inferieur: boolean, e: Echelle): string {
  if (inferieur || valeur === null) return COULEUR_NQ
  const c = classeConcentration(valeur, false, e.reference)
  if (c) return CLASSES_CONCENTRATION[c].couleur
  return rampe(e.lineaire ? (e.max > e.min ? (valeur - e.min) / (e.max - e.min) : 0.5) : positionLog(valeur, e.min, e.max))
}

/** Colour of a node of an interpolated field (log10 of the value unless linear); null beyond the wells' reach. */
export function couleurChamp(v: number, e: Echelle): string | null {
  if (!Number.isFinite(v)) return null
  return couleurValeur(e.lineaire ? v : 10 ** v, false, e)
}
