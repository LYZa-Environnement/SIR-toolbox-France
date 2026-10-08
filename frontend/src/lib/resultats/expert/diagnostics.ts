/**
 * Diagnostic indicators computed per sample:
 *
 * - chlorinated solvents: molar composition along the reductive
 *   dechlorination sequences (USEPA, 1998, Technical Protocol for Evaluating
 *   Natural Attenuation of Chlorinated Solvents in Ground Water,
 *   EPA/600/R-98/128): molar fractions, average number of chlorine atoms per
 *   molecule (4 for pure PCE, 1 for pure vinyl chloride), share of daughter
 *   products, cis / (cis + trans) DCE — reductive dechlorination yields
 *   mainly cis-1,2-DCE, manufactured DCE being mostly the trans and 1,1
 *   isomers;
 * - PAH: source ratios after Yunker et al. (2002), Organic Geochemistry 33,
 *   489-515 (petrogenic vs pyrolytic), and benzo[a]pyrene equivalent with the
 *   toxic equivalency factors proposed by INERIS (2003, rapport
 *   INERIS-DRC-03-47026, Nisbet & LaGoy 1992 table with dibenz[a,h]anthracene
 *   at 1).
 */

import { normaliser } from '../guides.ts'
import type { Lecture, Mesure, Parametre } from '../parse.ts'

const compact = (nom: string) =>
  normaliser(nom.replace(/\(([^)]{9,})\)/g, ' '))
    .replace(/ /g, '')
    .replace(/ethene/g, 'ethylene')

function trouverParametre(params: Parametre[], variantes: string[]): Parametre | undefined {
  return params.find((p) => !p.somme && variantes.includes(compact(p.nom)))
}

const quantifie = (m: Mesure | undefined): m is Mesure & { valeur: number } => !!m && !m.inferieur && m.valeur !== null && m.valeur > 0

// ---- Chlorinated solvents ---------------------------------------------------------

interface Espece {
  code: string
  variantes: string[]
  masseMolaire: number
  chlores: number
}

const CHLOROETHENES: Espece[] = [
  { code: 'PCE', variantes: ['tetrachloroethylene'], masseMolaire: 165.83, chlores: 4 },
  { code: 'TCE', variantes: ['trichloroethylene'], masseMolaire: 131.39, chlores: 3 },
  { code: 'cis-DCE', variantes: ['cis12dichloroethylene', '12cisdichloroethylene'], masseMolaire: 96.94, chlores: 2 },
  { code: 'trans-DCE', variantes: ['trans12dichloroethylene', '12transdichloroethylene'], masseMolaire: 96.94, chlores: 2 },
  { code: '1,1-DCE', variantes: ['11dichloroethylene'], masseMolaire: 96.94, chlores: 2 },
  { code: 'CV', variantes: ['chloruredevinyle', 'chloroethylene', 'monochloroethylene'], masseMolaire: 62.5, chlores: 1 },
]

const CHLOROETHANES: Espece[] = [
  { code: '1,1,1-TCA', variantes: ['111trichloroethane'], masseMolaire: 133.4, chlores: 3 },
  { code: '1,1,2-TCA', variantes: ['112trichloroethane'], masseMolaire: 133.4, chlores: 3 },
  { code: '1,1-DCA', variantes: ['11dichloroethane'], masseMolaire: 98.96, chlores: 2 },
  { code: '1,2-DCA', variantes: ['12dichloroethane'], masseMolaire: 98.96, chlores: 2 },
  { code: 'CA', variantes: ['chloroethane', 'monochloroethane'], masseMolaire: 64.51, chlores: 1 },
]

export interface Degradation {
  chaine: string
  /** Molar unit derived from the mass unit (µmol/l, µmol/kg, µmol/m³…). */
  uniteMolaire: string
  especes: string[]
  echantillons: {
    echantillon: string
    molaire: Record<string, number | null>
    fractions: Record<string, number | null>
    total: number
    nombreChlore: number | null
    partFilles: number | null
    cisSurDCE: number | null
  }[]
}

