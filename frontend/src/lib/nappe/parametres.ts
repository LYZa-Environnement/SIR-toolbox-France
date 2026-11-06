/**
 * The parameters the screening reads, their unit, and how a lab row is
 * recognised and brought to that unit.
 *
 * Lab rows are recognised by name (accents, case, punctuation and a
 * trailing "(Fe)", "(COT)" ignored). Iron is taken, in order of preference,
 * as ferrous iron (field kit or lab), dissolved iron (filtered sample) —
 * the usual proxy for Fe²⁺ —, or total iron, which also counts particulate
 * Fe(III) and so overstates Fe²⁺: the source is kept to be shown.
 */

import { normaliser } from '../resultats/guides.ts'
import type { Mesure, Parametre } from '../resultats/parse.ts'

export type ParamId =
  // field
  | 'ph'
  | 'orp'
  | 'od'
  | 'ce'
  | 't'
  // electron acceptors and metabolic products
  | 'nitrate'
  | 'fe2'
  | 'mn'
  | 'sulfate'
  | 'sulfure'
  | 'methane'
  | 'co2'
  | 'alcalinite'
  | 'chlorure'
  | 'h2'
  // carbon sources
  | 'cot'
  | 'agv'
  | 'btex'
  | 'hc'
  // chlorinated solvents and end products
  | 'pce'
  | 'tce'
  | 'cisdce'
  | 'transdce'
  | 'dce11'
  | 'cv'
  | 'tca111'
  | 'tca112'
  | 'dca11'
  | 'dca12'
  | 'ca'
  | 'ct'
  | 'cf'
  | 'dcm'
  | 'ethene'
  | 'ethane'

export type Groupe = 'terrain' | 'accepteurs' | 'carbone' | 'cohv'

export interface DefParam {
  id: ParamId
  libelle: string
  unite: string
  groupe: Groupe
  /** Required analysis of the USEPA (1998) screening (asterisk of table 2.3). */
  requis?: boolean
  /** Molar mass, g/mol, for the chlorinated compounds and end products. */
  masseMolaire?: number
}

