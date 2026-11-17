/**
 * Checklists of the ATTES attestations of a certified SSP firm, from the
 * models of the arrêté du 9 février 2022 (art. 74, 83, 88, 97) and the code
 * de l'environnement articles that require them. Patterns run on the folded
 * text (lower case, no accents).
 */

import { contient, trouver, validerSiret, type Point, type Referentiel, type Texte, type Verdict } from './controles.ts'
import { S } from './sources.ts'

type Produit = 'ALUR' | 'SECUR' | 'MEMOIRE' | 'TRAVAUX'

const ARTICLE_REFERENTIEL: Record<Produit, number> = { ALUR: 2, SECUR: 3, MEMOIRE: 4, TRAVAUX: 5 }
const MODELE: Record<Produit, typeof S.modeleAlur> = { ALUR: S.modeleAlur, SECUR: S.modeleSecur, MEMOIRE: S.modeleMemoire, TRAVAUX: S.modeleTravaux }

/** References to the 2022 arrêté, not the 2018 one annulled in 2022, nor
 *  the voluntary LNE certification. */
function validerReferentiel(t: Texte): Verdict {
  const ok = trouver(t, /arrete (ministeriel )?du 0?9 fevrier 2022|arrete du 09\/02\/2022/)
  const ancien = trouver(t, /arrete (ministeriel )?du 19 decembre 2018/)
  if (ancien.length && !ok.length) {
    return {
      statut: 'invalide',
      detail: "L'attestation se réfère à l'arrêté du 19 décembre 2018, annulé par le Conseil d'État à compter du 1er mars 2022 : le modèle et la certification en vigueur sont ceux de l'arrêté du 9 février 2022.",
      extraits: ancien,
    }
  }
  if (ok.length) return { statut: 'present', extraits: ok }
  return { statut: 'absent', detail: "Aucune référence à l'arrêté du 9 février 2022." }
}

/** "Atteste, sans réserve" — an attestation with reservations is not one. */
function validerConclusion(motif: RegExp) {
  return (t: Texte): Verdict => {
    const ok = trouver(t, motif)
    const reserves = trouver(t, /atteste[^.]{0,160}(sous reserve|avec reserves?|sous (la |les )?conditions?)|sous reserve (de|que) /)
    if (reserves.length) {
      return { statut: 'invalide', detail: "Conclusion assortie de réserves ou de conditions : le modèle n'admet qu'une attestation sans réserve (seules des observations mineures sont tolérées).", extraits: reserves }
    }
    if (ok.length) return { statut: 'present', extraits: ok }
    if (contient(t, /atteste,? sans reserve/)) return { statut: 'a-verifier', detail: 'Une conclusion « Atteste, sans réserve » figure, mais pas dans la formulation du modèle.', extraits: trouver(t, /atteste,? sans reserve/) }
    return { statut: 'absent', detail: 'Pas de conclusion « Atteste, sans réserve … ».' }
  }
}

/** Cadastral parcels: "section AB n° 123", "AB 123", "parcelle(s) …". */
function validerParcelles(t: Texte): Verdict {
  const precises = trouver(t, /section\s+[a-z]{1,2}\b|\b(parcelles?|references? cadastrales?)\b[^.]{0,40}\b[a-z]{1,2}\s?(n°\s?)?\d{1,4}\b/)
  if (precises.length) return { statut: 'present', extraits: precises }
  const vagues = trouver(t, /parcelles? cadastrales?|references? cadastrales?|cadastr/)
  if (vagues.length) return { statut: 'a-verifier', detail: 'Le cadastre est cité, mais aucune référence de parcelle (section et numéro) n’a été reconnue.', extraits: vagues }
  return { statut: 'absent', detail: 'Aucune référence cadastrale trouvée.' }
}

