/**
 * A made-up site to try the 3D model with: the five wells of Suivi
 * temporel's example (same names, coordinates and monitoring, 2019–2025)
 * with their logs, and eight soil borings around the two sources — a
 * chlorinated-solvent spill by PZ2, a hydrocarbon spot by PZ5. Fill and silt
 * over the sandy gravels of an alluvial aquifer, a clay lens downgradient,
 * marl at the base; the site's parcel around the two sources, the wells
 * downgradient off site; the leaching pack of the inert-waste landfill
 * criteria on every soil sample; three soil gas probes. Every figure is
 * fictitious.
 */

import { exemple as exempleSuivi } from '../suivi/exemple.ts'
import { cleOuvrage } from '../resultats/campagnes.ts'
import { cleSol } from './logs.ts'
import { classeLitho } from './lithologie.ts'
import type { CoucheLitho, EchantillonSol, Equipement, Forage, LectureGaz, Observation, ParametreSol, Source, ValeurSol } from './types.ts'

const MS = 'mg/kg MS'
const ELU = 'Lixiviation (éluat L/S 10)'

/** [name, CAS, family, LQ, value when not given (null: under the LQ)] — the pack of the
 *  arrêté du 12 décembre 2014 (annexe II) besides the compounds of the sources. */
const DEFS: [string, string, string, number, number | null, boolean][] = [
  ['Tétrachloroéthylène', '127-18-4', 'COHV', 0.05, null, false],
  ['Trichloroéthylène', '79-01-6', 'COHV', 0.05, null, false],
  ['Benzène', '71-43-2', 'BTEX', 0.05, null, false],
  ['Hydrocarbures C10-C40', '', 'Hydrocarbures', 15, null, false],
  ['Arsenic', '7440-38-2', 'Métaux', 1, 9, false],
  ['Plomb', '7439-92-1', 'Métaux', 5, 28, false],
  ['COT', '', 'Paramètres globaux', 1000, 6500, false],
  ['BTEX', '', 'BTEX', 0.25, null, false],
  ['Somme des 16 HAP', '', 'HAP', 0.8, 1.6, false],
  ['PCB 7', '', 'PCB', 0.007, null, false],
  ['Arsenic', '7440-38-2', ELU, 0.05, null, true],
  ['Baryum', '7440-39-3', ELU, 0.1, 0.4, true],
  ['Cadmium', '7440-43-9', ELU, 0.002, null, true],
  ['Chrome', '7440-47-3', ELU, 0.02, null, true],
  ['Cuivre', '7440-50-8', ELU, 0.02, 0.05, true],
  ['Mercure', '7439-97-6', ELU, 0.001, null, true],
  ['Molybdène', '7439-98-7', ELU, 0.01, 0.03, true],
  ['Nickel', '7440-02-0', ELU, 0.02, null, true],
  ['Plomb', '7439-92-1', ELU, 0.02, null, true],
  ['Antimoine', '7440-36-0', ELU, 0.005, null, true],
  ['Sélénium', '7782-49-2', ELU, 0.01, null, true],
  ['Zinc', '7440-66-6', ELU, 0.05, 0.08, true],
  ['Chlorures', '16887-00-6', ELU, 10, 40, true],
  ['Fluorures', '16984-48-8', ELU, 1, 2.5, true],
  ['Sulfates', '14808-79-8', ELU, 50, 310, true],
  ['Indice phénols', '', ELU, 0.1, null, true],
  ['COT sur éluat', '', ELU, 10, 60, true],
  ['Fraction soluble', '', ELU, 1000, 1900, true],
]

const PARAMS: ParametreSol[] = DEFS.map(([nom, cas, famille, , , eluat]) => ({ nom, cas, famille, unite: MS, cle: cleSol(nom, cas, eluat), eluat }))
/** Key of a definition: the name, "éluat:" first for a leachate result. */
const cleDef = (nom: string, eluat: boolean) => (eluat ? `éluat:${nom}` : nom)

/** Deterministic wiggle of a layer boundary across the site (no randomness: the example never changes). */
const ondule = (x: number, y: number, a: number) => a * Math.sin((x - 652300) / 37) * Math.cos((y - 6862300) / 53)

interface Def {
  nom: string
  x: number
  y: number
  z: number
  profondeur: number
  eau: number
  piezo?: { crepine: [number, number] }
  /** Soil results: [from, to, { parameter: value }] (a value under the LQ is not quantified;
   *  « éluat:Plomb » for a leachate result). */
  echantillons: [number, number, Record<string, number>][]
  lentille?: boolean
  observations?: [number, number, string][]
  /** A soil gas probe: shallow, screened near its base. */
  piezair?: boolean
}