export const PARAMS: DefParam[] = [
  { id: 'ph', libelle: 'pH', unite: 'unité pH', groupe: 'terrain', requis: true },
  { id: 'orp', libelle: 'Potentiel redox (Ag/AgCl)', unite: 'mV', groupe: 'terrain', requis: true },
  { id: 'od', libelle: 'Oxygène dissous', unite: 'mg/l', groupe: 'terrain', requis: true },
  { id: 'ce', libelle: 'Conductivité (25 °C)', unite: 'µS/cm', groupe: 'terrain' },
  { id: 't', libelle: 'Température', unite: '°C', groupe: 'terrain', requis: true },
  { id: 'nitrate', libelle: 'Nitrates (NO₃⁻)', unite: 'mg/l', groupe: 'accepteurs', requis: true },
  { id: 'fe2', libelle: 'Fer ferreux (Fe²⁺)', unite: 'mg/l', groupe: 'accepteurs', requis: true },
  { id: 'mn', libelle: 'Manganèse dissous', unite: 'mg/l', groupe: 'accepteurs' },
  { id: 'sulfate', libelle: 'Sulfates (SO₄²⁻)', unite: 'mg/l', groupe: 'accepteurs', requis: true },
  { id: 'sulfure', libelle: 'Sulfures (H₂S, HS⁻, S²⁻)', unite: 'mg/l', groupe: 'accepteurs', requis: true },
  { id: 'methane', libelle: 'Méthane', unite: 'mg/l', groupe: 'accepteurs', requis: true },
  { id: 'co2', libelle: 'Dioxyde de carbone', unite: 'mg/l', groupe: 'accepteurs' },
  { id: 'alcalinite', libelle: 'Alcalinité (TAC)', unite: 'mg/l CaCO₃', groupe: 'accepteurs' },
  { id: 'chlorure', libelle: 'Chlorures', unite: 'mg/l', groupe: 'accepteurs', requis: true },
  { id: 'h2', libelle: 'Hydrogène dissous', unite: 'nmol/l', groupe: 'accepteurs' },
  { id: 'cot', libelle: 'Carbone organique total / dissous', unite: 'mg/l', groupe: 'carbone' },
  { id: 'agv', libelle: 'Acides gras volatils', unite: 'mg/l', groupe: 'carbone' },
  { id: 'btex', libelle: 'BTEX (somme)', unite: 'µg/l', groupe: 'carbone', requis: true },
  { id: 'hc', libelle: 'Hydrocarbures totaux (C5/C10-C40)', unite: 'µg/l', groupe: 'carbone' },
  { id: 'pce', libelle: 'Tétrachloroéthylène (PCE)', unite: 'µg/l', groupe: 'cohv', masseMolaire: 165.83 },
  { id: 'tce', libelle: 'Trichloroéthylène (TCE)', unite: 'µg/l', groupe: 'cohv', requis: true, masseMolaire: 131.39 },
  { id: 'cisdce', libelle: 'cis-1,2-dichloroéthylène', unite: 'µg/l', groupe: 'cohv', requis: true, masseMolaire: 96.94 },
  { id: 'transdce', libelle: 'trans-1,2-dichloroéthylène', unite: 'µg/l', groupe: 'cohv', masseMolaire: 96.94 },
  { id: 'dce11', libelle: '1,1-dichloroéthylène', unite: 'µg/l', groupe: 'cohv', masseMolaire: 96.94 },
  { id: 'cv', libelle: 'Chlorure de vinyle (CV)', unite: 'µg/l', groupe: 'cohv', requis: true, masseMolaire: 62.5 },
  { id: 'tca111', libelle: '1,1,1-trichloroéthane', unite: 'µg/l', groupe: 'cohv', requis: true, masseMolaire: 133.4 },
  { id: 'tca112', libelle: '1,1,2-trichloroéthane', unite: 'µg/l', groupe: 'cohv', masseMolaire: 133.4 },
  { id: 'dca11', libelle: '1,1-dichloroéthane', unite: 'µg/l', groupe: 'cohv', masseMolaire: 98.96 },
  { id: 'dca12', libelle: '1,2-dichloroéthane', unite: 'µg/l', groupe: 'cohv', masseMolaire: 98.96 },
  { id: 'ca', libelle: 'Chloroéthane', unite: 'µg/l', groupe: 'cohv', requis: true, masseMolaire: 64.51 },
  { id: 'ct', libelle: 'Tétrachlorure de carbone', unite: 'µg/l', groupe: 'cohv', masseMolaire: 153.82 },
  { id: 'cf', libelle: 'Chloroforme', unite: 'µg/l', groupe: 'cohv', masseMolaire: 119.38 },
  { id: 'dcm', libelle: 'Dichlorométhane', unite: 'µg/l', groupe: 'cohv', masseMolaire: 84.93 },
  { id: 'ethene', libelle: 'Éthène (éthylène)', unite: 'µg/l', groupe: 'cohv', masseMolaire: 28.05 },
  { id: 'ethane', libelle: 'Éthane', unite: 'µg/l', groupe: 'cohv', masseMolaire: 30.07 },
]

export const PAR_ID = new Map(PARAMS.map((p) => [p.id, p]))

export const LIBELLES_GROUPE: Record<Groupe, string> = {
  terrain: 'Paramètres de terrain',
  accepteurs: "Accepteurs d'électrons et produits du métabolisme",
  carbone: "Donneurs d'électrons (sources de carbone)",
  cohv: 'Solvants chlorés et produits finaux',
}

// ---- Recognising a lab row -------------------------------------------------------------