function communs(p: Produit): Point[] {
  const produit = new RegExp(`attes[\\s-]*${p === 'MEMOIRE' ? 'm(e|é)moire' : p.toLowerCase()}`)
  return [
    {
      id: 'modele', groupe: 'Modèle et certification', niveau: 'obligatoire',
      intitule: 'Modèle réglementaire de l’arrêté du 9 février 2022',
      exigence: `L'entreprise « fait usage du modèle » fixé par l'arrêté du 9 février 2022 (art. ${({ ALUR: 74, SECUR: 83, MEMOIRE: 88, TRAVAUX: 97 })[p]}), qui a remplacé l'arrêté du 19 décembre 2018 annulé au 1er mars 2022.`,
      sources: [MODELE[p], S.arrete2022, S.annulation2018],
      valider: validerReferentiel,
      aide: 'Reprendre le modèle de l’arrêté du 9 février 2022 (Légifrance) et citer le référentiel de certification de son article ' + ARTICLE_REFERENTIEL[p] + '.',
    },
    {
      id: 'produit', groupe: 'Modèle et certification', niveau: 'obligatoire',
      intitule: `Prestation ATTES-${p} et référentiel de l’article ${ARTICLE_REFERENTIEL[p]}`,
      exigence: `Cadre A.1 : certification au titre du référentiel de l'article ${ARTICLE_REFERENTIEL[p]} de l'arrêté du 9 février 2022, pour la prestation ATTES-${p}.`,
      sources: [MODELE[p], S.lneCertificats],
      chercher: [produit],
      aide: 'Vérifier sur la liste du LNE que le certificat de l’entreprise couvre bien la prestation ATTES-' + p + ' (colonne « Produits certifiés »).',
    },
    {
      id: 'certificat', groupe: 'Modèle et certification', niveau: 'obligatoire',
      intitule: 'N° de certificat, organisme certificateur et validité',
      exigence: 'Cadre A.1 : n° de certificat, date de délivrance, date de fin de validité, organisme certificateur et son accréditation (ou cadre A.2 pour une entreprise équivalente).',
      sources: [MODELE[p], S.lneCertificats, S.lneRetraits, S.equivalences],
      chercher: [/certificat\w*\s*(n°|numero|no\b)|(n°|numero|no\b)\s*(de\s*|du\s*)?certificat/, /(valable jusqu|validite|date d.echeance|expire)/],
      tous: true,
      aide: 'Le certificat doit être en cours de validité à la date de l’attestation et l’établissement émetteur figurer parmi les établissements couverts : liste LNE des certificats et des retraits ; pour une entreprise étrangère, liste ministérielle des équivalences.',
    },
    {
      id: 'mentions', groupe: 'Modèle et certification', niveau: 'obligatoire',
      intitule: 'Mentions de certification dans le livrable (art. 50)',
      exigence:
        "Lorsque l'entreprise fait référence à sa certification dans ses livrables, elle reprend au minimum : les référentiels respectés (articles 2 à 6 de l'arrêté), l'organisme de certification, la révision du certificat si son numéro est cité, la marque de certification avec les prestations globales couvertes, et les établissements couverts.",
      sources: [S.article50, S.lneCertificats],
      chercher: [/organisme (de )?certifica|\blne\b/, /revision|indice/, /etablissements? (couverts?|certifies?)|etablissement emetteur/],
      tous: true,
      aide: "Reprendre ces mentions depuis le certificat (fiche LNE) : n° et révision, prestations globales, établissements couverts. Une entreprise suspendue ou retirée ne doit plus faire référence à la certification (art. 50 II).",
    },
    {
      id: 'siret', groupe: 'Identification', niveau: 'obligatoire',
      intitule: 'Entreprise certifiée identifiée (SIRET valide)',
      exigence: 'Identification de l’entreprise : dénomination, SIRET (obligatoire en l’absence de numéro d’identification unique), statut juridique, adresse.',
      sources: [MODELE[p], S.annuaire],
      valider: validerSiret,
      aide: 'Retrouver le SIRET de l’établissement émetteur sur l’annuaire des entreprises ; il doit correspondre à un établissement couvert par le certificat.',
    },
    {
      id: 'signature', groupe: 'Forme', niveau: 'obligatoire',
      intitule: 'Signataire, date, lieu, signature et cachet',
      exigence: 'Le modèle se termine par le nom du signataire, la date, le lieu, la signature et le cachet.',
      sources: [MODELE[p]],
      chercher: [/signature|signataire|cachet/],
      aide: 'Compléter le cadre de signature du modèle.',
    },
  ]
}

const exploitant = (p: Produit): Point[] => [
  {
    id: 'exploitant', groupe: 'Exploitant et installations', niveau: 'obligatoire',
    intitule: 'Exploitant : dénomination, code NAF, SIRET',
    exigence: 'Cadre exploitant du modèle : personne morale ou physique, dénomination, code NAF, SIRET, domicile, adresse d’exploitation.',
    sources: [MODELE[p], S.georisques, S.annuaire],
    chercher: [/exploitant/, /\bnaf\b|\bape\b/],
    tous: true,
    aide: 'Fiche ICPE sur Géorisques (raison sociale, SIRET, code AIOT, régime, IED) et annuaire des entreprises pour le code NAF.',
  },
  {
    id: 'regime', groupe: 'Exploitant et installations', niveau: 'obligatoire',
    intitule: 'Régime ICPE, statut IED et acte administratif',
    exigence: 'Régime actuel (autorisation, enregistrement, déclaration), installation IED oui / non, obligations de cessation, référence de l’arrêté préfectoral ou de la preuve de dépôt de la déclaration.',
    sources: [MODELE[p], S.georisques],
    chercher: [/\bied\b|emissions industrielles/, /arrete prefectoral|preuve de depot|recepisse/],
    tous: true,
    aide: 'Le régime, le statut IED et les arrêtés figurent sur la fiche de l’installation (Géorisques) ou dans le dossier de l’inspection.',
  },
  {
    id: 'aiot', groupe: 'Exploitant et installations', niveau: p === 'SECUR' ? 'attendu' : 'obligatoire',
    intitule: 'Code AIOT de l’installation',
    exigence: p === 'SECUR' ? 'Code AIOT « le cas échéant ».' : 'Code AIOT de l’installation (obligatoire dans ce modèle).',
    sources: [MODELE[p], S.georisques],
    chercher: [/\baiot\b/],
    aide: 'Le code AIOT (identifiant de l’installation) est donné sur la fiche Géorisques de l’établissement.',
  },
  {
    id: 'installations', groupe: 'Exploitant et installations', niveau: 'obligatoire',
    intitule: 'Installations mises à l’arrêt : rubriques, régime, capacité, date',
    exigence: 'Tableau des installations mises à l’arrêt : dénomination usuelle, rubrique et régime, capacité autorisée / enregistrée / déclarée, date de mise à l’arrêt.',
    sources: [MODELE[p]],
    chercher: [/rubriques?\s*(n°\s*)?\d{4}|\b[1-4]\d{3}-?\d?\b[^.]{0,30}\b(a|e|d|dc|autorisation|enregistrement|declaration)\b/, /mise a l.arret|arret definitif/],
    tous: true,
    aide: 'Reprendre les rubriques de la nomenclature ICPE de l’arrêté préfectoral ou du récépissé, et la date de mise à l’arrêt notifiée au préfet.',
  },
  {
    id: 'parcelles', groupe: 'Exploitant et installations', niveau: 'obligatoire',
    intitule: 'Parcelles concernées et surface totale',
    exigence: 'Tableau des parcelles (département, commune, section, numéro) et surface totale.',
    sources: [MODELE[p], S.cadastre],
    valider: validerParcelles,
    aide: 'Relever section et numéro de chaque parcelle de l’emprise sur cadastre.gouv.fr ; ils doivent correspondre à la notification de cessation.',
  },
]

