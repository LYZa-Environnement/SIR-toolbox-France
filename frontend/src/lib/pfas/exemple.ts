/**
 * A fictitious lab sheet, to discover the tool without a file. The three
 * profiles are built to illustrate the readings — an old electrochemical
 * foam, a fluorotelomer foam, diffuse inputs with TFA — and correspond to no
 * site. The sheet goes through the same reader as a real lab file.
 */

import type { Cell } from '../resultats/parse.ts'

const LQ = 1
const ECHANTILLONS = ['PZ1 (exemple)', 'PZ2 (exemple)', 'PZ3 (exemple)', 'Blanc de terrain']

/** ng/l; absent = below the LQ. */
const PROFILS: Record<string, number>[] = [
  { PFBA: 25, PFPeA: 60, PFHxA: 120, PFHpA: 40, PFOA: 95, PFNA: 5, PFBS: 35, PFPeS: 40, PFHxS: 420, PFHpS: 30, PFOS: 850, 'PFOS linéaire': 610, 'PFOS ramifiés': 240, '6:2 FTS': 18, TFA: 600, AOF: 3.2 },
  { PFBA: 90, PFPeA: 260, PFHxA: 380, PFHpA: 110, PFOA: 70, PFNA: 4, PFBS: 8, PFOS: 25, 'PFOS linéaire': 25, '6:2 FTS': 1400, TFA: 900, AOF: 4.1 },
  { PFBA: 6, PFPeA: 4, PFHxA: 5, PFOA: 3, PFOS: 2, 'PFOS linéaire': 2, TFA: 2400 },
  {},
]

const LIGNES: [string, string, string][] = [
  ['Acide perfluorobutanoïque (PFBA)', '375-22-4', 'PFBA'],
  ['Acide perfluoropentanoïque (PFPeA)', '2706-90-3', 'PFPeA'],
  ['Acide perfluorohexanoïque (PFHxA)', '307-24-4', 'PFHxA'],
  ['Acide perfluoroheptanoïque (PFHpA)', '375-85-9', 'PFHpA'],
  ['Acide perfluorooctanoïque (PFOA)', '335-67-1', 'PFOA'],
  ['Acide perfluorononanoïque (PFNA)', '375-95-1', 'PFNA'],
  ['Acide perfluorodécanoïque (PFDA)', '335-76-2', 'PFDA'],
  ['Acide perfluoroundécanoïque (PFUnDA)', '2058-94-8', 'PFUnDA'],
  ['Acide perfluorododécanoïque (PFDoDA)', '307-55-1', 'PFDoDA'],
  ['Acide perfluorotridécanoïque (PFTrDA)', '72629-94-8', 'PFTrDA'],
  ['Acide perfluorobutanesulfonique (PFBS)', '375-73-5', 'PFBS'],
  ['Acide perfluoropentanesulfonique (PFPeS)', '2706-91-4', 'PFPeS'],
  ['Acide perfluorohexanesulfonique (PFHxS)', '355-46-4', 'PFHxS'],
  ['Acide perfluoroheptanesulfonique (PFHpS)', '375-92-8', 'PFHpS'],
  ['Acide perfluorooctanesulfonique (PFOS)', '1763-23-1', 'PFOS'],
  ['PFOS linéaire', '', 'PFOS linéaire'],
  ['PFOS ramifiés', '', 'PFOS ramifiés'],
  ['Acide perfluorononanesulfonique (PFNS)', '68259-12-1', 'PFNS'],
  ['Acide perfluorodécanesulfonique (PFDS)', '335-77-3', 'PFDS'],
  ['Acide perfluoroundécanesulfonique (PFUnDS)', '749786-16-1', 'PFUnDS'],
  ['Acide perfluorododécanesulfonique (PFDoDS)', '79780-39-5', 'PFDoDS'],
  ['Acide perfluorotridécanesulfonique (PFTrDS)', '791563-89-8', 'PFTrDS'],
]

const VINGT = LIGNES.filter(([nom]) => !/lin[ée]aire|ramifi/.test(nom)).map(([, , cle]) => cle)

function cellule(v: number | undefined, lq: number): Cell {
  return v === undefined ? `<${String(lq).replace('.', ',')}` : v
}

export function grilleExemple(): Cell[][] {
  const g: Cell[][] = [
    ['Rapport d’essai — EXEMPLE FICTIF, ne correspond à aucun site'],
    [],
    ['Paramètre', 'N° CAS', 'Unité', ...ECHANTILLONS],
    ['Composés perfluorés (PFAS)'],
  ]
  for (const [nom, cas, cle] of LIGNES) g.push([nom, cas, 'ng/l', ...PROFILS.map((p) => cellule(p[cle], LQ))])
  g.push([
    'Somme des 20 PFAS (directive (UE) 2020/2184)',
    '',
    'ng/l',
    ...PROFILS.map((p) => {
      const s = VINGT.reduce((a, cle) => a + (p[cle] ?? 0), 0)
      return s > 0 ? s : `<${VINGT.length * LQ}`
    }),
  ])
  g.push(['Acide 6:2 fluorotélomère sulfonique (6:2 FTS)', '27619-97-2', 'ng/l', ...PROFILS.map((p) => cellule(p['6:2 FTS'], 5))])
  g.push(['Acide trifluoroacétique (TFA)', '76-05-1', 'ng/l', ...PROFILS.map((p) => cellule(p.TFA, 50))])
  g.push(['Paramètres globaux'])
  g.push(['AOF (fluor organique adsorbable)', '', 'µg F/l', ...PROFILS.map((p) => cellule(p.AOF, 2))])
  return g
}
