/**
 * Behaviour of a groundwater pollutant in the subsurface, after the BRGM
 * guides:
 *
 * - D. Hubé et al., « Guide polluants et comportement des polluants dans
 *   le milieu souterrain », BRGM/RP-74064-FR, version 3 du 2 décembre 2024
 *   (approuvé le 10 février 2025): properties of each compound — tableau 9
 *   (BTEX, p. 132) and tableau 13 (COHV, p. 148), values the guide takes
 *   from ECHA; phases (chapitre 4); the rule that COHV concentrations at
 *   1 to 10 % of their solubility generally betray an organic phase nearby
 *   (§ 10.6.5, p. 152);
 * - B. Lemière et al., « Guide sur le comportement des polluants dans les
 *   sols et les nappes », Documents du BRGM 300, nouvelle édition 2008
 *   (BRGM/RP-50662-FR): properties by behaviour family — density against
 *   water (LNAPL < 1 < DNAPL), log Koc, stability (§ 2.2, tableaux
 *   p. 29–30).
 *
 * A compound is found by its CAS number, else by its name, else by the
 * family the laboratory gives it. Pure data and lookups.
 */

/** Behaviour families of the 2008 guide (tableaux p. 29–30), and the metals of the 2024 one (chapitre 7). */
export type Famille = 'cohv' | 'btex' | 'hydrocarbures' | 'hap' | 'metaux' | 'pfas' | 'autre'

/** Where the pure phase goes: below the water (DNAPL), on it (LNAPL), or no phase of its own in the aquifer. */
export type Phase = 'dnapl' | 'lnapl' | 'dissous'

export interface ProprietesFamille {
  libelle: string
  phase: Phase
  /** log Koc range of the family (L/kg), null when the guide gives none. */
  logKoc: [number, number] | null
  /** Stability and biodegradation, as the guide puts it. */
  stabilite: string
  source: string
}

const GUIDE_2008 = 'Lemière et al. (2008), Documents du BRGM 300, § 2.2, tableaux p. 29–30'
const GUIDE_2024 = 'Hubé et al. (2024), BRGM/RP-74064-FR'

export const FAMILLES: Record<Famille, ProprietesFamille> = {
  cohv: {
    libelle: 'Composés organohalogénés volatils (COHV), aliphatiques halogénés',
    phase: 'dnapl',
    logKoc: [1.5, 2.5],
    stabilite: 'très stables, difficilement biodégradables ; déchloration réductrice en conditions anaérobies (PCE → TCE → DCE → chlorure de vinyle)',
    source: `${GUIDE_2008} ; ${GUIDE_2024}, § 10.6`,
  },
  btex: {
    libelle: 'Composés aromatiques monocycliques (BTEX)',
    phase: 'lnapl',
    logKoc: [1.5, 2.5],
    stabilite: 'généralement biodégradables',
    source: `${GUIDE_2008} ; ${GUIDE_2024}, § 10.3`,
  },
  hydrocarbures: {
    libelle: 'Hydrocarbures pétroliers aliphatiques',
    phase: 'lnapl',
    logKoc: null,
    stabilite: 'difficilement biodégradables sous C9, facilement au-delà',
    source: `${GUIDE_2008} ; ${GUIDE_2024}, § 10.2`,
  },
  hap: {
    libelle: 'Hydrocarbures aromatiques polycycliques (HAP)',
    phase: 'dnapl',
    logKoc: [3, 6],
    stabilite: 'généralement difficilement biodégradables ; phases denses avec les goudrons et créosotes',
    source: `${GUIDE_2008} ; ${GUIDE_2024}, § 10.11`,
  },
  metaux: {
    libelle: 'Éléments traces métalliques et métalloïdes',
    phase: 'dissous',
    logKoc: null,
    stabilite: 'non dégradables ; mobilité réglée par le pH, le potentiel redox, l’adsorption et la précipitation',
    source: `${GUIDE_2024}, chapitre 7`,
  },
  pfas: {
    libelle: 'Substances per- et polyfluoroalkylées (PFAS)',
    phase: 'dissous',
    logKoc: null,
    stabilite: 'très persistantes',
    source: `${GUIDE_2024}, § 10.10`,
  },
  autre: {
    libelle: 'Famille non reconnue',
    phase: 'dissous',
    logKoc: null,
    stabilite: '',
    source: '',
  },
}

