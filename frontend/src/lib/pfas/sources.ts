/**
 * Source leads: for each type of source the literature documents, the
 * composition features it is known for, checked one by one against the
 * sample. The outcome is a list of leads the profile is compatible with —
 * never an attribution. Source tracking needs several lines of evidence
 * and the conceptual site model (Rodowa et al., 2021); profiles change
 * along a plume as short chains travel further (Guelfo & Higgins, 2013)
 * and precursors turn into terminal acids (Houtz et al., 2013; Zhang et
 * al., 2016).
 *
 * Criteria are qualitative ("majority", "dominant compound", "quantified");
 * where a criterion is the tool's own reading of the literature rather than
 * a statement found in it, it says so (`propose`).
 */

import type { EchantillonPfas } from './lecture.ts'
import { composition } from './indicateurs.ts'
import type { Matrice } from './reperes.ts'
import { PAR_ID, VINGT, type IdSubstance } from './substances.ts'

const PFCA_C9 = VINGT.filter((s) => s.famille === 'PFCA' && s.carbones >= 9).map((s) => s.id)

export type Etat = 'oui' | 'non' | 'na'

export interface Critere {
  libelle: string
  etat: Etat
  detail: string
  /** A reading proposed by the tool, not stated as such in the sources. */
  propose?: boolean
}

export interface Piste {
  id: string
  titre: string
  /** Short label for tables. */
  court: string
  description: string
  criteres: Critere[]
  refs: string[]
  /** What to look for on site and in the records. */
  terrain: string
  verdict: 'compatible' | 'partiel' | 'peu' | 'indetermine'
  score: number
}

const fr = (x: number) => `${Math.round(x * 100)} %`

