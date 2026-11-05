/**
 * Nomenclature IOTA (installations, ouvrages, travaux et activités) annexée
 * à l'article R. 214-1 du code de l'environnement, version consolidée
 * publiée par l'INERIS (AIDA) le 28 août 2025.
 *
 * Each rubrique carries the quantities its thresholds are written in, and a
 * classifier that turns what the reader typed into a regime: déclaration (D),
 * autorisation (A), non concerné (NC), or `null` while a quantity the
 * thresholds need is still missing. Thresholds are copied from the official
 * text, inclusive or strict exactly as written ("supérieur ou égal", "supérieur
 * à … mais inférieur à …").
 *
 * The general prescriptions (APG) are those listed by AIDA for each rubrique,
 * and the R1 reference levels of rubrique 2.2.3.0 are table I of the arrêté du
 * 9 août 2006 as amended on 30 June 2020.
 */

export type Regime = 'A' | 'D' | 'NC'

export type Param =
  | { id: string; libelle: string; type: 'nombre'; unite: string; aide?: string }
  | { id: string; libelle: string; type: 'case'; aide?: string }
  | { id: string; libelle: string; type: 'choix'; options: { v: string; l: string }[]; aide?: string }

export type Valeurs = Record<string, string | boolean | undefined>

export interface Classement {
  regime: Regime | null
  motif: string
}

export interface Rubrique {
  code: string
  titre: 1 | 2 | 3 | 4 | 5
  intitule: string
  /** The rubrique's text, shortened only where it lists exclusions. */
  texte: string
  /** Thresholds as the nomenclature words them. */
  seuils: string[]
  params: Param[]
  classer: (v: Valeurs) => Classement
  /** Extra notes shown under the rubrique (exclusions, upcoming changes). */
  notes?: string[]
}

export const TITRES: Record<number, string> = {
  1: 'Titre I — Prélèvements',
  2: 'Titre II — Rejets',
  3: 'Titre III — Impacts sur le milieu aquatique ou sur la sécurité publique',
  4: 'Titre IV — Impacts sur le milieu marin',
  5: 'Titre V — Régimes d’autorisation valant autorisation au titre des articles L. 214-1 et suivants',
}

export const LIBELLE_REGIME: Record<Regime, string> = {
  A: 'Autorisation',
  D: 'Déclaration',
  NC: 'Non concerné',
}

/** French decimal ("1 200,5") to a number; empty or unreadable gives null. */
export function nombre(v: string | boolean | undefined): number | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const fr = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 3 })

const A = (motif: string): Classement => ({ regime: 'A', motif })
const D = (motif: string): Classement => ({ regime: 'D', motif })
const NC = (motif: string): Classement => ({ regime: 'NC', motif })
const manque = (motif: string): Classement => ({ regime: null, motif })

/** A single quantity against an A threshold and a D threshold. */
function palier(
  x: number | null,
  unite: string,
  a: { seuil: number; inclus: boolean },
  d: { seuil: number; inclus: boolean } | null,
  nomGrandeur: string,
): Classement {
  if (x === null) return manque(`${nomGrandeur} à renseigner`)
  const v = `${nomGrandeur} : ${fr(x)} ${unite}`
  if (a.inclus ? x >= a.seuil : x > a.seuil) return A(`${v} (${a.inclus ? '≥' : '>'} ${fr(a.seuil)} ${unite})`)
  if (d && (d.inclus ? x >= d.seuil : x > d.seuil)) return D(`${v} (${d.inclus ? '≥' : '>'} ${fr(d.seuil)} ${unite})`)
  if (!d) return NC(`${v}, sous le seuil d'autorisation`)
  return NC(`${v} (${d.inclus ? '<' : '≤'} ${fr(d.seuil)} ${unite})`)
}

// ---- Niveaux de référence R1 (rubrique 2.2.3.0) ----------------------------

export interface ParametreR1 {
  id: string
  nom: string
  /** R1 level, in `uniteR1`. */
  r1: number
  uniteR1: string
  /** Unit the concentration is typed in. */
  uniteConc: string
  /** Flux in R1 unit = concentration × daily flow (m³/j) × facteur. */
  facteur: number
  note?: string
}

