/**
 * Diagnostic indicators computed per sample for the expert export.
 *
 * Dechlorination chains (molar basis — one mole of parent gives at most one
 * mole of each daughter):
 * - chloroethenes PCE → TCE → DCE → vinyl chloride → ethene, chloroethanes
 *   1,1,1-TCA → 1,1-DCA → chloroethane (USEPA, 1998, EPA/600/R-98/128);
 * - chlorobenzenes: more chlorinated → trichloro- → dichloro- →
 *   monochlorobenzene, which tends to accumulate under anaerobic conditions
 *   and is mineralised under aerobic ones (benzene is not an established end
 *   product, hence left out).
 * The stage of each sample is read from its dominant species in moles —
 * a description of the composition, not a threshold of our own.
 *
 * PAH: source ratios after Yunker et al. (2002), LMW/HMW (2-3 rings over
 * 4-6 rings: > 1 petrogenic, < 1 pyrolytic — Wang et al., 1999), share of the
 * seven PAH classed probable human carcinogens (US EPA, group B2), and the
 * benzo[a]pyrene equivalent with the INERIS (2003) toxic equivalency factors.
 *
 * Petroleum hydrocarbons and BTEX: distribution of the carbon-range
 * fractions (indicative product ranges, to be confirmed on the lab
 * chromatogram), and the B/T and (B+T)/(E+X) ratios — benzene and toluene,
 * more soluble and degradable, are depleted first as a product weathers.
 */

import { normaliser } from '../guides.ts'
import type { Lecture, Mesure, Parametre } from '../parse.ts'

export const compact = (nom: string) =>
  normaliser(nom.replace(/\(([^)]{9,})\)/g, ' '))
    .replace(/ /g, '')
    .replace(/ethene/g, 'ethylene')

function trouverParametre(params: Parametre[], variantes: string[]): Parametre | undefined {
  return params.find((p) => !p.somme && variantes.includes(compact(p.nom)))
}

const quantifie = (m: Mesure | undefined): m is Mesure & { valeur: number } => !!m && !m.inferieur && m.valeur !== null && m.valeur > 0

// ---- Dechlorination chains -------------------------------------------------------------

export interface Espece {
  code: string
  libelle: string
  variantes: string[]
  masseMolaire: number
  chlores: number
  couleur: string
  /** What a sample dominated by this species says. */
  stade: string
}

export interface Chaine {
  nom: string
  especes: Espece[]
  /** Highest possible average number of chlorine atoms (pure parent). */
  chloresMax: number
}