const ALUR: Point[] = [
  ...communs('ALUR'),
  {
    id: 'cadre', groupe: 'Cadre et projet', niveau: 'obligatoire',
    intitule: 'Cadre : L. 556-1 (ancienne ICPE, changement d’usage) ou L. 556-2 (SIS)',
    exigence: 'Case « Attestation délivrée dans le cadre » : article L. 556-1 (changement d’usage d’un terrain ayant accueilli une ICPE) ou L. 556-2 (secteur d’information sur les sols).',
    sources: [S.modeleAlur, S.l5561, S.l5562, S.r5561B],
    chercher: [/l\.?\s?556-[12]\b/],
    aide: 'Vérifier sur Géorisques si le terrain est en SIS, ou s’il a accueilli une ICPE (cessation d’activité) : cela fixe le cadre à cocher.',
  },
  {
    id: 'maitre-ouvrage', groupe: 'Cadre et projet', niveau: 'obligatoire',
    intitule: 'Maître d’ouvrage identifié',
    exigence: 'Maître d’ouvrage de l’opération : personne physique (nom, adresse) ou morale (SIRET, code NAF, statut, adresse).',
    sources: [S.modeleAlur],
    chercher: [/maitre d.ouvrage/],
    aide: 'Reprendre l’identité du demandeur du permis (formulaire Cerfa du permis de construire ou d’aménager).',
  },
  {
    id: 'projet', groupe: 'Cadre et projet', niveau: 'obligatoire',
    intitule: 'Projet : dénomination, adresse, surface',
    exigence: 'Projet : dénomination de l’opération, adresse, références cadastrales, surface de la construction ou de l’aménagement.',
    sources: [S.modeleAlur],
    chercher: [/projet|operation/, /surface|\bm2\b|m²|\bha\b/],
    tous: true,
    aide: 'Dénomination, adresse et surface figurent dans le dossier de permis et la notice du projet.',
  },
  {
    id: 'parcelles', groupe: 'Cadre et projet', niveau: 'obligatoire',
    intitule: 'Références cadastrales du projet',
    exigence: 'Numéro des parcelles cadastrales concernées par l’opération, cohérentes avec celles de l’étude de sols (R. 556-2 II).',
    sources: [S.modeleAlur, S.r5562, S.cadastre],
    valider: validerParcelles,
    aide: 'Relever section et numéro sur cadastre.gouv.fr ; les comparer à l’emprise du SIS ou de l’ancienne ICPE et à celles de l’étude de sols.',
  },
  {
    id: 'usages', groupe: 'Cadre et projet', niveau: 'obligatoire',
    intitule: 'Usage avant et après l’opération (typologie D. 556-1 A)',
    exigence: 'Usages avant et après l’opération selon D. 556-1 A : industriel, tertiaire, résidentiel, récréatif de plein air, agricole, accueil de populations sensibles, renaturation, autre.',
    sources: [S.modeleAlur, S.d5561A],
    chercher: [/usage/, /industriel|tertiaire|residentiel|recreatif|agricole|populations sensibles|renaturation/],
    tous: true,
    aide: 'Employer les termes de la typologie de l’article D. 556-1 A pour l’usage actuel et l’usage projeté (zonage si plusieurs usages).',
  },
  {
    id: 'etude', groupe: 'Étude de sols et mesures', niveau: 'obligatoire',
    intitule: 'Étude de sols décrite : rapports, dates, auteur',
    exigence: 'Description de l’étude de sols : prestations contrôlées, références et dates des rapports (diagnostic et plan de gestion, R. 556-2 II), auteur (le bureau lui-même ou un autre, identifié).',
    sources: [S.modeleAlur, S.r5562, S.r5563],
    chercher: [/diagnostic|etude de sols?|plan de gestion/, /rapport|reference|version/],
    tous: true,
    aide: 'Lister les rapports de diagnostic et de plan de gestion (titre, référence, date, auteur) ; si le bureau a réalisé l’étude lui-même, son certificat doit couvrir l’annexe II (art. 2 II de l’arrêté).',
  },
  {
    id: 'documents-mo', groupe: 'Étude de sols et mesures', niveau: 'obligatoire',
    intitule: 'Documents du projet transmis par le maître d’ouvrage',
    exigence: 'Références et dates des documents de conception transmis par le maître d’ouvrage.',
    sources: [S.modeleAlur],
    chercher: [/(documents?|elements?|plans?) (transmis|fournis|communiques)/],
    aide: 'Citer les plans et notices du projet examinés (indice, date).',
  },
  {
    id: 'mesures', groupe: 'Étude de sols et mesures', niveau: 'obligatoire',
    intitule: 'Liste des mesures de gestion prises en compte',
    exigence: 'Liste des mesures de gestion de la pollution prises en compte dans la conception du projet.',
    sources: [S.modeleAlur, S.r5563],
    chercher: [/mesures? de gestion/],
    aide: 'Reprendre les mesures du plan de gestion (excavation, recouvrement, vide sanitaire, restrictions…) et indiquer comment le projet les intègre.',
  },
  {
    id: 'note', groupe: 'Étude de sols et mesures', niveau: 'obligatoire',
    intitule: 'Note de synthèse de l’analyse critique (référence et date)',
    exigence: 'Référence et date de la note de synthèse résumant l’analyse critique effectuée.',
    sources: [S.modeleAlur],
    chercher: [/note de synthese/],
    aide: 'Joindre ou référencer la note de synthèse de la prestation ATTES-ALUR.',
  },
  {
    id: 'travaux-anterieurs', groupe: 'Étude de sols et mesures', niveau: 'attendu',
    intitule: 'Le cas échéant, attestation de conformité des travaux de réhabilitation',
    exigence: '« Le cas échéant, référence des attestations garantissant la conformité des travaux de réhabilitation » (ATTES-TRAVAUX de la cessation ICPE).',
    sources: [S.modeleAlur, S.r5561],
    siConcerne: { motif: /l\.?\s?556-1\b|installation classee|icpe/, libelle: 'une ancienne installation classée' },
    chercher: [/attes[\s-]*travaux|conformite des travaux/],
    aide: 'Sur Géorisques, vérifier si une cessation d’activité a été menée sur le terrain ; si l’exploitant est inconnu ou a disparu, l’attestation doit justifier les démarches effectuées (R. 556-1 I).',
  },
  {
    id: 'conclusion', groupe: 'Conclusion', niveau: 'obligatoire',
    intitule: 'Conclusion « Atteste, sans réserve »',
    exigence: '« Atteste, sans réserve, que le maître d’ouvrage a pris en compte les mesures de gestion de la pollution des sols et des eaux souterraines nécessaires dans la conception du projet… »',
    sources: [S.modeleAlur],
    valider: validerConclusion(/atteste,? sans reserve,? que le maitre d.ouvrage a pris en compte les mesures de gestion/),
    aide: 'Reprendre la formule exacte du modèle ; une attestation avec réserves n’est pas une attestation.',
    correction: 'Atteste, sans réserve, que le maître d’ouvrage a pris en compte les mesures de gestion de la pollution des sols et des eaux souterraines nécessaires dans la conception du projet de construction ou d’aménagement affectant le site mentionné ci-dessus.',
  },
  {
    id: 'sensible', groupe: 'Transmission', niveau: 'attendu',
    intitule: 'Usage sensible : transmission à l’inspection et à l’ARS',
    exigence: 'Pour un usage d’accueil de populations sensibles, l’attestation est transmise à l’inspection des installations classées et à l’ARS dans les quinze jours suivant sa réception, au plus tard au dépôt de la demande (R. 556-1 II).',
    sources: [S.r5561],
    siConcerne: { motif: /populations? sensibles?|creche|ecole|etablissement (d.enseignement|sensible)|aire de jeux/, libelle: 'un usage sensible' },
    chercher: [/\bars\b|agence regionale de sante/],
    aide: 'Rappeler au maître d’ouvrage cette transmission ; elle n’a pas à figurer dans le modèle mais doit être faite.',
  },
]

