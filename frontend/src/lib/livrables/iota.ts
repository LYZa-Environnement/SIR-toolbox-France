/**
 * Checklist of a declaration under the loi sur l'eau (IOTA) for the usual
 * SSP operations — piezometers and boreholes, pumping tests, pump and
 * treat, discharge of pumped water — from article R. 214-32 of the code de
 * l'environnement (version of the décret n° 2022-989), the nomenclature of
 * R. 214-1 and the general prescriptions of the rubriques concerned.
 */

import { contient, trouver, validerSiret, type Point, type Referentiel, type Texte, type Verdict } from './controles.ts'
import { PAR_CODE } from './nomenclatureIota.ts'
import { S } from './sources.ts'

const FORAGE = /piezometres?|forages?|sondages?|ouvrages? souterrains?/
const POMPAGE = /pompage|rabattement|prelevements?/
const REJET = /rejet|deversement/

/** Rubriques cited, read against the nomenclature; the usual omissions. */
function validerRubriques(t: Texte): Verdict {
  const codes = new Set<string>()
  for (const p of t.plies) for (const m of p.matchAll(/\b([1-5]\.\d\.\d\.\d)\b/g)) codes.add(m[1])
  const connus = [...codes].filter((c) => PAR_CODE.has(c))
  const inconnus = [...codes].filter((c) => !PAR_CODE.has(c))
  if (!connus.length) return { statut: 'absent', detail: 'Aucune rubrique de la nomenclature (n° x.x.x.x) trouvée.' }
  const manque: string[] = []
  if (contient(t, FORAGE) && !codes.has('1.1.1.0')) manque.push('1.1.1.0 (sondage, forage, piézomètre)')
  // Volumes over 10 000 m³/an: a withdrawal rubrique (D above that).
  const volumes = t.plies.flatMap((p) => [...p.matchAll(/(\d{1,3}(?:[\s.]\d{3})*|\d+)(?:,\d+)?\s*m(?:3|³)\s*\/\s*an\b/g)].map((m) => Number(m[1].replace(/[\s.]/g, ''))))
  const volumeMax = volumes.length ? Math.max(...volumes) : 0
  if (volumeMax > 10000 && !['1.1.2.0', '1.2.1.0', '1.3.1.0'].some((c) => codes.has(c))) manque.push(`1.1.2.0, ou 1.2.1.0 / 1.3.1.0 (prélèvement de ${volumeMax.toLocaleString('fr-FR')} m³/an, au-delà de 10 000 m³/an)`)
  if (contient(t, /rejet[^.]{0,80}(cours d.eau|fosse|milieu naturel|eaux (de )?surface|eaux superficielles)/) && !codes.has('2.2.3.0')) manque.push('2.2.3.0 (rejet en eaux de surface, flux avant traitement comparé au niveau R1)')
  const liste = connus.map((c) => `${c} — ${PAR_CODE.get(c)!.intitule}`).join(' ; ')
  if (manque.length) {
    return {
      statut: 'invalide',
      detail: `Rubriques citées : ${liste}. Rubrique(s) à examiner, l’opération décrite semblant en relever : ${manque.join(' ; ')}.${inconnus.length ? ` N° non reconnus : ${inconnus.join(', ')}.` : ''}`,
      extraits: trouver(t, /\b[1-5]\.\d\.\d\.\d\b/),
    }
  }
  return { statut: 'present', detail: `Rubriques citées : ${liste}.${inconnus.length ? ` N° non reconnus dans la nomenclature en vigueur : ${inconnus.join(', ')}.` : ''}`, extraits: trouver(t, /\b[1-5]\.\d\.\d\.\d\b/) }
}

/** Depth over 10 m: declaration under the code minier (L. 411-1). */
function validerCodeMinier(t: Texte): Verdict {
  let profondeurMax = 0
  for (const p of t.plies) {
    for (const m of p.matchAll(/profondeurs?[^.\d]{0,40}(\d+(?:[.,]\d+)?)\s*m\b/g)) profondeurMax = Math.max(profondeurMax, Number(m[1].replace(',', '.')))
  }
  if (profondeurMax && profondeurMax <= 10) return { statut: 'sans-objet', detail: `Profondeur la plus grande relevée : ${String(profondeurMax).replace('.', ',')} m (≤ 10 m).` }
  const cite = trouver(t, /l\.?\s?411-1|code minier|duplos/)
  if (cite.length) return { statut: 'present', extraits: cite }
  if (profondeurMax > 10) return { statut: 'absent', detail: `Profondeur relevée jusqu’à ${String(profondeurMax).replace('.', ',')} m : la déclaration au titre du code minier (L. 411-1) n’est pas mentionnée.` }
  return { statut: 'a-verifier', detail: 'Profondeur des ouvrages non reconnue dans le texte : vérifier si elle dépasse 10 m.' }
}