function uniteMolaire(unite: string): { facteur: number; libelle: string } | null {
  const m = unite.trim().toLowerCase().replace('μ', 'µ').match(/^(ng|µg|ug|mg|g)\s*\/\s*(\S+)/)
  if (!m) return null
  // To µmol per the same denominator: mass in µg / M (g/mol) = µmol.
  const versMicrogrammes: Record<string, number> = { ng: 0.001, µg: 1, ug: 1, mg: 1000, g: 1e6 }
  return { facteur: versMicrogrammes[m[1]], libelle: `µmol/${m[2]}` }
}

function chaine(lecture: Lecture, nom: string, especes: Espece[], echantillons: string[], valeurEn?: (p: Parametre, m: Mesure, echantillon: string) => number | null): Degradation | null {
  const presentes = especes.map((e) => ({ e, p: trouverParametre(lecture.parametres.CM, e.variantes) })).filter((x) => x.p)
  if (presentes.length < 2) return null
  const unite = valeurEn ? 'µg/m³' : presentes[0].p!.unite
  const u = uniteMolaire(unite)
  if (!u) return null
  const lignes: Degradation['echantillons'] = []
  for (const ech of echantillons) {
    const molaire: Record<string, number | null> = {}
    let total = 0
    let chloresPonderes = 0
    for (const { e, p } of presentes) {
      const m = lecture.valeurs.CM[ech]?.[p!.cle]
      if (!quantifie(m)) {
        molaire[e.code] = m ? 0 : null
        continue
      }
      const masse = valeurEn ? valeurEn(p!, m, ech) : m.valeur * u.facteur
      if (masse === null) {
        molaire[e.code] = null
        continue
      }
      const mol = (masse * (valeurEn ? 1 : 1)) / e.masseMolaire
      molaire[e.code] = mol
      total += mol
      chloresPonderes += mol * e.chlores
    }
    if (!total) continue
    const fractions = Object.fromEntries(Object.entries(molaire).map(([k, v]) => [k, v === null ? null : v / total]))
    const parent = especes[0].code
    const filles = presentes.filter((x) => x.e.code !== parent).reduce((a, x) => a + (molaire[x.e.code] ?? 0), 0)
    const cis = molaire['cis-DCE'] ?? 0
    const trans = molaire['trans-DCE'] ?? 0
    lignes.push({
      echantillon: ech,
      molaire,
      fractions,
      total,
      nombreChlore: chloresPonderes / total,
      partFilles: filles / total,
      cisSurDCE: cis + trans > 0 ? cis / (cis + trans) : null,
    })
  }
  if (!lignes.length) return null
  return { chaine: nom, uniteMolaire: valeurEn ? 'µmol/m³' : u.libelle, especes: presentes.map((x) => x.e.code), echantillons: lignes }
}

/** `concentration` converts a sorbent-tube mass to µg/m³ for gas samples. */
export function degradationCOHV(
  lecture: Lecture,
  echantillons: string[],
  concentration?: (p: Parametre, m: Mesure, echantillon: string) => number | null,
): Degradation[] {
  return [
    chaine(lecture, 'Chloroéthènes', CHLOROETHENES, echantillons, concentration),
    chaine(lecture, 'Chloroéthanes', CHLOROETHANES, echantillons, concentration),
  ].filter((d): d is Degradation => !!d)
}

// ---- PAH -----------------------------------------------------------------------------

const HAP: Record<string, string[]> = {
  Nap: ['naphtalene', 'naphthalene'],
  Acy: ['acenaphtylene', 'acenaphthylene'],
  Ace: ['acenaphtene', 'acenaphthene'],
  Flu: ['fluorene'],
  Phe: ['phenanthrene'],
  Ant: ['anthracene'],
  Fla: ['fluoranthene'],
  Pyr: ['pyrene'],
  BaA: ['benzoaanthracene', 'benzaanthracene'],
  Chr: ['chrysene'],
  BbF: ['benzobfluoranthene'],
  BkF: ['benzokfluoranthene'],
  BaP: ['benzoapyrene'],
  DahA: ['dibenzoahanthracene', 'dibenzahanthracene'],
  BghiP: ['benzoghiperylene'],
  IcdP: ['indeno123cdpyrene', 'indeno123cdpyrene'],
}

