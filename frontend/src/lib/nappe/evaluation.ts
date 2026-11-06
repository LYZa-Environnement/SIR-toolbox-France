/**
 * Groundwater conditions, well by well.
 *
 * 1. Screening for reductive dechlorination — USEPA (1998), Technical
 *    Protocol for Evaluating Natural Attenuation of Chlorinated Solvents in
 *    Ground Water, EPA/600/R-98/128, table 2.3 (points) and table 2.4
 *    (interpretation), the screening sheet BIOCHLOR also carries. The ORP
 *    is the one measured against the Ag/AgCl electrode, as the protocol
 *    asks (not Eh). Daughter products score only when they are not part of
 *    the released product (footnote a/): the user says so per compound, or
 *    the automatic rule applies (parent quantified on site; cis-DCE above
 *    80 % of total DCE, as the table states).
 *    A criterion with no data scores nothing and is reported as such, with
 *    the points it could have brought: the score is then a lower bound.
 *
 * 2. Predominant redox process — McMahon & Chapelle (2008), Ground Water
 *    46(2), as implemented in the USGS workbook (Jurgens et al., 2009, OFR
 *    2009-1004): O2 0.5, NO3-N 0.5, Mn 0.05, Fe 0.1, SO4 0.5 mg/l, and the
 *    Fe(II)/H2S mass ratio (Chapelle et al., 2009, Ground Water 47(2)):
 *    > 10 iron reduction, < 0.3 sulfate reduction.
 *
 * 3. Field data checks: oxygen saturation (APHA 4500-O equation), oxygen
 *    against redox, stabilisation of the purge, notes of the sheet.
 */

import type { Ouvrage } from './donnees.ts'
import { PAR_ID, PARAMS, type ParamId, type Valeur } from './parametres.ts'

export type Statut = 'auto' | 'filiation' | 'rejete'
export type Compose = 'tce' | 'dce' | 'cv' | 'dca' | 'ca' | 'cf' | 'dcm'

export const COMPOSES_FILIATION: { id: Compose; libelle: string; regle: string }[] = [
  { id: 'tce', libelle: 'TCE', regle: 'produit de dégradation si du PCE est quantifié sur le site' },
  { id: 'dce', libelle: 'DCE', regle: "produit de dégradation si le cis-DCE dépasse 80 % du DCE total de l'ouvrage" },
  { id: 'cv', libelle: 'Chlorure de vinyle', regle: 'produit de dégradation si du PCE, du TCE ou du DCE est quantifié sur le site' },
  { id: 'dca', libelle: 'Dichloroéthanes', regle: 'produit de dégradation du TCA (barème sans réserve)' },
  { id: 'ca', libelle: 'Chloroéthane', regle: 'produit de dégradation du DCA ou du CV (barème sans réserve)' },
  { id: 'cf', libelle: 'Chloroforme', regle: 'produit de dégradation si du tétrachlorure de carbone est quantifié sur le site' },
  { id: 'dcm', libelle: 'Dichlorométhane', regle: 'produit de dégradation si du chloroforme ou du tétrachlorure de carbone est quantifié sur le site' },
]

export interface Options {
  /** mV added to the measured redox (Ag/AgCl) to give Eh (hydrogen electrode). */
  decalage: number
  /** Background wells (upgradient, outside the plume), by key. */
  fond: string[]
  statuts: Record<Compose, Statut>
}

export const STATUTS_DEFAUT: Record<Compose, Statut> = { tce: 'auto', dce: 'auto', cv: 'auto', dca: 'auto', ca: 'auto', cf: 'auto', dcm: 'auto' }

export interface Critere {
  id: string
  analyse: string
  requis: boolean
  /** Criterion as stated in the protocol. */
  critere: string
  valeur: string
  /** null: not evaluated (no data, or LQ above the threshold). */
  points: number | null
  /** Best score the criterion can bring, for the missing-data bound. */
  max: number
  interpretation: string
  note?: string
}

export type Classe = 'insuffisante' | 'limitee' | 'suffisante' | 'forte'

export const LIBELLES_CLASSE: Record<Classe, string> = {
  insuffisante: 'Preuves insuffisantes',
  limitee: 'Preuves limitées',
  suffisante: 'Preuves suffisantes',
  forte: 'Preuves fortes',
}

export const BAREME_CLASSES: { classe: Classe; bornes: string; texte: string }[] = [
  { classe: 'insuffisante', bornes: '0 à 5', texte: 'Preuves insuffisantes de biodégradation anaérobie (déchloration réductrice) des composés chlorés' },
  { classe: 'limitee', bornes: '6 à 14', texte: 'Preuves limitées de biodégradation anaérobie (déchloration réductrice) des composés chlorés' },
  { classe: 'suffisante', bornes: '15 à 20', texte: 'Preuves suffisantes de biodégradation anaérobie (déchloration réductrice) des composés chlorés' },
  { classe: 'forte', bornes: '> 20', texte: 'Preuves fortes de biodégradation anaérobie (déchloration réductrice) des composés chlorés' },
]

export function classer(score: number): Classe {
  if (score > 20) return 'forte'
  if (score >= 15) return 'suffisante'
  if (score >= 6) return 'limitee'
  return 'insuffisante'
}

