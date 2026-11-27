/**
 * A made-up site to try the 3D model with: the five wells of Suivi
 * temporel's example (same names, coordinates and monitoring, 2019–2025)
 * with their logs, and eight soil borings around the two sources — a
 * chlorinated-solvent spill by PZ2, a hydrocarbon spot by PZ5. Fill and silt
 * over the sandy gravels of an alluvial aquifer, a clay lens downgradient,
 * marl at the base. Every figure is fictitious.
 */

import { exemple as exempleSuivi } from '../suivi/exemple.ts'
import { cleOuvrage } from '../resultats/campagnes.ts'
import { cleSol } from './logs.ts'
import { classeLitho } from './lithologie.ts'
import type { CoucheLitho, EchantillonSol, Equipement, Forage, ParametreSol, Source, ValeurSol } from './types.ts'

const PARAMS: ParametreSol[] = [
  { nom: 'Tétrachloroéthylène', cas: '127-18-4', famille: 'COHV', unite: 'mg/kg MS' },
  { nom: 'Trichloroéthylène', cas: '79-01-6', famille: 'COHV', unite: 'mg/kg MS' },
  { nom: 'Benzène', cas: '71-43-2', famille: 'BTEX', unite: 'mg/kg MS' },
  { nom: 'Hydrocarbures C10-C40', cas: '', famille: 'Hydrocarbures', unite: 'mg/kg MS' },
  { nom: 'Arsenic', cas: '7440-38-2', famille: 'Métaux', unite: 'mg/kg MS' },
  { nom: 'Plomb', cas: '7439-92-1', famille: 'Métaux', unite: 'mg/kg MS' },
].map((p) => ({ ...p, cle: cleSol(p.nom, p.cas, false), eluat: false }))

const LQ: Record<string, number> = { 'Tétrachloroéthylène': 0.05, 'Trichloroéthylène': 0.05, 'Benzène': 0.05, 'Hydrocarbures C10-C40': 15, Arsenic: 1, Plomb: 5 }

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
  /** Soil results: [from, to, { parameter: value }] (a value under the LQ is not quantified). */
  echantillons: [number, number, Record<string, number>][]
  lentille?: boolean
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
      [0.5, 1, { 'Tétrachloroéthylène': 62, 'Trichloroéthylène': 4.1, ...fond }],
      [2, 2.5, { 'Tétrachloroéthylène': 18, 'Trichloroéthylène': 1.6, Arsenic: 8 }],
      [4, 4.5, { 'Tétrachloroéthylène': 2.3, 'Trichloroéthylène': 0.4 }],
    ],
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
      [1, 1.5, { 'Hydrocarbures C10-C40': 2600, 'Benzène': 1.8, Arsenic: 14, Plomb: 85 }],
      [2.5, 3, { 'Hydrocarbures C10-C40': 640, 'Benzène': 0.4 }],
    ],
  },
  {
    nom: 'S1',
    x: 652343,
    y: 6862318,
    z: 53.3,
    profondeur: 5,
    eau: 1.5,
    echantillons: [
      [0.3, 1, { 'Tétrachloroéthylène': 140, 'Trichloroéthylène': 9.5, Arsenic: 11, Plomb: 64 }],
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
      [0.5, 1, { 'Tétrachloroéthylène': 33, 'Trichloroéthylène': 2.2, ...fond }],
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
      [0.5, 1, { 'Hydrocarbures C10-C40': 4300, 'Benzène': 3.2, Arsenic: 12, Plomb: 120 }],
      [1.5, 2, { 'Hydrocarbures C10-C40': 1900, 'Benzène': 1.1 }],
      [3, 3.5, { 'Hydrocarbures C10-C40': 260, 'Benzène': 0.2 }],
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
]

function lithologie(d: Def): CoucheLitho[] {
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
  const equipement: Equipement[] = d.piezo
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
    for (const p of PARAMS) {
      const v = vals[p.nom]
      const lq = LQ[p.nom]
      // Analysed for everything: what is not given is under the LQ.
      resultats[p.cle] = v !== undefined && v >= lq ? { valeur: v, inferieur: false, brut: String(v).replace('.', ',') } : { valeur: lq, inferieur: true, brut: `<${String(lq).replace('.', ',')}` }
    }
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
    niveauEau: d.eau,
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
    resume: `${FORAGES.length} forages dont 5 piézomètres · sols analysés · 14 campagnes d'eaux souterraines (2019–2025) — données fictives`,
    forages: FORAGES.map(forage),
    parametresSol: PARAMS,
    sols: [],
    eaux: { lots: suivi.lots, campagnes: [], releves: suivi.releves, ouvrages: suivi.ouvrages, corrections: null },
    avertissements: [],
  }
}