export const CHAINES: Chaine[] = [
  {
    nom: 'Chloroéthènes',
    chloresMax: 4,
    especes: [
      { code: 'PCE', libelle: 'Tétrachloroéthylène', variantes: ['tetrachloroethylene'], masseMolaire: 165.83, chlores: 4, couleur: '#1F3864', stade: 'Peu dégradé — PCE dominant (zone source ou panache peu évolué)' },
      { code: 'TCE', libelle: 'Trichloroéthylène', variantes: ['trichloroethylene'], masseMolaire: 131.39, chlores: 3, couleur: '#2E75B6', stade: 'Déchloration amorcée — TCE dominant (ou TCE rejeté comme tel)' },
      { code: 'cis-DCE', libelle: 'cis-1,2-dichloroéthylène', variantes: ['cis12dichloroethylene', '12cisdichloroethylene'], masseMolaire: 96.94, chlores: 2, couleur: '#00A37E', stade: 'Déchloration partielle — cis-DCE dominant (accumulation possible si le milieu n\'est pas assez réducteur)' },
      { code: 'trans-DCE', libelle: 'trans-1,2-dichloroéthylène', variantes: ['trans12dichloroethylene', '12transdichloroethylene'], masseMolaire: 96.94, chlores: 2, couleur: '#82A78D', stade: 'trans-DCE dominant — origine industrielle ou voie non biologique possible' },
      { code: '1,1-DCE', libelle: '1,1-dichloroéthylène', variantes: ['11dichloroethylene'], masseMolaire: 96.94, chlores: 2, couleur: '#B7B2AA', stade: '1,1-DCE dominant — souvent issu du 1,1,1-TCA (voie abiotique)' },
      { code: 'CV', libelle: 'Chlorure de vinyle', variantes: ['chloruredevinyle', 'chloroethylene', 'monochloroethylene'], masseMolaire: 62.5, chlores: 1, couleur: '#C0392B', stade: 'Déchloration avancée — chlorure de vinyle dominant (le plus toxique de la chaîne ; éthène et éthane à rechercher)' },
    ],
  },
  {
    nom: 'Chloroéthanes',
    chloresMax: 3,
    especes: [
      { code: '1,1,1-TCA', libelle: '1,1,1-trichloroéthane', variantes: ['111trichloroethane'], masseMolaire: 133.4, chlores: 3, couleur: '#1F3864', stade: 'Peu dégradé — 1,1,1-TCA dominant' },
      { code: '1,1,2-TCA', libelle: '1,1,2-trichloroéthane', variantes: ['112trichloroethane'], masseMolaire: 133.4, chlores: 3, couleur: '#2E75B6', stade: 'Peu dégradé — 1,1,2-TCA dominant' },
      { code: '1,1-DCA', libelle: '1,1-dichloroéthane', variantes: ['11dichloroethane'], masseMolaire: 98.96, chlores: 2, couleur: '#00A37E', stade: 'Déchloration en cours — 1,1-DCA dominant' },
      { code: '1,2-DCA', libelle: '1,2-dichloroéthane', variantes: ['12dichloroethane'], masseMolaire: 98.96, chlores: 2, couleur: '#82A78D', stade: '1,2-DCA dominant — souvent d\'origine propre (solvant, synthèse du CV)' },
      { code: 'CA', libelle: 'Chloroéthane', variantes: ['chloroethane', 'monochloroethane'], masseMolaire: 64.51, chlores: 1, couleur: '#C0392B', stade: 'Déchloration avancée — chloroéthane dominant' },
    ],
  },
  {
    nom: 'Chlorobenzènes',
    chloresMax: 6,
    especes: [
      { code: 'HCB', libelle: 'Hexachlorobenzène', variantes: ['hexachlorobenzene'], masseMolaire: 284.78, chlores: 6, couleur: '#0D2421', stade: 'Peu dégradé — hexachlorobenzène dominant' },
      { code: 'PeCB', libelle: 'Pentachlorobenzène', variantes: ['pentachlorobenzene'], masseMolaire: 250.34, chlores: 5, couleur: '#1F3864', stade: 'Peu dégradé — pentachlorobenzène dominant' },
      {
        code: 'TeCB',
        libelle: 'Tétrachlorobenzènes',
        variantes: ['1234tetrachlorobenzene', '1235tetrachlorobenzene', '1245tetrachlorobenzene', 'tetrachlorobenzene', 'tetrachlorobenzenes'],
        masseMolaire: 215.89,
        chlores: 4,
        couleur: '#2E5597',
        stade: 'Peu dégradé — tétrachlorobenzènes dominants',
      },
      {
        code: 'TCB',
        libelle: 'Trichlorobenzènes',
        variantes: ['123trichlorobenzene', '124trichlorobenzene', '135trichlorobenzene', 'trichlorobenzene', 'trichlorobenzenes'],
        masseMolaire: 181.45,
        chlores: 3,
        couleur: '#2E75B6',
        stade: 'Peu dégradé — trichlorobenzènes dominants (le 1,3,5-TCB est réputé persistant)',
      },
      {
        code: 'DCB',
        libelle: 'Dichlorobenzènes',
        variantes: ['12dichlorobenzene', '13dichlorobenzene', '14dichlorobenzene', 'dichlorobenzene', 'dichlorobenzenes'],
        masseMolaire: 147.0,
        chlores: 2,
        couleur: '#00A37E',
        stade: 'Déchloration partielle — dichlorobenzènes dominants',
      },
      {
        code: 'MCB',
        libelle: 'Monochlorobenzène',
        variantes: ['monochlorobenzene', 'chlorobenzene'],
        masseMolaire: 112.56,
        chlores: 1,
        couleur: '#E69F00',
        stade: 'Déchloration avancée — monochlorobenzène dominant (s\'accumule en anaérobie, se dégrade en aérobie)',
      },
    ],
  },
]

