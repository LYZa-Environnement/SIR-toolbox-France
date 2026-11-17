/**
 * The 22 substances the tool reads: the 20 PFAS of the "Somme des PFAS"
 * parameter (directive (UE) 2020/2184, annexe III partie B point 3 —
 * perfluoroalkyl carboxylic acids and sulfonic acids from C4 to C13), TFA
 * (C2) and 6:2 FTS.
 *
 * Formulas follow the homologous series (acid form):
 * - PFCA, CnF(2n-1)COOH written CnHF(2n-1)O2 — n carbons, n-1 perfluorinated;
 * - PFSA, CnF(2n+1)SO3H written CnHF(2n+1)O3S — n carbons, all perfluorinated;
 * - 6:2 FTS, C6F13-CH2CH2-SO3H = C8H5F13O3S;
 * - TFA, CF3COOH = C2HF3O2.
 * Molar masses and fluorine mass fractions are computed from them with the
 * IUPAC standard atomic weights, never typed in.
 *
 * "Long chain" follows Buck et al. (2011): PFCA with 7 or more
 * perfluorinated carbons (PFOA and above), PFSA with 6 or more (PFHxS and
 * above). CAS numbers: UBA (2024) table of the PFAS-20; they only help to
 * recognise the lab's rows, names being read as well.
 */

export type Famille = 'PFCA' | 'PFSA' | 'FTS' | 'TFA'

export type IdSubstance =
  | 'PFBA' | 'PFPeA' | 'PFHxA' | 'PFHpA' | 'PFOA' | 'PFNA' | 'PFDA' | 'PFUnDA' | 'PFDoDA' | 'PFTrDA'
  | 'PFBS' | 'PFPeS' | 'PFHxS' | 'PFHpS' | 'PFOS' | 'PFNS' | 'PFDS' | 'PFUnDS' | 'PFDoDS' | 'PFTrDS'
  | 'FTS62' | 'TFA'

export interface Substance {
  id: IdSubstance
  /** Abbreviation as written in reports. */
  abreviation: string
  nom: string
  famille: Famille
  /** Total number of carbons in the molecule. */
  carbones: number
  /** Perfluorinated carbons (Buck et al., 2011, chain-length criterion). */
  perfluores: number
  cas: string
  formule: Partial<Record<Atome, number>>
  /** Part of the 20 of the directive. */
  somme20: boolean
  /** Long chain in the sense of Buck et al. (2011); TFA and 6:2 FTS: no. */
  longue: boolean
  /** Extra abbreviations met in lab reports (compact, lower case). */
  variantes: string[]
}

type Atome = 'C' | 'H' | 'F' | 'O' | 'S'

/** IUPAC standard atomic weights (conventional values). */
const MASSES: Record<Atome, number> = { C: 12.011, H: 1.008, F: 18.998, O: 15.999, S: 32.06 }

const PREFIXES = ['but', 'pent', 'hex', 'hept', 'oct', 'non', 'déc', 'undéc', 'dodéc', 'tridéc']

const PFCA: [IdSubstance, string, string[]][] = [
  ['PFBA', '375-22-4', ['pfbua']],
  ['PFPeA', '2706-90-3', []],
  ['PFHxA', '307-24-4', []],
  ['PFHpA', '375-85-9', []],
  ['PFOA', '335-67-1', []],
  ['PFNA', '375-95-1', []],
  ['PFDA', '335-76-2', ['pfdea']],
  ['PFUnDA', '2058-94-8', ['pfuna', 'pfuda', 'pfunda']],
  ['PFDoDA', '307-55-1', ['pfdoa']],
  ['PFTrDA', '72629-94-8', ['pftria', 'pftrida', 'pftra']],
]
const PFSA: [IdSubstance, string, string[]][] = [
  ['PFBS', '375-73-5', []],
  ['PFPeS', '2706-91-4', []],
  ['PFHxS', '355-46-4', []],
  ['PFHpS', '375-92-8', []],
  ['PFOS', '1763-23-1', []],
  ['PFNS', '68259-12-1', []],
  ['PFDS', '335-77-3', []],
  ['PFUnDS', '749786-16-1', ['pfuns', 'pfuds']],
  ['PFDoDS', '79780-39-5', ['pfdos']],
  ['PFTrDS', '791563-89-8', ['pftrs', 'pftrids']],
]