export const R1: ParametreR1[] = [
  { id: 'mes', nom: 'MES', r1: 9, uniteR1: 'kg/j', uniteConc: 'mg/l', facteur: 1e-3 },
  { id: 'dbo5', nom: 'DBO5', r1: 9, uniteR1: 'kg/j', uniteConc: 'mg/l', facteur: 1e-3, note: 'Rejet salé (chlorures > 2 000 mg/l) : COT, R1 = 8 kg/j' },
  { id: 'dco', nom: 'DCO', r1: 12, uniteR1: 'kg/j', uniteConc: 'mg/l', facteur: 1e-3, note: 'Rejet salé (chlorures > 2 000 mg/l) : COT, R1 = 8 kg/j' },
  { id: 'mi', nom: 'Matières inhibitrices', r1: 25, uniteR1: 'équitox/j', uniteConc: 'équitox/m³', facteur: 1 },
  { id: 'ngl', nom: 'Azote total', r1: 1.2, uniteR1: 'kg/j', uniteConc: 'mg/l', facteur: 1e-3 },
  { id: 'pt', nom: 'Phosphore total', r1: 0.3, uniteR1: 'kg/j', uniteConc: 'mg/l', facteur: 1e-3 },
  { id: 'aox', nom: 'AOX', r1: 7.5, uniteR1: 'g/j', uniteConc: 'µg/l', facteur: 1e-3 },
  { id: 'hc', nom: 'Hydrocarbures', r1: 0.1, uniteR1: 'kg/j', uniteConc: 'mg/l', facteur: 1e-3 },
  {
    id: 'ecoli',
    nom: 'Escherichia coli',
    r1: 1e10,
    uniteR1: 'n/j',
    uniteConc: 'n/100 ml',
    facteur: 1e4,
    note: "Seulement si le rejet est à moins de 1 km d'une zone conchylicole ou de culture marine, d'une prise d'eau potable ou d'une zone de baignade",
  },
  { id: 'sels', nom: 'Sels dissous', r1: 1, uniteR1: 't/j', uniteConc: 'mg/l', facteur: 1e-6 },
  { id: 'hg', nom: 'Mercure', r1: 105, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'cd', nom: 'Cadmium', r1: 120, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'as', nom: 'Arsenic', r1: 1245, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'pb', nom: 'Plomb', r1: 1800, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'ni', nom: 'Nickel', r1: 6000, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'cu', nom: 'Cuivre', r1: 1500, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'cr', nom: 'Chrome', r1: 5100, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'zn', nom: 'Zinc', r1: 11700, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'bap', nom: 'Benzo(a)pyrène', r1: 0.25, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'np', nom: 'Nonylphénols', r1: 0.45, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'ipu', nom: 'Isoproturon', r1: 0.45, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'mcpa', nom: '2,4 MCPA', r1: 750, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'dehp', nom: 'DEHP', r1: 1950, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'op', nom: 'Octylphénols', r1: 150, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'fla', nom: 'Fluoranthène', r1: 9.5, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'tcm', nom: 'Trichlorométhane (chloroforme)', r1: 3750, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
  { id: 'cpf', nom: 'Chlorpyrifos', r1: 45, uniteR1: 'mg/j', uniteConc: 'µg/l', facteur: 1 },
]

export interface FluxR1 {
  p: ParametreR1
  concentration: number
  flux: number
  depasse: boolean
}

/** Flux of each parameter typed for rubrique 2.2.3.0, against R1. */
export function fluxR1(v: Valeurs): { debit: number | null; flux: FluxR1[] } {
  const debit = nombre(v.debit)
  const flux: FluxR1[] = []
  if (debit === null) return { debit, flux }
  for (const p of R1) {
    const c = nombre(v[`c_${p.id}`])
    if (c === null) continue
    const f = c * debit * p.facteur
    flux.push({ p, concentration: c, flux: f, depasse: f >= p.r1 })
  }
  return { debit, flux }
}

// ---- Rubriques ---------------------------------------------------------------

const CONVENTION_L2149 = "À l'exception des prélèvements faisant l'objet d'une convention avec l'attributaire du débit affecté prévu par l'article L. 214-9."

export const RUBRIQUES: Rubrique[] = [
  {
    code: '1.1.1.0',
    titre: 1,
    intitule: 'Sondage, forage, puits ou ouvrage souterrain non domestique',
    texte:
      "Sondage, forage, y compris les essais de pompage, création de puits ou d'ouvrage souterrain, non destiné à un usage domestique, exécuté en vue de la recherche ou de la surveillance d'eaux souterraines ou en vue d'effectuer un prélèvement temporaire ou permanent dans les eaux souterraines, y compris dans les nappes d'accompagnement de cours d'eau.",
    seuils: ['Déclaration (D), quel que soit le nombre ou la profondeur des ouvrages'],
    params: [
      { id: 'nombre', libelle: "Nombre d'ouvrages", type: 'nombre', unite: '' },
      { id: 'profondeur', libelle: 'Profondeur maximale', type: 'nombre', unite: 'm' },
      {
        id: 'usage',
        libelle: 'Objet des ouvrages',
        type: 'choix',
        options: [
          { v: 'surveillance', l: 'Surveillance de la qualité des eaux souterraines' },
          { v: 'recherche', l: "Recherche d'eau, essais de pompage" },
          { v: 'prelevement', l: 'Prélèvement (traitement, rabattement, alimentation)' },
        ],
      },
    ],
    classer: () => D("Ouvrage souterrain non domestique : déclaration quel que soit le nombre d'ouvrages"),
    notes: [
      "Usage domestique (prélèvement ≤ 1 000 m³/an pour les besoins d'une famille, art. R. 214-5) exclu.",
      "Décret n° 2025-884 du 2 septembre 2025 et arrêtés du 18 mars 2026 : à compter du 31 décembre 2027, les forages relèvent de règles générales (art. R. 211-21-4) et d'entreprises de forage certifiées. Vérifier le régime applicable à la date des travaux.",
      'Les sondages purement géotechniques ou de prélèvement de sols et de gaz du sol ne visent pas les eaux souterraines.',
    ],
  },
  {
    code: '1.1.2.0',
    titre: 1,
    intitule: 'Prélèvement en nappe (hors nappe d’accompagnement)',
    texte:
      "Prélèvements permanents ou temporaires issus d'un forage, puits ou ouvrage souterrain dans un système aquifère, à l'exclusion de nappes d'accompagnement de cours d'eau, par pompage, drainage, dérivation ou tout autre procédé.",
    seuils: ['Volume total prélevé ≥ 200 000 m³/an : A', 'Volume > 10 000 m³/an et < 200 000 m³/an : D'],
    params: [{ id: 'volume', libelle: 'Volume total prélevé', type: 'nombre', unite: 'm³/an', aide: 'Somme des ouvrages du projet (R. 214-42)' }],
    classer: (v) => palier(nombre(v.volume), 'm³/an', { seuil: 200000, inclus: true }, { seuil: 10000, inclus: false }, 'Volume prélevé'),
  },
  {
    code: '1.2.1.0',
    titre: 1,
    intitule: 'Prélèvement en cours d’eau ou nappe d’accompagnement',
    texte: `${CONVENTION_L2149} Prélèvements et installations et ouvrages permettant le prélèvement, y compris par dérivation, dans un cours d'eau, dans sa nappe d'accompagnement ou dans un plan d'eau ou canal alimenté par ce cours d'eau ou cette nappe.`,
    seuils: [
      'Capacité totale maximale ≥ 1 000 m³/h ou ≥ 5 % du débit du cours d’eau : A',
      'Capacité comprise entre 400 et 1 000 m³/h ou entre 2 et 5 % du débit : D',
    ],
    params: [
      { id: 'capacite', libelle: 'Capacité totale maximale', type: 'nombre', unite: 'm³/h' },
      { id: 'part', libelle: 'Part du débit du cours d’eau (QMNA5)', type: 'nombre', unite: '%', aide: 'Débit de référence : débit moyen mensuel sec de récurrence 5 ans' },
    ],
    classer: (v) => {
      const q = nombre(v.capacite)
      const p = nombre(v.part)
      if (q === null && p === null) return manque('Capacité ou part du débit à renseigner')
      if ((q ?? 0) >= 1000 || (p ?? 0) >= 5) return A('Capacité ≥ 1 000 m³/h ou ≥ 5 % du débit')
      if ((q ?? 0) >= 400 || (p ?? 0) >= 2) return D('Capacité entre 400 et 1 000 m³/h ou entre 2 et 5 % du débit')
      return NC('Capacité < 400 m³/h et < 2 % du débit')
    },
  },
  {
    code: '1.2.2.0',
    titre: 1,
    intitule: 'Prélèvement en cours d’eau réalimenté',
    texte: `${CONVENTION_L2149} Prélèvements dans un cours d'eau, sa nappe d'accompagnement ou un plan d'eau ou canal alimenté par ce cours d'eau ou cette nappe, lorsque le débit du cours d'eau en période d'étiage résulte, pour plus de moitié, d'une réalimentation artificielle. Pour la Seine, la Loire, la Marne et l'Yonne, autorisation seulement au-delà de 80 m³/h.`,
    seuils: ['Autorisation (A)'],
    params: [],
    classer: () => A("Cours d'eau réalimenté artificiellement à l'étiage"),
  },
  {
    code: '1.3.1.0',
    titre: 1,
    intitule: 'Prélèvement en zone de répartition des eaux (ZRE)',
    texte: `${CONVENTION_L2149} Ouvrages, installations, travaux permettant un prélèvement total d'eau dans une zone où des mesures permanentes de répartition quantitative instituées, notamment au titre de l'article L. 211-2, ont prévu l'abaissement des seuils.`,
    seuils: ['Capacité ≥ 8 m³/h : A', 'Dans les autres cas : D'],
    params: [{ id: 'capacite', libelle: 'Capacité totale de prélèvement', type: 'nombre', unite: 'm³/h' }],
    classer: (v) => {
      const q = nombre(v.capacite)
      if (q === null) return manque('Capacité de prélèvement à renseigner')
      if (q >= 8) return A(`Capacité : ${fr(q)} m³/h (≥ 8 m³/h)`)
      if (q > 0) return D(`Capacité : ${fr(q)} m³/h (< 8 m³/h, en ZRE)`)
      return NC('Pas de prélèvement')
    },
    notes: ["S'applique dans la zone de répartition des eaux (la lecture du contexte indique si le site y est). Les seuils de 1.1.2.0 et 1.2.1.0 ne s'appliquent alors plus."],
  },
  {
    code: '2.1.1.0',
    titre: 2,
    intitule: 'Système d’assainissement collectif ou non collectif',
    texte:
      "Systèmes d'assainissement collectif des eaux usées et installations d'assainissement non collectif destinés à collecter et traiter une charge brute de pollution organique au sens de l'article R. 2224-6 du code général des collectivités territoriales.",
    seuils: ['Charge > 600 kg de DBO5/j : A', 'Charge > 12 kg et ≤ 600 kg de DBO5/j : D'],
    params: [{ id: 'charge', libelle: 'Charge brute de pollution organique', type: 'nombre', unite: 'kg DBO5/j' }],
    classer: (v) => palier(nombre(v.charge), 'kg DBO5/j', { seuil: 600, inclus: false }, { seuil: 12, inclus: false }, 'Charge'),
  },
  {
    code: '2.1.3.0',
    titre: 2,
    intitule: 'Épandage de boues d’assainissement',
    texte:
      "Épandage et stockage en vue d'épandage de boues produites dans un ou plusieurs systèmes d'assainissement collectif des eaux usées et installations d'assainissement non collectif.",
    seuils: ['Matière sèche > 800 t/an ou azote total > 40 t/an : A', 'Matière sèche entre 3 et 800 t/an ou azote total entre 0,15 et 40 t/an : D'],
    params: [
      { id: 'ms', libelle: 'Matière sèche épandue', type: 'nombre', unite: 't/an' },
      { id: 'n', libelle: 'Azote total épandu', type: 'nombre', unite: 't/an' },
    ],
    classer: (v) => {
      const ms = nombre(v.ms)
      const n = nombre(v.n)
      if (ms === null && n === null) return manque('Quantités épandues à renseigner')
      if ((ms ?? 0) > 800 || (n ?? 0) > 40) return A('Matière sèche > 800 t/an ou azote > 40 t/an')
      if ((ms ?? 0) >= 3 || (n ?? 0) >= 0.15) return D('Matière sèche entre 3 et 800 t/an ou azote entre 0,15 et 40 t/an')
      return NC('Sous les seuils de déclaration')
    },
  },
  {
    code: '2.1.4.0',
    titre: 2,
    intitule: 'Épandage d’effluents ou de boues (autres)',
    texte:
      "Épandage et stockage en vue d'épandage d'effluents ou de boues, hors boues de la rubrique 2.1.3.0, effluents d'élevage, et boues ou effluents d'IOTA ou d'ICPE déjà soumis à la nomenclature.",
    seuils: ['Volume > 50 000 m³/an, ou flux > 1 t/an d’azote total, ou > 500 kg/an de DBO5 : D'],
    params: [
      { id: 'volume', libelle: 'Volume épandu', type: 'nombre', unite: 'm³/an' },
      { id: 'n', libelle: 'Azote total', type: 'nombre', unite: 't/an' },
      { id: 'dbo', libelle: 'DBO5', type: 'nombre', unite: 'kg/an' },
    ],
    classer: (v) => {
      const vol = nombre(v.volume)
      const n = nombre(v.n)
      const dbo = nombre(v.dbo)
      if (vol === null && n === null && dbo === null) return manque('Quantités épandues à renseigner')
      if ((vol ?? 0) > 50000 || (n ?? 0) > 1 || (dbo ?? 0) > 500) return D('Au moins un seuil dépassé')
      return NC('Sous les seuils de déclaration')
    },
  },
  {
    code: '2.1.5.0',
    titre: 2,
    intitule: 'Rejet d’eaux pluviales',
    texte:
      "Rejet d'eaux pluviales dans les eaux douces superficielles ou sur le sol ou dans le sous-sol, la surface totale du projet, augmentée de la surface correspondant à la partie du bassin naturel dont les écoulements sont interceptés par le projet.",
    seuils: ['Surface ≥ 20 ha : A', 'Surface > 1 ha et < 20 ha : D'],
    params: [{ id: 'surface', libelle: 'Surface du projet + bassin versant intercepté', type: 'nombre', unite: 'ha' }],
    classer: (v) => palier(nombre(v.surface), 'ha', { seuil: 20, inclus: true }, { seuil: 1, inclus: false }, 'Surface'),
  },
  {
    code: '2.2.1.0',
    titre: 2,
    intitule: 'Rejet modifiant le régime des eaux',
    texte:
      "Rejet dans les eaux douces superficielles susceptible de modifier le régime des eaux, à l'exclusion des rejets mentionnés à la rubrique 2.1.5.0 ainsi que des rejets des ouvrages mentionnés à la rubrique 2.1.1.0.",
    seuils: ['Capacité totale de rejet > 2 000 m³/j ou > 5 % du débit moyen interannuel du cours d’eau : D'],
    params: [
      { id: 'capacite', libelle: 'Capacité totale de rejet', type: 'nombre', unite: 'm³/j' },
      { id: 'part', libelle: 'Part du module du cours d’eau', type: 'nombre', unite: '%' },
    ],
    classer: (v) => {
      const q = nombre(v.capacite)
      const p = nombre(v.part)
      if (q === null && p === null) return manque('Capacité de rejet à renseigner')
      if ((q ?? 0) > 2000 || (p ?? 0) > 5) return D('Capacité > 2 000 m³/j ou > 5 % du module')
      return NC('Capacité ≤ 2 000 m³/j et ≤ 5 % du module')
    },
  },
  {
    code: '2.2.3.0',
    titre: 2,
    intitule: 'Rejet dans les eaux de surface (flux ≥ R1)',
    texte:
      "Rejet dans les eaux de surface, à l'exclusion des rejets réglementés au titre des autres rubriques de la présente nomenclature ou de la nomenclature des installations classées, le flux total de pollution, le cas échéant avant traitement, étant supérieur ou égal au niveau de référence R1 pour l'un au moins des paramètres qui y figurent.",
    seuils: ['Flux ≥ R1 pour au moins un paramètre (arrêté du 9 août 2006) : D'],
    params: [
      { id: 'debit', libelle: 'Débit rejeté', type: 'nombre', unite: 'm³/j' },
      { id: 'avantTraitement', libelle: 'Concentrations saisies avant traitement (cas le plus défavorable)', type: 'case' },
    ],
    classer: (v) => {
      const { debit, flux } = fluxR1(v)
      if (debit === null) return manque('Débit rejeté à renseigner')
      if (!flux.length) return manque('Concentrations à renseigner (au moins un paramètre)')
      const d = flux.filter((f) => f.depasse)
      if (d.length) return D(`Flux ≥ R1 : ${d.map((f) => f.p.nom).join(', ')}`)
      return NC(`Flux < R1 pour les ${flux.length} paramètre(s) saisi(s)`)
    },
    notes: ['Un rejet au réseau public relève d’une autorisation de déversement (art. L. 1331-10 du code de la santé publique), non de cette rubrique.'],
  },
  {
    code: '2.3.1.0',
    titre: 2,
    intitule: 'Rejet d’effluents sur le sol ou dans le sous-sol',
    texte:
      "Rejets d'effluents sur le sol ou dans le sous-sol, à l'exclusion des rejets visés à la rubrique 2.1.5.0, des rejets des ouvrages visés aux rubriques 2.1.1.0, 2.1.2.0, des épandages visés aux rubriques 2.1.3.0 et 2.1.4.0, ainsi que des réinjections visées à la rubrique 5.1.1.0.",
    seuils: ['Autorisation (A)'],
    params: [],
    classer: () => A("Rejet d'effluents sur le sol ou dans le sous-sol"),
    notes: ["Une infiltration des eaux de purge ou d'exhaure dans le sol relève de cette rubrique : préférer un rejet aux eaux de surface ou au réseau."],
  },
  {
    code: '2.3.2.0',
    titre: 2,
    intitule: 'Recharge artificielle des eaux souterraines',
    texte: 'Recharge artificielle des eaux souterraines.',
    seuils: ['Autorisation (A)'],
    params: [],
    classer: () => A('Recharge artificielle'),
  },
  {
    code: '3.1.1.0',
    titre: 3,
    intitule: 'Obstacle dans le lit mineur',
    texte: "Installations, ouvrages, remblais et épis, dans le lit mineur d'un cours d'eau, constituant un obstacle à l'écoulement des crues ou à la continuité écologique.",
    seuils: [
      "Obstacle à l'écoulement des crues : A",
      'Différence de niveau ≥ 50 cm (débit moyen annuel) : A',
      'Différence de niveau > 20 cm et < 50 cm : D',
    ],
    params: [
      { id: 'crues', libelle: "Obstacle à l'écoulement des crues", type: 'case' },
      { id: 'chute', libelle: 'Différence de niveau amont / aval', type: 'nombre', unite: 'cm' },
    ],
    classer: (v) => {
      if (v.crues) return A("Obstacle à l'écoulement des crues")
      return palier(nombre(v.chute), 'cm', { seuil: 50, inclus: true }, { seuil: 20, inclus: false }, 'Différence de niveau')
    },
  },
  {
    code: '3.1.2.0',
    titre: 3,
    intitule: 'Modification du profil du lit mineur',
    texte:
      "Installations, ouvrages, travaux ou activités conduisant à modifier le profil en long ou le profil en travers du lit mineur d'un cours d'eau, à l'exclusion de ceux visés à la rubrique 3.1.4.0, ou conduisant à la dérivation d'un cours d'eau.",
    seuils: ['Longueur ≥ 100 m : A', 'Longueur < 100 m : D'],
    params: [{ id: 'longueur', libelle: 'Longueur de cours d’eau concernée', type: 'nombre', unite: 'm' }],
    classer: (v) => {
      const l = nombre(v.longueur)
      if (l === null) return manque('Longueur à renseigner')
      if (l >= 100) return A(`Longueur : ${fr(l)} m (≥ 100 m)`)
      if (l > 0) return D(`Longueur : ${fr(l)} m (< 100 m)`)
      return NC('Aucune longueur concernée')
    },
  },
  {
    code: '3.1.3.0',
    titre: 3,
    intitule: 'Impact sur la luminosité d’un cours d’eau',
    texte: "Installations ou ouvrages ayant un impact sensible sur la luminosité nécessaire au maintien de la vie et de la circulation aquatique dans un cours d'eau.",
    seuils: ['Longueur ≥ 100 m : A', 'Longueur ≥ 10 m et < 100 m : D'],
    params: [{ id: 'longueur', libelle: 'Longueur couverte', type: 'nombre', unite: 'm' }],
    classer: (v) => palier(nombre(v.longueur), 'm', { seuil: 100, inclus: true }, { seuil: 10, inclus: true }, 'Longueur'),
  },
  {
    code: '3.1.4.0',
    titre: 3,
    intitule: 'Consolidation ou protection de berges',
    texte: 'Consolidation ou protection des berges, à l’exclusion des canaux artificiels, par des techniques autres que végétales vivantes.',
    seuils: ['Longueur ≥ 200 m : A', 'Longueur ≥ 20 m et < 200 m : D'],
    params: [{ id: 'longueur', libelle: 'Longueur de berge', type: 'nombre', unite: 'm' }],
    classer: (v) => palier(nombre(v.longueur), 'm', { seuil: 200, inclus: true }, { seuil: 20, inclus: true }, 'Longueur'),
  },
  {
    code: '3.1.5.0',
    titre: 3,
    intitule: 'Destruction de frayères',
    texte:
      "Installations, ouvrages, travaux ou activités, dans le lit mineur d'un cours d'eau, étant de nature à détruire les frayères, les zones de croissance ou les zones d'alimentation de la faune piscicole, des crustacés et des batraciens, ou dans le lit majeur d'un cours d'eau, étant de nature à détruire les frayères de brochet.",
    seuils: ['Destruction de plus de 200 m² de frayères : A', 'Dans les autres cas : D'],
    params: [{ id: 'surface', libelle: 'Surface de frayères détruite', type: 'nombre', unite: 'm²' }],
    classer: (v) => {
      const s = nombre(v.surface)
      if (s === null) return manque('Surface à renseigner')
      if (s > 200) return A(`Surface : ${fr(s)} m² (> 200 m²)`)
      return D('Travaux de nature à détruire des frayères, ≤ 200 m²')
    },
  },
  {
    code: '3.2.1.0',
    titre: 3,
    intitule: 'Entretien de cours d’eau ou de canaux',
    texte:
      "Entretien de cours d'eau ou de canaux, à l'exclusion de l'entretien visé à l'article L. 215-14 réalisé par le propriétaire riverain, des dragages visés à la rubrique 4.1.3.0 et de l'entretien des ouvrages visés à la rubrique 2.1.5.0, le volume des sédiments extraits étant au cours d'une année.",
    seuils: ['Volume > 2 000 m³ : A', 'Volume ≤ 2 000 m³ et teneur ≥ S1 : A', 'Volume ≤ 2 000 m³ et teneur < S1 : D'],
    params: [
      { id: 'volume', libelle: 'Volume de sédiments extraits', type: 'nombre', unite: 'm³/an' },
      { id: 's1', libelle: 'Teneur des sédiments ≥ niveau S1 (arrêté du 9 août 2006)', type: 'case' },
      { id: 'groupee', libelle: "Opération groupée d'entretien (plan de gestion, art. L. 215-15)", type: 'case' },
    ],
    classer: (v) => {
      const vol = nombre(v.volume)
      if (vol === null) return manque('Volume à renseigner')
      if (vol > 2000) return A(`Volume : ${fr(vol)} m³ (> 2 000 m³)`)
      if (v.s1) return A('Teneur ≥ S1')
      if (vol > 0) return D(`Volume : ${fr(vol)} m³ (≤ 2 000 m³), teneur < S1`)
      return NC('Pas de sédiments extraits')
    },
  },
  {
    code: '3.2.2.0',
    titre: 3,
    intitule: 'Installation ou remblai en lit majeur',
    texte:
      "Installations, ouvrages, remblais dans le lit majeur d'un cours d'eau. Le lit majeur est la zone naturellement inondable par la plus forte crue connue ou par la crue centennale si celle-ci est supérieure.",
    seuils: ['Surface soustraite ≥ 10 000 m² : A', 'Surface soustraite ≥ 400 m² et < 10 000 m² : D'],
    params: [{ id: 'surface', libelle: "Surface soustraite à l'expansion des crues", type: 'nombre', unite: 'm²' }],
    classer: (v) => palier(nombre(v.surface), 'm²', { seuil: 10000, inclus: true }, { seuil: 400, inclus: true }, 'Surface soustraite'),
  },
  {
    code: '3.2.3.0',
    titre: 3,
    intitule: 'Plan d’eau',
    texte:
      "Plans d'eau, permanents ou non. Ne constituent pas des plans d'eau les étendues d'eau réglementées au titre des rubriques 2.1.1.0, 2.1.5.0 et 3.2.5.0, ni celles demeurant en lit mineur réglementées au titre de la rubrique 3.1.1.0.",
    seuils: ['Superficie ≥ 3 ha : A', 'Superficie > 0,1 ha et < 3 ha : D'],
    params: [{ id: 'surface', libelle: 'Superficie du plan d’eau', type: 'nombre', unite: 'ha' }],
    classer: (v) => palier(nombre(v.surface), 'ha', { seuil: 3, inclus: true }, { seuil: 0.1, inclus: false }, 'Superficie'),
  },
  {
    code: '3.2.5.0',
    titre: 3,
    intitule: 'Barrage de retenue',
    texte: "Barrage de retenue et ouvrages assimilés relevant des critères de classement prévus par l'article R. 214-112.",
    seuils: ['Autorisation (A)'],
    params: [],
    classer: () => A('Barrage classé'),
  },
  {
    code: '3.2.6.0',
    titre: 3,
    intitule: 'Système d’endiguement, aménagement hydraulique',
    texte: "Ouvrages construits ou aménagés en vue de prévenir les inondations et les submersions : système d'endiguement (R. 562-13), aménagement hydraulique (R. 562-18).",
    seuils: ['Autorisation (A)'],
    params: [],
    classer: () => A('Ouvrage de prévention des inondations'),
  },
  {
    code: '3.2.7.0',
    titre: 3,
    intitule: 'Pisciculture d’eau douce',
    texte: "Piscicultures d'eau douce mentionnées à l'article L. 431-6.",
    seuils: ['Déclaration (D)'],
    params: [],
    classer: () => D('Pisciculture d’eau douce'),
  },
  {
    code: '3.3.1.0',
    titre: 3,
    intitule: 'Zone humide : assèchement, imperméabilisation, remblai',
    texte: 'Assèchement, mise en eau, imperméabilisation, remblais de zones humides ou de marais.',
    seuils: ['Zone ≥ 1 ha : A', 'Zone > 0,1 ha et < 1 ha : D'],
    params: [{ id: 'surface', libelle: 'Surface de zone humide concernée', type: 'nombre', unite: 'ha', aide: 'Délimitation selon l’article L. 211-1 et l’arrêté du 24 juin 2008' }],
    classer: (v) => palier(nombre(v.surface), 'ha', { seuil: 1, inclus: true }, { seuil: 0.1, inclus: false }, 'Surface de zone humide'),
  },
  {
    code: '3.3.2.0',
    titre: 3,
    intitule: 'Réseau de drainage',
    texte: 'Réalisation de réseaux de drainage.',
    seuils: ['Superficie drainée ≥ 100 ha : A', 'Superficie > 20 ha et < 100 ha : D'],
    params: [{ id: 'surface', libelle: 'Superficie drainée', type: 'nombre', unite: 'ha' }],
    classer: (v) => palier(nombre(v.surface), 'ha', { seuil: 100, inclus: true }, { seuil: 20, inclus: false }, 'Superficie drainée'),
  },
  {
    code: '3.3.3.0',
    titre: 3,
    intitule: 'Canalisation d’hydrocarbures ou de produits chimiques',
    texte: 'Canalisations de transports d’hydrocarbures liquides ou de produits chimiques liquides.',
    seuils: ['Longueur > 5 km, ou diamètre extérieur × longueur > 2 000 m² : A'],
    params: [
      { id: 'longueur', libelle: 'Longueur', type: 'nombre', unite: 'km' },
      { id: 'diametre', libelle: 'Diamètre extérieur', type: 'nombre', unite: 'm' },
    ],
    classer: (v) => {
      const l = nombre(v.longueur)
      const d = nombre(v.diametre)
      if (l === null) return manque('Longueur à renseigner')
      if (l > 5) return A(`Longueur : ${fr(l)} km (> 5 km)`)
      if (d !== null && d * l * 1000 > 2000) return A(`Diamètre × longueur : ${fr(d * l * 1000)} m² (> 2 000 m²)`)
      if (d === null) return manque('Diamètre à renseigner')
      return NC('Sous les seuils')
    },
  },
  {
    code: '3.3.5.0',
    titre: 3,
    intitule: 'Restauration des fonctionnalités naturelles des milieux aquatiques',
    texte:
      "Travaux ayant uniquement pour objet la restauration des fonctionnalités naturelles des milieux aquatiques (arasement d'ouvrages, déplacement du lit mineur, restauration de zones humides, reméandrage, remise à ciel ouvert…). Rubrique exclusive des autres rubriques de la nomenclature.",
    seuils: ['Déclaration (D)'],
    params: [],
    classer: () => D('Travaux de restauration (rubrique exclusive des autres)'),
    notes: ['Ne s’applique pas aux travaux n’atteignant pas les seuils des autres rubriques.'],
  },
  {
    code: '4.1.1.0',
    titre: 4,
    intitule: 'Création de port maritime ou de chenal',
    texte: "Travaux de création d'un port maritime ou d'un chenal d'accès ou travaux de modification des spécifications théoriques d'un chenal d'accès existant.",
    seuils: ['Autorisation (A)'],
    params: [],
    classer: () => A('Port ou chenal maritime'),
  },
  {
    code: '4.1.2.0',
    titre: 4,
    intitule: 'Travaux en contact avec le milieu marin',
    texte: 'Travaux d’aménagement portuaires et autres ouvrages réalisés en contact avec le milieu marin et ayant une incidence directe sur ce milieu.',
    seuils: ['Montant ≥ 1 900 000 € : A', 'Montant ≥ 160 000 € et < 1 900 000 € : D'],
    params: [{ id: 'montant', libelle: 'Montant des travaux', type: 'nombre', unite: '€' }],
    classer: (v) => palier(nombre(v.montant), '€', { seuil: 1900000, inclus: true }, { seuil: 160000, inclus: true }, 'Montant'),
  },
  {
    code: '4.1.3.0',
    titre: 4,
    intitule: 'Dragage en milieu marin',
    texte: 'Dragage et/ou rejet y afférent en milieu marin.',
    seuils: [
      'Teneur ≥ N2 : A',
      'Entre N1 et N2, Atlantique-Manche-mer du Nord à ≥ 1 km d’une zone conchylicole : ≥ 50 000 m³ A, sinon D',
      'Entre N1 et N2, autres façades ou à < 1 km : ≥ 5 000 m³ A, sinon D',
      '≤ N1 : ≥ 500 000 m³ A ; ≥ 5 000 m³ (Atlantique-Manche-mer du Nord) ou ≥ 500 m³ (ailleurs ou < 1 km) D',
    ],
    params: [
      {
        id: 'teneur',
        libelle: 'Teneur des sédiments',
        type: 'choix',
        options: [
          { v: 'n1', l: '≤ N1 pour tous les éléments' },
          { v: 'n1n2', l: 'Entre N1 et N2' },
          { v: 'n2', l: '≥ N2 pour au moins un élément' },
        ],
      },
      {
        id: 'facade',
        libelle: 'Façade et zone conchylicole',
        type: 'choix',
        options: [
          { v: 'amn', l: 'Atlantique-Manche-mer du Nord, rejet à ≥ 1 km d’une zone conchylicole' },
          { v: 'autre', l: 'Autre façade, ou rejet à < 1 km d’une zone conchylicole' },
        ],
      },
      { id: 'volume', libelle: 'Volume in situ dragué sur 12 mois', type: 'nombre', unite: 'm³' },
    ],
    classer: (v) => {
      const t = v.teneur
      const vol = nombre(v.volume)
      if (!t) return manque('Teneur des sédiments à renseigner')
      if (t === 'n2') return A('Teneur ≥ N2')
      if (vol === null || !v.facade) return manque('Volume et façade à renseigner')
      const amn = v.facade === 'amn'
      if (t === 'n1n2') return vol >= (amn ? 50000 : 5000) ? A(`Volume ≥ ${amn ? '50 000' : '5 000'} m³`) : D(`Volume < ${amn ? '50 000' : '5 000'} m³`)
      if (vol >= 500000) return A('Volume ≥ 500 000 m³')
      if (vol >= (amn ? 5000 : 500)) return D(`Volume ≥ ${amn ? '5 000' : '500'} m³`)
      return NC('Sous les seuils de déclaration')
    },
  },
  {
    code: '5.1.1.0',
    titre: 5,
    intitule: 'Réinjection dans une même nappe',
    texte: "Réinjection dans une même nappe des eaux prélevées pour la géothermie, l'exhaure des mines et carrières ou lors des travaux de génie civil.",
    seuils: ['Capacité ≥ 80 m³/h : A', 'Capacité > 8 m³/h et < 80 m³/h : D'],
    params: [{ id: 'capacite', libelle: 'Capacité totale de réinjection', type: 'nombre', unite: 'm³/h' }],
    classer: (v) => palier(nombre(v.capacite), 'm³/h', { seuil: 80, inclus: true }, { seuil: 8, inclus: false }, 'Capacité de réinjection'),
    notes: [
      'Titre V : les règles de procédure des articles R. 214-6 à R. 214-56 ne s’appliquent pas, ces opérations relèvent de dispositions particulières (code minier notamment). À vérifier avec le service instructeur.',
    ],
  },
]

export const PAR_CODE = new Map(RUBRIQUES.map((r) => [r.code, r]))

// ---- Arrêtés de prescriptions générales (AIDA) -------------------------------

export interface Apg {
  regimes: Regime[]
  texte: string
}

export const APG: Record<string, Apg[]> = {
  '1.1.1.0': [
    { regimes: ['D'], texte: "Arrêté du 11 septembre 2003 fixant les prescriptions générales applicables aux sondage, forage, création de puits ou d'ouvrage souterrain soumis à déclaration (rubrique 1.1.1.0), jusqu'au 31 décembre 2027" },
    { regimes: ['D'], texte: "Arrêté du 18 mars 2026 fixant les règles générales prévues à l'article R. 211-21-4 (travaux de sondage ou de forage non domestiques), applicable à compter du 31 décembre 2027" },
  ],
  '1.1.2.0': [
    { regimes: ['D'], texte: 'Arrêté du 11 septembre 2003 fixant les prescriptions générales applicables aux prélèvements soumis à déclaration (rubriques 1.1.2.0, 1.2.1.0, 1.2.2.0 ou 1.3.1.0)' },
    { regimes: ['A'], texte: 'Arrêté du 11 septembre 2003 fixant les prescriptions générales applicables aux prélèvements soumis à autorisation' },
  ],
  '1.2.1.0': [
    { regimes: ['D'], texte: 'Arrêté du 11 septembre 2003 fixant les prescriptions générales applicables aux prélèvements soumis à déclaration' },
    { regimes: ['A'], texte: 'Arrêté du 11 septembre 2003 fixant les prescriptions générales applicables aux prélèvements soumis à autorisation' },
  ],
  '1.2.2.0': [{ regimes: ['A'], texte: 'Arrêté du 11 septembre 2003 fixant les prescriptions générales applicables aux prélèvements soumis à autorisation' }],
  '1.3.1.0': [
    { regimes: ['D'], texte: 'Arrêté du 11 septembre 2003 fixant les prescriptions générales applicables aux prélèvements soumis à déclaration' },
    { regimes: ['A'], texte: 'Arrêté du 11 septembre 2003 fixant les prescriptions générales applicables aux prélèvements soumis à autorisation' },
  ],
  '2.1.1.0': [{ regimes: ['A', 'D'], texte: "Arrêté du 21 juillet 2015 relatif aux systèmes d'assainissement collectif et aux installations d'assainissement non collectif (hors charge ≤ 1,2 kg/j de DBO5)" }],
  '2.1.3.0': [{ regimes: ['A', 'D'], texte: "Arrêté du 8 janvier 1998 fixant les prescriptions techniques applicables aux épandages de boues sur les sols agricoles" }],
  '2.2.3.0': [{ regimes: ['D'], texte: "Arrêté du 9 août 2006 relatif aux niveaux à prendre en compte lors d'une analyse de rejets dans les eaux de surface ou de sédiments (niveaux R1)" }],
  '3.1.1.0': [{ regimes: ['A', 'D'], texte: "Arrêté du 11 septembre 2015 fixant les prescriptions techniques générales applicables aux installations, ouvrages, épis et remblais soumis à autorisation ou à déclaration (rubrique 3.1.1.0)" }],
  '3.1.2.0': [{ regimes: ['D'], texte: "Arrêté du 28 novembre 2007 fixant les prescriptions générales applicables aux IOTA soumis à déclaration (rubrique 3.1.2.0)" }],
  '3.1.3.0': [{ regimes: ['D'], texte: "Arrêté du 13 février 2002 fixant les prescriptions générales applicables aux IOTA soumis à déclaration (rubrique 3.1.3.0)" }],
  '3.1.4.0': [{ regimes: ['D'], texte: 'Arrêté du 13 février 2002 fixant les prescriptions générales applicables aux consolidations, traitements ou protections de berges soumis à déclaration (rubrique 3.1.4.0)' }],
  '3.1.5.0': [{ regimes: ['A', 'D'], texte: "Arrêté du 30 septembre 2014 fixant les prescriptions techniques générales applicables aux IOTA soumis à autorisation ou à déclaration (rubrique 3.1.5.0)" }],
  '3.2.1.0': [
    { regimes: ['A', 'D'], texte: "Arrêté du 30 mai 2008 fixant les prescriptions générales applicables aux opérations d'entretien de cours d'eau ou canaux (rubrique 3.2.1.0)" },
    { regimes: ['A', 'D'], texte: "Arrêté du 9 août 2006 relatif aux niveaux à prendre en compte lors d'une analyse de sédiments (niveau S1)" },
  ],
  '3.2.2.0': [{ regimes: ['D'], texte: 'Arrêté du 13 février 2002 fixant les prescriptions générales applicables aux installations, ouvrages ou remblais soumis à déclaration (rubrique 3.2.2.0)' }],
  '3.2.3.0': [{ regimes: ['A', 'D'], texte: "Arrêté du 9 juin 2021 fixant les prescriptions techniques générales applicables aux plans d'eau, y compris en ce qui concerne les modalités de vidange (rubrique 3.2.3.0)" }],
  '3.2.5.0': [{ regimes: ['A'], texte: 'Arrêté du 8 août 2022 relatif aux obligations documentaires et aux vérifications et visites techniques approfondies des ouvrages hydrauliques' }],
  '3.2.6.0': [{ regimes: ['A'], texte: 'Arrêté du 8 août 2022 relatif aux obligations documentaires et aux vérifications et visites techniques approfondies des ouvrages hydrauliques' }],
  '3.2.7.0': [{ regimes: ['D'], texte: "Arrêté du 1er avril 2008 fixant les règles techniques auxquelles doivent satisfaire les piscicultures d'eau douce (article L. 431-6)" }],
  '3.3.5.0': [{ regimes: ['D'], texte: 'Arrêté du 30 juin 2020 définissant les travaux de restauration des fonctionnalités naturelles des milieux aquatiques relevant de la rubrique 3.3.5.0' }],
  '4.1.2.0': [{ regimes: ['D'], texte: "Arrêté du 23 février 2001 fixant les prescriptions générales applicables aux travaux d'aménagement portuaires et ouvrages réalisés en contact avec le milieu aquatique soumis à déclaration (rubrique 4.1.2.0)" }],
  '4.1.3.0': [
    { regimes: ['A', 'D'], texte: "Arrêté du 9 août 2006 relatif aux niveaux à prendre en compte lors d'une analyse de sédiments marins (niveaux N1 et N2)" },
    { regimes: ['D'], texte: 'Arrêté du 27 mars 2024 relatif aux dragages et rejets y afférents en milieu marin (rubrique 4.1.3.0)' },
  ],
}

export function apgApplicables(code: string, regime: Regime | null): string[] {
  if (!regime || regime === 'NC') return []
  return (APG[code] ?? []).filter((a) => a.regimes.includes(regime)).map((a) => a.texte)
}

// ---- Synthèse ------------------------------------------------------------------

export interface RubriqueRetenue {
  rubrique: Rubrique
  classement: Classement
  apg: string[]
}

export interface Synthese {
  retenues: RubriqueRetenue[]
  /** Regime of the whole project: A wins over D (art. R. 214-42 et L. 181-1). */
  regime: Regime | null
  aCompleter: string[]
  titreV: boolean
}

export function synthese(actives: string[], valeurs: Record<string, Valeurs>): Synthese {
  const retenues: RubriqueRetenue[] = []
  const aCompleter: string[] = []
  for (const code of actives) {
    const r = PAR_CODE.get(code)
    if (!r) continue
    const c = r.classer(valeurs[code] ?? {})
    if (c.regime === null) aCompleter.push(`${code} : ${c.motif}`)
    retenues.push({ rubrique: r, classement: c, apg: apgApplicables(code, c.regime) })
  }
  retenues.sort((a, b) => a.rubrique.code.localeCompare(b.rubrique.code))
  const regimes = retenues.map((r) => r.classement.regime)
  const regime: Regime | null = regimes.includes('A') ? 'A' : regimes.includes('D') ? 'D' : retenues.length && regimes.every((x) => x === 'NC') ? 'NC' : null
  const titreV = retenues.some((r) => r.rubrique.titre === 5 && r.classement.regime && r.classement.regime !== 'NC')
  return { retenues, regime, aCompleter, titreV }
}