export function pistes(e: EchantillonPfas, matrice: Matrice): Piste[] {
  const c = composition(e)
  const q = (id: IdSubstance) => !!e.substances[id] && !e.substances[id]!.inferieur
  const analyse = (id: IdSubstance) => !!e.substances[id]
  const rang = (id: IdSubstance) => c.parts.findIndex((p) => p.id === id)
  const parts20 = c.parts.filter((p) => PAR_ID[p.id].somme20)
  const vide = c.total20 === 0
  const pfsa = parts20.filter((p) => PAR_ID[p.id].famille === 'PFSA').reduce((a, p) => a + p.valeur, 0)
  const partPfsa = vide ? null : pfsa / c.total20
  const courtes = parts20.filter((p) => !PAR_ID[p.id].longue).reduce((a, p) => a + p.valeur, 0)
  const partCourtes = vide ? null : courtes / c.total20
  const dominant = c.parts[0]?.id
  const nom = (id: IdSubstance) => PAR_ID[id].abreviation

  const crit = (libelle: string, etat: Etat, detail: string, propose = false): Critere => ({ libelle, etat, detail, ...(propose ? { propose } : {}) })
  const majorite = (x: number | null, libelle: string, sens: 'plus' | 'moins', quoi: string) =>
    crit(
      libelle,
      x === null ? 'na' : (sens === 'plus' ? x > 0.5 : x < 0.5) ? 'oui' : 'non',
      x === null ? 'Aucun des 20 PFAS quantifié.' : `${quoi} : ${fr(x)} de la somme des 20 quantifiés.`,
    )
  const ftsCrit = (attendu: boolean) =>
    crit(
      attendu ? '6:2 FTS quantifié' : '6:2 FTS non quantifié',
      !analyse('FTS62') ? 'na' : q('FTS62') === attendu ? 'oui' : 'non',
      !analyse('FTS62') ? '6:2 FTS non analysé.' : q('FTS62') ? `6:2 FTS : ${e.substances.FTS62!.brut}.` : '6:2 FTS inférieur à la LQ.',
    )

  const liste: Omit<Piste, 'verdict' | 'score'>[] = [
    {
      id: 'mousses-ecf',
      titre: 'Mousses d’extinction anciennes au PFOS (procédé électrochimique)',
      court: 'Mousses anciennes au PFOS',
      description:
        'Mousses AFFF à base de PFOS fabriquées par procédé électrochimique, principalement par 3M jusqu’à l’arrêt de cette chimie (2000-2002) : sulfonates dominants, PFOS et PFHxS associés, isomères ramifiés.',
      criteres: [
        majorite(partPfsa, 'Sulfonates majoritaires', 'plus', 'Sulfonates'),
        crit(
          'PFOS ou PFHxS composé dominant',
          !dominant ? 'na' : dominant === 'PFOS' || dominant === 'PFHxS' ? 'oui' : 'non',
          dominant ? `Composé dominant : ${nom(dominant)}.` : 'Aucun composé quantifié.',
        ),
        crit('PFHxS quantifié', !analyse('PFHxS') ? 'na' : q('PFHxS') ? 'oui' : 'non', q('PFHxS') ? `PFHxS : ${e.substances.PFHxS!.brut}.` : 'PFHxS inférieur à la LQ ou non analysé.'),
        crit(
          'Isomères ramifiés du PFOS présents',
          !(e.isomeres.PFOS?.ramifie && e.isomeres.PFOS?.lineaire) ? 'na' : !e.isomeres.PFOS.ramifie.inferieur ? 'oui' : 'non',
          e.isomeres.PFOS?.ramifie ? `PFOS ramifiés : ${e.isomeres.PFOS.ramifie.brut}.` : 'Le laboratoire ne distingue pas les isomères.',
        ),
      ],
      refs: ['anderson2016', 'barzenHanson2017', 'houtz2013', 'benskin2010', 'iarc2025', 'tm2000', 'dauchy2019'],
      terrain:
        'Aéroports, bases militaires, centres d’entraînement et casernes de pompiers, dépôts pétroliers et sites industriels équipés de réseaux d’extinction, lieux d’incendie passés.',
    },
    {
      id: 'mousses-ft',
      titre: 'Mousses d’extinction à fluorotélomères',
      court: 'Mousses à fluorotélomères',
      description:
        'Formulations à fluorotélomères : 6:2 FTS et précurseurs, qui se dégradent en PFHxA et PFPeA ; peu de PFOS.',
      criteres: [
        ftsCrit(true),
        majorite(partPfsa, 'Carboxylates majoritaires', 'moins', 'Sulfonates'),
        crit(
          'PFHxA ou PFPeA parmi les trois premiers composés',
          vide ? 'na' : [rang('PFHxA'), rang('PFPeA')].some((r) => r >= 0 && r < 3) ? 'oui' : 'non',
          vide ? 'Aucun composé quantifié.' : `Trois premiers : ${c.parts.slice(0, 3).map((p) => nom(p.id)).join(', ')}.`,
        ),
      ],
      refs: ['backe2013', 'houtz2013', 'zhang2016', 'dauchy2019'],
      terrain: 'Mêmes lieux que les mousses anciennes, pour des usages plus récents ; vérifier les fiches de données de sécurité des mousses stockées.',
    },
    {
      id: 'chromage',
      titre: 'Traitement de surface (chromage, mordançage des plastiques)',
      court: 'Traitement de surface',
      description:
        'Suppresseurs de brouillard : PFOS jusqu’à son interdiction, 6:2 FTS dans les formulations actuelles. Le 6:2 FTS est commun au chromage et aux mousses à fluorotélomères : seul l’historique du site les départage.',
      criteres: [
        crit(
          'PFOS ou 6:2 FTS composé dominant',
          !dominant ? 'na' : dominant === 'PFOS' || dominant === 'FTS62' ? 'oui' : 'non',
          dominant ? `Composé dominant : ${nom(dominant)}.` : 'Aucun composé quantifié.',
        ),
        crit(
          'PFHxS non quantifié',
          !analyse('PFHxS') ? 'na' : q('PFHxS') ? 'non' : 'oui',
          'Élément de distinction avec les mousses anciennes au PFOS, qui associent PFHxS et PFOS.',
          true,
        ),
      ],
      refs: ['egle2020', 'bmuv2019', 'barzenHanson2017'],
      terrain: 'ICPE de traitement de surface (rubrique 2565), ateliers de chromage dur ou décoratif, anciens sites CASIAS de l’industrie métallurgique.',
    },
    {
      id: 'fluoropolymeres',
      titre: 'Fluoropolymères et chimie du fluor',
      court: 'Fluoropolymères',
      description:
        'Fabrication et mise en œuvre de fluoropolymères, première source historique de PFCA : carboxylates, dont PFOA et chaînes plus longues.',
      criteres: [
        majorite(partPfsa, 'Carboxylates majoritaires', 'moins', 'Sulfonates'),
        crit(
          'PFOA ou un PFCA C9 à C13 composé dominant',
          !dominant ? 'na' : dominant === 'PFOA' || (PAR_ID[dominant].famille === 'PFCA' && PAR_ID[dominant].carbones >= 9) ? 'oui' : 'non',
          dominant ? `Composé dominant : ${nom(dominant)}.` : 'Aucun composé quantifié.',
        ),
        crit(
          'PFCA C9 à C13 quantifiés',
          vide ? 'na' : PFCA_C9.some(q) ? 'oui' : 'non',
          `Quantifiés : ${PFCA_C9.filter(q).map(nom).join(', ') || 'aucun'}.`,
        ),
      ],
      refs: ['prevedouros2006', 'boiteux2017'],
      terrain: 'Plateformes chimiques du fluor, fabricants et transformateurs de fluoropolymères (revêtements, membranes, câbles, textiles techniques).',
    },
    {
      id: 'decharge',
      titre: 'Décharge, lixiviats de déchets',
      court: 'Décharge, lixiviats',
      description: 'Lixiviats : acides perfluorés courts (C4 à C7) les plus abondants, PFOA toujours présent.',
      criteres: [
        majorite(partCourtes, 'Chaînes courtes majoritaires', 'plus', 'Chaînes courtes'),
        crit(
          'Un PFCA court (C4 à C7) composé dominant',
          !dominant ? 'na' : PAR_ID[dominant].famille === 'PFCA' && !PAR_ID[dominant].longue ? 'oui' : 'non',
          dominant ? `Composé dominant : ${nom(dominant)}.` : 'Aucun composé quantifié.',
        ),
        crit('PFOA quantifié', !analyse('PFOA') ? 'na' : q('PFOA') ? 'oui' : 'non', q('PFOA') ? `PFOA : ${e.substances.PFOA!.brut}.` : 'PFOA inférieur à la LQ ou non analysé.'),
      ],
      refs: ['hamid2018', 'lang2017', 'salvatore2022'],
      terrain:
        'Installations de stockage de déchets, anciennes décharges (CASIAS), dépôts sauvages, remblais. Le composé dominant des lixiviats (acide 5:3 FTCA) n’est pas dans la liste des 20.',
    },
    ...(matrice === 'sol'
      ? [
          {
            id: 'boues',
            titre: 'Épandage de boues d’épuration',
            court: 'Boues d’épuration',
            description: 'Sols amendés par des boues : PFOS dominant, concentrations proportionnelles aux apports cumulés.',
            criteres: [
              crit(
                'PFOS composé dominant',
                !dominant ? 'na' : dominant === 'PFOS' ? 'oui' : 'non',
                dominant ? `Composé dominant : ${nom(dominant)}.` : 'Aucun composé quantifié.',
              ),
              majorite(partPfsa, 'Sulfonates majoritaires', 'plus', 'Sulfonates'),
            ],
            refs: ['sepulvado2011', 'salvatore2022'],
            terrain: 'Plans d’épandage des stations d’épuration, parcelles agricoles amendées, irrigation par eaux usées traitées.',
          },
        ]
      : []),
    {
      id: 'diffus',
      titre: 'Apports diffus (retombées atmosphériques, bruit de fond)',
      court: 'Apports diffus',
      description: 'Niveaux faibles, carboxylates présents partout, pas de marqueur de source ponctuelle.',
      criteres: [
        matrice === 'eau'
          ? crit(
              'Somme des 20 sous la limite de l’eau du robinet (100 ng/l)',
              !e.somme ? 'na' : e.somme.inferieur || e.somme.valeur < 100 ? 'oui' : 'non',
              e.somme ? `Somme des 20 : ${e.somme.inferieur ? '< LQ' : `${Math.round(e.somme.valeur).toLocaleString('fr-FR')} ng/l`}.` : 'Pas de somme.',
            )
          : crit(
              'PFOS et PFOA au plus au bruit de fond néerlandais (1,4 et 1,9 µg/kg MS)',
              !analyse('PFOS') && !analyse('PFOA') ? 'na' : (!q('PFOS') || e.substances.PFOS!.valeur <= 1.4) && (!q('PFOA') || e.substances.PFOA!.valeur <= 1.9) ? 'oui' : 'non',
              `PFOS : ${e.substances.PFOS?.brut ?? 'non analysé'} ; PFOA : ${e.substances.PFOA?.brut ?? 'non analysé'}.`,
            ),
        crit(
          'Carboxylates quantifiés',
          vide ? 'na' : parts20.some((p) => PAR_ID[p.id].famille === 'PFCA') ? 'oui' : 'non',
          vide ? 'Aucun composé quantifié.' : `${parts20.filter((p) => PAR_ID[p.id].famille === 'PFCA').length} PFCA quantifiés.`,
        ),
        ftsCrit(false),
      ],
      refs: ['rankin2016', 'brusseau2020', 'rivm2020', 'anses2025'],
      terrain: 'Comparer à l’amont hydraulique ou à des sols témoins hors influence du site.',
    },
    {
      id: 'tfa',
      titre: 'Sources du TFA (fluides frigorigènes, pesticides, industrie)',
      court: 'Sources du TFA',
      description:
        'TFA, produit terminal de nombreux PFAS et rejet industriel direct ; présent presque partout, seul un niveau très supérieur au bruit de fond oriente vers une source locale.',
      criteres: [
        crit('TFA quantifié', !analyse('TFA') ? 'na' : q('TFA') ? 'oui' : 'non', e.substances.TFA ? `TFA : ${e.substances.TFA.brut}.` : 'TFA non analysé.'),
        crit(
          'TFA supérieur à la somme des 20',
          !analyse('TFA') || !e.somme ? 'na' : q('TFA') && (e.somme.inferieur || e.substances.TFA!.valeur > e.somme.valeur) ? 'oui' : 'non',
          'Fréquent même sans source ponctuelle.',
        ),
        ...(matrice === 'eau'
          ? [
              crit(
                'TFA au-dessus de la médiane nationale de l’eau traitée (780 ng/l)',
                !analyse('TFA') ? 'na' : q('TFA') && e.substances.TFA!.valeur > 780 ? 'oui' : 'non',
                'Médiane de la campagne ANSES ; une eau souterraine n’est pas une eau traitée, l’ordre de grandeur reste utile.',
              ),
            ]
          : []),
      ],
      refs: ['arp2024', 'anses2025'],
      terrain: 'Industrie du fluor, fabrication ou usage de fluides frigorigènes, parcelles traitées par des pesticides fluorés, rejets de stations d’épuration.',
    },
  ]

  return liste
    .map((p) => {
      const evalues = p.criteres.filter((c) => c.etat !== 'na')
      const oui = evalues.filter((c) => c.etat === 'oui').length
      const score = evalues.length ? oui / evalues.length : 0
      const verdict: Piste['verdict'] =
        evalues.length < 2 ? 'indetermine' : score === 1 ? 'compatible' : score >= 0.5 ? 'partiel' : 'peu'
      return { ...p, score, verdict }
    })
    .sort((a, b) => ordre(a) - ordre(b) || b.score - a.score)
}

const ORDRE: Record<Piste['verdict'], number> = { compatible: 0, partiel: 1, peu: 2, indetermine: 3 }
const ordre = (p: Piste) => ORDRE[p.verdict]

export const LIBELLES_VERDICT: Record<Piste['verdict'], string> = {
  compatible: 'Profil compatible',
  partiel: 'Partiellement compatible',
  peu: 'Peu compatible',
  indetermine: 'Non évaluable',
}