const fond = { Arsenic: 9, Plomb: 28 }

const FORAGES: Def[] = [
  { nom: 'PZ1', x: 652300, y: 6862420, z: 53.6, profondeur: 12, eau: 1.1, piezo: { crepine: [3, 11] }, echantillons: [[0.5, 1, { ...fond }], [2, 2.5, { Arsenic: 7, Plomb: 21 }]] },
  {
    nom: 'PZ2',
    x: 652355,
    y: 6862305,
    z: 53.2,
    profondeur: 12,
    eau: 1.4,
    piezo: { crepine: [3, 11] },
    echantillons: [
      [0.5, 1, { 'Tétrachloroéthylène': 62, 'Trichloroéthylène': 4.1, ...fond, 'éluat:Sulfates': 1400, 'éluat:Fraction soluble': 5200 }],
      [2, 2.5, { 'Tétrachloroéthylène': 18, 'Trichloroéthylène': 1.6, Arsenic: 8 }],
      [4, 4.5, { 'Tétrachloroéthylène': 2.3, 'Trichloroéthylène': 0.4 }],
    ],
    observations: [[0.5, 2, 'Odeur de solvant chloré']],
  },
  { nom: 'PZ3', x: 652430, y: 6862205, z: 52.5, profondeur: 11, eau: 1.3, piezo: { crepine: [3, 10] }, lentille: true, echantillons: [[1, 1.5, { 'Tétrachloroéthylène': 0.3, ...fond }]] },
  { nom: 'PZ4', x: 652530, y: 6862080, z: 51.8, profondeur: 11, eau: 1.4, piezo: { crepine: [3, 10] }, lentille: true, echantillons: [[1, 1.5, { Arsenic: 7, Plomb: 19 }]] },
  {
    nom: 'PZ5',
    x: 652290,
    y: 6862215,
    z: 52.9,
    profondeur: 10,
    eau: 1.5,
    piezo: { crepine: [2.5, 9.5] },
    echantillons: [
      [1, 1.5, { 'Hydrocarbures C10-C40': 2600, 'Benzène': 1.8, Arsenic: 14, Plomb: 85, BTEX: 4.2 }],
      [2.5, 3, { 'Hydrocarbures C10-C40': 640, 'Benzène': 0.4 }],
    ],
    observations: [[1, 3, 'Odeur d’hydrocarbures, irisations sur l’eau']],
  },
  {
    nom: 'S1',
    x: 652343,
    y: 6862318,
    z: 53.3,
    profondeur: 5,
    eau: 1.5,
    echantillons: [
      [0.3, 1, { 'Tétrachloroéthylène': 140, 'Trichloroéthylène': 9.5, Arsenic: 11, Plomb: 64, 'Somme des 16 HAP': 65 }],
      [1.5, 2, { 'Tétrachloroéthylène': 46, 'Trichloroéthylène': 3.2 }],
      [3, 3.5, { 'Tétrachloroéthylène': 7.8, 'Trichloroéthylène': 0.9 }],
      [4.5, 5, { 'Tétrachloroéthylène': 0.9 }],
    ],
  },
  {
    nom: 'S2',
    x: 652372,
    y: 6862290,
    z: 53.1,
    profondeur: 5,
    eau: 1.4,
    echantillons: [
      [0.5, 1, { 'Tétrachloroéthylène': 33, 'Trichloroéthylène': 2.2, ...fond, 'éluat:Sulfates': 1250, 'éluat:Fraction soluble': 4600 }],
      [2, 2.5, { 'Tétrachloroéthylène': 11, 'Trichloroéthylène': 1.1 }],
      [4, 4.5, { 'Tétrachloroéthylène': 1.4 }],
    ],
  },
  { nom: 'S3', x: 652325, y: 6862338, z: 53.4, profondeur: 4, eau: 1.3, echantillons: [[0.5, 1, { 'Tétrachloroéthylène': 3.6, ...fond }], [2, 2.5, { 'Tétrachloroéthylène': 0.8 }]] },
  { nom: 'S4', x: 652398, y: 6862262, z: 52.9, profondeur: 4, eau: 1.3, echantillons: [[0.5, 1, { 'Tétrachloroéthylène': 1.9 }], [2, 2.5, { 'Tétrachloroéthylène': 0.6, 'Trichloroéthylène': 0.2 }]] },
  {
    nom: 'S5',
    x: 652278,
    y: 6862226,
    z: 53.0,
    profondeur: 5,
    eau: 1.6,
    echantillons: [
      [0.5, 1, { 'Hydrocarbures C10-C40': 4300, 'Benzène': 3.2, Arsenic: 12, Plomb: 1450, BTEX: 9.8, 'éluat:Plomb': 12 }],
      [1.5, 2, { 'Hydrocarbures C10-C40': 1900, 'Benzène': 1.1, BTEX: 3.1 }],
      [3, 3.5, { 'Hydrocarbures C10-C40': 260, 'Benzène': 0.2 }],
    ],
    observations: [
      [0.2, 1, 'Remblais noirâtres, odeur d’hydrocarbures'],
      [1, 2.5, 'Odeur d’hydrocarbures'],
    ],
  },
  {
    nom: 'S6',
    x: 652302,
    y: 6862198,
    z: 52.8,
    profondeur: 4,
    eau: 1.5,
    echantillons: [
      [0.5, 1, { 'Hydrocarbures C10-C40': 980, 'Benzène': 0.6, ...fond }],
      [2, 2.5, { 'Hydrocarbures C10-C40': 310 }],
    ],
  },
  { nom: 'S7', x: 652262, y: 6862244, z: 53.1, profondeur: 4, eau: 1.6, echantillons: [[0.5, 1, { 'Hydrocarbures C10-C40': 140, ...fond }], [2, 2.5, {}]] },
  { nom: 'S8', x: 652335, y: 6862252, z: 52.9, profondeur: 4, eau: 1.4, echantillons: [[0.5, 1, { 'Hydrocarbures C10-C40': 45, 'Tétrachloroéthylène': 0.4, ...fond }], [2, 2.5, {}]] },
  { nom: 'PA1', x: 652352, y: 6862322, z: 53.3, profondeur: 1.2, eau: Number.NaN, piezair: true, echantillons: [] },
  { nom: 'PA2', x: 652281, y: 6862206, z: 52.9, profondeur: 1.2, eau: Number.NaN, piezair: true, echantillons: [] },
  { nom: 'PA3', x: 652318, y: 6862276, z: 53.1, profondeur: 1.2, eau: Number.NaN, piezair: true, echantillons: [] },
]

