/**
 * Per-compound statistics over the regular samples (blanks and duplicates
 * left out, so that a duplicate does not weigh twice and a blank does not
 * pull the distribution down).
 *
 * Distribution figures (min, max, mean, median, standard deviation, 90th
 * percentile) are computed on quantified results only; the "LQ/2" mean
 * substitutes half the quantification limit for results below it, the usual
 * convention when a mean over all samples is wanted.
 */

import { convertir, volumeLitres, type Prelevement, type UniteSortie } from './calc.ts'
import type { Lecture, Parametre } from './parse.ts'

export interface Valeur {
  echantillon: string
  valeur: number
  inferieur: boolean
}

export interface StatsCompose {
  analyses: number
  quantifies: number
  frequence: number | null
  lqMin: number | null
  lqMax: number | null
  min: number | null
  max: number | null
  echantillonMax: string | null
  moyenne: number | null
  mediane: number | null
  ecartType: number | null
  p90: number | null
  moyenneDemiLQ: number | null
  guide: number | null
  depassements: number
  frequenceDepassement: number | null
  ratioMaxGuide: number | null
  echantillonsDepassement: string[]
  /** Results below an LQ that is itself above the comparison value. */
  lqSuperieures: number
}

function quantile(tries: number[], q: number): number {
  // Linear interpolation between order statistics (Excel PERCENTILE.INC).
  const pos = (tries.length - 1) * q
  const bas = Math.floor(pos)
  const haut = Math.ceil(pos)
  return tries[bas] + (tries[haut] - tries[bas]) * (pos - bas)
}

export function statistiques(valeurs: Valeur[], guide: number | null): StatsCompose {
  const q = valeurs.filter((v) => !v.inferieur)
  const lq = valeurs.filter((v) => v.inferieur).map((v) => v.valeur)
  const x = q.map((v) => v.valeur)
  const tries = [...x].sort((a, b) => a - b)
  const n = x.length
  const moyenne = n ? x.reduce((a, b) => a + b, 0) / n : null
  const ecartType = n > 1 && moyenne !== null ? Math.sqrt(x.reduce((s, v) => s + (v - moyenne) ** 2, 0) / (n - 1)) : null
  const max = n ? tries[n - 1] : null
  const depassants = guide === null ? [] : q.filter((v) => v.valeur > guide)
  const tous = valeurs.map((v) => (v.inferieur ? v.valeur / 2 : v.valeur))
  return {
    analyses: valeurs.length,
    quantifies: n,
    frequence: valeurs.length ? (n / valeurs.length) * 100 : null,
    lqMin: lq.length ? Math.min(...lq) : null,
    lqMax: lq.length ? Math.max(...lq) : null,
    min: n ? tries[0] : null,
    max,
    echantillonMax: n ? q.find((v) => v.valeur === max)!.echantillon : null,
    moyenne,
    mediane: n ? quantile(tries, 0.5) : null,
    ecartType,
    p90: n ? quantile(tries, 0.9) : null,
    moyenneDemiLQ: tous.length ? tous.reduce((a, b) => a + b, 0) / tous.length : null,
    guide,
    depassements: depassants.length,
    frequenceDepassement: guide !== null && valeurs.length ? (depassants.length / valeurs.length) * 100 : null,
    ratioMaxGuide: guide !== null && guide > 0 && max !== null ? max / guide : null,
    echantillonsDepassement: depassants.map((v) => v.echantillon),
    lqSuperieures: guide === null ? 0 : valeurs.filter((v) => v.inferieur && v.valeur > guide).length,
  }
}

/** The values a compound's statistics are computed on: raw results, or —
 *  for sorbent tubes — the concentrations of the measuring layer. */
export function valeursCompose(
  lecture: Lecture,
  pa: Parametre,
  echantillons: string[],
  conversion: { prelevements: Record<string, Prelevement>; unite: UniteSortie } | null,
): Valeur[] {
  const out: Valeur[] = []
  for (const nom of echantillons) {
    const m = lecture.valeurs.CM[nom]?.[pa.cle]
    if (!m || m.valeur === null) continue
    if (!conversion) {
      out.push({ echantillon: nom, valeur: m.valeur, inferieur: m.inferieur })
      continue
    }
    const c = convertir(m, pa, volumeLitres(conversion.prelevements[nom] ?? { debitDebut: null, debitFin: null, duree: null }), conversion.unite)
    if (c) out.push({ echantillon: nom, valeur: c.valeur, inferieur: c.inferieur })
  }
  return out
}