export const SUBSTANCES: Substance[] = [
  ...PFCA.map(([id, cas, variantes], i): Substance => {
    const n = i + 4
    return {
      id,
      abreviation: id,
      nom: `Acide perfluoro${PREFIXES[i]}anoïque`,
      famille: 'PFCA',
      carbones: n,
      perfluores: n - 1,
      cas,
      formule: { C: n, H: 1, F: 2 * n - 1, O: 2 },
      somme20: true,
      longue: n - 1 >= 7,
      variantes,
    }
  }),
  ...PFSA.map(([id, cas, variantes], i): Substance => {
    const n = i + 4
    return {
      id,
      abreviation: id,
      nom: `Acide perfluoro${PREFIXES[i]}anesulfonique`,
      famille: 'PFSA',
      carbones: n,
      perfluores: n,
      cas,
      formule: { C: n, H: 1, F: 2 * n + 1, O: 3, S: 1 },
      somme20: true,
      longue: n >= 6,
      variantes,
    }
  }),
  {
    id: 'FTS62',
    abreviation: '6:2 FTS',
    nom: 'Acide 6:2 fluorotélomère sulfonique (1H,1H,2H,2H-perfluorooctanesulfonique)',
    famille: 'FTS',
    carbones: 8,
    perfluores: 6,
    cas: '27619-97-2',
    formule: { C: 8, H: 5, F: 13, O: 3, S: 1 },
    somme20: false,
    longue: false,
    variantes: [],
  },
  {
    id: 'TFA',
    abreviation: 'TFA',
    nom: 'Acide trifluoroacétique',
    famille: 'TFA',
    carbones: 2,
    perfluores: 1,
    cas: '76-05-1',
    formule: { C: 2, H: 1, F: 3, O: 2 },
    somme20: false,
    longue: false,
    variantes: [],
  },
]

export const PAR_ID = Object.fromEntries(SUBSTANCES.map((s) => [s.id, s])) as Record<IdSubstance, Substance>
export const VINGT = SUBSTANCES.filter((s) => s.somme20)

export function masseMolaire(s: Substance): number {
  return (Object.entries(s.formule) as [Atome, number][]).reduce((m, [a, n]) => m + MASSES[a] * n, 0)
}

/** Mass fraction of fluorine: a concentration × this = fluorine it carries. */
export function fractionFluor(s: Substance): number {
  return ((s.formule.F ?? 0) * MASSES.F) / masseMolaire(s)
}

export function formuleTexte(s: Substance): string {
  return (['C', 'H', 'F', 'O', 'S'] as Atome[])
    .filter((a) => s.formule[a])
    .map((a) => `${a}${s.formule[a]! > 1 ? s.formule[a] : ''}`)
    .join('')
}

export type Groupe = 'PFCA courtes' | 'PFCA longues' | 'PFSA courtes' | 'PFSA longues' | '6:2 FTS'

export function groupe(s: Substance): Groupe | null {
  if (s.famille === 'FTS') return '6:2 FTS'
  if (s.famille === 'TFA') return null
  return `${s.famille} ${s.longue ? 'longues' : 'courtes'}` as Groupe
}

export const GROUPES: { groupe: Groupe; couleur: string; detail: string }[] = [
  { groupe: 'PFCA courtes', couleur: '#6da7ec', detail: 'PFBA à PFHpA (C4–C7)' },
  { groupe: 'PFCA longues', couleur: '#1c5cab', detail: 'PFOA à PFTrDA (C8–C13)' },
  { groupe: 'PFSA courtes', couleur: '#f0955f', detail: 'PFBS, PFPeS (C4–C5)' },
  { groupe: 'PFSA longues', couleur: '#b4471a', detail: 'PFHxS à PFTrDS (C6–C13)' },
  { groupe: '6:2 FTS', couleur: '#6250d6', detail: 'Précurseur fluorotélomère' },
]
export const COULEUR_TFA = '#1baf7a'

export function couleur(s: Substance): string {
  const g = groupe(s)
  return g ? GROUPES.find((x) => x.groupe === g)!.couleur : COULEUR_TFA
}