const SECUR: Point[] = [
  ...communs('SECUR'),
  ...exploitant('SECUR'),
  {
    id: 'vulnerabilite', groupe: 'Mise en sécurité', niveau: 'obligatoire',
    intitule: 'Enjeux de l’étude de vulnérabilité',
    exigence: 'Enjeux identifiés : logements et activités proches, ICPE tiers, eaux souterraines (profondeur, nature, usages), eaux superficielles, autres enjeux sensibles.',
    sources: [S.modeleSecur],
    chercher: [/vulnerabilite|enjeux/, /eaux souterraines|nappe/],
    tous: true,
    aide: 'Reprendre l’étude historique et de vulnérabilité (prestations A110 / A120 de la norme NF X31-620).',
  },
  {
    id: 'evacuation', groupe: 'Mise en sécurité', niveau: 'obligatoire',
    intitule: 'Évacuation des produits dangereux et des déchets (quantités)',
    exigence: 'R. 512-75-1 IV 1° : évacuation des produits dangereux et gestion des déchets ; le modèle demande les quantités évacuées, dangereuses et non dangereuses.',
    sources: [S.r512751, S.modeleSecur],
    chercher: [/evacu|elimin/, /dechets?|produits? dangereux/],
    tous: true,
    aide: 'Justificatifs : registre des déchets, bordereaux de suivi (Trackdéchets), état des matières stockées.',
  },
  {
    id: 'acces', groupe: 'Mise en sécurité', niveau: 'obligatoire',
    intitule: 'Interdiction ou limitation d’accès',
    exigence: 'R. 512-75-1 IV 2° : interdictions ou limitations d’accès au site.',
    sources: [S.r512751, S.modeleSecur],
    chercher: [/acces/],
    aide: 'Décrire clôtures, fermetures, gardiennage, signalétique.',
  },
  {
    id: 'incendie', groupe: 'Mise en sécurité', niveau: 'obligatoire',
    intitule: 'Suppression des risques d’incendie et d’explosion',
    exigence: 'R. 512-75-1 IV 3° : suppression des risques d’incendie et d’explosion (inertage, dégazage, consignations).',
    sources: [S.r512751, S.modeleSecur],
    chercher: [/incendie|explosion|inertage|degazage/],
    aide: 'Joindre les certificats d’inertage ou de dégazage des cuves et les consignations (gaz, électricité).',
  },
  {
    id: 'surveillance', groupe: 'Mise en sécurité', niveau: 'obligatoire',
    intitule: 'Surveillance des effets sur l’environnement',
    exigence: 'R. 512-75-1 IV 4° : surveillance des effets de l’installation sur son environnement, au vu d’un diagnostic proportionné ; le modèle demande substances, milieux et fréquence.',
    sources: [S.r512751, S.modeleSecur],
    chercher: [/surveillance|suivi/],
    aide: 'Préciser substances suivies, milieux (eaux souterraines, gaz du sol…) et fréquence, ou justifier l’absence de surveillance.',
  },
  {
    id: 'ecarts', groupe: 'Mise en sécurité', niveau: 'obligatoire',
    intitule: 'Écarts par rapport à la notification, justifiés',
    exigence: 'Écarts entre les mesures annoncées dans la notification de cessation et celles réalisées, avec justification (note de synthèse, art. 81).',
    sources: [S.modeleSecur, S.livrableSecur, S.r512391],
    chercher: [/ecarts?/, /notification/],
    tous: true,
    aide: 'Comparer la notification de cessation (R. 512-39-1, R. 512-46-25 ou R. 512-66-1) aux opérations réalisées.',
  },
  {
    id: 'documents', groupe: 'Livrable', niveau: 'obligatoire',
    intitule: 'Liste des documents examinés et note de synthèse',
    exigence: 'Le livrable comprend la liste des installations et parcelles, la liste des documents examinés, une note de synthèse (avec cartes des diagnostics) et l’attestation.',
    sources: [S.livrableSecur],
    chercher: [/documents? (examines|consultes|analyses)|liste des documents/, /note de synthese/],
    tous: true,
    aide: 'Ajouter la liste des documents examinés et la note de synthèse prévues à l’article 81 de l’arrêté.',
  },
  {
    id: 'declaration', groupe: 'Livrable', niveau: 'attendu',
    intitule: 'Installation à déclaration : rubrique listée à R. 512-66-3',
    exigence: 'Pour une installation soumise à déclaration, l’ATTES-SECUR n’est exigée que pour les rubriques listées à l’article R. 512-66-3.',
    sources: [S.r512661, S.r512663],
    siConcerne: { motif: /soumise? a declaration|regime de (la )?declaration|\(dc?\)/, libelle: 'une installation soumise à déclaration' },
    aide: 'Comparer les rubriques de l’installation à la liste de R. 512-66-3.',
  },
  {
    id: 'conclusion', groupe: 'Conclusion', niveau: 'obligatoire',
    intitule: 'Conclusion « Atteste, sans réserve »',
    exigence: '« Atteste, sans réserve, que l’exploitant a mis en œuvre les mesures de mise en sécurité de l’ensemble des installations mises à l’arrêt définitif sur son site, conformément à l’article R. 512-75-1 ».',
    sources: [S.modeleSecur, S.l51261, S.l51276, S.l512121],
    valider: validerConclusion(/atteste,? sans reserve,? que l.exploitant a mis en (œ|oe)uvre les mesures de mise en securite/),
    aide: 'Reprendre la formule exacte du modèle.',
    correction: 'Atteste, sans réserve, que l’exploitant a mis en œuvre les mesures de mise en sécurité de l’ensemble des installations mises à l’arrêt définitif sur son site, conformément à l’article R. 512-75-1.',
  },
]

