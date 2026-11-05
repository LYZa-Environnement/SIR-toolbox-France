/**
 * Checklists drawn from the NF X31-620 standard (December 2021, parts 1 to
 * 5) and from the LNE SSP certification referential (revision 8, May
 * 2026). The standard is AFNOR's and not public: the app holds only short
 * paraphrases with the clause they come from, for the reader to check
 * against their own copy.
 */

import nf1 from '../../data/livrables/nf1-lne.json' with { type: 'json' }
import nf345 from '../../data/livrables/nf345.json' with { type: 'json' }
import type { Point, Referentiel, Source } from './controles.ts'

interface PointBrut {
  id: string
  groupe: string
  intitule: string
  exigence: string
  clause: string
  niveau: string
  motifs: string[]
  tous?: boolean
  aide: string
  siConcerne?: { motif: string; libelle: string }
}

interface ReferentielBrut {
  id: string
  titre: string
  description: string
  points: PointBrut[]
}

const LNE = 'https://www.lne.fr/fr/certification/certification-sites-sols-pollues'

/** A clause of the standard has no public page; the LNE referential has. */
function source(clause: string): Source {
  return /lne/i.test(clause) ? { libelle: clause, url: LNE } : { libelle: `${clause} (norme AFNOR, à consulter sur votre exemplaire)`, url: '' }
}

function point(p: PointBrut): Point {
  return {
    id: p.id,
    groupe: p.groupe,
    intitule: p.intitule,
    exigence: p.exigence,
    sources: [source(p.clause)],
    niveau: p.niveau === 'obligatoire' ? 'obligatoire' : 'attendu',
    chercher: p.motifs.map((m) => new RegExp(m)),
    tous: p.tous,
    aide: p.aide,
    siConcerne: p.siConcerne ? { motif: new RegExp(p.siConcerne.motif), libelle: p.siConcerne.libelle } : undefined,
  }
}

const LIMITES = [
  'Exigences de la norme NF X31-620 (décembre 2021) et du référentiel LNE SSP paraphrasées : leur formulation complète est dans le texte de la norme (AFNOR) et du référentiel.',
  'Une recherche dans le texte dit si une information figure, pas si elle est juste : chaque point trouvé reste à relire, comme en revue de rapport.',
  'Les logos et les éléments des figures ou des images ne sont pas lus : à vérifier visuellement.',
]

const GENERAUX = ['rapport-general', 'marque-lne']

const COURTS: Record<string, string> = {
  'rapport-general': 'Exigences générales (NF X31-620-1, LNE)',
  'marque-lne': 'Marque LNE SSP',
  'nf5-alur': 'NF X31-620-5',
}

const CATEGORIES: [RegExp, string, string[]][] = [
  [/^nf3-/, 'Ingénierie des travaux (NF X31-620-3)', GENERAUX],
  [/^nf4-/, 'Exécution des travaux (NF X31-620-4)', GENERAUX],
  [/^nf2-/, 'Rapports d’études (NF X31-620-2)', GENERAUX],
  [/^rapport-general$/, 'Exigences communes et certification LNE', ['marque-lne']],
  [/^offre$/, 'Exigences communes et certification LNE', ['marque-lne']],
  [/^marque-lne$/, 'Exigences communes et certification LNE', []],
]

function referentiel(r: ReferentielBrut): Referentiel {
  const [, categorie, complements] = CATEGORIES.find(([re]) => re.test(r.id)) ?? [null, 'Autres', []]
  const code = r.titre.split(/\s+[—–-]\s+/)[0]
  return {
    id: r.id,
    titre: r.titre,
    accroche: code !== r.titre ? code : r.id.replace(/^nf\d-/, '').toUpperCase(),
    description: r.description,
    categorie,
    complements: complements.filter((c) => c !== r.id),
    // The ATTES-ALUR additions of part 5 complete the regulatory model; not a choice of their own.
    masque: r.id === 'nf5-alur',
    court: COURTS[r.id],
    cadre: [{ libelle: 'Norme NF X31-620 (décembre 2021), parties 1 à 5 — AFNOR', url: '' }, { libelle: 'Référentiel de certification LNE SSP, révision 8 (mai 2026)', url: LNE }],
    points: r.points.map(point),
    limites: LIMITES,
  }
}

export const REFERENTIELS_NORMES: Referentiel[] = [...(nf1.referentiels as ReferentielBrut[]), ...(nf345.referentiels as ReferentielBrut[])].map(referentiel)
