/**
 * The model's heavy calculations, run in a Web Worker (worker.ts) so that
 * the page never freezes while the geology, the kriging or the volumes are
 * computed: the same functions, called by name with their arguments
 * (structured-cloned there and back).
 */

import { analyser, REGLAGES_DEFAUT, type Classe } from '../suivi/analyse.ts'
import type { Base, Corrections } from '../suivi/modele.ts'
import { delimitationsParCampagne, delimiterPanache } from './delimitation.ts'
import { volumesFilieres } from './filieres.ts'
import { construireModele, enveloppeSols, evolutionPanache } from './modele.ts'

export interface Tendance {
  ouvrage: string
  compose: string
  classe: Classe
  /** Theil–Sen slope, in the compound's unit per year. */
  pente: number | null
  n: number
}

/**
 * The trend of every well × compound series over the whole monitoring, as
 * Suivi temporel reads it (Mann-Kendall, Sen slope, MAROS classes, default
 * settings; the comparison values entered there are kept).
 */
export function tendances(base: Base, corrections: Corrections): Tendance[] {
  if (base.campagnes.length < 2) return []
  const a = analyser(base, corrections, REGLAGES_DEFAUT)
  return a.series.map((s) => ({ ouvrage: s.ouvrage.cle, compose: s.compose.cle, classe: s.classe, pente: s.sen?.pente ?? null, n: s.n }))
}

export const CALCULS = { construireModele, enveloppeSols, evolutionPanache, delimiterPanache, delimitationsParCampagne, volumesFilieres, tendances }

export type NomCalcul = keyof typeof CALCULS