const MEMOIRE: Point[] = [
  ...communs('MEMOIRE'),
  ...exploitant('MEMOIRE'),
  {
    id: 'secur', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Références des attestations précédentes (ATTES-SECUR)',
    exigence: 'Références des précédentes attestations délivrées suite à la mise à l’arrêt.',
    sources: [S.modeleMemoire],
    chercher: [/attes[\s-]*secur|attestation de mise en securite/],
    aide: 'Citer l’ATTES-SECUR (n°, date, entreprise) transmise à l’inspection.',
  },
  {
    id: 'memoire', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Mémoire de réhabilitation référencé (nom, date, version, rédacteur)',
    exigence: 'Référence du mémoire de réhabilitation examiné ; le mémoire est transmis au préfet dans les six mois suivant l’arrêt définitif, accompagné de l’attestation.',
    sources: [S.modeleMemoire, S.r512393, S.r5124627],
    chercher: [/memoire de rehabilitation/],
    aide: 'Indiquer titre, référence, version, date et rédacteur du mémoire.',
  },
  {
    id: 'schema', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Schéma conceptuel avant et après travaux',
    exigence: 'Schéma conceptuel avant travaux (sources, transferts, milieux, voies d’exposition) et après mise en œuvre des mesures.',
    sources: [S.modeleMemoire],
    chercher: [/schema conceptuel/],
    aide: 'Reprendre le schéma conceptuel du diagnostic (R. 556-2) et celui projeté après travaux.',
  },
  {
    id: 'usage', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Usage futur et rapport de base',
    exigence: 'Usage futur (fixé par arrêté préfectoral ou déterminé selon R. 512-39-2 / R. 512-46-26) et existence d’un rapport de base (L. 515-30) oui / non.',
    sources: [S.modeleMemoire, S.r512393],
    chercher: [/usage futur|usage (retenu|envisage)/, /rapport de base/],
    tous: true,
    aide: 'L’usage futur figure dans l’arrêté préfectoral ou résulte de la procédure de R. 512-39-2 ; le rapport de base concerne les installations IED.',
  },
  {
    id: 'sources-concentrees', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Substances majoritaires et sources concentrées',
    exigence: 'Substances contribuant majoritairement au risque ; traitement des sources de pollution et suppression des pollutions concentrées (R. 512-39-3 I).',
    sources: [S.modeleMemoire, S.r512393],
    chercher: [/sources? (concentrees?|de pollution)|pollutions? concentrees?|zones? sources?/],
    aide: 'Identifier les sources concentrées et leur traitement ; un maintien sur site relève de la dérogation du 4° de R. 512-39-3 I.',
  },
  {
    id: 'bca', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Bilan coûts-avantages, scénarios et volumes',
    exigence: 'Synthèse des scénarios du bilan coûts-avantages avec volumes prévisionnels de terres et d’eaux ; scénario retenu et calendrier prévisionnel.',
    sources: [S.modeleMemoire, S.r512393],
    chercher: [/bilan couts?[\s-]*avantages/, /volumes?|\bm3\b|m³/, /calendrier/],
    tous: true,
    aide: 'Le bilan coûts-avantages compare plusieurs scénarios (prestation A330 de la norme) ; reporter volumes et calendrier du scénario retenu.',
  },
  {
    id: 'arr', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Analyse des risques résiduels prédictive',
    exigence: 'Justification du scénario retenu, y compris l’analyse des risques résiduels prédictive.',
    sources: [S.modeleMemoire],
    chercher: [/analyse des risques residuels/],
    aide: 'Joindre ou référencer l’ARR prédictive (prestation A320).',
  },
  {
    id: 'restrictions', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Surveillance, restrictions d’usage et conservation de la mémoire',
    exigence: 'Contrôles et surveillance pendant les travaux ; restrictions, surveillance et conservation de la mémoire après les travaux.',
    sources: [S.modeleMemoire, S.r512393],
    chercher: [/restrictions? d.usage|servitudes?|conservation de la memoire/, /surveillance/],
    tous: true,
    aide: 'Préciser les restrictions d’usage envisagées (SUP, servitudes conventionnelles) et le programme de surveillance.',
  },
  {
    id: 'cases', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Pollution hors site, imputabilité, exposition des populations',
    exigence: 'Trois réponses oui / non : pollution hors site ; pollutions toutes imputables au dernier exploitant ; « l’exposition des populations sur ou hors site ne peut être exclue » (si oui : transmission à l’ARS et information du préfet).',
    sources: [S.modeleMemoire, S.r512393],
    chercher: [/hors site/, /imputable/, /exposition des populations/],
    tous: true,
    aide: 'Renseigner les trois cases du modèle ; si l’exposition ne peut être exclue, l’exploitant transmet mémoire et attestation à l’ARS.',
  },
  {
    id: 'derogation', groupe: 'Mémoire de réhabilitation', niveau: 'obligatoire',
    intitule: 'Maintien de pollutions concentrées : conditions confirmées',
    exigence: 'En cas de maintien de pollutions concentrées sur site, l’attestation confirme que les conditions du 4° de R. 512-39-3 I sont remplies (pas d’atteinte aux intérêts protégés, transferts coupés, bilan environnemental plus favorable) ; le silence du préfet vaut alors rejet.',
    sources: [S.r512393, S.r5124627],
    siConcerne: { motif: /maintien[^.]{0,80}pollutions? concentrees?|pollutions? concentrees?[^.]{0,80}maintenu/, libelle: 'un maintien de pollutions concentrées' },
    aide: 'Le modèle de 2022 n’a pas de champ pour cette confirmation (exigence de 2025) : l’ajouter en observation de l’attestation.',
  },
  {
    id: 'documents', groupe: 'Livrable', niveau: 'obligatoire',
    intitule: 'Documents examinés et note de synthèse',
    exigence: 'Le livrable comprend la liste des documents examinés (dont le mémoire), une note de synthèse (études, diagnostics avec cartes, plan de gestion, bilan coûts-avantages, enjeux sanitaires) et l’attestation.',
    sources: [S.livrableMemoire],
    chercher: [/documents? (examines|consultes|analyses)|liste des documents/, /note de synthese/],
    tous: true,
    aide: 'Ajouter la liste des documents examinés et la note de synthèse prévues à l’article 86 de l’arrêté.',
  },
  {
    id: 'conclusion', groupe: 'Conclusion', niveau: 'obligatoire',
    intitule: 'Conclusion « Atteste, sans réserve »',
    exigence: '« Atteste, sans réserve, de l’adéquation des mesures proposées par l’exploitant pour la réhabilitation du site. »',
    sources: [S.modeleMemoire],
    valider: validerConclusion(/atteste,? sans reserve,? de l.adequation des mesures proposees/),
    aide: 'Reprendre la formule exacte du modèle.',
    correction: 'Atteste, sans réserve, de l’adéquation des mesures proposées par l’exploitant pour la réhabilitation du site.',
  },
]

