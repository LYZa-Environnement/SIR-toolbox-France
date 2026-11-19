# Vérification de livrables SSP

Page : `frontend/src/pages/VerificationLivrables.tsx` — catégorie
**4. Contrôle de conformité**. Code : `frontend/src/lib/livrables/`.

Contrôle d'un livrable réglementé déposé en PDF, Word ou texte, en un ou
plusieurs documents vérifiés ensemble. Les documents sont lus dans le
navigateur (`extraction.ts`).

## Livrables couverts

- **ATTES-ALUR, ATTES-SECUR, ATTES-MEMOIRE, ATTES-TRAVAUX** : modèles de
  l'arrêté du 9 février 2022 (`attes.ts`).
- **Déclaration IOTA** : article R. 214-32, nomenclature R. 214-1,
  prescriptions générales des rubriques SSP (`iota.ts`,
  `nomenclatureIota.ts`).
- **Rapports d'études, de travaux et offres** au regard de la norme
  NF X31-620 (décembre 2021, parties 1 à 5) et du référentiel de
  certification LNE SSP (rév. 8) : rapports LEVE, INFOS, DIAG, PG, IEM,
  SUIVI, BQ, CONT, XPER, VERIF, AMO (partie 2).

Les points de la norme sont paraphrasés avec leur clause, sans reprendre le
texte de la norme (`src/data/livrables/*.json`, `normes.ts`).

## Résultat du contrôle

Chaque point de contrôle est recherché dans le texte (`controles.ts`) :
trouvé (avec le passage et la page), absent, invalide ou à vérifier. Il cite
ses sources officielles (`sources.ts`) et indique où trouver l'information
ou comment corriger. Rapport Excel (`export.ts`).

## Exigences, bonnes pratiques et marque LNE

Chaque point relève d'une **exigence** (texte réglementaire ou « doit » de la
norme), d'une **bonne pratique** (attendu selon le cas) ou de l'**usage de la
marque LNE SSP** (`portee`, `controles.ts`). Une non-conformité prend la
couleur de ce qu'elle manque : rouge plein pour une exigence, ambre (bordure
double) pour une bonne pratique, gris pointillé pour la marque. Les points sur
la marque LNE SSP (apposition, domaine, périmètre, prestations hors
certification), moins critiques, sont regroupés à part. Dans tous les rendus :

- **décompte** : trois cases (exigences non satisfaites, bonnes pratiques non
  suivies, marque LNE), cliquables pour n'afficher que ces non-conformités, et
  un tableau statut × niveau ;
- **présentation par rubrique** : chaque titre de rubrique porte le nombre
  d'exigences et de bonnes pratiques non conformes ; la marque LNE forme un
  bloc replié en fin de liste ;
- **présentation par niveau** : les non-conformités seules, exigences puis
  bonnes pratiques puis marque LNE (bloc replié), chaque carte rappelant sa
  rubrique ;
- **rapport Excel** : feuille « Non-conformités » en tête, par niveau sous un
  bandeau de couleur (avec paragraphe et phrase proposés) ; feuille
  « Vérification » avec la colonne « Niveau » colorée et la marque LNE sous
  son propre bandeau, en fin de tableau.

## Propositions d'ajout

Pour chaque point absent ou à corriger, l'outil propose (`propositions.ts`) :

- **le paragraphe** où l'insérer : un titre du document lu dans son texte
  (`structure.ts` : titres numérotés, annexes, titres usuels, sans le
  sommaire), sinon un paragraphe à créer, placé après ou avant ses voisins
  dans l'ordre habituel d'un rapport (résumé, contexte, site, visite,
  historique, vulnérabilité, programme, investigations, résultats, schéma
  conceptuel, risques, gestion, incertitudes, conclusions, annexes) ;
- **une phrase d'exemple** (`exemples.ts`, une par point), complétée avec les
  éléments lus dans le document (`faits.ts`) : site, commune, adresse,
  client, date, référence, milieux, substances, sondages et piézomètres,
  laboratoire, usage, profondeur de la nappe, codes de prestation,
  parcelles. Ce que le document ne dit pas reste [entre crochets], surligné,
  à compléter. Pour une conclusion d'attestation ATTES, la phrase est la
  formulation du modèle réglementaire.

Les propositions figurent aussi dans le rapport Excel (colonnes « Proposition
d'ajout »). Un test vérifie que chaque point de chaque référentiel a sa phrase.