export interface LigneDegradation {
  echantillon: string
  /** µmol per the lab's denominator (or per m³ for gas samples). */
  molaire: Record<string, number>
  fractions: Record<string, number>
  total: number
  nombreChlore: number
  partFilles: number
  dominant: Espece
  cisSurDCE: number | null
}

export interface Degradation {
  chaine: Chaine
  uniteMolaire: string
  /** Species analysed in this file, in chain order. */
  especes: Espece[]
  echantillons: LigneDegradation[]
}

function uniteMolaire(unite: string): { facteur: number; libelle: string } | null {
  const m = unite.trim().toLowerCase().replace('μ', 'µ').match(/^(ng|µg|ug|mg|g)\s*\/\s*(\S+)/)
  if (!m) return null
  const versMicrogrammes: Record<string, number> = { ng: 0.001, µg: 1, ug: 1, mg: 1000, g: 1e6 }
  return { facteur: versMicrogrammes[m[1]], libelle: `µmol/${m[2]}` }
}

type Conversion = (p: Parametre, m: Mesure, echantillon: string) => number | null

function degradationChaine(lecture: Lecture, chaine: Chaine, echantillons: string[], versMicrogrammesM3?: Conversion): Degradation | null {
  // A species may gather several isomers (dichlorobenzenes): all rows count.
  const presentes = chaine.especes
    .map((e) => ({ e, params: lecture.parametres.CM.filter((p) => !p.somme && e.variantes.includes(compact(p.nom))) }))
    .filter((x) => x.params.length)
  if (presentes.length < 2) return null
  const unite = versMicrogrammesM3 ? null : uniteMolaire(presentes[0].params[0].unite)
  if (!versMicrogrammesM3 && !unite) return null
  const parent = presentes[0].e
  const lignes: LigneDegradation[] = []
  for (const ech of echantillons) {
    const molaire: Record<string, number> = {}
    let total = 0
    let chlores = 0
    for (const { e, params } of presentes) {
      let mol = 0
      for (const p of params) {
        const m = lecture.valeurs.CM[ech]?.[p.cle]
        if (!quantifie(m)) continue
        const microgrammes = versMicrogrammesM3 ? versMicrogrammesM3(p, m, ech) : m.valeur * unite!.facteur
        if (microgrammes === null) continue
        mol += microgrammes / e.masseMolaire
      }
      molaire[e.code] = mol
      total += mol
      chlores += mol * e.chlores
    }
    if (!total) continue
    const fractions = Object.fromEntries(Object.entries(molaire).map(([k, v]) => [k, v / total]))
    const dominant = presentes.map((x) => x.e).reduce((a, b) => (molaire[b.code] > molaire[a.code] ? b : a))
    const cis = molaire['cis-DCE'] ?? 0
    const trans = molaire['trans-DCE'] ?? 0
    lignes.push({
      echantillon: ech,
      molaire,
      fractions,
      total,
      nombreChlore: chlores / total,
      partFilles: (total - molaire[parent.code]) / total,
      dominant,
      cisSurDCE: chaine.nom === 'Chloroéthènes' && cis + trans > 0 ? cis / (cis + trans) : null,
    })
  }
  if (!lignes.length) return null
  // Least degraded first: the table reads like the dechlorination itself.
  lignes.sort((a, b) => b.nombreChlore - a.nombreChlore || b.total - a.total)
  return { chaine, uniteMolaire: versMicrogrammesM3 ? 'µmol/m³' : unite!.libelle, especes: presentes.map((x) => x.e), echantillons: lignes }
}