export interface Score {
  total: number
  /** Points the criteria without data could still bring. */
  potentiel: number
  /** Best total reachable with the criteria evaluated. */
  accessible: number
  /** Nitrate, Fe²⁺, sulfate and methane all available: the total can be read against table 2.4. */
  complet: boolean
  /** Key geochemical analyses missing (nitrate, Fe²⁺, sulfate, methane). */
  geochimieManquante: string[]
  classe: Classe
  /** Class if every missing criterion scored its best. */
  classeMax: Classe
  criteres: Critere[]
  requisManquants: string[]
}

export interface Redox {
  /** Redox category of the USGS workbook (oxic, suboxic, anoxic, mixed). */
  categorie: string
  /** Predominant process. */
  processus: string
  /** Short explanation. */
  detail: string
  /** Missing data that keep the classification partial. */
  manquants: string[]
}

export type Niveau = 'alerte' | 'vigilance' | 'info'
export interface Alerte {
  niveau: Niveau
  texte: string
}

export interface Evaluation {
  ouvrage: Ouvrage
  eh: number | null
  saturationO2: number | null
  redox: Redox
  score: Score
  /** Fate of vinyl chloride as the protocol reads the indicators. */
  devenirCV: string[]
  alertes: Alerte[]
  /** Chlorinated ethenes, ethanes and methanes quantified, µmol/l. */
  cohvMolaire: number
  lecture: LectureSimplifiee
}

export type Favorabilite = 'favorable' | 'possible' | 'limite' | 'defavorable' | 'indetermine'

export const LIBELLES_FAVORABILITE: Record<Favorabilite, string> = {
  favorable: 'Favorables',
  possible: 'Possibles',
  limite: 'Peu favorables',
  defavorable: 'Défavorables',
  indetermine: 'Non déterminées',
}

/**
 * The reading that holds with the usual data — field parameters and
 * chlorinated solvents, sometimes BTEX and petroleum hydrocarbons — when
 * nitrate, iron, sulfate and methane are not analysed: a set of clues, not
 * a score, with what it cannot tell.
 */
export interface LectureSimplifiee {
  /** Conditions for reductive dechlorination, from oxygen and redox. */
  conditions: Favorabilite
  motifConditions: string
  /** Signs that dechlorination has taken place (daughter products). */
  indices: string[]
  /** Electron donors seen (BTEX, hydrocarbons, organic carbon). */
  carbone: string[]
  conclusion: string
  limites: string[]
  /** Analyses that would lift the limits, cheapest first. */
  analysesUtiles: string[]
}

// ---- Helpers ---------------------------------------------------------------------------

const fr = (x: number, d = 2) => Number(x.toPrecision(3)).toLocaleString('fr-FR', { maximumFractionDigits: d })
const ecrireValeur = (v: Valeur | undefined, unite?: string) => (v ? `${v.inferieur ? '<' : ''}${fr(v.valeur, 3)}${unite ? ` ${unite}` : ''}` : 'non analysé')

/** true / false, or null when a value below the LQ cannot tell (LQ above the threshold). */
function inferieurA(v: Valeur, seuil: number): boolean | null {
  if (v.inferieur) return v.valeur <= seuil ? true : null
  return v.valeur < seuil
}
function superieurA(v: Valeur, seuil: number): boolean {
  return !v.inferieur && v.valeur > seuil
}
const quantifie = (v: Valeur | undefined): v is Valeur => !!v && !v.inferieur && v.valeur > 0

