/**
 * Sampling dates of a lab report, read where labs write them: a row
 * labelled "Date de prélèvement", "Date d'échantillonnage", "Sampling
 * date"… with one date under each sample. Failing that, a date in the file
 * name ("2023-03-14", "20230314", "14-03-2023", "mars 2023"). The date of a
 * reception, an analysis or the report is never taken for a sampling date.
 *
 * Pure: takes grids of raw cell values (dates as Excel serial numbers, as
 * SheetJS returns them with `raw: true`, or as Date objects or text).
 */

import { jourIso } from '../format.ts'
import type { Cell, Lecture } from '../resultats/parse.ts'

const ISO = (a: number, m: number, j: number) =>
  a >= 1970 && a <= 2100 && m >= 1 && m <= 12 && j >= 1 && j <= 31 ? `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null

const siecle = (a: number) => (a < 100 ? (a < 70 ? 2000 + a : 1900 + a) : a)

/** A cell read as a date (ISO yyyy-mm-dd), or null. */
export function lireDate(c: Cell): string | null {
  if (c === null || c === undefined || c === '') return null
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : jourIso(c)
  if (typeof c === 'number') {
    // Excel serial date (1900 system): 25569 is 1970-01-01. Kept between 1970 and 2100.
    if (c < 25569 || c > 73051) return null
    return new Date(Math.round((c - 25569) * 86400) * 1000).toISOString().slice(0, 10)
  }
  const t = String(c).trim()
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return ISO(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/)
  if (m) return ISO(siecle(+m[3]), +m[2], +m[1])
  return null
}

const LIBELLE_DATE = /date[^a-z0-9]{0,3}(de |d.|du |of )?\s*(pr[ée]l[èe]?v|pr[ée]l\.|[ée]chantillonn|sampl|collect|pr[ée]l[èe]vement)|sampl\w*\s*date|pr[ée]lev[ée]e?s?\s+le|date\s+pr[ée]l/i
const PAS_UNE_DATE_DE_PRELEVEMENT = /r[ée]ception|receipt|received|analys|rapport|report|[ée]dition|[ée]mission|d[ée]but d.analyse|extraction/i

/** Row labels: the first cells with text, left of the data. */
function libelleLigne(r: Cell[]): string {
  return r
    .slice(0, 6)
    .filter((c) => typeof c === 'string')
    .join(' ')
}

/**
 * Sampling date of each sample of a lab reading, from the date rows of the
 * sheets: the sample's column is found on the row holding the sample names.
 * Returns the dates by sample name, and every sampling date met (for a
 * report whose columns cannot be matched).
 */
export function datesPrelevement(feuilles: { nom: string; grille: Cell[][] }[], lecture: Lecture): { parEchantillon: Record<string, string>; toutes: string[] } {
  const parEchantillon: Record<string, string> = {}
  const toutes: string[] = []
  const libelles = lecture.points.map((p) => ({ nom: p.nom, libelle: (p.libelles.CM ?? p.libelles.CC ?? p.nom).trim() }))
  for (const f of feuilles) {
    const lignesDates = f.grille
      .map((r, i) => ({ r, i, l: libelleLigne(r) }))
      .filter((x) => LIBELLE_DATE.test(x.l) && !PAS_UNE_DATE_DE_PRELEVEMENT.test(x.l))
    if (!lignesDates.length) continue
    // The row naming the most samples is the one the dates line up with.
    let ligneNoms = -1
    let meilleur = 0
    f.grille.forEach((r, i) => {
      const textes = new Set(r.map((c) => (c === null || c === undefined ? '' : String(c).trim())))
      const n = libelles.filter((x) => textes.has(x.libelle)).length
      if (n > meilleur) {
        meilleur = n
        ligneNoms = i
      }
    })
    for (const { r } of lignesDates) {
      for (const c of r) {
        const d = lireDate(c)
        if (d) toutes.push(d)
      }
      if (ligneNoms < 0) continue
      const noms = f.grille[ligneNoms]
      for (const x of libelles) {
        if (parEchantillon[x.nom]) continue
        const j = noms.findIndex((c) => c !== null && c !== undefined && String(c).trim() === x.libelle)
        const d = j >= 0 ? lireDate(r[j]) : null
        if (d) parEchantillon[x.nom] = d
      }
    }
  }
  return { parEchantillon, toutes }
}

const MOIS: [RegExp, number][] = [
  [/janv|january|\bjan\b/i, 1],
  [/f[ée]vr|february|\bfeb\b/i, 2],
  [/mars|march|\bmar\b/i, 3],
  [/avril|april|\bapr\b|\bavr\b/i, 4],
  [/\bmai\b|\bmay\b/i, 5],
  [/juin|june|\bjun\b/i, 6],
  [/juil|july|\bjul\b/i, 7],
  [/ao[uû]t|august|\baug\b/i, 8],
  [/sept|\bsep\b/i, 9],
  [/oct/i, 10],
  [/nov/i, 11],
  [/d[ée]c|\bdec\b/i, 12],
]

/** A date in a file name; a month and year alone give the 15th of the month. */
export function dateDepuisNom(nom: string): string | null {
  const n = nom.replace(/\.[a-z0-9]+$/i, '')
  let m = n.match(/(?<!\d)((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?!\d)/)
  if (m) return ISO(+m[1], +m[2], +m[3])
  m = n.match(/(?<!\d)(0?[1-9]|[12]\d|3[01])[-_.](0?[1-9]|1[0-2])[-_.]((?:19|20)\d{2})(?!\d)/)
  if (m) return ISO(+m[3], +m[2], +m[1])
  m = n.match(/(?<!\d)((?:19|20)\d{2})[-_.](0[1-9]|1[0-2])(?!\d)/)
  if (m) return ISO(+m[1], +m[2], 15)
  m = n.match(/(?<!\d)(0[1-9]|1[0-2])[-_.]((?:19|20)\d{2})(?!\d)/)
  if (m) return ISO(+m[2], +m[1], 15)
  const annee = n.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/)
  if (annee) {
    const mois = MOIS.find(([re]) => re.test(n))
    if (mois) return ISO(+annee[1], mois[1], 15)
  }
  return null
}

/**
 * Hydrological regime proposed from the month, for French aquifers in
 * general: high water from December to May (winter–spring recharge), low
 * water from June to November. Only a proposal — the regime of a campaign
 * is read on the piezometric records of the site.
 */
export function regimePropose(iso: string): 'HE' | 'BE' | null {
  const m = Number(iso.slice(5, 7))
  if (!m) return null
  return m === 12 || m <= 5 ? 'HE' : 'BE'
}

/** The date retained for a set of samples: the earliest (start of the campaign). */
export function dateCampagne(dates: string[]): string {
  return dates.length ? [...dates].sort()[0] : ''
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const [a, m, j] = iso.split('-')
  return `${j}/${m}/${a}`
}

/** "mars 2023" */
export function moisAnnee(iso: string): string {
  if (!iso) return '—'
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Days between two ISO dates. */
export function ecartJours(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000
}
