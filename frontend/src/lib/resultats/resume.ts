/**
 * The key figures of a set of results, for the summary tiles of the page:
 * compounds quantified, results above the reference value and where the
 * most are.
 */

import { convertir, volumeLitres, type Prelevement, type UniteSortie } from './calc.ts'
import type { Lecture } from './parse.ts'

export interface Resume {
  composes: number
  quantifies: number
  depassements: number
  composesDepasses: string[]
  /** Highest result / reference, with where it is. */
  max: { ratio: number; compose: string; echantillon: string } | null
}

export function resumer(
  lecture: Lecture,
  echantillons: string[],
  guides: Record<string, { valeur: number; source: string } | null>,
  conversion: { prelevements: Record<string, Prelevement>; unite: UniteSortie } | null,
): Resume {
  const vide: Prelevement = { duree: null, debitDebut: null, debitFin: null }
  const params = lecture.parametres.CM.filter((p) => !p.somme)
  let quantifies = 0
  let depassements = 0
  const composesDepasses: string[] = []
  let max: Resume['max'] = null
  for (const p of params) {
    const g = guides[p.cle]
    let quantifie = false
    let depasse = false
    for (const e of echantillons) {
      const m = lecture.valeurs.CM[e]?.[p.cle]
      const v = conversion ? convertir(m, p, volumeLitres(conversion.prelevements[e] ?? vide), conversion.unite) : m && m.valeur !== null ? m : null
      if (!v || v.inferieur || v.valeur === null) continue
      quantifie = true
      if (g && g.valeur > 0) {
        const r = v.valeur / g.valeur
        if (r > 1) {
          depassements++
          depasse = true
        }
        if (!max || r > max.ratio) max = { ratio: r, compose: p.nom, echantillon: e }
      }
    }
    if (quantifie) quantifies++
    if (depasse) composesDepasses.push(p.nom)
  }
  return { composes: params.length, quantifies, depassements, composesDepasses, max }
}