const TRAVAUX: Point[] = [
  ...communs('TRAVAUX'),
  ...exploitant('TRAVAUX'),
  {
    id: 'independance', groupe: 'Travaux', niveau: 'obligatoire',
    intitule: 'Indépendance : l’entreprise n’a pas réalisé les travaux',
    exigence: 'L’entreprise qui atteste « ne peut pas être la même que celle qui a réalisé tout ou partie des travaux » (elle peut avoir rédigé le mémoire).',
    sources: [S.r512393, S.independanceTravaux],
    aide: 'Comparer la raison sociale et le SIRET de l’entreprise certifiée à ceux des entreprises de travaux du dossier de récolement.',
  },
  {
    id: 'precedentes', groupe: 'Travaux', niveau: 'obligatoire',
    intitule: 'Références des attestations précédentes (SECUR, MEMOIRE)',
    exigence: 'Références des attestations précédemment délivrées (mise en sécurité, mémoire).',
    sources: [S.modeleTravaux],
    chercher: [/attes[\s-]*(secur|memoire)/],
    aide: 'Citer l’ATTES-SECUR et l’ATTES-MEMOIRE (n°, date, entreprise).',
  },
  {
    id: 'objectifs', groupe: 'Travaux', niveau: 'obligatoire',
    intitule: 'Objectifs : arrêtés préfectoraux ou mémoire de réhabilitation',
    exigence: 'Rappel des usages, travaux et objectifs fixés par les arrêtés préfectoraux ou, à défaut, par le mémoire (référence, nom, date).',
    sources: [S.modeleTravaux, S.r512393],
    chercher: [/arrete prefectoral|memoire de rehabilitation/],
    aide: 'Citer l’arrêté préfectoral de prescriptions de réhabilitation, ou le mémoire en l’absence d’arrêté.',
  },
  {
    id: 'recolement', groupe: 'Travaux', niveau: 'obligatoire',
    intitule: 'Dossier de récolement et analyse des risques résiduels de fin de travaux',
    exigence: 'Référence du dossier de récolement (rapport de fin de travaux et analyse des risques résiduels de fin de travaux) : nom, date, version, rédacteur ; conclusions de l’ARR.',
    sources: [S.modeleTravaux, S.livrableTravaux],
    chercher: [/recolement|rapport de fin de travaux/, /analyse des risques residuels/],
    tous: true,
    aide: 'Joindre ou référencer le dossier de récolement et l’ARR de fin de travaux (prestation A320).',
  },
  {
    id: 'bilan', groupe: 'Travaux', niveau: 'obligatoire',
    intitule: 'Surface réhabilitée, techniques et volumes traités',
    exigence: 'Surface totale réhabilitée ; modes de traitement in situ / sur site / hors site, avec techniques, volumes de terres et d’eaux traités, quantités de polluants traités ; sources découvertes en cours de travaux.',
    sources: [S.modeleTravaux],
    chercher: [/surface/, /in situ|sur site|hors site/, /volumes?|\bm3\b|m³|tonnes?/],
    tous: true,
    aide: 'Reprendre les bilans du dossier de récolement (bordereaux, suivis de traitement).',
  },
  {
    id: 'residuelle', groupe: 'Travaux', niveau: 'obligatoire',
    intitule: 'Pollution résiduelle décrite et cartographiée',
    exigence: 'Description de la pollution résiduelle et annexe cartographique (cartes des sources résiduelles : teneurs et profondeurs par milieu).',
    sources: [S.modeleTravaux, S.livrableTravaux],
    chercher: [/pollution residuelle|teneurs residuelles/, /carte|cartograph|plan/],
    tous: true,
    aide: 'Ajouter les cartes des teneurs résiduelles par milieu (art. 95 de l’arrêté).',
  },
  {
    id: 'restrictions', groupe: 'Travaux', niveau: 'obligatoire',
    intitule: 'Restrictions, surveillance et conservation de la mémoire',
    exigence: 'Restrictions d’usage, surveillance et conservation de la mémoire en place ou en cours de mise en place.',
    sources: [S.modeleTravaux, S.livrableTravaux],
    chercher: [/restrictions? d.usage|servitudes?|conservation de la memoire|surveillance/],
    aide: 'Préciser les servitudes (SUP, servitudes conventionnelles) et la surveillance en place.',
  },
  {
    id: 'sis', groupe: 'Transmission', niveau: 'attendu',
    intitule: 'Projet de SIS si l’état n’est pas compatible avec un usage résidentiel ou sensible',
    exigence: 'Si l’exploitant ne démontre pas la compatibilité de l’état du site avec les usages résidentiel ou d’accueil de populations sensibles, il remet un projet de secteur d’information sur les sols avec l’attestation.',
    sources: [S.r512393],
    chercher: [/secteur d.information sur les sols|\bsis\b/],
    aide: 'Vérifier l’usage futur ; si résidentiel ou sensible non démontré, prévoir le projet de SIS.',
  },
  {
    id: 'destinataires', groupe: 'Transmission', niveau: 'attendu',
    intitule: 'Transmission au préfet, au maire ou à l’EPCI, aux propriétaires',
    exigence: 'L’exploitant transmet l’attestation au préfet, au maire ou au président de l’EPCI compétent en urbanisme, et aux propriétaires des terrains ; la cessation est réputée achevée deux mois après, sauf opposition.',
    sources: [S.r512393, S.r5124627],
    chercher: [/prefet/, /maire|epci/, /proprietaires?/],
    tous: true,
    aide: 'Rappeler les destinataires dans le courrier de transmission.',
  },
  {
    id: 'documents', groupe: 'Livrable', niveau: 'obligatoire',
    intitule: 'Documents examinés et notes de synthèse',
    exigence: 'Le livrable comprend la liste des documents examinés, une note comparant mesures prévues et réalisées, une note sur la surveillance et les restrictions, les cartes des sources résiduelles et l’attestation.',
    sources: [S.livrableTravaux],
    chercher: [/documents? (examines|consultes|analyses)|liste des documents/, /note de synthese/],
    tous: true,
    aide: 'Ajouter les éléments prévus à l’article 95 de l’arrêté.',
  },
  {
    id: 'conclusion', groupe: 'Conclusion', niveau: 'obligatoire',
    intitule: 'Conclusion « Atteste, sans réserve »',
    exigence: '« Atteste, sans réserve, que les travaux réalisés sont cohérents avec le mémoire de réhabilitation ou, le cas échéant, avec les objectifs prescrits par le préfet et que l’état du site est compatible avec l’usage futur défini. »',
    sources: [S.modeleTravaux],
    valider: validerConclusion(/atteste,? sans reserve,? que les travaux realises sont coherents/),
    aide: 'Reprendre la formule exacte du modèle.',
    correction: 'Atteste, sans réserve, que les travaux réalisés sont cohérents avec le mémoire de réhabilitation ou, le cas échéant, avec les objectifs prescrits par le préfet et que l’état du site est compatible avec l’usage futur défini.',
  },
]

