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
