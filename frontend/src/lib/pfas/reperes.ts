/**
 * Reference values placed on the order-of-magnitude scales. Two kinds:
 * - `seuil`: a management value (regulation, health guidance), drawn as a
 *   line, results compared to it;
 * - `contexte`: a measured range or value from a study, drawn as a band or
 *   a tick, to situate a result — never a threshold.
 *
 * Water in ng/l, soils in µg/kg dry matter. Every entry cites its source
 * (`references.ts`); nothing here is a value of the tool's own.
 */

export type Matrice = 'eau' | 'sol'
/** What a scale shows: the lab's sum of the 20, or one substance. */
export type Grandeur = 'somme20' | 'TFA' | 'FTS62' | 'PFOS' | 'PFOA'

export interface Repere {
  matrice: Matrice
  grandeur: Grandeur
  type: 'seuil' | 'contexte'
  libelle: string
  /** Single value, or [min, max] for a range. */
  valeur: number | [number, number]
  refs: string[]
  /** Shown under the scale. */
  detail: string
  /** The ERM comparison value for groundwater (guide file). */
  erm?: boolean
}

export const UNITE: Record<Matrice, string> = { eau: 'ng/l', sol: 'µg/kg MS' }

export const REPERES: Repere[] = [
  // ---- Eaux, somme des 20 ------------------------------------------------
  {
    matrice: 'eau',
    grandeur: 'somme20',
    type: 'seuil',
    libelle: 'Eau du robinet',
    valeur: 100,
    refs: ['directive2020', 'arrete2007'],
    detail: 'Limite de qualité des eaux distribuées pour la somme des 20 PFAS (0,1 µg/l), en vigueur en France depuis le 1er janvier 2023 (arrêté du 30 décembre 2022).',
  },
  {
    matrice: 'eau',
    grandeur: 'somme20',
    type: 'seuil',
    libelle: 'Eaux brutes',
    valeur: 2000,
    refs: ['arrete2007'],
    detail:
      'Limite de qualité des eaux brutes utilisées pour produire de l’eau potable (2 µg/l, annexe II). C’est la valeur de comparaison retenue dans le référentiel ERM « eaux souterraines ».',
    erm: true,
  },
  {
    matrice: 'eau',
    grandeur: 'somme20',
    type: 'contexte',
    libelle: 'Eau traitée, France',
    valeur: [110, 451],
    refs: ['anses2025'],
    detail: 'Campagne nationale ANSES : les 9 échantillons d’eau traitée (sur 627) au-dessus de 100 ng/l se situaient entre 110 et 451 ng/l.',
  },
  {
    matrice: 'eau',
    grandeur: 'somme20',
    type: 'contexte',
    libelle: 'Nappe d’un centre d’entraînement des pompiers',
    valeur: [300, 8300],
    refs: ['dauchy2019'],
    detail:
      'Nappe en limite d’un site d’entraînement incendie en France et source en aval : 300 à 8 300 ng/l (somme des PFAS analysés, liste plus large que les 20).',
  },

  // ---- Eaux, TFA -----------------------------------------------------------
  {
    matrice: 'eau',
    grandeur: 'TFA',
    type: 'seuil',
    libelle: 'Valeur sanitaire indicative',
    valeur: 60000,
    refs: ['instructionDgs2025'],
    detail: 'Valeur sanitaire indicative provisoire du TFA dans l’eau potable (60 µg/l), reprise de l’Allemagne dans l’attente de l’expertise européenne.',
  },
  {
    matrice: 'eau',
    grandeur: 'TFA',
    type: 'seuil',
    libelle: 'Objectif',
    valeur: 10000,
    refs: ['instructionDgs2025'],
    detail: 'Objectif plus protecteur de 10 µg/l fixé par l’instruction du 19 février 2025.',
  },
  {
    matrice: 'eau',
    grandeur: 'TFA',
    type: 'contexte',
    libelle: 'Médiane, eau traitée en France',
    valeur: 780,
    refs: ['anses2025'],
    detail: 'TFA détecté dans 92 % des échantillons de la campagne ANSES ; médiane 780 ng/l, maximum 25 000 ng/l.',
  },
  {
    matrice: 'eau',
    grandeur: 'TFA',
    type: 'contexte',
    libelle: 'Maximum, eau traitée en France',
    valeur: 25000,
    refs: ['anses2025'],
    detail: 'Valeur la plus haute de la campagne ANSES dans l’eau traitée.',
  },

  // ---- Sols ----------------------------------------------------------------
  {
    matrice: 'sol',
    grandeur: 'PFOS',
    type: 'contexte',
    libelle: 'Bruit de fond, Pays-Bas',
    valeur: 1.4,
    refs: ['rivm2020'],
    detail: 'Valeur de bruit de fond des sols néerlandais non influencés pour le PFOS (1,4 µg/kg MS). Aucune valeur française n’existe.',
  },
  {
    matrice: 'sol',
    grandeur: 'PFOS',
    type: 'contexte',
    libelle: 'Maximums des zones sources',
    valeur: [100000, 1000000],
    refs: ['brusseau2020'],
    detail: 'Synthèse mondiale (plus de 30 000 échantillons) : PFOS jusqu’à plusieurs centaines de mg/kg sur les sites contaminés (zones d’entraînement incendie, sites industriels).',
  },
  {
    matrice: 'sol',
    grandeur: 'PFOA',
    type: 'contexte',
    libelle: 'Bruit de fond, Pays-Bas',
    valeur: 1.9,
    refs: ['rivm2020'],
    detail: 'Valeur de bruit de fond des sols néerlandais non influencés pour le PFOA (1,9 µg/kg MS).',
  },
  {
    matrice: 'sol',
    grandeur: 'somme20',
    type: 'contexte',
    libelle: 'Centre d’entraînement des pompiers',
    valeur: 357000,
    refs: ['dauchy2019'],
    detail: 'Maximum mesuré dans les sols d’un site d’entraînement incendie en France : 357 µg/g, soit 357 000 µg/kg (somme des PFAS analysés).',
  },
]

export function reperes(matrice: Matrice, grandeur: Grandeur): Repere[] {
  return REPERES.filter((r) => r.matrice === matrice && r.grandeur === grandeur)
}

export const GRANDEURS: Record<Matrice, { grandeur: Grandeur; titre: string; aide: string }[]> = {
  eau: [
    { grandeur: 'somme20', titre: 'Somme des 20 PFAS', aide: 'Valeur rendue par le laboratoire, comparable aux seuils.' },
    { grandeur: 'TFA', titre: 'TFA', aide: 'Hors somme des 20 : seuils propres.' },
    { grandeur: 'FTS62', titre: '6:2 FTS', aide: 'Pas de valeur de gestion française.' },
  ],
  sol: [
    { grandeur: 'somme20', titre: 'Somme des 20 PFAS', aide: 'Pas de valeur réglementaire française pour les sols.' },
    { grandeur: 'PFOS', titre: 'PFOS', aide: 'Bruit de fond néerlandais et zones sources.' },
    { grandeur: 'PFOA', titre: 'PFOA', aide: 'Bruit de fond néerlandais.' },
    { grandeur: 'TFA', titre: 'TFA', aide: 'Pas de valeur de référence pour les sols.' },
    { grandeur: 'FTS62', titre: '6:2 FTS', aide: 'Pas de valeur de référence pour les sols.' },
  ],
}