export interface Substance {
  cas: string
  nom: string
  famille: Famille
  /** Density of the pure compound at 20 °C (g/cm³). */
  densite: number | null
  /** Solubility in water at 20 °C (mg/l), as a range when the guide gives one. */
  solubilite: [number, number] | null
  logKow: [number, number] | null
  /** Henry's constant at 20 °C: dimensionless (COHV) or in Pa·m³/mol (BTEX), as the guide gives it. */
  henry: { valeur: number; unite: '-' | 'Pa·m³/mol' } | null
  /** Boiling point (°C): a compound boiling below 20 °C forms no liquid phase. */
  ebullition: number | null
  source: string
  /** Values of the guide that other references contradict: shown beside them, the guide's kept for the calculations. */
  douteux?: { champ: 'densite' | 'solubilite'; autre: string; source: string }[]
}

const T13 = `${GUIDE_2024}, tableau 13 (p. 148)`
const T9 = `${GUIDE_2024}, tableau 9 (p. 132)`

const cohv = (cas: string, nom: string, sol: [number, number], densite: number | null, logKow: number, henry: number | null, ebullition: number | null): Substance => ({
  cas,
  nom,
  famille: 'cohv',
  densite,
  solubilite: sol,
  logKow: [logKow, logKow],
  henry: henry === null ? null : { valeur: henry, unite: '-' },
  ebullition,
  source: T13,
})

/** The compounds of the BRGM tables, by CAS number. */
export const SUBSTANCES: Substance[] = [
  // Tableau 13: chloromethanes, chloroethanes, chloroethenes (solubility mg/l, density g/cm³, log Kow, Henry, boiling point).
  cohv('75-09-2', 'Dichlorométhane', [19400, 19400], 1.33, 1.25, 0.07, 40.1),
  cohv('67-66-3', 'Chloroforme', [7900, 7900], 1.48, 1.95, 0.1, 61),
  cohv('56-23-5', 'Tétrachlorure de carbone', [1160, 1160], 1.46, 2.6, 0.81, 76),
  cohv('71-55-6', '1,1,1-Trichloroéthane', [720, 720], 1.34, 2.46, 0.5, 73.8),
  cohv('75-34-3', '1,1-Dichloroéthane', [5100, 5100], 1.18, 1.79, 0.16, 57),
  cohv('79-00-5', '1,1,2-Trichloroéthane', [4590, 4590], 1.44, 1.89, 0.032, 113.8),
  cohv('79-34-5', '1,1,2,2-Tétrachloroéthane', [2830, 2830], 1.596, 2.66, 0.014, 146.5),
  cohv('107-06-2', '1,2-Dichloroéthane', [8700, 8700], 1.24, 1.48, 0.06, 83.6),
  cohv('75-00-3', 'Chloroéthane', [6710, 6710], 0.92, 1.43, null, 12.3),
  cohv('78-87-5', '1,2-Dichloropropane', [2700, 2700], 1.156, 2.25, 0.09, 96.4),
  cohv('127-18-4', 'Tétrachloroéthylène', [100, 200], 1.62, 2.6, 0.48, 121.2),
  cohv('79-01-6', 'Trichloroéthylène', [1000, 1100], 1.27, 2.3, 0.28, 86.7),
  cohv('156-59-2', 'cis-1,2-Dichloroéthylène', [800, 800], 1.28, 1.86, 0.138, 60.3),
  cohv('156-60-5', 'trans-1,2-Dichloroéthylène', [600, 600], 1.27, 2.09, 0.138, 47.5),
  cohv('75-35-4', '1,1-Dichloroéthylène', [2500, 2500], 1.223, 2.13, 0.186, 31.7),
  cohv('75-01-4', 'Chlorure de vinyle', [1100, 9500], 0.91, 1.4, 0.71, -13.4),
  // Second part of tableau 13 (bromoforms): solubility, log Kow, then density.
  cohv('75-25-2', 'Bromoforme', [1100, 1100], 2.9, 2.4, null, 149.5),
  // Tableau 9: BTEX (solubility mg/l, log Pow, density g/cm³, Henry Pa·m³/mol, boiling point).
  { cas: '71-43-2', nom: 'Benzène', famille: 'btex', densite: 0.879, solubilite: [1770, 1780], logKow: [1.8, 2.1], henry: { valeur: 557, unite: 'Pa·m³/mol' }, ebullition: 80, source: T9 },
  { cas: '108-88-3', nom: 'Toluène', famille: 'btex', densite: 0.872, solubilite: [530, 530], logKow: [2.39, 2.39], henry: { valeur: 668, unite: 'Pa·m³/mol' }, ebullition: 110.8, source: T9 },
  { cas: '100-41-4', nom: 'Éthylbenzène', famille: 'btex', densite: 0.867, solubilite: [866, 866], logKow: [3.15, 3.15], henry: { valeur: 881, unite: 'Pa·m³/mol' }, ebullition: 136.2, source: T9 },
  { cas: '1330-20-7', nom: 'Xylènes', famille: 'btex', densite: 0.86, solubilite: [175, 198], logKow: [3.13, 3.2], henry: { valeur: 366, unite: 'Pa·m³/mol' }, ebullition: 138, source: `${T9}, o-, m- et p-xylènes (densité 0,86 à 0,88, Henry 366 à 512)` },
]