/** Name variants, compacted (see `cles`). */
const VARIANTES: [ParamId | 'fe-dissous' | 'fe-total' | 'benzene' | 'toluene' | 'ethylbenzene' | 'xylenes' | 'mpxylene' | 'oxylene', string[]][] = [
  ['ph', ['ph', 'phinsitu', 'phterrain']],
  ['od', ['oxygenedissous', 'o2dissous', 'oxygene']],
  ['ce', ['conductivite', 'conductivitea25c', 'conductiviteelectrique', 'conductivitea25c']],
  ['t', ['temperature', 'temperaturedeleau']],
  ['nitrate', ['nitrates', 'nitrate', 'no3', 'azotenitrique', 'nno3', 'nitratesno3', 'nitratesenno3']],
  ['fe2', ['ferii', 'ferferreux', 'fe2', 'ferdivalent', 'fer2', 'ferferreuxfe2']],
  ['fe-dissous', ['ferdissous', 'ferfiltre', 'fedissous']],
  ['fe-total', ['fer', 'fe', 'fertotal']],
  ['mn', ['manganese', 'manganesedissous', 'mn', 'manganesetotal']],
  ['sulfate', ['sulfates', 'sulfate', 'so4', 'sulphates']],
  ['sulfure', ['sulfures', 'sulfure', 'sulfurestotaux', 'sulfuresdissous', 'h2s', 'sulfuredhydrogene', 'hydrogenesulfure', 'sulfureslibres']],
  ['methane', ['methane', 'ch4', 'methanedissous']],
  ['co2', ['dioxydedecarbone', 'co2', 'co2libre', 'gazcarbonique', 'anhydridecarbonique', 'co2dissous']],
  ['alcalinite', ['alcalinite', 'tac', 'titrealcalimetriquecomplet', 'alcalinitetotale', 'hydrogenocarbonates', 'bicarbonates', 'hco3']],
  ['chlorure', ['chlorures', 'chlorure', 'cl', 'ionchlorure']],
  ['h2', ['hydrogene', 'h2', 'hydrogenedissous', 'dihydrogene']],
  ['cot', ['carboneorganiquetotal', 'cot', 'carboneorganiquedissous', 'cod', 'toc', 'doc', 'carboneorganiquetotalcot']],
  ['agv', ['acidesgrasvolatils', 'agv', 'acidesorganiquesvolatils']],
  ['btex', ['btex', 'sommedesbtex', 'btextotaux', 'sommebtex']],
  ['benzene', ['benzene']],
  ['toluene', ['toluene']],
  ['ethylbenzene', ['ethylbenzene']],
  ['xylenes', ['xylenes']],
  ['mpxylene', ['mpxylene', 'metaparaxylene', 'mxylenepxylene', 'mpxylenes', 'metaetparaxylene']],
  ['oxylene', ['oxylene', 'orthoxylene']],
  ['pce', ['tetrachloroethylene']],
  ['tce', ['trichloroethylene']],
  ['cisdce', ['cis12dichloroethylene', '12cisdichloroethylene', 'cisdichloroethylene']],
  ['transdce', ['trans12dichloroethylene', '12transdichloroethylene', 'transdichloroethylene']],
  ['dce11', ['11dichloroethylene']],
  ['cv', ['chloruredevinyle', 'chloroethylene', 'monochloroethylene']],
  ['tca111', ['111trichloroethane']],
  ['tca112', ['112trichloroethane']],
  ['dca11', ['11dichloroethane']],
  ['dca12', ['12dichloroethane']],
  ['ca', ['chloroethane', 'monochloroethane']],
  ['ct', ['tetrachloromethane']],
  ['cf', ['trichloromethane']],
  ['dcm', ['dichloromethane']],
  ['ethene', ['ethylene']],
  ['ethane', ['ethane']],
]

const INDEX = new Map<string, (typeof VARIANTES)[number][0]>()
for (const [id, vs] of VARIANTES) for (const v of vs) if (!INDEX.has(v)) INDEX.set(v, id)

/** A name, compacted, with and without its parentheses: "Fer (Fe)" → ["ferfe", "fer"]. */
function cles(nom: string): string[] {
  const sans = nom.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
  return [...new Set([nom, sans].map((n) => normaliser(n).replace(/ethene/g, 'ethylene').replace(/ /g, '')).filter(Boolean))]
}

export type Reconnu = (typeof VARIANTES)[number][0]

/** Total petroleum hydrocarbons, however the lab words it: "Indice hydrocarbures C10-C40", "HCT C5-C40"… */
const HC_TOTAL = /^(indice|somme|total)?(des|d)?(hydrocarbures?|hct|hc|ht)(totaux|total)?((c5|c6|c10)(a)?c40)?$|^(somme|indice)(des)?(c5|c10)(a)?c40$/

