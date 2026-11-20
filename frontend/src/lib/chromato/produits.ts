/**
 * Reference products, as they appear in the C10–C40 window of a lab
 * chromatogram (GC-FID, n-decane to n-tetracontane).
 *
 * Carbon ranges after the BRGM report (Colombano et al., 2014, § 2.2.2):
 * petrol C4–C10, kerosene C12–C15 (distilled 150–275 °C), diesel C11–C25,
 * heating oil "the same characteristics as diesel", heavy cuts and
 * residues above; and the ITRC fact sheet A.5 (2018): elution increases
 * from petrol to jet fuel to diesel, crude oil spans the whole range, the
 * "hump" (UCM) is branched and cyclic material. The visible range and
 * centre of each template below are indicative bands derived from these
 * ranges (the lab window starts at C10, so petrol only shows its tail);
 * they are reading aids, not norms: each product varies with the crude and
 * the refinery.
 */

export type NiveauUcm = 'faible' | 'moyen' | 'fort'

export interface Produit {
  id: string
  nom: string
  /** Carbon range holding most of the product within the C10–C40 window. */
  plage: [number, number]
  /** Where the centre of mass (median carbon) usually falls. */
  centre: [number, number]
  /** Share of the unresolved hump expected for the fresh product. */
  ucm: NiveauUcm
  /** A regular n-alkane series is expected. */
  serie: boolean
  /** Middle distillate: the n-C17/pristane age model applies. */
  distillatMoyen?: boolean
  description: string
  refs: string[]
}

export const PRODUITS: Produit[] = [
  {
    id: 'leger',
    nom: 'Fraction légère : essence, white-spirit, naphta',
    plage: [10, 12.5],
    centre: [10, 11.2],
    ucm: 'faible',
    serie: false,
    description:
      'Produits de C4 à C10–C12, presque entièrement en dehors de la fenêtre C10–C40 : seule leur queue lourde (alkylbenzènes, naphtalène) apparaît au début du chromatogramme. L’indice C10–C40 sous-estime fortement ces produits.',
    refs: ['brgm2014', 'itrc2018'],
  },
  {
    id: 'kerosene',
    nom: 'Kérosène, carburéacteur, pétrole lampant',
    plage: [10, 17],
    centre: [11.8, 14],
    ucm: 'faible',
    serie: true,
    distillatMoyen: true,
    description: 'Coupe distillée entre 150 et 275 °C, de 12 à 15 atomes de carbone selon le BRGM ; n-alcanes bien résolus, profil centré avant C14.',
    refs: ['brgm2014', 'itrc2018'],
  },
  {
    id: 'gazole',
    nom: 'Gazole ou fioul domestique',
    plage: [10, 25],
    centre: [13.5, 19],
    ucm: 'moyen',
    serie: true,
    distillatMoyen: true,
    description:
      'De 11 à 25 atomes de carbone, n-alcanes et cycloalcanes majoritaires, doublets n-C17/pristane et n-C18/phytane. Le fioul domestique a les mêmes caractéristiques : seul son colorant, recherché par HPLC, le distingue du gazole.',
    refs: ['brgm2014'],
  },
  {
    id: 'brut',
    nom: 'Pétrole brut',
    plage: [10, 40],
    centre: [15, 23],
    ucm: 'moyen',
    serie: true,
    description: 'Couvre toute la gamme : série régulière de n-alcanes décroissant vers les lourds, bosse sous-jacente.',
    refs: ['itrc2018', 'brgm2014'],
  },
  {
    id: 'fiouLourd',
    nom: 'Fioul lourd (résidu, bunker)',
    plage: [12, 40],
    centre: [19, 27],
    ucm: 'fort',
    serie: true,
    description:
      'Résidu de distillation souvent coupé avec un distillat : distribution large, parfois bimodale, forte bosse. Exemple du BRGM (§ 7.1.5) : fioul « Bunker C » de C9 à C40 avec un maximum vers C21.',
    refs: ['brgm2014'],
  },
  {
    id: 'huile',
    nom: 'Huile lubrifiante, huile moteur, huile hydraulique',
    plage: [20, 40],
    centre: [24, 33],
    ucm: 'fort',
    serie: false,
    description:
      'Huiles de base retraitées et additivées : bosse non résolue centrée au-delà de C25, peu ou pas de n-alcanes. Une bosse sans pics est ici la forme normale du produit, pas un signe de vieillissement.',
    refs: ['brgm2014', 'itrc2018'],
  },
  {
    id: 'bitume',
    nom: 'Bitume, goudron, fraction très lourde',
    plage: [30, 40],
    centre: [34, 40],
    ucm: 'fort',
    serie: false,
    description: 'Mélanges de haut poids moléculaire issus du résidu sous vide : l’essentiel sort après C40, seule la montée de la bosse est visible en fin de chromatogramme.',
    refs: ['brgm2014'],
  },
]

export const PRODUIT_PAR_ID = Object.fromEntries(PRODUITS.map((p) => [p.id, p])) as Record<string, Produit>