/** `versMicrogrammesM3` converts a sorbent-tube mass to µg/m³ for gas samples. */
export function degradations(lecture: Lecture, echantillons: string[], versMicrogrammesM3?: Conversion): Degradation[] {
  return CHAINES.map((c) => degradationChaine(lecture, c, echantillons, versMicrogrammesM3)).filter((d): d is Degradation => !!d)
}

// ---- PAH --------------------------------------------------------------------------------

const HAP: Record<string, { variantes: string[]; cycles: number; b2?: boolean }> = {
  Nap: { variantes: ['naphtalene', 'naphthalene'], cycles: 2 },
  Acy: { variantes: ['acenaphtylene', 'acenaphthylene'], cycles: 3 },
  Ace: { variantes: ['acenaphtene', 'acenaphthene'], cycles: 3 },
  Flu: { variantes: ['fluorene'], cycles: 3 },
  Phe: { variantes: ['phenanthrene'], cycles: 3 },
  Ant: { variantes: ['anthracene'], cycles: 3 },
  Fla: { variantes: ['fluoranthene'], cycles: 4 },
  Pyr: { variantes: ['pyrene'], cycles: 4 },
  BaA: { variantes: ['benzoaanthracene', 'benzaanthracene'], cycles: 4, b2: true },
  Chr: { variantes: ['chrysene'], cycles: 4, b2: true },
  BbF: { variantes: ['benzobfluoranthene'], cycles: 5, b2: true },
  BkF: { variantes: ['benzokfluoranthene'], cycles: 5, b2: true },
  BaP: { variantes: ['benzoapyrene'], cycles: 5, b2: true },
  DahA: { variantes: ['dibenzoahanthracene', 'dibenzahanthracene'], cycles: 5, b2: true },
  BghiP: { variantes: ['benzoghiperylene'], cycles: 6 },
  IcdP: { variantes: ['indeno123cdpyrene'], cycles: 6, b2: true },
}

export const NOMS_HAP: Record<string, string> = {
  Nap: 'Naphtalène', Acy: 'Acénaphtylène', Ace: 'Acénaphtène', Flu: 'Fluorène', Phe: 'Phénanthrène', Ant: 'Anthracène',
  Fla: 'Fluoranthène', Pyr: 'Pyrène', BaA: 'Benzo(a)anthracène', Chr: 'Chrysène', BbF: 'Benzo(b)fluoranthène',
  BkF: 'Benzo(k)fluoranthène', BaP: 'Benzo(a)pyrène', DahA: 'Dibenzo(a,h)anthracène', BghiP: 'Benzo(ghi)pérylène', IcdP: 'Indéno(1,2,3-cd)pyrène',
}

/** INERIS (2003) toxic equivalency factors, relative to benzo[a]pyrene. */
export const FET_INERIS: Record<string, number> = {
  Nap: 0.001, Acy: 0.001, Ace: 0.001, Flu: 0.001, Phe: 0.001, Ant: 0.01, Fla: 0.001, Pyr: 0.001,
  BaA: 0.1, Chr: 0.01, BbF: 0.1, BkF: 0.1, BaP: 1, DahA: 1, BghiP: 0.01, IcdP: 0.1,
}

export type Origine = 'pétrogénique' | 'pyrolytique' | 'mixte'

export interface Ratio {
  code: string
  num: string
  autre: string
  seuils: number[]
  lectures: string[]
  /** Petrogenic / pyrolytic reading of each interval, for the synthesis. */
  origines: Origine[]
}