/** Soil gas of the probes (µg/m³), one campaign. */
const GAZ: Record<string, Record<string, number>> = {
  PA1: { 'Tétrachloroéthylène': 4800, 'Trichloroéthylène': 410, 'Benzène': 6, 'Toluène': 22 },
  PA2: { 'Tétrachloroéthylène': 35, 'Trichloroéthylène': 4, 'Benzène': 140, 'Toluène': 380 },
  PA3: { 'Tétrachloroéthylène': 260, 'Trichloroéthylène': 18, 'Benzène': 9, 'Toluène': 30 },
}
const PARAMS_GAZ: ParametreSol[] = [
  ['Tétrachloroéthylène', '127-18-4', 'COHV'],
  ['Trichloroéthylène', '79-01-6', 'COHV'],
  ['Benzène', '71-43-2', 'BTEX'],
  ['Toluène', '108-88-3', 'BTEX'],
].map(([nom, cas, famille]) => ({ nom, cas, famille, unite: 'µg/m³', cle: cleSol(nom, cas, false), eluat: false }))

function gaz(): LectureGaz {
  const points: LectureGaz['points'] = {}
  for (const [pt, vals] of Object.entries(GAZ)) {
    points[pt] = {}
    for (const p of PARAMS_GAZ) {
      const v = vals[p.nom]
      points[pt][p.cle] = v !== undefined ? { valeur: v, inferieur: false, brut: String(v) } : { valeur: 2, inferieur: true, brut: '<2' }
    }
  }
  return { fichier: 'Exemple (gaz du sol)', date: '2019-03-20', parametres: PARAMS_GAZ, points }
}

/** The site's parcel, around the two sources (Lambert 93). */
const PARCELLE: [number, number][] = [
  [652245, 6862185],
  [652405, 6862160],
  [652418, 6862300],
  [652372, 6862355],
  [652258, 6862372],
  [652238, 6862290],
  [652245, 6862185],
]