const POINTS: Point[] = [
  // ---- Identification and location (R. 214-32 II 1° and 2°) ----
  {
    id: 'declarant', groupe: 'Déclarant et emplacement', niveau: 'obligatoire',
    intitule: 'Déclarant : nom, adresse et SIRET',
    exigence: 'R. 214-32 II 1° : « nom et adresse du déclarant, ainsi que son numéro SIRET ou, à défaut, sa date de naissance ».',
    sources: [S.r21432, S.annuaire],
    valider: validerSiret,
    aide: 'Le SIRET du déclarant (maître d’ouvrage, pas le bureau d’études) se retrouve sur l’annuaire des entreprises.',
  },
  {
    id: 'mandat', groupe: 'Déclarant et emplacement', niveau: 'attendu',
    intitule: 'Mandat si un bureau d’études dépose pour le déclarant',
    exigence: 'Téléprocédure : un mandat signé est obligatoire lorsqu’un mandataire dépose la déclaration, avec son SIRET.',
    sources: [S.guideGunenv, S.teleprocedure],
    siConcerne: { motif: /mandataire|pour le compte de|bureau d.etudes?/, libelle: 'de mandataire' },
    chercher: [/mandat/],
    aide: 'Joindre le mandat signé par le déclarant.',
  },
  {
    id: 'emplacement', groupe: 'Déclarant et emplacement', niveau: 'obligatoire',
    intitule: 'Emplacement : commune, parcelles cadastrales, coordonnées',
    exigence: 'R. 214-32 II 2° : « l’emplacement sur lequel l’installation, l’ouvrage, les travaux ou l’activité doivent être réalisés ».',
    sources: [S.r21432, S.cadastre, S.guideGunenv],
    chercher: [/parcelles?|cadastr|section\s+[a-z]{1,2}\b/, /coordonnees|lambert|wgs ?84|\bx\s*[:=]/],
    tous: true,
    aide: 'Parcelles sur cadastre.gouv.fr ; coordonnées des ouvrages en Lambert 93 (Géoportail).',
  },
  {
    id: 'droit', groupe: 'Déclarant et emplacement', niveau: 'obligatoire',
    intitule: 'Droit du déclarant sur le terrain',
    exigence: 'R. 214-32 II 2° : document attestant que le déclarant est propriétaire du terrain, ou qu’il dispose du droit d’y réaliser son projet, ou qu’une procédure est en cours pour lui conférer ce droit.',
    sources: [S.r21432],
    chercher: [/proprietaire|titre de propriete|convention|autorisation d.occupation|droit d.y realiser|accord du proprietaire/],
    aide: 'Piézomètres chez des tiers ou sur le domaine public : joindre la convention signée, l’autorisation d’occupation ou le titre de propriété.',
  },
  // ---- Operation and nomenclature (3°) ----
  {
    id: 'consistance', groupe: 'Opération et nomenclature', niveau: 'obligatoire',
    intitule: 'Nature, consistance, volume : nombre, profondeur, diamètre, débits',
    exigence: 'R. 214-32 II 3° : la nature, la consistance, le volume et l’objet de l’opération (nombre, profondeur et diamètre des ouvrages, débits et volumes pompés et rejetés, durée).',
    sources: [S.r21432],
    chercher: [/profondeur/, /diametre|debit|volume/],
    tous: true,
    aide: 'Ces données servent à vérifier les seuils des rubriques ; les reprendre de la note technique du projet.',
  },
  {
    id: 'rubriques', groupe: 'Opération et nomenclature', niveau: 'obligatoire',
    intitule: 'Rubriques de la nomenclature et régime justifiés',
    exigence: 'R. 214-32 II 3° : « la ou les rubriques de la nomenclature dans lesquelles ils doivent être rangés », y compris en cas de cumul d’opérations d’une même personne sur le même milieu (R. 214-42).',
    sources: [S.r21432, S.r2141, S.nomenclatureAida, S.livre2Aida],
    valider: validerRubriques,
    aide: 'Comparer débits et volumes aux seuils de la nomenclature en vigueur ; omissions fréquentes : 1.1.2.0 au-delà de 10 000 m³/an, 2.2.3.0 avec le flux avant traitement, 3.3.1.0 si un rabattement assèche une zone humide.',
  },
  {
    id: 'cumul', groupe: 'Opération et nomenclature', niveau: 'attendu',
    intitule: 'Cumul des ouvrages et campagnes successives',
    exigence: 'R. 214-42 : une seule déclaration pour des opérations de la même personne sur le même milieu dont l’ensemble dépasse le seuil, même si chacune est en dessous, réalisées simultanément ou successivement.',
    sources: [S.livre2Aida],
    siConcerne: { motif: /campagnes?|phases?|tranches?|plusieurs (ouvrages|puits|piezometres)/, libelle: 'plusieurs ouvrages ou campagnes' },
    chercher: [/cumul|ensemble des (ouvrages|operations)|r\.?\s?214-42/],
    aide: 'Additionner volumes et débits de tous les ouvrages et campagnes du projet avant de comparer aux seuils.',
  },
  // ---- Document d'incidences (4° and 5°) ----
  {
    id: 'rnt', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Résumé non technique',
    exigence: 'R. 214-32 II 4° : un résumé non technique (pièce obligatoire de la téléprocédure).',
    sources: [S.r21432, S.guideGunenv],
    chercher: [/resume non technique/],
    aide: 'Ajouter une à deux pages résumant le projet et ses incidences pour un lecteur non spécialiste.',
  },
  {
    id: 'alternatives', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Raisons du choix parmi les solutions alternatives',
    exigence: 'R. 214-32 II 5° a) : les raisons pour lesquelles le projet a été retenu parmi les solutions alternatives.',
    sources: [S.r21432],
    chercher: [/solutions? alternatives?|variantes?|raisons? (pour lesquelles|du choix)/],
    aide: 'Expliquer pourquoi ces ouvrages, cet emplacement, ce mode de pompage ou de rejet ont été retenus.',
  },
  {
    id: 'incidences', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Incidences sur la ressource en eau et le milieu aquatique',
    exigence: 'R. 214-32 II 5° b) : incidences sur la ressource en eau, le milieu aquatique, l’écoulement, le niveau et la qualité des eaux, selon les procédés, le fonctionnement, la nature, l’origine et le volume des eaux, compte tenu des variations saisonnières et climatiques.',
    sources: [S.r21432],
    chercher: [/incidences?/, /eaux souterraines|nappe|ressource en eau|qualite des eaux/],
    tous: true,
    aide: 'En SSP : rayon d’influence, mobilisation du panache, mise en communication d’aquifères, qualité des eaux rejetées.',
  },
  {
    id: 'sdage', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Compatibilité avec le SDAGE et le PGRI',
    exigence: 'R. 214-32 II 5° c) : compatibilité avec le SDAGE et le PGRI, contribution aux objectifs de L. 211-1 et aux objectifs de qualité des eaux.',
    sources: [S.r21432, S.sandre],
    chercher: [/\bsdage\b/],
    aide: 'Identifier la masse d’eau (code Sandre) et le SDAGE 2022-2027 du bassin (agence de l’eau).',
  },
  {
    id: 'pgri', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Plan de gestion des risques d’inondation (PGRI)',
    exigence: 'R. 214-32 II 5° c) : compatibilité avec le plan de gestion des risques d’inondation (L. 566-7).',
    sources: [S.r21432],
    chercher: [/\bpgri\b|plan de gestion des risques d.inondation/],
    aide: 'Citer le PGRI du bassin et indiquer si le site est en zone inondable.',
  },
  {
    id: 'sage', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'SAGE : compatibilité et conformité au règlement',
    exigence: 'R. 214-32 II 5° c) : compatibilité avec le SAGE ; le règlement d’un SAGE approuvé est opposable aux IOTA (conformité requise).',
    sources: [S.r21432, S.gesteau],
    chercher: [/\bsage\b|schema d.amenagement et de gestion des eaux/],
    aide: 'Chercher sur Gest’eau si le site est dans le périmètre d’un SAGE ; si aucun, l’écrire.',
  },
  {
    id: 'natura', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Évaluation des incidences Natura 2000',
    exigence: 'R. 214-32 II 5° d) et R. 414-19 : évaluation des incidences Natura 2000 obligatoire pour toute déclaration IOTA, que le projet soit ou non dans un site ; contenu minimal de R. 414-23 I (présentation, carte, raisons de l’absence ou de la présence d’incidence, sites susceptibles d’être affectés).',
    sources: [S.r21432, S.r41419, S.r41423, S.inpn],
    chercher: [/natura 2000/],
    aide: 'Identifier sur l’INPN les sites Natura 2000 proches ; au minimum, l’évaluation simplifiée de R. 414-23 I.',
  },
  {
    id: 'erc', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Mesures d’évitement, de réduction ou de compensation',
    exigence: 'R. 214-32 II 5° e) : les mesures correctives ou compensatoires envisagées, s’il y a lieu.',
    sources: [S.r21432],
    chercher: [/eviter|reduire|compens|mesures? (correctives|de reduction|d.evitement)/],
    aide: 'Décrire par exemple le traitement des eaux pompées, la limitation des débits, la protection des têtes d’ouvrage.',
  },
  {
    id: 'surveillance', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Moyens de surveillance (prélèvements, rejets)',
    exigence: 'R. 214-32 II 5° g) : les moyens de surveillance ou d’évaluation prévus en phases de construction et de fonctionnement, notamment pour les prélèvements et les déversements.',
    sources: [S.r21432],
    chercher: [/surveillance|suivi|compteur|controle/],
    aide: 'Préciser compteur volumétrique, suivi piézométrique, analyses du rejet et leurs fréquences.',
  },
  {
    id: 'plans', groupe: 'Résumé et document d’incidences', niveau: 'obligatoire',
    intitule: 'Plans et cartes',
    exigence: 'R. 214-32 II 6° : les éléments graphiques, plans ou cartes utiles à la compréhension (situation, implantation des ouvrages, point de rejet, coupes).',
    sources: [S.r21432, S.guideGunenv],
    chercher: [/plan de situation|plan d.implantation|carte|coupe (technique|previsionnelle)|figure/],
    aide: 'Joindre un plan de situation et un plan d’implantation des ouvrages et du point de rejet.',
  },
  {
    id: 'autres', groupe: 'Résumé et document d’incidences', niveau: 'attendu',
    intitule: 'Autres autorisations ou déclarations du projet',
    exigence: 'R. 214-32 II 7° : mention des autorisations ou déclarations déjà sollicitées pour le projet au titre d’une autre législation, avec date et autorité.',
    sources: [S.r21432],
    chercher: [/code minier|icpe|installation classee|dict|autorisation de deversement|permis/],
    aide: 'Citer, par exemple, la déclaration code minier, la DICT, le dossier ICPE ou l’autorisation de déversement au réseau.',
  },
  // ---- SSP operations ----
  {
    id: 'forage-chantier', groupe: 'Forages et piézomètres (1.1.1.0)', niveau: 'obligatoire',
    intitule: 'Chantier : entreprise de forage, dates, techniques, comblement',
    exigence: 'Arrêté du 11 septembre 2003 (1.1.1.0), art. 5 : au moins un mois avant les travaux, dates de chantier, entreprise de forage, techniques de réalisation, d’équipement et de comblement, modalités des essais de pompage et de rejet des eaux pompées (dans le dossier ou par courrier).',
    sources: [S.apgForage, S.apgForage2026],
    siConcerne: { motif: FORAGE, libelle: 'de forage ni de piézomètre' },
    chercher: [/foreur|entreprise de forage|societe de forage/, /comblement|cimentation|rebouch/],
    tous: true,
    aide: 'Si ces éléments ne sont pas dans le dossier, ils doivent être transmis au préfet au moins un mois avant le début des travaux.',
  },
  {
    id: 'forage-tete', groupe: 'Forages et piézomètres (1.1.1.0)', niveau: 'attendu',
    intitule: 'Cimentation de l’annulaire et protection de la tête',
    exigence: 'Arrêté du 11 septembre 2003, art. 7 et 8 : cimentation de l’espace annulaire en partie supérieure, tête protégée et fermée, plaque portant les références du récépissé.',
    sources: [S.apgForage],
    siConcerne: { motif: FORAGE, libelle: 'de forage ni de piézomètre' },
    chercher: [/cimentation|cimente|annulaire/, /tete|capot|bouche a cle/],
    tous: true,
    aide: 'Décrire la cimentation, la tête d’ouvrage (capot, bouche à clé) et sa fermeture.',
  },
  {
    id: 'code-minier', groupe: 'Forages et piézomètres (1.1.1.0)', niveau: 'obligatoire',
    intitule: 'Ouvrages de plus de 10 m : déclaration au titre du code minier',
    exigence: 'Code minier, art. L. 411-1 : tout sondage ou ouvrage souterrain de plus de dix mètres de profondeur fait l’objet d’une déclaration préalable (téléservice DUPLOS du BRGM, qui donne aussi le code BSS).',
    sources: [S.codeMinier, S.duplos],
    siConcerne: { motif: FORAGE, libelle: 'de forage ni de piézomètre' },
    valider: validerCodeMinier,
    aide: 'Déclarer les ouvrages sur DUPLOS et reporter le code BSS dans le rapport de fin de travaux.',
  },
  {
    id: 'fin-travaux', groupe: 'Forages et piézomètres (1.1.1.0)', niveau: 'attendu',
    intitule: 'Rapport de fin de travaux annoncé (2 mois, code BSS)',
    exigence: 'Arrêté du 11 septembre 2003, art. 10 : rapport de fin de travaux au préfet dans les deux mois (localisation, coupes géologique et technique, cote NGF, code BSS, comblements, essais) ; à partir du 31 décembre 2027, transmission sous trois mois (arrêté du 18 mars 2026).',
    sources: [S.apgForage, S.apgForage2026],
    siConcerne: { motif: FORAGE, libelle: 'de forage ni de piézomètre' },
    chercher: [/rapport de fin de travaux|compte[\s-]rendu de fin de travaux/],
    aide: 'S’engager dans le dossier à remettre le rapport de fin de travaux dans le délai réglementaire.',
  },
  {
    id: 'compteur', groupe: 'Pompages et rabattement', niveau: 'obligatoire',
    intitule: 'Compteur volumétrique et registre des prélèvements',
    exigence: 'Arrêté du 11 septembre 2003 (prélèvements), art. 8, 10 et 11 : compteur volumétrique, registre conservé trois ans, synthèse annuelle au préfet dans les deux mois suivant la fin de l’année civile ou de la campagne.',
    sources: [S.apgPrelevement],
    siConcerne: { motif: POMPAGE, libelle: 'de pompage' },
    chercher: [/compteur/],
    aide: 'Prévoir un compteur volumétrique sans remise à zéro et un registre des volumes.',
  },
  {
    id: 'debits', groupe: 'Pompages et rabattement', niveau: 'obligatoire',
    intitule: 'Débit instantané et volume annuel déclarés',
    exigence: 'Seuils des rubriques 1.1.2.0 (D au-delà de 10 000 m³/an, A à partir de 200 000 m³/an), 1.2.1.0 en nappe d’accompagnement, 1.3.1.0 en zone de répartition des eaux.',
    sources: [S.r2141, S.nomenclatureAida],
    siConcerne: { motif: POMPAGE, libelle: 'de pompage' },
    chercher: [/m(3|³)\s*\/\s*h/, /m(3|³)\s*\/\s*an|volume annuel/],
    tous: true,
    aide: 'Indiquer débit (m³/h) et volume annuel (m³/an), cumulés sur tous les ouvrages et campagnes.',
  },
  {
    id: 'zre', groupe: 'Pompages et rabattement', niveau: 'attendu',
    intitule: 'Zone de répartition des eaux (ZRE)',
    exigence: 'En ZRE, les seuils de la rubrique 1.3.1.0 s’appliquent (A à partir de 8 m³/h).',
    sources: [S.r2141, S.livre2Aida],
    siConcerne: { motif: POMPAGE, libelle: 'de pompage' },
    chercher: [/zone de repartition|\bzre\b/],
    aide: 'Vérifier l’arrêté ZRE du bassin (site de la préfecture) pour la commune et la profondeur concernées.',
  },
  {
    id: 'rejet-r1', groupe: 'Rejets des eaux pompées', niveau: 'obligatoire',
    intitule: 'Rejet en eaux de surface : flux avant traitement comparé au niveau R1',
    exigence: 'Rubrique 2.2.3.0 : le flux total de pollution, « le cas échéant avant traitement », comparé au niveau de référence R1 de l’arrêté du 9 août 2006 pour chaque paramètre.',
    sources: [S.r2141, S.arrete2006],
    siConcerne: { motif: /rejet[^.]{0,80}(cours d.eau|fosse|milieu naturel|eaux (de )?surface|eaux superficielles)/, libelle: 'de rejet en eaux de surface' },
    chercher: [/\br1\b|niveau de reference|9 aout 2006/],
    aide: 'Calculer pour chaque paramètre la concentration maximale avant traitement × le débit de rejet, et la comparer au tableau I de l’arrêté du 9 août 2006.',
  },
  {
    id: 'rejet-modalites', groupe: 'Rejets des eaux pompées', niveau: 'obligatoire',
    intitule: 'Devenir des eaux pompées décrit',
    exigence: 'Arrêté du 11 septembre 2003 (1.1.1.0), art. 5 et 7 : modalités de rejet des eaux pompées, traitement adapté à la sensibilité du milieu récepteur.',
    sources: [S.apgForage],
    siConcerne: { motif: POMPAGE, libelle: 'de pompage' },
    chercher: [REJET],
    aide: 'Indiquer le point de rejet (réseau, milieu naturel, citerne) et le traitement ; un rejet au réseau public demande une autorisation de déversement.',
  },
  // ---- Procedure ----
  {
    id: 'delai', groupe: 'Procédure', niveau: 'attendu',
    intitule: 'Délai d’opposition de deux mois avant travaux',
    exigence: 'R. 214-35 : les travaux ne peuvent commencer avant l’expiration du délai d’opposition de deux mois à compter du dossier complet (sauf non-opposition expresse).',
    sources: [S.r21435, S.r21433],
    chercher: [/deux mois|2 mois|opposition/],
    aide: 'Caler le planning : récépissé, puis deux mois avant le début des travaux.',
  },
  {
    id: 'cas-par-cas', groupe: 'Procédure', niveau: 'attendu',
    intitule: 'Évaluation environnementale : cas par cas le cas échéant',
    exigence: 'Annexe à R. 122-2 : captages de 200 000 m³/an ou plus, forages pour l’eau de 50 m et plus, autres forages de plus de 100 m soumis au cas par cas ; clause filet de R. 122-2-1 (l’examen suspend le délai d’opposition).',
    sources: [S.r12221],
    chercher: [/cas par cas|evaluation environnementale|etude d.impact/],
    aide: 'Vérifier les seuils de l’annexe à R. 122-2 ; sinon, l’écrire.',
  },
]

export const REFERENTIEL_IOTA: Referentiel = {
  id: 'iota', titre: 'Déclaration IOTA', accroche: 'Loi sur l’eau — forages, pompages, rejets',
  description: 'Dossier de déclaration au titre des articles L. 214-1 et suivants du code de l’environnement pour les opérations SSP : piézomètres et forages, pompages d’essai, pompage-traitement, rejets des eaux pompées.',
  cadre: [S.r21432, S.r2141, S.r21435, S.teleprocedure],
  points: POINTS,
  limites: [
    'Une recherche dans le texte dit si une information figure, pas si elle est juste : chaque point trouvé reste à relire.',
    'Au 31 décembre 2027, l’arrêté du 18 mars 2026 remplace celui du 11 septembre 2003 pour les forages (entreprise de forage certifiée, rapport de fin de travaux sous trois mois) : se référer à la date des travaux.',
    'Une opération rattachée à une installation classée relève de son arrêté préfectoral ICPE, non d’une déclaration IOTA autonome (L. 214-7).',
    'Réinjection d’eaux traitées en nappe : la rubrique applicable (5.1.1.0, 2.3.1.0 ou 2.3.2.0) est à confirmer avec la DDT(M).',
  ],
}