function mediane(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Oxygen solubility in fresh water at 1 atm, mg/l (APHA 4500-O, Benson & Krause). */
export function solubiliteO2(t: number): number {
  const T = t + 273.15
  return Math.exp(-139.34411 + 1.575701e5 / T - 6.642308e7 / T ** 2 + 1.2438e10 / T ** 3 - 8.621949e11 / T ** 4)
}

type Table = Partial<Record<ParamId, Valeur>>

// ---- Screening (USEPA 1998, table 2.3) ------------------------------------------------

export interface Site {
  /** Parameters quantified in at least one well. */
  quantifies: Set<ParamId>
  /** Background medians, by parameter. */
  fond: Partial<Record<ParamId, number>>
  fondOuvrages: string[]
}

export function lireSite(valeurs: Record<string, Table>, fond: string[]): Site {
  const quantifies = new Set<ParamId>()
  for (const t of Object.values(valeurs)) for (const [id, v] of Object.entries(t) as [ParamId, Valeur][]) if (quantifie(v)) quantifies.add(id)
  const med: Site['fond'] = {}
  for (const id of ['chlorure', 'alcalinite', 'co2'] as ParamId[]) {
    const m = mediane(fond.map((c) => valeurs[c]?.[id]).filter((v): v is Valeur => !!v).map((v) => v.valeur))
    if (m !== null) med[id] = m
  }
  return { quantifies, fond: med, fondOuvrages: fond }
}

function filiation(c: Compose, statut: Statut, t: Table, site: Site): { oui: boolean; pourquoi: string } {
  if (statut === 'filiation') return { oui: true, pourquoi: 'déclaré produit de dégradation' }
  if (statut === 'rejete') return { oui: false, pourquoi: 'déclaré présent dans le produit rejeté' }
  const q = (...ids: ParamId[]) => ids.some((id) => site.quantifies.has(id))
  switch (c) {
    case 'tce':
      return q('pce') ? { oui: true, pourquoi: 'PCE quantifié sur le site' } : { oui: false, pourquoi: 'pas de PCE quantifié sur le site : TCE réputé rejeté' }
    case 'dce': {
      const cis = quantifie(t.cisdce) ? t.cisdce.valeur : 0
      const total = cis + (quantifie(t.transdce) ? t.transdce.valeur : 0) + (quantifie(t.dce11) ? t.dce11.valeur : 0)
      if (!total) return { oui: false, pourquoi: 'DCE non quantifié' }
      const part = cis / total
      return part > 0.8
        ? { oui: true, pourquoi: `cis-DCE = ${fr(part * 100, 0)} % du DCE total (> 80 %)` }
        : { oui: false, pourquoi: `cis-DCE = ${fr(part * 100, 0)} % du DCE total (≤ 80 %) : filiation non établie` }
    }
    case 'cv':
      return q('pce', 'tce', 'cisdce', 'transdce', 'dce11')
        ? { oui: true, pourquoi: 'chloroéthènes parents quantifiés sur le site' }
        : { oui: false, pourquoi: 'aucun chloroéthène parent quantifié sur le site' }
    case 'dca':
    case 'ca':
      return { oui: true, pourquoi: 'produit de dégradation (barème USEPA)' }
    case 'cf':
      return q('ct') ? { oui: true, pourquoi: 'tétrachlorure de carbone quantifié sur le site' } : { oui: false, pourquoi: 'pas de tétrachlorure de carbone quantifié : chloroforme réputé rejeté' }
    case 'dcm':
      return q('ct', 'cf')
        ? { oui: true, pourquoi: 'chloroforme ou tétrachlorure de carbone quantifié sur le site' }
        : { oui: false, pourquoi: 'pas de parent quantifié : dichlorométhane réputé rejeté' }
  }
}

/** Without these, the total is not read against table 2.4: the redox process stays unknown. */
const GEOCHIMIE: [ParamId, string][] = [
  ['nitrate', 'nitrates'],
  ['fe2', 'fer ferreux'],
  ['sulfate', 'sulfates'],
  ['methane', 'méthane'],
]

export function scorer(t: Table, site: Site, opts: Options): Score {
  const criteres: Critere[] = []
  const ajouter = (c: Critere) => criteres.push(c)

  // Thresholded parameter: points by the first satisfied rule.
  const seuils = (
    id: ParamId,
    analyse: string,
    regles: { test: (v: Valeur) => boolean | null; points: number; critere: string; interpretation: string }[],
    sinon: { points: number; interpretation: string },
    unite = PAR_ID.get(id)!.unite,
  ) => {
    const v = t[id]
    const max = Math.max(0, ...regles.map((r) => r.points), sinon.points)
    const critere = regles.map((r) => r.critere).join(' ; ')
    const base = { id, analyse, requis: !!PAR_ID.get(id)!.requis, critere, max, valeur: ecrireValeur(v, unite), note: v?.note }
    if (!v) return ajouter({ ...base, points: null, interpretation: 'Non analysé' })
    for (const r of regles) {
      const ok = r.test(v)
      if (ok === null) return ajouter({ ...base, points: null, interpretation: `LQ supérieure au seuil (${r.critere}) : non concluant` })
      if (ok) return ajouter({ ...base, points: r.points, interpretation: r.interpretation })
    }
    ajouter({ ...base, points: sinon.points, interpretation: sinon.interpretation })
  }

  seuils(
    'od',
    'Oxygène dissous',
    [
      { test: (v) => inferieurA(v, 0.5), points: 3, critere: '< 0,5 mg/l', interpretation: 'Toléré ; inhibe la voie réductrice à plus forte concentration' },
      { test: (v) => superieurA(v, 5), points: -3, critere: '> 5 mg/l', interpretation: 'Non toléré ; le CV peut toutefois être oxydé en aérobie' },
    ],
    { points: 0, interpretation: 'Entre 0,5 et 5 mg/l : défavorable à la voie réductrice' },
  )
  seuils(
    'nitrate',
    'Nitrates',
    [{ test: (v) => inferieurA(v, 1), points: 2, critere: '< 1 mg/l', interpretation: 'Pas de concurrence notable avec la voie réductrice' }],
    { points: 0, interpretation: 'À plus forte concentration, peut concurrencer la voie réductrice' },
  )
  seuils(
    'fe2',
    'Fer ferreux (Fe²⁺)',
    [{ test: (v) => superieurA(v, 1), points: 3, critere: '> 1 mg/l', interpretation: 'Voie réductrice possible ; le CV peut être oxydé en conditions ferri-réductrices' }],
    { points: 0, interpretation: '≤ 1 mg/l' },
  )
  seuils(
    'sulfate',
    'Sulfates',
    [{ test: (v) => inferieurA(v, 20), points: 2, critere: '< 20 mg/l', interpretation: 'Pas de concurrence notable avec la voie réductrice' }],
    { points: 0, interpretation: 'À plus forte concentration, peut concurrencer la voie réductrice (la déchloration reste souvent observée)' },
  )
  seuils(
    'sulfure',
    'Sulfures',
    [{ test: (v) => superieurA(v, 1), points: 3, critere: '> 1 mg/l', interpretation: 'Voie réductrice possible' }],
    { points: 0, interpretation: '≤ 1 mg/l' },
  )
  seuils(
    'methane',
    'Méthane',
    [{ test: (v) => superieurA(v, 0.5), points: 3, critere: '> 0,5 mg/l', interpretation: 'Produit réductif ultime ; le CV s’accumule' }],
    { points: 0, interpretation: '< 0,5 mg/l : le CV s’oxyde' },
  )
  seuils(
    'orp',
    'Potentiel redox (contre électrode Ag/AgCl)',
    [
      { test: (v) => v.valeur < -100, points: 2, critere: '< −100 mV', interpretation: 'Voie réductrice probable' },
      { test: (v) => v.valeur < 50, points: 1, critere: '< 50 mV', interpretation: 'Voie réductrice possible' },
    ],
    { points: 0, interpretation: '≥ 50 mV : milieu peu réducteur' },
  )
  seuils(
    'ph',
    'pH',
    [{ test: (v) => v.valeur > 5 && v.valeur < 9, points: 0, critere: '5 < pH < 9 (0 point) ; hors de cet intervalle −2', interpretation: 'Domaine optimal pour la voie réductrice' }],
    { points: -2, interpretation: 'Hors du domaine optimal pour la voie réductrice' },
    '',
  )
  seuils(
    'cot',
    'Carbone organique (COT)',
    [{ test: (v) => superieurA(v, 20), points: 2, critere: '> 20 mg/l', interpretation: "Source de carbone et d'énergie ; entretient la déchloration" }],
    { points: 0, interpretation: '≤ 20 mg/l' },
  )
  seuils(
    't',
    'Température',
    [{ test: (v) => v.valeur > 20, points: 1, critere: '> 20 °C', interpretation: 'Processus biochimiques accélérés' }],
    { points: 0, interpretation: '≤ 20 °C' },
  )

  // Against the background.
  const fond = (id: ParamId, analyse: string, points: number, interpretation: string) => {
    const v = t[id]
    const f = site.fond[id]
    const unite = PAR_ID.get(id)!.unite
    const base = { id, analyse, requis: !!PAR_ID.get(id)!.requis, critere: '> 2 × le fond', max: points, note: v?.note }
    if (!v) return ajouter({ ...base, valeur: 'non analysé', points: null, interpretation: 'Non analysé' })
    if (f === undefined || f <= 0)
      return ajouter({
        ...base,
        valeur: ecrireValeur(v, unite),
        points: null,
        interpretation: site.fondOuvrages.length ? "Valeur de fond non disponible dans les ouvrages de référence" : "Aucun ouvrage de fond (amont, hors panache) désigné",
      })
    const r = v.valeur / f
    const ok = !v.inferieur && r > 2
    ajouter({
      ...base,
      valeur: `${ecrireValeur(v, unite)} (${v.inferieur ? '< ' : ''}${fr(r)} × fond de ${fr(f)} ${unite})`,
      points: ok ? points : 0,
      interpretation: ok ? interpretation : '≤ 2 × le fond',
    })
  }
  fond('co2', 'Dioxyde de carbone', 1, 'Produit oxydatif ultime')
  fond('alcalinite', 'Alcalinité', 1, 'Interaction du CO₂ avec les minéraux de l’aquifère')
  fond('chlorure', 'Chlorures', 2, 'Produit de la déchloration du chlore organique')

  seuils(
    'h2',
    'Hydrogène dissous',
    [{ test: (v) => superieurA(v, 1), points: 3, critere: '> 1 nM', interpretation: 'Voie réductrice possible ; le CV peut s’accumuler' }],
    { points: 0, interpretation: '< 1 nM : le CV est oxydé' },
  )
  seuils(
    'agv',
    'Acides gras volatils',
    [{ test: (v) => superieurA(v, 0.1), points: 2, critere: '> 0,1 mg/l', interpretation: 'Intermédiaires de biodégradation ; source de carbone et d’énergie' }],
    { points: 0, interpretation: '≤ 0,1 mg/l' },
  )
  seuils(
    'btex',
    'BTEX',
    [{ test: (v) => superieurA(v, 100), points: 2, critere: '> 0,1 mg/l (100 µg/l)', interpretation: 'Source de carbone et d’énergie ; entretient la déchloration' }],
    { points: 0, interpretation: '≤ 0,1 mg/l' },
  )

  // Daughter products.
  const fille = (c: Compose, ids: ParamId[], analyse: string, critere: string, interpretation: string) => {
    const vs = ids.map((id) => t[id]).filter((v): v is Valeur => !!v)
    const requis = ids.some((id) => PAR_ID.get(id)!.requis)
    const q = vs.filter((v) => !v.inferieur && v.valeur > 0)
    const somme = q.reduce((s, v) => s + v.valeur, 0)
    const base = { id: c, analyse, requis, critere, max: 2 }
    if (!vs.length) return ajouter({ ...base, valeur: 'non analysé', points: null, interpretation: 'Non analysé' })
    const valeur = q.length ? `${fr(somme, 3)} µg/l` : `<LQ (${vs.map((v) => fr(v.valeur, 3)).join(' ; ')} µg/l)`
    if (!q.length) return ajouter({ ...base, valeur, points: 0, interpretation: 'Non quantifié' })
    const f = filiation(c, opts.statuts[c], t, site)
    ajouter({ ...base, valeur, points: f.oui ? 2 : 0, interpretation: f.oui ? interpretation : 'Composé rejeté (0 point)', note: f.pourquoi })
  }
  fille('tce', ['tce'], 'Trichloroéthylène', 'Produit de dégradation (a/)', 'Produit de dégradation du PCE')
  fille('dce', ['cisdce', 'transdce', 'dce11'], 'Dichloroéthylènes', 'Produit de dégradation (a/) ; cis > 80 % du DCE total', 'Produit de dégradation du TCE')
  fille('cv', ['cv'], 'Chlorure de vinyle', 'Produit de dégradation (a/)', 'Produit de dégradation du DCE')
  fille('dca', ['dca11', 'dca12'], 'Dichloroéthanes', 'Produit de dégradation', 'Produit de dégradation du TCA en conditions réductrices')
  fille('ca', ['ca'], 'Chloroéthane', 'Produit de dégradation', 'Produit de dégradation du DCA ou du CV en conditions réductrices')

  // Ethene / ethane.
  {
    const vs = [t.ethene, t.ethane].filter((v): v is Valeur => !!v)
    const base = { id: 'ethene', analyse: 'Éthène / éthane', requis: false, critere: '> 0,01 mg/l (2) ; > 0,1 mg/l (3)', max: 3 }
    if (!vs.length) ajouter({ ...base, valeur: 'non analysé', points: null, interpretation: 'Non analysé' })
    else {
      const s = vs.filter((v) => !v.inferieur).reduce((a, v) => a + v.valeur, 0)
      const points = s > 100 ? 3 : s > 10 ? 2 : 0
      ajouter({
        ...base,
        valeur: s ? `${fr(s, 3)} µg/l` : '<LQ',
        points,
        interpretation: points ? 'Produit de dégradation du CV / de l’éthène' : '≤ 0,01 mg/l',
      })
    }
  }
  fille('cf', ['cf'], 'Chloroforme', 'Produit de dégradation', 'Produit de dégradation du tétrachlorure de carbone')
  fille('dcm', ['dcm'], 'Dichlorométhane', 'Produit de dégradation', 'Produit de dégradation du chloroforme')

  const total = criteres.reduce((s, c) => s + (c.points ?? 0), 0)
  const potentiel = criteres.filter((c) => c.points === null).reduce((s, c) => s + c.max, 0)
  const accessible = criteres.filter((c) => c.points !== null).reduce((s, c) => s + c.max, 0)
  const requisManquants = criteres.filter((c) => c.requis && c.points === null && c.interpretation === 'Non analysé').map((c) => c.analyse)
  const geochimieManquante = GEOCHIMIE.filter(([id]) => !t[id]).map(([, l]) => l)
  return {
    total,
    potentiel,
    accessible,
    complet: !geochimieManquante.length,
    geochimieManquante,
    classe: classer(total),
    classeMax: classer(total + potentiel),
    criteres,
    requisManquants,
  }
}

// ---- Redox process (McMahon & Chapelle, 2008) ------------------------------------------

export function processusRedox(t: Table): Redox {
  const o2 = t.od
  const no3 = t.nitrate ? { ...t.nitrate, valeur: (t.nitrate.valeur * 14.007) / 62.004 } : undefined
  const mn = t.mn
  const fe = t.fe2
  const so4 = t.sulfate
  const manquants = [!o2 && 'O₂', !no3 && 'NO₃', !mn && 'Mn', !fe && 'Fe', !so4 && 'SO₄'].filter((x): x is string => !!x)
  const haut = (v: Valeur | undefined, s: number) => (v ? !v.inferieur && v.valeur >= s : null)

  const O = haut(o2, 0.5)
  if (O === null) return { categorie: 'Non déterminé', processus: '—', detail: "Oxygène dissous non mesuré", manquants }
  const N = haut(no3, 0.5)
  const M = haut(mn, 0.05)
  const F = haut(fe, 0.1)
  if (N === null || M === null || F === null) {
    return O
      ? { categorie: 'Oxique (terrain)', processus: 'O₂', detail: 'O₂ ≥ 0,5 mg/l ; Mn, Fe et NO₃ nécessaires pour exclure un mélange d’eaux', manquants }
      : {
          categorie: 'Anoxique (terrain)',
          processus: 'Non identifiable',
          detail: 'O₂ < 0,5 mg/l ; dénitrification, réduction du fer, sulfato-réduction ou méthanogenèse : NO₃, Mn, Fe et SO₄ nécessaires pour les distinguer',
          manquants,
        }
  }
  if (O) {
    if (!M && !F) return { categorie: 'Oxique', processus: 'O₂', detail: 'Réduction de l’oxygène', manquants }
    return {
      categorie: 'Mixte (oxique-anoxique)',
      processus: F ? 'O₂-Fe(III)/SO₄' : 'O₂-Mn(IV)',
      detail: `O₂ ≥ 0,5 mg/l avec ${F ? 'Fe ≥ 0,1' : 'Mn ≥ 0,05'} mg/l : mélange d’eaux ou hétérogénéité de l’ouvrage crépiné`,
      manquants,
    }
  }
  if (N) {
    if (!M && !F) return { categorie: 'Anoxique', processus: 'NO₃', detail: 'Dénitrification', manquants }
    return { categorie: 'Mixte (anoxique)', processus: F ? 'NO₃-Fe(III)/SO₄' : 'NO₃-Mn(IV)', detail: 'Nitrates présents avec Mn ou Fe dissous', manquants }
  }
  if (!F) {
    if (M) return { categorie: 'Anoxique', processus: 'Mn(IV)', detail: 'Réduction du manganèse', manquants }
    return { categorie: 'Suboxique', processus: 'Suboxique', detail: 'O₂ et NO₃ faibles, Mn et Fe non mobilisés', manquants }
  }
  // Iron mobilised: sulfate decides between Fe(III)/SO4 reduction and methanogenesis.
  const S = haut(so4, 0.5)
  if (S === null) return { categorie: 'Anoxique', processus: 'Fe(III)/SO₄ ou CH₄gen', detail: 'Sulfates non analysés', manquants }
  if (!S) return { categorie: 'Anoxique', processus: 'CH₄gen', detail: 'Méthanogenèse (sulfates épuisés)', manquants }
  const h2s = t.sulfure
  if (!h2s) return { categorie: 'Anoxique', processus: 'Fe(III)/SO₄', detail: 'Réduction du fer ou des sulfates (sulfures non analysés pour les départager)', manquants: [...manquants, 'H₂S'] }
  if (h2s.inferieur) {
    const r = fe!.valeur / h2s.valeur
    return r > 10
      ? { categorie: 'Anoxique', processus: 'Fe(III)', detail: `Fe/H₂S > ${fr(r)} (sulfures < LQ) : réduction du fer`, manquants }
      : { categorie: 'Anoxique', processus: 'Fe(III)/SO₄', detail: 'Sulfures < LQ mais LQ trop élevée pour départager', manquants }
  }
  const r = fe!.valeur / h2s.valeur
  if (r > 10) return { categorie: 'Anoxique', processus: 'Fe(III)', detail: `Fe/H₂S = ${fr(r)} (> 10) : réduction du fer`, manquants }
  if (r < 0.3) return { categorie: 'Anoxique', processus: 'SO₄', detail: `Fe/H₂S = ${fr(r)} (< 0,3) : sulfato-réduction`, manquants }
  return { categorie: 'Mixte (anoxique)', processus: 'Fe(III)-SO₄', detail: `Fe/H₂S = ${fr(r)} (entre 0,3 et 10) : réduction du fer et des sulfates`, manquants }
}

// ---- Vinyl chloride and checks ---------------------------------------------------------

function devenirCV(t: Table): string[] {
  const d: string[] = []
  if (t.od && superieurA(t.od, 5)) d.push('O₂ > 5 mg/l : déchloration réductrice non tolérée ; le CV peut être oxydé en aérobie')
  if (t.methane) {
    if (superieurA(t.methane, 0.5)) d.push('Méthane > 0,5 mg/l : conditions méthanogènes, le CV s’accumule')
    else d.push('Méthane < 0,5 mg/l : le CV s’oxyde')
  }
  if (t.h2) d.push(superieurA(t.h2, 1) ? 'H₂ > 1 nM : le CV peut s’accumuler' : 'H₂ < 1 nM : le CV est oxydé')
  if (t.fe2 && superieurA(t.fe2, 1) && !(t.methane && superieurA(t.methane, 0.5))) d.push('Fe²⁺ > 1 mg/l : le CV peut être oxydé en conditions ferri-réductrices')
  return d
}

const MOLAIRES: ParamId[] = PARAMS.filter((p) => p.groupe === 'cohv' && p.id !== 'ethene' && p.id !== 'ethane').map((p) => p.id)

export function evaluer(o: Ouvrage, t: Table, site: Site, opts: Options): Evaluation {
  const alertes: Alerte[] = []
  const eh = t.orp ? t.orp.valeur + opts.decalage : null
  const saturationO2 = t.od && t.t && !t.od.inferieur ? (t.od.valeur / solubiliteO2(t.t.valeur)) * 100 : null

  if (saturationO2 !== null && saturationO2 > 110) {
    alertes.push({ niveau: 'alerte', texte: `Oxygène dissous sursaturé (${fr(saturationO2, 0)} % de la saturation à ${fr(t.t!.valeur)} °C) : entrée d’air, bulles dans la cellule ou étalonnage de la sonde à vérifier` })
  }
  if (t.od && t.orp && !t.od.inferieur && t.od.valeur >= 1 && t.orp.valeur < -100) {
    alertes.push({ niveau: 'vigilance', texte: `O₂ = ${fr(t.od.valeur)} mg/l avec un redox de ${fr(t.orp.valeur)} mV : mesures incohérentes, aération probable de l’échantillon` })
  }
  if (t.od && t.orp && !t.od.inferieur && t.od.valeur === 0 && t.orp.valeur > 100) {
    alertes.push({
      niveau: 'vigilance',
      texte: `O₂ = 0 mg/l exactement avec un redox de +${fr(t.orp.valeur)} mV (Ag/AgCl) : milieu anoxique peu compatible avec ce potentiel, sonde à oxygène (zéro, membrane) à vérifier`,
    })
  }
  const f = o.fiche
  if (f) {
    const instables = (Object.entries(f.stabilite) as [string, string][]).filter(([, s]) => s === 'instable').map(([p]) => LIB_TERRAIN[p])
    if (instables.length) alertes.push({ niveau: 'vigilance', texte: `Stabilisation non atteinte en fin de purge (3 dernières mesures) : ${instables.join(', ')}` })
    const anterieures = (Object.entries(f.finale) as [string, { anterieure: boolean }][]).filter(([, v]) => v.anterieure).map(([p]) => LIB_TERRAIN[p])
    if (anterieures.length) alertes.push({ niveau: 'vigilance', texte: `Non mesuré(s) en fin de purge, dernière valeur relevée retenue : ${anterieures.join(', ')}` })
    if (/^non/i.test(f.calibration)) alertes.push({ niveau: 'alerte', texte: 'Calibration de la sonde non validée sur la fiche' })
    if (/^oui/i.test(f.derive)) alertes.push({ niveau: 'alerte', texte: 'Dérive de la sonde constatée sur la fiche' })
    if (/^oui/i.test(f.flottant)) alertes.push({ niveau: 'alerte', texte: 'Phase flottante signalée : concentrations dissoutes et paramètres non représentatifs de la nappe' })
    const odeurs = f.observations.filter((x) => /h2s|h₂s|soufr|oeuf|œuf|sulfur/i.test(x))
    if (odeurs.length) alertes.push({ niveau: 'info', texte: `Odeur de type H₂S notée (« ${odeurs[0]} ») : indice qualitatif de sulfato-réduction, à confirmer par l’analyse des sulfures` })
    const noir = f.observations.filter((x) => /noir/i.test(x))
    if (noir.length) alertes.push({ niveau: 'info', texte: 'Eau noire notée : sulfures de fer possibles (milieu sulfato-réducteur)' })
  }
  for (const p of ['fe2', 'od', 'ph', 'ce', 't'] as ParamId[]) {
    const note = t[p]?.note
    if (note && (p === 'fe2' || /laboratoire/.test(note))) alertes.push({ niveau: 'info', texte: `${PAR_ID.get(p)!.libelle} : ${note}` })
  }

  const cohvMolaire = MOLAIRES.reduce((s, id) => (quantifie(t[id]) ? s + t[id]!.valeur / PAR_ID.get(id)!.masseMolaire! : s), 0)
  const score = scorer(t, site, opts)
  return { ouvrage: o, eh, saturationO2, redox: processusRedox(t), score, devenirCV: devenirCV(t), alertes, cohvMolaire, lecture: lireSimplement(t, site) }
}

const LIB_TERRAIN: Record<string, string> = { ph: 'pH', orp: 'redox', od: 'oxygène dissous', ce: 'conductivité', t: 'température' }

// ---- Reading with field data and chlorinated solvents only -----------------------------

const molaire = (v: Valeur | undefined, id: ParamId) => (quantifie(v) ? v.valeur / PAR_ID.get(id)!.masseMolaire! : 0)

function conditions(t: Table): { niveau: Favorabilite; motif: string } {
  const od = t.od
  const orp = t.orp
  if (!od && !orp) return { niveau: 'indetermine', motif: 'Ni oxygène dissous ni redox mesurés' }
  const redox = orp ? `redox ${fr(orp.valeur)} mV (Ag/AgCl)` : 'redox non mesuré'
  if (od && superieurA(od, 5)) return { niveau: 'defavorable', motif: `O₂ = ${fr(od.valeur)} mg/l (> 5 mg/l) : la déchloration réductrice n’est pas tolérée (USEPA 1998)` }
  if (od && !(inferieurA(od, 0.5) ?? false)) {
    return { niveau: 'limite', motif: `O₂ = ${fr(od.valeur)} mg/l (entre 0,5 et 5 mg/l), ${redox} : oxygène résiduel, voie réductrice inhibée au droit de l’ouvrage` }
  }
  const anoxique = od ? `O₂ = ${od.inferieur ? '<' : ''}${fr(od.valeur)} mg/l (< 0,5 mg/l)` : 'O₂ non mesuré'
  if (!orp) return { niveau: 'possible', motif: `${anoxique}, redox non mesuré : milieu anoxique, degré de réduction inconnu` }
  if (orp.valeur < -100) return { niveau: od ? 'favorable' : 'possible', motif: `${anoxique}, ${redox} (< −100 mV) : voie réductrice probable` }
  if (orp.valeur < 50) return { niveau: 'possible', motif: `${anoxique}, ${redox} (< 50 mV) : voie réductrice possible` }
  return { niveau: 'limite', motif: `${anoxique}, ${redox} (≥ 50 mV) : milieu peu réducteur` }
}

function lireSimplement(t: Table, site: Site): LectureSimplifiee {
  const c = conditions(t)
  const indices: string[] = []
  const carbone: string[] = []

  // Daughter products.
  const pce = molaire(t.pce, 'pce')
  const tce = molaire(t.tce, 'tce')
  const dce = molaire(t.cisdce, 'cisdce') + molaire(t.transdce, 'transdce') + molaire(t.dce11, 'dce11')
  const cv = molaire(t.cv, 'cv')
  const eth = molaire(t.ethene, 'ethene') + molaire(t.ethane, 'ethane')
  const total = pce + tce + dce + cv + eth
  const pceSurSite = site.quantifies.has('pce')
  const filles = (pceSurSite ? tce : 0) + dce + cv + eth
  if (total > 0 && filles > 0) indices.push(`Produits de dégradation : ${fr((filles / total) * 100, 0)} % (molaire) des chloroéthènes${pceSurSite ? '' : ' hors TCE (pas de PCE sur le site, TCE réputé rejeté)'}`)
  const cis = quantifie(t.cisdce) ? t.cisdce.valeur : 0
  const dceMasse = cis + (quantifie(t.transdce) ? t.transdce.valeur : 0) + (quantifie(t.dce11) ? t.dce11.valeur : 0)
  if (dceMasse > 0) {
    const part = cis / dceMasse
    indices.push(
      part > 0.8
        ? `cis-DCE = ${fr(part * 100, 0)} % du DCE : signature d’une déchloration biologique (USEPA 1998)`
        : `cis-DCE = ${fr(part * 100, 0)} % du DCE seulement : DCE en partie d’origine industrielle ou abiotique possible`,
    )
  }
  if (cv > 0) indices.push('Chlorure de vinyle quantifié : déchloration poussée jusqu’au CV (composé le plus toxique de la chaîne)')
  if (eth > 0) indices.push('Éthène / éthane quantifiés : déchloration complète')
  if (quantifie(t.dca11) || quantifie(t.dca12) || quantifie(t.ca)) indices.push('Chloroéthanes peu chlorés (DCA, chloroéthane) quantifiés : déchloration des chloroéthanes possible')
  if (quantifie(t.cf) && site.quantifies.has('ct')) indices.push('Chloroforme avec du tétrachlorure de carbone sur le site : déchloration des chlorométhanes')

  // Electron donors.
  if (t.btex && superieurA(t.btex, 100)) carbone.push(`BTEX = ${fr(t.btex.valeur, 0)} µg/l (> 0,1 mg/l) : source de carbone qui entretient la déchloration (USEPA 1998)`)
  else if (quantifie(t.btex)) carbone.push(`BTEX = ${fr(t.btex.valeur, 1)} µg/l : apport de carbone faible`)
  if (quantifie(t.hc)) carbone.push(`Hydrocarbures totaux = ${fr(t.hc.valeur, 0)} µg/l : donneurs d’électrons potentiels (critère hors barème USEPA)`)
  if (t.cot && superieurA(t.cot, 20)) carbone.push(`COT = ${fr(t.cot.valeur)} mg/l (> 20 mg/l) : source de carbone`)

  // Conclusion.
  const degrade = filles > 0
  const sansCOHV = total === 0
  let conclusion: string
  if (c.niveau === 'indetermine') conclusion = 'Conditions non déterminées : oxygène dissous et redox à mesurer en cellule de circulation.'
  else if (sansCOHV)
    conclusion = `Conditions ${LIBELLES_FAVORABILITE[c.niveau].toLowerCase()} pour la déchloration réductrice ; pas de chloroéthène quantifié (ou non analysé) pour juger d’une dégradation.`
  else if (c.niveau === 'favorable' || c.niveau === 'possible')
    conclusion = degrade
      ? `Milieu ${c.niveau === 'favorable' ? 'réducteur' : 'anoxique'} et produits de dégradation présents : déchloration réductrice ${c.niveau === 'favorable' ? 'probable' : 'plausible'}, à confirmer par les accepteurs d’électrons et l’évolution des concentrations.`
      : 'Milieu compatible avec la déchloration réductrice, mais aucun produit de dégradation : déchloration absente ou lente (donneurs d’électrons ou micro-organismes limitants), ou rejet récent.'
  else
    conclusion = degrade
      ? 'Produits de dégradation présents alors que l’eau est oxygénée au droit de l’ouvrage : déchloration en amont ou dans des niveaux plus réducteurs puis transport, ou mélange d’eaux dans l’ouvrage crépiné. Le DCE et le CV peuvent s’y oxyder en aérobie.'
      : 'Milieu oxygéné, sans produit de dégradation : déchloration réductrice peu probable ; seuls les composés peu chlorés (DCE, CV) peuvent se dégrader par oxydation aérobie.'

  // Limits and useful analyses.
  const limites: string[] = []
  const manque = (id: ParamId) => !t[id]
  if (manque('nitrate') && manque('fe2') && manque('sulfate') && manque('methane')) {
    limites.push(
      'Sans nitrates, fer, sulfates ni méthane, le processus redox n’est pas identifiable : le redox de terrain sépare les eaux oxiques des eaux anoxiques mais ne distingue pas dénitrification, réduction du fer, sulfato-réduction et méthanogenèse (USEPA 1998, § 2.3.2.9, d’après Chapelle et al., 1996).',
    )
    limites.push('Le score USEPA est partiel : il ne se compare pas aux classes du tableau 2.4, établies pour le jeu complet de paramètres.')
  } else if (GEOCHIMIE.some(([id]) => manque(id))) {
    limites.push(`Géochimie incomplète (${GEOCHIMIE.filter(([id]) => manque(id)).map(([, l]) => l).join(', ')}) : processus redox et score USEPA à lire comme des minorants.`)
  }
  if (manque('methane') && manque('ethene') && cv > 0) limites.push('Sans méthane ni éthène / éthane, le devenir du CV (accumulation en méthanogenèse ou oxydation) ne peut pas être précisé.')
  if (manque('chlorure')) limites.push('Sans chlorures, pas de critère « chlorures > 2 × le fond » ni de normalisation des constantes de dégradation (dilution non corrigée).')
  if (c.niveau !== 'indetermine') limites.push('Une mesure ponctuelle en fin de purge reflète l’eau du massif filtrant : un ouvrage crépiné sur plusieurs niveaux mélange des eaux de conditions différentes.')

  const analysesUtiles: string[] = []
  if (manque('fe2')) analysesUtiles.push('Fer ferreux (Fe²⁺) au kit colorimétrique sur le terrain, au moment du prélèvement')
  if (manque('nitrate') || manque('sulfate') || manque('chlorure')) analysesUtiles.push('Anions au laboratoire : nitrates, sulfates, chlorures (un seul flacon, analyse peu coûteuse)')
  if (manque('methane') || manque('ethene')) analysesUtiles.push('Gaz dissous : méthane, éthène, éthane (flacon spécifique sans bulle)')
  if (manque('sulfure') && (c.niveau === 'favorable' || c.niveau === 'possible')) analysesUtiles.push('Sulfures au kit de terrain (milieu anoxique : sulfato-réduction possible)')
  if (manque('cot')) analysesUtiles.push('COT / COD (source de carbone)')

  return { conditions: c.niveau, motifConditions: c.motif, indices, carbone, conclusion, limites, analysesUtiles }
}