const LIMITES_ATTES = [
  'Une recherche dans le texte dit si une information figure, pas si elle est juste : chaque point trouvé reste à relire.',
  'Le contenu détaillé des prestations (codes A110, A120, A320, A330…) relève de la norme NF X31-620 (AFNOR, payante) et n’est pas vérifié ici.',
  'La validité du certificat à la date de l’attestation, et le fait que l’établissement émetteur soit couvert, se vérifient sur la liste du LNE.',
]

export const REFERENTIELS_ATTES: Referentiel[] = [
  {
    id: 'attes-alur', titre: 'ATTES-ALUR', accroche: 'Permis de construire ou d’aménager',
    description: 'Attestation de prise en compte des mesures de gestion de la pollution dans la conception du projet (ancienne ICPE en changement d’usage, ou secteur d’information sur les sols).',
    cadre: [S.l5561, S.l5562, S.r5563, S.r43116, S.modeleAlur],
    points: ALUR, limites: LIMITES_ATTES,
  },
  {
    id: 'attes-secur', titre: 'ATTES-SECUR', accroche: 'Cessation d’activité ICPE — mise en sécurité',
    description: 'Attestation de la mise en œuvre des mesures de mise en sécurité lors de la mise à l’arrêt définitif d’une installation classée.',
    cadre: [S.l51261, S.r512391, S.r5124625, S.r512661, S.r512751, S.modeleSecur],
    points: SECUR, limites: LIMITES_ATTES,
  },
  {
    id: 'attes-memoire', titre: 'ATTES-MEMOIRE', accroche: 'Cessation d’activité ICPE — mémoire de réhabilitation',
    description: 'Attestation de l’adéquation des mesures proposées dans le mémoire de réhabilitation (installations soumises à autorisation ou à enregistrement).',
    cadre: [S.r512393, S.r5124627, S.modeleMemoire],
    points: MEMOIRE, limites: LIMITES_ATTES,
  },
  {
    id: 'attes-travaux', titre: 'ATTES-TRAVAUX', accroche: 'Cessation d’activité ICPE — fin des travaux',
    description: 'Attestation de la conformité des travaux de réhabilitation au mémoire ou aux objectifs prescrits par le préfet.',
    cadre: [S.r512393, S.r5124627, S.modeleTravaux],
    points: TRAVAUX, limites: LIMITES_ATTES,
  },
]
