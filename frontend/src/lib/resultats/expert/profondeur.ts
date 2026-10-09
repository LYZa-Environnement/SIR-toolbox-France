/**
 * Depth of soil samples, read from their names: sample names often carry the
 * borehole and the depth interval — "MW6 (4-4,5)", "S3 (0,5-1 m)", "T2 (2 m)".
 * Used to sort the samples by borehole then depth, and to print the sampled
 * interval under each sample in the result tables.
 */

import type { Lecture } from '../parse.ts'

export interface Profondeur {
  sondage: string
  haut: number
  bas: number
  milieu: number
}

const NOMBRE = String.raw`(\d+(?:[.,]\d+)?)`
const INTERVALLE = new RegExp(String.raw`^(.*?)[\s_-]*\(\s*${NOMBRE}\s*(?:m\s*)?(?:[-–/à]|a)\s*${NOMBRE}\s*m?\s*\)\s*$`, 'i')
const PONCTUELLE = new RegExp(String.raw`^(.*?)[\s_-]*\(\s*${NOMBRE}\s*m?\s*\)\s*$`, 'i')

const nb = (s: string) => Number(s.replace(',', '.'))

/** "MW6 (4-4,5)" → { sondage: "MW6", haut: 4, bas: 4.5, milieu: 4.25 } */
export function lireProfondeur(nom: string): Profondeur | null {
  const i = nom.match(INTERVALLE)
  if (i && i[1].trim()) {
    const haut = nb(i[2])
    const bas = nb(i[3])
    if (bas >= haut && bas < 200) return { sondage: i[1].trim(), haut, bas, milieu: (haut + bas) / 2 }
  }
  const p = nom.match(PONCTUELLE)
  if (p && p[1].trim()) {
    const z = nb(p[2])
    if (z < 200) return { sondage: p[1].trim(), haut: z, bas: z, milieu: z }
  }
  return null
}

const fr = (x: number) => String(x).replace('.', ',')

/** "4 – 4,5" (interval) or "2" (single depth), in metres. */
export const libelleProfondeur = (p: Profondeur) => (p.haut === p.bas ? fr(p.haut) : `${fr(p.haut)} – ${fr(p.bas)}`)

const naturel = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/** Samples by borehole (natural order: S2 before S10), then from the top
 *  down; samples without a readable depth (duplicates, blanks…) come last,
 *  in the lab's order. */
export function ordonnerParProfondeur(lecture: Lecture): Lecture {
  const cles = new Map(lecture.points.map((p) => [p.nom, lireProfondeur(p.nom)]))
  if (![...cles.values()].some(Boolean)) return lecture
  const points = [...lecture.points].sort((a, b) => {
    const pa = cles.get(a.nom)
    const pb = cles.get(b.nom)
    if (!pa || !pb) return Number(!pa) - Number(!pb)
    return naturel.compare(pa.sondage, pb.sondage) || pa.haut - pb.haut || pa.bas - pb.bas
  })
  return { ...lecture, points }
}