function lithologie(d: Def): CoucheLitho[] {
  if (d.piezair)
    return [
      { cle: 'REMBLAIS', description: 'Remblais sablo-graveleux', de: 0, a: 0.8, classe: 'remb' },
      { cle: 'LIMON ARGILEUX', description: 'Limon argileux brun', de: 0.8, a: d.profondeur, classe: 'silt' },
    ]
  const r = (v: number) => Math.round(v * 10) / 10
  const remblais = r(0.8 + ondule(d.x, d.y, 0.4) + (d.nom === 'PZ2' || d.nom === 'S1' || d.nom === 'S5' ? 0.5 : 0))
  const limon = r(remblais + 1.4 + ondule(d.y, d.x, 0.5))
  const graviers = r(8 + ondule(d.x + 40, d.y, 0.8))
  const marne = r(10 + ondule(d.x, d.y + 60, 0.6))
  const couches: [string, string, number, number][] = [
    ['REMBLAIS', 'Remblais sablo-graveleux, débris de briques', 0, remblais],
    ['LIMON ARGILEUX', 'Limon argileux brun', remblais, limon],
    ['SABLE GRAVELEUX', 'Sable graveleux beige, alluvions', limon, graviers],
    ['GRAVIERS', 'Graviers et galets roulés', graviers, marne],
    ['MARNE', 'Marne grise compacte', marne, 14],
  ]
  const lentille: [string, string, number, number][] = d.lentille ? [['ARGILE', 'Argile grise plastique (lentille)', 4.6, 5.5]] : []
  const toutes = d.lentille
    ? couches.flatMap((c) => (c[0] === 'SABLE GRAVELEUX' ? [[c[0], c[1], c[2], 4.6] as typeof c, ...lentille, [c[0], c[1], 5.5, c[3]] as typeof c] : [c]))
    : couches
  return toutes
    .map(([cle, description, de, a]) => ({ cle, description, de, a: Math.min(a, d.profondeur), classe: classeLitho(cle) }))
    .filter((c) => c.a > c.de)
}

function forage(d: Def): Forage {
  const equipement: Equipement[] = d.piezair
    ? [
        { de: 0, a: 0.6, element: 'TUBE PLEIN' },
        { de: 0.6, a: 1.1, element: 'CREPINE' },
        { de: 0, a: 0.5, element: 'BENTONITE' },
        { de: 0.5, a: 1.2, element: 'MASSIF FILTRANT' },
      ]
    : d.piezo
    ? [
        { de: 0, a: 0.3, element: 'CIMENT' },
        { de: 0.3, a: d.piezo.crepine[0] - 0.5, element: 'BENTONITE' },
        { de: d.piezo.crepine[0] - 0.5, a: d.piezo.crepine[1] + 0.5, element: 'MASSIF FILTRANT' },
        { de: 0, a: d.piezo.crepine[0], element: 'TUBE PLEIN' },
        { de: d.piezo.crepine[0], a: d.piezo.crepine[1], element: 'CREPINE' },
      ]
    : []
  const echantillons: EchantillonSol[] = d.echantillons.map(([de, a, vals]) => {
    const resultats: Record<string, ValeurSol> = {}
    DEFS.forEach(([nom, , , lq, defaut, eluat], i) => {
      // Analysed for everything: what is not given is the background, or under the LQ.
      const v = vals[cleDef(nom, eluat)] ?? defaut ?? undefined
      resultats[PARAMS[i].cle] = v !== undefined && v >= lq ? { valeur: v, inferieur: false, brut: String(v).replace('.', ',') } : { valeur: lq, inferieur: true, brut: `<${String(lq).replace('.', ',')}` }
    })
    return { id: `${d.nom} (${String(de).replace('.', ',')}-${String(a).replace('.', ',')} m)`, de, a, date: d.piezo ? '2018-11-20' : '2018-11-22', resultats }
  })
  return {
    nom: d.nom,
    cle: cleOuvrage(d.nom),
    x: d.x,
    y: d.y,
    z: d.z,
    profondeur: d.profondeur,
    lithologie: lithologie(d),
    equipement,
    pid: d.echantillons.map(([de, a, v]) => ({ de, a, valeur: Math.round(((v['Tétrachloroéthylène'] ?? 0) * 0.8 + (v['Hydrocarbures C10-C40'] ?? 0) * 0.02 + 0.3) * 10) / 10 })),
    observations: (d.observations ?? []).map(([de, a, texte]): Observation => ({ de, a, organoleptique: texte, remarque: '', humidite: '' })),
    niveauEau: Number.isFinite(d.eau) ? d.eau : null,
    echantillons,
    date: d.piezo ? '2018-11-20' : '2018-11-22',
  }
}

export function exemple(): Source {
  const suivi = exempleSuivi()
  return {
    id: 'exemple',
    origine: 'exemple',
    nom: 'Exemple (données fictives)',
    resume: `${FORAGES.length} forages dont 5 piézomètres et 3 piézairs · sols analysés · gaz du sol · 14 campagnes d'eaux souterraines (2019–2025) · parcelle du site — données fictives`,
    forages: FORAGES.map(forage),
    parametresSol: PARAMS,
    sols: [],
    eaux: { lots: suivi.lots, campagnes: [], releves: suivi.releves, ouvrages: suivi.ouvrages, corrections: null },
    gaz: [gaz()],
    parcelles: [PARCELLE],
    avertissements: [],
  }
}
