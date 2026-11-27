/**
 * Kinds of points of a site investigation, recognised from the type written
 * in the file (EQuIS location types, field forms, French usage) or, failing
 * that, from the usual prefixes of the names (Pz, Pza, VP, S, T, AA…).
 */

import type { Famille } from './types'

export interface DefFamille {
  id: Famille
  libelle: string
  /** Fill colour on the map; white outline. */
  couleur: string
  /** Shape on the map, so that kinds stay apart without colour. */
  forme: 'rond' | 'carre' | 'losange' | 'triangle'
  /** EQuIS loc_type written when exporting an EDD. */
  equis: string
}

export const FAMILLES: DefFamille[] = [
  { id: 'piezometre', libelle: 'Piézomètres', couleur: '#1f6fb2', forme: 'rond', equis: 'Monitoring well' },
  { id: 'sondage', libelle: 'Sondages de sol', couleur: '#8a5a2b', forme: 'carre', equis: 'Soil boring' },
  { id: 'gaz-sol', libelle: 'Piézairs (gaz du sol)', couleur: '#2e8b57', forme: 'triangle', equis: 'Soil Gas Monitoring' },
  { id: 'sous-dalle', libelle: 'Gaz sous dalle (vapor pins)', couleur: '#d97706', forme: 'losange', equis: 'Soil Vapor Point' },
  { id: 'air', libelle: 'Air intérieur ou ambiant', couleur: '#7c3aed', forme: 'rond', equis: 'Air Monitor' },
  { id: 'traitement', libelle: 'Ouvrages de traitement (extraction, injection)', couleur: '#be123c', forme: 'carre', equis: 'Extraction Well' },
  { id: 'eau-surface', libelle: 'Eaux superficielles, sédiments', couleur: '#0891b2', forme: 'triangle', equis: 'Surface Water' },
  { id: 'autre', libelle: 'Autres points', couleur: '#52525b', forme: 'rond', equis: 'Survey Point' },
]
export const FAMILLE = Object.fromEntries(FAMILLES.map((f) => [f.id, f])) as Record<Famille, DefFamille>

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Order matters: "soil vapor extraction well" is a treatment well, not a soil-gas probe. */
const PAR_TYPE: [RegExp, Famille][] = [
  [/extract|recovery|injection|sparge|pompage|pumping|traitement|\bsve\b|\bmpe\b|recharge|remediation|depressur|recirculation|\bexwell\b|rabattement/, 'traitement'],
  [/vapor ?pin|vapour ?pin|soil vapou?r point|sub-?slab|sous[ -]?dalle|\bvp\b/, 'sous-dalle'],
  [/soil ?gas|soil vapou?r|gaz (du|de) sol|piezair|piez-?air|vapou?r (probe|monitor|point|well)|\bpza?\b.*air|active soil|passive soil/, 'gaz-sol'],
  [/\bair\b|indoor|outdoor|ambient|ambiant|interieur|crawl ?space|canister|canis|radiello|tube passif/, 'air'],
  [/surface water|eaux? (de )?surface|superficiel|sediment|riviere|cours d.eau|outfall|rejet|stream|wetland/, 'eau-surface'],
  [/piezo|monitor(ing)? well|observation|\bwell\b|\bmw\b|puits|forage d.eau|ouvrage (de )?(suivi|surveillance)|qualitometre/, 'piezometre'],
  [/boring|bore|sondage|carott|tranchee|trench|test pit|trial pit|fouille|excavation|soil|sol\b|tariere|\bpelle\b/, 'sondage'],
]

/** Usual prefixes of point names, when the file gives no type. */
const PAR_NOM: [RegExp, Famille][] = [
  [/^(vp|ssv|gsd)[-_ ]?\d/, 'sous-dalle'],
  [/^(pza|pa|pg|pgs|gs|sg|piezair|sgp|sv)[-_ ]?\d/, 'gaz-sol'],
  [/^(aa|ai|ae|air|iaq|ap|oa)[-_ ]?\d/, 'air'],
  [/^(d?pz|mw|pzc|piezo|pc)[-_ ]?\w*\d/, 'piezometre'],
  [/^(sve|pe|pi|pr|ext)[-_ ]?\d/, 'traitement'],
  [/^(s|sc|sd|st|sp|t|tr|f|fp|tm|b|bh|tp|ech)[-_ ]?\d/, 'sondage'],
  [/^(esu|sed|riv|rej)[-_ ]?\d/, 'eau-surface'],
]

export function familleDe(type: string | null | undefined, nom = ''): Famille {
  const t = sansAccents(type ?? '').trim()
  if (t) {
    for (const [re, f] of PAR_TYPE) if (re.test(t)) return f
  }
  const n = sansAccents(nom).trim()
  for (const [re, f] of PAR_NOM) if (re.test(n)) return f
  return 'autre'
}