export const RATIOS_HAP: Ratio[] = [
  { code: 'Ant/(Ant+Phe)', num: 'Ant', autre: 'Phe', seuils: [0.1], lectures: ['pétrogénique', 'pyrolytique'], origines: ['pétrogénique', 'pyrolytique'] },
  {
    code: 'Fla/(Fla+Pyr)',
    num: 'Fla',
    autre: 'Pyr',
    seuils: [0.4, 0.5],
    lectures: ['pétrogénique', 'combustion de produits pétroliers', 'combustion de biomasse ou de charbon'],
    origines: ['pétrogénique', 'pyrolytique', 'pyrolytique'],
  },
  { code: 'BaA/(BaA+Chr)', num: 'BaA', autre: 'Chr', seuils: [0.2, 0.35], lectures: ['pétrogénique', 'mixte', 'combustion'], origines: ['pétrogénique', 'mixte', 'pyrolytique'] },
  {
    code: 'IcdP/(IcdP+BghiP)',
    num: 'IcdP',
    autre: 'BghiP',
    seuils: [0.2, 0.5],
    lectures: ['pétrogénique', 'combustion de produits pétroliers', 'combustion de biomasse ou de charbon'],
    origines: ['pétrogénique', 'pyrolytique', 'pyrolytique'],
  },
]

export interface LigneHAP {
  echantillon: string
  somme: number
  parCycles: Record<string, number>
  lmwHmw: number | null
  ratios: Record<string, { valeur: number; lecture: string; origine: Origine } | null>
  synthese: string
  partCancerogenes: number | null
  bapEqMin: number
  bapEqMax: number
  contributeur: string | null
  nbQuantifies: number
}

export interface DiagnosticHAP {
  unite: string
  presents: string[]
  coelution: boolean
  echantillons: LigneHAP[]
}

export const CLASSES_CYCLES = ['2 cycles', '3 cycles', '4 cycles', '5 cycles', '6 cycles']

export function diagnosticHAP(lecture: Lecture, echantillons: string[]): DiagnosticHAP | null {
  const params = Object.fromEntries(Object.entries(HAP).map(([code, h]) => [code, trouverParametre(lecture.parametres.CM, h.variantes)]))
  const presents = Object.keys(params).filter((c) => params[c])
  if (presents.length < 4) return null
  const unite = params[presents[0]]!.unite
  const lignes: LigneHAP[] = []
  for (const ech of echantillons) {
    const val = (code: string) => (params[code] ? lecture.valeurs.CM[ech]?.[params[code]!.cle] : undefined)
    let somme = 0
    let b2 = 0
    let bapEqMin = 0
    let bapEqMax = 0
    let nbQuantifies = 0
    let mesures = 0
    let contributeur: { code: string; v: number } | null = null
    const parCycles: Record<string, number> = Object.fromEntries(CLASSES_CYCLES.map((c) => [c, 0]))
    for (const code of presents) {
      const m = val(code)
      if (!m || m.valeur === null) continue
      mesures++
      bapEqMax += m.valeur * FET_INERIS[code]
      if (m.inferieur) continue
      nbQuantifies++
      somme += m.valeur
      parCycles[`${HAP[code].cycles} cycles`] += m.valeur
      if (HAP[code].b2) b2 += m.valeur
      const eq = m.valeur * FET_INERIS[code]
      bapEqMin += eq
      if (!contributeur || eq > contributeur.v) contributeur = { code, v: eq }
    }
    if (!mesures) continue
    const lmw = parCycles['2 cycles'] + parCycles['3 cycles']
    const hmw = parCycles['4 cycles'] + parCycles['5 cycles'] + parCycles['6 cycles']
    const ratios: LigneHAP['ratios'] = {}
    for (const r of RATIOS_HAP) {
      const a = val(r.num)
      const b = val(r.autre)
      if (!quantifie(a) || !quantifie(b)) {
        ratios[r.code] = null
        continue
      }
      const v = a.valeur / (a.valeur + b.valeur)
      let i = r.seuils.findIndex((s) => v < s)
      if (i < 0) i = r.lectures.length - 1
      ratios[r.code] = { valeur: v, lecture: r.lectures[i], origine: r.origines[i] }
    }
    lignes.push({
      echantillon: ech,
      somme,
      parCycles,
      lmwHmw: lmw > 0 && hmw > 0 ? lmw / hmw : null,
      ratios,
      synthese: '',
      partCancerogenes: somme ? b2 / somme : null,
      bapEqMin,
      bapEqMax,
      contributeur: contributeur ? NOMS_HAP[contributeur.code] : null,
      nbQuantifies,
    })
  }
  if (!lignes.length) return null
  lignes.sort((a, b) => b.somme - a.somme)
  // Same value for BaA and chrysene everywhere: measured together, so that
  // ratio says nothing and must not vote.
  const baa = lignes.map((l) => l.ratios['BaA/(BaA+Chr)']?.valeur).filter((v): v is number => v !== undefined)
  const coelution = baa.length > 1 && baa.every((v) => Math.abs(v - 0.5) < 1e-9)
  for (const l of lignes) l.synthese = syntheseOrigine(l, coelution ? ['BaA/(BaA+Chr)'] : [])
  return { unite, presents, coelution, echantillons: lignes }
}

