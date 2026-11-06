/**
 * Usual short names of the organic compounds (PCE, TCE, cis-DCE, CV, BaP…),
 * to save room on charts: the chlorinated chains' codes and the PAH codes of
 * the expert diagnostics, and a few common others; else the short form the
 * lab itself gives, in brackets (« Acide perfluorooctane sulfonique
 * (PFOS) » → PFOS, the usual way PFAS are reported). A name with no known
 * short form is kept as it is.
 */

import { CHAINES, compact, HAP } from './expert/diagnostics.ts'

const AUTRES: [string[], string][] = [
  [['ethylbenzene'], 'EB'],
  [['mpxylene', 'metaetparaxylene', 'paraetmetaxylene', 'xylenemetapara', 'mxylene', 'pxylene'], 'm+p-X'],
  [['orthoxylene', 'oxylene'], 'o-X'],
  [['xylenes', 'xylenestotaux', 'sommedesxylenes'], 'X'],
  [['dichloromethane', 'chlorurdemethylene', 'chloruredemethylene'], 'DCM'],
  [['trichloromethane', 'chloroforme'], 'TCM'],
  [['tetrachloromethane', 'tetrachlorurdecarbone', 'tetrachloruredecarbone'], 'CTC'],
  [['methyltertbutylether', 'methyltertiobutylether', 'mtbe'], 'MTBE'],
  [['ethyltertbutylether', 'ethyltertiobutylether', 'etbe'], 'ETBE'],
  [['hexachlorobutadiene'], 'HCBD'],
  [['styrene'], 'Styrène'],
]

const PAR_NOM = new Map<string, string>()
for (const c of CHAINES) for (const e of c.especes) for (const v of e.variantes) if (!PAR_NOM.has(v)) PAR_NOM.set(v, e.code)
for (const [code, h] of Object.entries(HAP)) for (const v of h.variantes) PAR_NOM.set(v, code)
for (const [vs, code] of AUTRES) for (const v of vs) PAR_NOM.set(v, code)

/** Petroleum fractions: « Fraction aliphatique C6-C8 » → « Aliph. C6-C8 ». */
function fraction(nom: string): string | null {
  const m = nom.match(/\b(>?\s*C\s*\d+\s*[-–à]+\s*C\s*\d+)\b/i)
  if (!m) return null
  const plage = m[1].replace(/\s+/g, '').replace(/[–à]+/, '-')
  if (/aliphati/i.test(nom)) return `Aliph. ${plage}`
  if (/aromati/i.test(nom)) return `Arom. ${plage}`
  return /fraction|hydrocarbure/i.test(nom) ? plage : null
}

/** A short form, not a locant or an isomer: « PFOS », « 6:2 FTOH »,
 * « HFPO-DA », « C6O4 » — not « (a) », « (1,2,3-cd) » or « (somme) ». */
const estSigle = (t: string) => t.length >= 2 && t.length <= 14 && (t.match(/[A-Z]/g)?.length ?? 0) >= 2 && !/[a-zà-ÿ]{4,}/.test(t)

/** The lab's short form: the last bracket of the name, or the name itself
 *  before « , somme des isomères… ». Of several (« H4PFDS, 8:2 FTS »,
 *  « HFPO-DA / Gen X »), the fluorotelomer notation, else the first. */
function sigleDuLabo(nom: string): string | null {
  const m = nom.match(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/)
  if (m) {
    const candidats = m[1].split(/\s*[/;]\s*|,\s+/).map((x) => x.trim()).filter(estSigle)
    if (candidats.length) return candidats.find((x) => /\d+:\d+/.test(x)) ?? candidats[0]
  }
  const avant = nom.replace(/\s*,\s*(somme|total|isom[èe]res?)\b.*$/i, '').trim()
  return avant !== nom.trim() && estSigle(avant) && !/\s/.test(avant) ? avant : null
}

const sansParentheses = (nom: string) => nom.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s*,\s*(somme|total|isom[èe]res?)\b.*$/i, '')

export function acronyme(nom: string): string {
  return PAR_NOM.get(compact(nom)) ?? PAR_NOM.get(compact(sansParentheses(nom))) ?? sigleDuLabo(nom) ?? fraction(nom) ?? nom
}