/** INERIS (2003) toxic equivalency factors, relative to benzo[a]pyrene. */
export const FET_INERIS: Record<string, number> = {
  Nap: 0.001, Acy: 0.001, Ace: 0.001, Flu: 0.001, Phe: 0.001, Ant: 0.01, Fla: 0.001, Pyr: 0.001,
  BaA: 0.1, Chr: 0.01, BbF: 0.1, BkF: 0.1, BaP: 1, DahA: 1, BghiP: 0.01, IcdP: 0.1,
}

export interface Ratio {
  code: string
  libelle: string
  num: string
  autre: string
  /** Thresholds and the reading of each interval, low to high. */
  seuils: number[]
  lectures: string[]
}

export const RATIOS_HAP: Ratio[] = [
  { code: 'Ant/(Ant+Phe)', libelle: 'Anthracène / (anthracène + phénanthrène)', num: 'Ant', autre: 'Phe', seuils: [0.1], lectures: ['pétrogénique', 'pyrolytique'] },
  {
    code: 'Fla/(Fla+Pyr)',
    libelle: 'Fluoranthène / (fluoranthène + pyrène)',
    num: 'Fla',
    autre: 'Pyr',
    seuils: [0.4, 0.5],
    lectures: ['pétrogénique', 'combustion de produits pétroliers', 'combustion de biomasse ou de charbon'],
  },
  {
    code: 'BaA/(BaA+Chr)',
    libelle: 'Benzo(a)anthracène / (benzo(a)anthracène + chrysène)',
    num: 'BaA',
    autre: 'Chr',
    seuils: [0.2, 0.35],
    lectures: ['pétrogénique', 'mixte', 'combustion'],
  },
  {
    code: 'IcdP/(IcdP+BghiP)',
    libelle: 'Indéno(1,2,3-cd)pyrène / (indéno(1,2,3-cd)pyrène + benzo(ghi)pérylène)',
    num: 'IcdP',
    autre: 'BghiP',
    seuils: [0.2, 0.5],
    lectures: ['pétrogénique', 'combustion de produits pétroliers', 'combustion de biomasse ou de charbon'],
  },
]

export interface DiagnosticHAP {
  unite: string
  presents: string[]
  echantillons: {
    echantillon: string
    ratios: Record<string, { valeur: number; lecture: string } | null>
    bapEqMin: number
    bapEqMax: number
    nbQuantifies: number
  }[]
}

export function diagnosticHAP(lecture: Lecture, echantillons: string[]): DiagnosticHAP | null {
  const params = Object.fromEntries(Object.entries(HAP).map(([code, v]) => [code, trouverParametre(lecture.parametres.CM, v)]))
  const presents = Object.keys(params).filter((c) => params[c])
  if (presents.length < 4) return null
  const unite = params[presents[0]]!.unite
  const lignes: DiagnosticHAP['echantillons'] = []
  for (const ech of echantillons) {
    const val = (code: string) => {
      const p = params[code]
      return p ? lecture.valeurs.CM[ech]?.[p.cle] : undefined
    }
    let bapEqMin = 0
    let bapEqMax = 0
    let nbQuantifies = 0
    let mesures = 0
    for (const code of presents) {
      const m = val(code)
      if (!m || m.valeur === null) continue
      mesures++
      if (!m.inferieur) {
        nbQuantifies++
        bapEqMin += m.valeur * FET_INERIS[code]
      }
      bapEqMax += m.valeur * FET_INERIS[code]
    }
    if (!mesures) continue
    const ratios: DiagnosticHAP['echantillons'][number]['ratios'] = {}
    for (const r of RATIOS_HAP) {
      const a = val(r.num)
      const b = val(r.autre)
      if (!quantifie(a) || !quantifie(b)) {
        ratios[r.code] = null
        continue
      }
      const v = a.valeur / (a.valeur + b.valeur)
      const i = r.seuils.findIndex((s) => v < s)
      ratios[r.code] = { valeur: v, lecture: r.lectures[i < 0 ? r.lectures.length - 1 : i] }
    }
    lignes.push({ echantillon: ech, ratios, bapEqMin, bapEqMax, nbQuantifies })
  }
  return lignes.length ? { unite, presents, echantillons: lignes } : null
}