function syntheseOrigine(l: LigneHAP, exclus: string[]): string {
  const votes: Origine[] = Object.entries(l.ratios)
    .filter(([code, r]) => r && !exclus.includes(code))
    .map(([, r]) => r!.origine)
  if (l.lmwHmw !== null) votes.push(l.lmwHmw > 1 ? 'pétrogénique' : 'pyrolytique')
  const pyro = votes.filter((v) => v === 'pyrolytique').length
  const petro = votes.filter((v) => v === 'pétrogénique').length
  if (!votes.length) return 'Non déterminable (trop peu de HAP quantifiés)'
  if (pyro > petro) return `Plutôt pyrolytique (${pyro} indicateur${pyro > 1 ? 's' : ''} sur ${votes.length})`
  if (petro > pyro) return `Plutôt pétrogénique (${petro} indicateur${petro > 1 ? 's' : ''} sur ${votes.length})`
  return `Mixte ou indéterminée (${votes.length} indicateurs partagés)`
}

// ---- Petroleum hydrocarbons -------------------------------------------------------------

export const CLASSES_HCT = [
  { code: 'C5–C10', bas: 5, haut: 10, couleur: '#E69F00', produits: 'fraction légère et volatile : essences' },
  { code: 'C10–C16', bas: 10, haut: 16, couleur: '#2E75B6', produits: 'kérosène, gazole léger' },
  { code: 'C16–C22', bas: 16, haut: 22, couleur: '#00A37E', produits: 'gazole, fioul domestique' },
  { code: 'C22–C40', bas: 22, haut: 40, couleur: '#1F3864', produits: 'fractions lourdes : huiles, lubrifiants, fioul lourd' },
]

export interface LigneHCT {
  echantillon: string
  total: number
  parClasse: Record<string, number>
  dominante: (typeof CLASSES_HCT)[number]
}

export interface DiagnosticHCT {
  unite: string
  fractions: { p: Parametre; classe: string }[]
  echantillons: LigneHCT[]
}

/** "fraction C10-C12", "> C12 - C16 inclus", "C21-C40" → [10, 12]… */
function bornesCarbone(nom: string): [number, number] | null {
  const m = nom.match(/c\s*(\d+)\s*(?:[-–à]|a)\s*>?\s*n?c\s*(\d+)/i)
  return m ? [Number(m[1]), Number(m[2])] : null
}

