/**
 * Completeness of the declaration against article R. 214-32 of the code de
 * l'environnement (version in force since 25 July 2022, décret n° 2022-989),
 * item by item, with where the dossier answers each one.
 */

import { syntheseDossier, type Dossier, type SectionId } from './modele'
import { texte } from './redaction'

export type EtatPiece = 'ok' | 'manquant' | 'a-verifier' | 'sans-objet'

export interface Piece {
  ref: string
  libelle: string
  etat: EtatPiece
  detail: string
  /** Where the dossier answers it. */
  ou: string
}

const rempli = (t: string | undefined) => !!t && t.trim().length > 0

/** Judged on the text the export will carry: the reader's, else the tool's
 * proposal. A proposal is never "ok" on its own — it has not been read. */
function etatTexte(d: Dossier, ids: SectionId[]): EtatPiece {
  const effectifs = ids.map((i) => texte(i, d))
  if (!effectifs.some(rempli)) return 'manquant'
  if (effectifs.some((x) => /\[À compléter/i.test(x))) return 'a-verifier'
  if (ids.some((i) => !rempli(d.textes[i]))) return 'a-verifier'
  return 'ok'
}

function detailTexte(d: Dossier, ids: SectionId[]): string {
  const trous = ids.reduce((n, i) => n + (texte(i, d).match(/\[À compléter/g)?.length ?? 0), 0)
  const nonRelus = ids.filter((i) => !rempli(d.textes[i])).length
  return [trous && `${trous} élément${trous > 1 ? 's' : ''} à compléter`, nonRelus && `${nonRelus > 1 ? `${nonRelus} propositions` : 'proposition'} de l’outil non relue${nonRelus > 1 ? 's' : ''}`].filter(Boolean).join(', ')
}

export function completude(d: Dossier): Piece[] {
  const s = syntheseDossier(d)
  const codes = new Set(s.retenues.filter((r) => r.classement.regime && r.classement.regime !== 'NC').map((r) => r.rubrique.code))
  const p: Piece[] = []
  const identite = rempli(d.declarant.nom) && rempli(d.declarant.adresse) && (d.declarant.morale ? rempli(d.declarant.siret) : rempli(d.declarant.dateNaissance))
  p.push({
    ref: 'R. 214-32 II 1°',
    libelle: 'Nom et adresse du déclarant, numéro SIRET ou, à défaut, date de naissance',
    etat: identite ? 'ok' : 'manquant',
    detail: identite ? d.declarant.nom : d.declarant.morale ? 'Nom, adresse et SIRET requis' : 'Nom, adresse et date de naissance requis',
    ou: 'Étude d’incidence, § 1',
  })
  const lieu = rempli(d.site.commune) && (rempli(d.site.parcelles) || d.site.lat !== null)
  p.push({
    ref: 'R. 214-32 II 2°',
    libelle: 'Emplacement du projet',
    etat: lieu ? 'ok' : 'manquant',
    detail: lieu ? [d.site.adresse, d.site.commune, d.site.parcelles && `parcelles ${d.site.parcelles}`].filter(Boolean).join(', ') : 'Commune et parcelles (ou coordonnées) requises',
    ou: 'Étude d’incidence, § 1',
  })
  p.push({
    ref: 'R. 214-32 II 2°',
    libelle: 'Pièce attestant la maîtrise foncière (propriété, droit de réaliser le projet ou procédure en cours)',
    etat: rempli(d.site.pieceMaitrise) ? 'ok' : 'manquant',
    detail: rempli(d.site.pieceMaitrise) ? d.site.pieceMaitrise : 'Joindre un titre de propriété, une attestation ou une convention',
    ou: 'Annexe',
  })
  p.push({
    ref: 'R. 214-32 II 3°',
    libelle: 'Rubriques de la nomenclature dont le projet relève',
    etat: !s.retenues.length ? 'manquant' : s.aCompleter.length ? 'a-verifier' : 'ok',
    detail: s.retenues.length
      ? s.retenues.map((r) => `${r.rubrique.code} (${r.classement.regime ?? '?'})`).join(', ') + (s.aCompleter.length ? ` — à compléter : ${s.aCompleter.join(' ; ')}` : '')
      : 'Aucune rubrique cochée',
    ou: 'Étude d’incidence, § 3',
  })
  p.push({
    ref: 'R. 214-32 II 3°',
    libelle: 'Nature, consistance, volume et objet du projet',
    etat: etatTexte(d, ['descriptionProjet']),
    detail: [d.ouvrages.length && `${d.ouvrages.length} ouvrage(s) décrit(s)`, detailTexte(d, ['descriptionProjet'])].filter(Boolean).join(', '),
    ou: 'Étude d’incidence, § 4',
  })
  p.push({
    ref: 'R. 214-32 II 4°',
    libelle: 'Résumé non technique',
    etat: etatTexte(d, ['contexteDemande', 'rntProjet', 'rntIncidences']),
    detail: `Document séparé. ${detailTexte(d, ['contexteDemande', 'rntProjet', 'rntIncidences'])}`.trim(),
    ou: 'Résumé non technique',
  })
  p.push({ ref: 'R. 214-32 II 5° a)', libelle: 'Raisons pour lesquelles le projet a été retenu parmi les alternatives', etat: etatTexte(d, ['choixProjet']), detail: detailTexte(d, ['choixProjet']), ou: 'Étude d’incidence, § 5' })
  p.push({
    ref: 'R. 214-32 II 5° b)',
    libelle:
      'Incidences directes et indirectes, temporaires et permanentes, sur la ressource en eau, le milieu aquatique, l’écoulement, le niveau et la qualité des eaux, y compris de ruissellement, compte tenu des variations saisonnières et climatiques',
    etat: etatTexte(d, ['incidencesQuantitatives', 'incidencesQualitatives', 'incidencesMilieux', 'variations']),
    detail: detailTexte(d, ['incidencesQuantitatives', 'incidencesQualitatives', 'incidencesMilieux', 'variations']),
    ou: 'Étude d’incidence, § 6',
  })
  p.push({
    ref: 'R. 214-32 II 5° c)',
    libelle: 'Compatibilité avec le SDAGE, le SAGE et le PGRI, contribution aux objectifs de l’article L. 211-1 et aux objectifs de qualité de l’article D. 211-10',
    etat: etatTexte(d, ['compatibiliteSdage', 'compatibiliteSage', 'compatibilitePgri', 'objectifsQualite']),
    detail: detailTexte(d, ['compatibiliteSdage', 'compatibiliteSage', 'compatibilitePgri', 'objectifsQualite']),
    ou: 'Étude d’incidence, § 7',
  })
  p.push({
    ref: 'R. 214-32 II 5° d)',
    libelle: 'Évaluation des incidences Natura 2000 (article R. 414-23)',
    etat: etatTexte(d, ['naturaAnalyse', 'naturaConclusion']),
    detail: d.naturaIncidence === 'absence' ? 'Évaluation préliminaire concluant à l’absence d’incidence (I de l’article R. 414-23)' : 'Évaluation complète (II et III de l’article R. 414-23)',
    ou: 'Évaluation des incidences Natura 2000 ; étude d’incidence, § 6.6',
  })
  p.push({ ref: 'R. 214-32 II 5° e)', libelle: 'Mesures d’évitement, de réduction ou de compensation', etat: etatTexte(d, ['mesuresErc']), detail: detailTexte(d, ['mesuresErc']), ou: 'Étude d’incidence, § 8' })
  p.push({
    ref: 'R. 214-32 II 5° f)',
    libelle: 'Demande de prescriptions spécifiques (le cas échéant)',
    etat: rempli(d.textes.prescriptionsSpecifiques) ? 'ok' : 'sans-objet',
    detail: '',
    ou: 'Étude d’incidence, § 9',
  })
  p.push({
    ref: 'R. 214-32 II 5° g)',
    libelle: 'Moyens de surveillance ou d’évaluation des prélèvements et des déversements',
    etat: etatTexte(d, ['moyensSurveillance']),
    detail: detailTexte(d, ['moyensSurveillance']),
    ou: 'Étude d’incidence, § 10',
  })
  p.push({
    ref: 'Recommandé (DDT)',
    libelle: 'Moyens d’intervention en cas d’incident ou d’accident',
    etat: etatTexte(d, ['moyensIntervention']),
    detail: detailTexte(d, ['moyensIntervention']),
    ou: 'Étude d’incidence, § 10',
  })
  const figures = d.figures.filter((f) => f.prevue)
  p.push({
    ref: 'R. 214-32 II 6°',
    libelle: 'Plans, cartes et schémas utiles à la compréhension du dossier',
    etat: figures.length ? 'a-verifier' : 'manquant',
    detail: figures.length ? `${figures.length} figure(s) à insérer : ${figures.map((f) => f.titre).join(' ; ')}` : 'Aucune figure prévue',
    ou: 'Figures',
  })
  p.push({
    ref: 'R. 214-32 II 7°',
    libelle: 'Autres autorisations ou déclarations déposées pour le même projet (date de dépôt, autorité)',
    etat: etatTexte(d, ['autresProcedures']),
    detail: detailTexte(d, ['autresProcedures']),
    ou: 'Étude d’incidence, § 11',
  })
  const m = d.mandat
  const mandatRempli = d.declarant.morale ? !!(m.representantNom && m.representantPrenom) : !!d.declarant.nom
  p.push({
    ref: 'Dépôt',
    libelle: 'Mandat de dépôt signé par le déclarant, si ERM dépose la déclaration sur Service-public.fr pour son compte',
    etat: mandatRempli ? 'a-verifier' : 'manquant',
    detail: mandatRempli ? 'Mandat à faire signer par le mandant et le mandataire' : 'Représentant du déclarant à renseigner (étape 7)',
    ou: 'Pièce du dépôt',
  })
  if (d.evalEnv === 'etude-impact')
    p.push({
      ref: 'R. 214-32 II 5°',
      libelle: 'Étude d’impact (articles R. 122-2 et R. 122-3-1) : elle remplace le document d’incidences et doit en contenir les éléments',
      etat: 'a-verifier',
      detail: 'Joindre l’étude d’impact',
      ou: 'Annexe',
    })
  if (d.evalEnv === 'dispense')
    p.push({ ref: 'R. 122-3-1', libelle: 'Décision de dispense d’évaluation environnementale après examen au cas par cas', etat: 'a-verifier', detail: 'Joindre la décision', ou: 'Annexe' })
  if (codes.has('2.1.1.0'))
    p.push({
      ref: 'R. 214-32 III',
      libelle: 'Assainissement : système de collecte, déversoirs d’orage, traitement, réutilisation éventuelle, coûts et financement',
      etat: 'a-verifier',
      detail: 'Pièces propres aux systèmes d’assainissement (1° à 5° du III)',
      ou: 'Annexe',
    })
  if (codes.has('2.1.3.0'))
    p.push({
      ref: 'R. 214-32 IV',
      libelle: 'Épandage de boues : étude préalable (R. 211-33), programme prévisionnel (R. 211-39), éléments de l’article R. 211-46',
      etat: 'a-verifier',
      detail: '',
      ou: 'Annexe',
    })
  if (codes.has('3.2.1.0') && d.rubriques.valeurs['3.2.1.0']?.groupee)
    p.push({
      ref: 'R. 214-32 VII',
      libelle: 'Plan de gestion : cohérence hydrographique, obstacles aux sports nautiques, programme pluriannuel, traitement des sédiments',
      etat: 'a-verifier',
      detail: '',
      ou: 'Annexe',
    })
  if (d.hydraulique)
    p.push({
      ref: 'R. 214-32 VIII',
      libelle: 'Énergie hydraulique : débit dérivé, hauteur de chute, puissance, capacités techniques et financières, maîtrise des terrains, plans des ouvrages',
      etat: 'a-verifier',
      detail: '',
      ou: 'Annexe',
    })
  return p
}