const CRC = 'tables de constantes physiques des composés organiques (CRC Handbook of Chemistry and Physics)'
const DOUTEUX: Record<string, Substance['douteux']> = {
  '79-01-6': [{ champ: 'densite', autre: '1,46 g/cm³ à 20 °C', source: CRC }],
  '56-23-5': [{ champ: 'densite', autre: '1,59 g/cm³ à 20 °C', source: CRC }],
  '100-41-4': [{ champ: 'solubilite', autre: '150 mg/l (éthylbenzène et xylènes)', source: GUIDE_2008 }],
  '156-59-2': [
    {
      champ: 'solubilite',
      autre: '3 500 mg/l à 25 °C (National Research Council, Drinking Water and Health, 1977) ; 6 410 mg/l à 25 °C (ATSDR, profil du 1,2-dichloroéthène, 2025)',
      source: 'sources divergentes, la température comptant beaucoup',
    },
  ],
  '156-60-5': [
    {
      champ: 'solubilite',
      autre: '6 300 mg/l à 25 °C (National Research Council, Drinking Water and Health, 1977) ; 4 520 mg/l à 25 °C (ATSDR, profil du 1,2-dichloroéthène, 2025)',
      source: 'sources divergentes, la température comptant beaucoup',
    },
  ],
}
for (const s of SUBSTANCES) if (DOUTEUX[s.cas]) s.douteux = DOUTEUX[s.cas]

