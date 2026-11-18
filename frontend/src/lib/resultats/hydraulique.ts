/**
 * Hydraulic heads of the wells, from the sampling sheets: elevation of the
 * measuring point (m NGF) minus the initial static level, or the water
 * level elevation written on the sheet. Water flows from the highest head
 * to the lowest: the wells ranked by head give a first upgradient /
 * downgradient reading, to be checked against the piezometric map (one
 * campaign's heads do not give the flow direction between wells far apart
 * or across the flow).
 *
 * Pure.
 */

import type { Position } from './expert/amontAval.ts'

export interface OuvrageHydro {
  nom: string
  /** Lab samples of this well. */
  echantillons: string[]
  /** Measuring point elevation (m NGF). */
  repere: number | null
  /** Initial static level, depth below the measuring point (m). */
  niveau: number | null
  /** Hydraulic head (m NGF). */
  charge: number
}

/** Highest third of the heads upgradient, lowest third downgradient, the rest in between (« au droit du site »). */
export function proposerPositions(ouvrages: OuvrageHydro[]): Record<string, Position> {
  if (ouvrages.length < 2) return {}
  const charges = ouvrages.map((o) => o.charge)
  const max = Math.max(...charges)
  const min = Math.min(...charges)
  const tiers = (max - min) / 3
  const out: Record<string, Position> = {}
  for (const o of ouvrages) {
    const p: Position = tiers === 0 ? 'droit' : o.charge >= max - tiers ? 'amont' : o.charge <= min + tiers ? 'aval' : 'droit'
    for (const e of o.echantillons) out[e] = p
  }
  return out
}

/** Head difference between the highest and the lowest well, and the wells. */
export function ecartCharges(ouvrages: OuvrageHydro[]): { haut: OuvrageHydro; bas: OuvrageHydro; ecart: number } | null {
  if (ouvrages.length < 2) return null
  const tries = [...ouvrages].sort((a, b) => b.charge - a.charge)
  return { haut: tries[0], bas: tries[tries.length - 1], ecart: tries[0].charge - tries[tries.length - 1].charge }
}