export function diagnosticHCT(lecture: Lecture, echantillons: string[]): DiagnosticHCT | null {
  const fractions = lecture.parametres.CM.flatMap((p) => {
    if (p.somme || /aliph|arom|total|indice|%/i.test(p.nom) || !/g\s*\//i.test(p.unite)) return []
    const b = bornesCarbone(p.nom)
    if (!b || b[1] <= b[0] || b[1] - b[0] > 20) return []
    const milieu = (b[0] + b[1]) / 2
    const classe = CLASSES_HCT.find((c) => milieu >= c.bas && milieu < c.haut) ?? CLASSES_HCT[CLASSES_HCT.length - 1]
    return [{ p, classe: classe.code }]
  })
  if (fractions.length < 2) return null
  const unite = fractions[0].p.unite
  const lignes: LigneHCT[] = []
  for (const ech of echantillons) {
    const parClasse: Record<string, number> = Object.fromEntries(CLASSES_HCT.map((c) => [c.code, 0]))
    let total = 0
    let mesure = false
    for (const f of fractions) {
      const m = lecture.valeurs.CM[ech]?.[f.p.cle]
      if (m && m.valeur !== null) mesure = true
      if (!quantifie(m)) continue
      parClasse[f.classe] += m.valeur
      total += m.valeur
    }
    if (!mesure || !total) continue
    const dominante = CLASSES_HCT.reduce((a, b) => (parClasse[b.code] > parClasse[a.code] ? b : a))
    lignes.push({ echantillon: ech, total, parClasse, dominante })
  }
  if (!lignes.length) return null
  lignes.sort((a, b) => b.total - a.total)
  return { unite, fractions, echantillons: lignes }
}

// ---- BTEX ---------------------------------------------------------------------------------

const BTEX = {
  B: ['benzene'],
  T: ['toluene'],
  E: ['ethylbenzene'],
  X: ['xylenes', 'xylenestotaux', 'sommedesxylenes'],
  oX: ['orthoxylene', 'oxylene'],
  mpX: ['paraetmetaxylene', 'metaetparaxylene', 'mpxylene', 'xylenemetapara'],
}

export interface LigneBTEX {
  echantillon: string
  B: number | null
  T: number | null
  E: number | null
  X: number | null
  bSurT: number | null
  btSurEx: number | null
  partBenzene: number | null
}

export function diagnosticBTEX(lecture: Lecture, echantillons: string[]): { unite: string; echantillons: LigneBTEX[] } | null {
  const tous = lecture.parametres.CM
  const chercher = (v: string[]) => tous.find((p) => v.includes(compact(p.nom)))
  const pB = chercher(BTEX.B)
  const pT = chercher(BTEX.T)
  const pE = chercher(BTEX.E)
  // Xylenes: the lab total when given, else ortho + meta/para.
  const pX = chercher(BTEX.X)
  const pXs = [chercher(BTEX.oX), chercher(BTEX.mpX)].filter((p): p is Parametre => !!p)
  if (!pB || !pT || !pE || (!pX && !pXs.length)) return null
  const lignes: LigneBTEX[] = []
  for (const ech of echantillons) {
    const v = (p: Parametre | undefined) => {
      const m = p ? lecture.valeurs.CM[ech]?.[p.cle] : undefined
      return quantifie(m) ? m.valeur : m && m.valeur !== null ? 0 : null
    }
    const B = v(pB)
    const T = v(pT)
    const E = v(pE)
    const X = pX ? v(pX) : pXs.map(v).reduce<number | null>((a, b) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0)), null)
    if (![B, T, E, X].some((x) => x)) continue
    const total = (B ?? 0) + (T ?? 0) + (E ?? 0) + (X ?? 0)
    lignes.push({
      echantillon: ech,
      B,
      T,
      E,
      X,
      bSurT: B && T ? B / T : null,
      btSurEx: (B || T) && (E || X) ? ((B ?? 0) + (T ?? 0)) / ((E ?? 0) + (X ?? 0)) : null,
      partBenzene: total ? (B ?? 0) / total : null,
    })
  }
  return lignes.length ? { unite: pB.unite, echantillons: lignes.sort((a, b) => (b.B ?? 0) + (b.T ?? 0) + (b.E ?? 0) + (b.X ?? 0) - ((a.B ?? 0) + (a.T ?? 0) + (a.E ?? 0) + (a.X ?? 0))) } : null
}