const PAR_CAS = new Map<string, Substance>()
for (const s of SUBSTANCES) PAR_CAS.set(s.cas, s)
// Isomers of the xylenes, given separately by some laboratories.
for (const cas of ['95-47-6', '108-38-3', '106-42-3', '179601-23-1']) PAR_CAS.set(cas, PAR_CAS.get('1330-20-7')!)

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Family of a compound from its name or the laboratory's family, when its CAS number is not in the tables. */
export function familleDe(nom: string, familleLabo = ''): Famille {
  const n = sansAccents(nom)
  const f = sansAccents(familleLabo)
  if (/perfluoro|polyfluoro|\bpfos\b|\bpfoa\b|\bpfas\b|fluorotelom|\bfts\b/.test(n) || /pfas|perfluor/.test(f)) return 'pfas'
  // Salts (chlorides, chlorates…) are no solvents.
  if (/^(chlorures?|bromures?|fluorures?|chlorates?|perchlorates?)\b/.test(n) && !/vinyle|methylene/.test(n)) return 'autre'
  if (/chlor|brom|fluorotrichlor|\bfreon/.test(n) && !/benz|phenol|biphen/.test(n)) return 'cohv'
  if (/^(benzene|toluene|ethylbenzene|xylene|m\+p-xylene|o-xylene|btex)/.test(n) || /btex|aromatiques? monocycl/.test(f)) return 'btex'
  if (/naphtal|anthrac|phenanthr|fluoren|fluoranth|pyrene|chrysene|benzo|acenaphth|indeno|\bhap\b/.test(n) || /\bhap\b|polycycl/.test(f)) return 'hap'
  if (/hydrocarbure|c10|c40|c5-c10|\bhct\b|\btph\b|indice hydrocarbure/.test(n) || /hydrocarbure|hct/.test(f)) return 'hydrocarbures'
  if (/^(arsenic|nickel|plomb|chrome|cadmium|cuivre|zinc|mercure|antimoine|selenium|baryum|molybdene|cobalt|vanadium|thallium|uranium|etain|aluminium|fer|manganese)\b/.test(n) || /metaux|metal|elements? trace/.test(f)) return 'metaux'
  if (/cohv|organohalog|halogen|solvant/.test(f)) return 'cohv'
  return 'autre'
}

export interface Comportement {
  /** The compound in the BRGM tables, when it is there. */
  substance: Substance | null
  famille: Famille
  /** Phase of the pure compound against water (a compound boiling below 20 °C forms none). */
  phase: Phase
  /** log Koc range used for the retardation: the family's (2008 guide). */
  logKoc: [number, number] | null
  sources: string[]
}

/** What the BRGM guides say of a compound of the monitoring. */
export function comportement(c: { cas: string; nom: string; famille: string }): Comportement {
  const substance = PAR_CAS.get(c.cas.trim()) ?? SUBSTANCES.find((s) => sansAccents(s.nom) === sansAccents(c.nom)) ?? null
  const famille = substance?.famille ?? familleDe(c.nom, c.famille)
  const f = FAMILLES[famille]
  let phase = f.phase
  // A density read in the table decides between the two non-aqueous phases; a gas at 20 °C forms neither.
  if (substance?.densite != null && phase !== 'dissous') phase = substance.densite > 1 ? 'dnapl' : 'lnapl'
  if (substance?.ebullition != null && substance.ebullition < 20) phase = 'dissous'
  return { substance, famille, phase, logKoc: f.logKoc, sources: [...new Set([substance?.source, f.source].filter((s): s is string => !!s))] }
}

/**
 * Share of the solubility a concentration reaches (µg/l against mg/l), for
 * the COHV: from 1 %, an organic phase is generally present nearby
 * (RP-74064-FR, § 10.6.5). Null for other families or without a
 * solubility; the lowest solubility of the range is taken.
 */
export function partSolubilite(concentrationMicrogrammesParLitre: number, c: Comportement): number | null {
  if (c.famille !== 'cohv' || !c.substance?.solubilite) return null
  return concentrationMicrogrammesParLitre / 1000 / c.substance.solubilite[0]
}

export const LIBELLES_PHASE: Record<Phase, string> = {
  dnapl: 'plus dense que l’eau (DNAPL) : la phase pure plonge jusqu’au premier niveau peu perméable, le panache dissous se tient souvent à la base de l’aquifère',
  lnapl: 'plus légère que l’eau (LNAPL) : la phase pure flotte sur la nappe, dans la zone de battement',
  dissous: 'pas de phase pure propre dans l’aquifère : transport à l’état dissous',
}