export function reconnaitre(p: Parametre): Reconnu | null {
  for (const c of cles(p.nom)) if (HC_TOTAL.test(c)) return 'hc'
  for (const c of cles(p.nom)) {
    const id = INDEX.get(c)
    if (!id) continue
    // A metal listed under a dissolved / filtered family is the dissolved one.
    if (id === 'fe-total' && /dissous|filtr/i.test(`${p.famille} ${p.nom}`)) return 'fe-dissous'
    return id
  }
  return null
}

// ---- Units -----------------------------------------------------------------------------

const MASSE: Record<string, number> = { ng: 1e-6, µg: 1e-3, ug: 1e-3, mcg: 1e-3, mg: 1, g: 1000 }

/**
 * Brings a lab value to the parameter's unit. Returns null when the unit
 * is not understood (the row is then left out, and said so).
 */
export function convertir(valeur: number, unite: string, id: ParamId, nom: string): number | null {
  const u = unite.trim().toLowerCase().replace('μ', 'µ').replace(/\s+/g, ' ')
  const cible = PAR_ID.get(id)!
  if (id === 'ph') return /ph|^-$|^$|unit/.test(u) ? valeur : null
  if (id === 't') return /°|deg|c$/.test(u) ? valeur : null
  if (id === 'ce') {
    if (/µs\/cm|us\/cm/.test(u)) return valeur
    if (/ms\/cm/.test(u)) return valeur * 1000
    if (/ms\/m/.test(u)) return valeur * 10
    return null
  }
  if (id === 'orp') return /mv/.test(u) ? valeur : null
  if (id === 'h2') {
    if (/^nm$|nmol/.test(u)) return valeur
    if (/µmol|umol/.test(u)) return valeur * 1000
    return null
  }
  if (id === 'alcalinite') {
    if (/°\s*f|degr[ée]s? fran/.test(u)) return valeur * 10
    if (/meq|mmol/.test(u)) return valeur * 50.04 * (/mmol/.test(u) ? 2 : 1)
  }
  const m = u.match(/^(ng|µg|ug|mcg|mg|g)\s*([a-z0-9\-₂₃₄]*)\s*\/\s*(ml|l)\b\s*([a-z0-9]*)/)
  if (!m) return null
  const facteurL = m[3] === 'ml' ? 1000 : 1
  const enMg = valeur * MASSE[m[1]] * facteurL
  const ion = `${m[2]}${m[4]}`
  let x = cible.unite.startsWith('µg') ? enMg * 1000 : enMg
  const enAzote = (t: string) => /^n$|^n-?no3$|^no3-?n$/.test(t)
  if (id === 'nitrate' && (enAzote(m[2]) || enAzote(m[4]) || /\bn-?no3\b|azote/i.test(nom))) x *= 62.004 / 14.007
  if (id === 'alcalinite' && /hco3/.test(ion + nom.toLowerCase())) x *= 50.04 / 61.02
  return x
}

/** A lab or typed value, in the parameter's unit. */
export interface Valeur {
  valeur: number
  /** Below the quantification limit: `valeur` is the LQ. */
  inferieur: boolean
  /** Where it comes from: "fiche", lab file name, "saisie"… */
  source: string
  /** What the user should know: total iron for Fe²⁺, earlier reading, sum of BTEX… */
  note?: string
}

export function depuisMesure(m: Mesure, unite: string, id: ParamId, nom: string, source: string): Valeur | null {
  if (m.valeur === null) return null
  const v = convertir(m.valeur, unite, id, nom)
  return v === null ? null : { valeur: v, inferieur: m.inferieur, source }
}

/** "<0,5", "12,3", "" → Valeur | null | undefined (undefined: not a number). */
export function lireSaisie(s: string): { valeur: number; inferieur: boolean } | null | undefined {
  const t = s.trim()
  if (!t) return null
  const inferieur = /^</.test(t)
  const n = Number(t.replace(/^[<>≤]\s*/, '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? { valeur: n, inferieur } : undefined
}

export function formatValeur(v: Valeur | undefined | null): string {
  if (!v) return ''
  const n = Number(v.valeur.toPrecision(4)).toLocaleString('fr-FR', { maximumFractionDigits: 6, useGrouping: false })
  return v.inferieur ? `<${n}` : n
}
