/**
 * Usual short names of the organic compounds (PCE, TCE, cis-DCE, CV, BaP…),
 * to save room on charts: the chlorinated chains' codes and the PAH codes of
 * the expert diagnostics, and a few common others. A name with no known
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

export function acronyme(nom: string): string {
  return PAR_NOM.get(compact(nom)) ?? fraction(nom) ?? nom
}
