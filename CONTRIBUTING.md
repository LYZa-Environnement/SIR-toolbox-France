# Contribuer à SIR Toolbox France

## Organisation du code

```
frontend/
  src/
    pages/         une page par outil React (chargée à la demande, voir App.tsx)
    components/    composants partagés ; sous-dossiers par outil (nappe/, pfas/)
    lib/           calculs et lecture des données, sans React
      resultats/   lecture des fichiers du laboratoire, exports (Résultats labo)
      nappe/ pfas/ rejets/ livrables/   un dossier par outil
      *.ts         clients des API publiques (Site Setting) et utilitaires communs
    themes/        rubriques du Site Setting (eau, air, sols, nature, risques)
    data/          référentiels livrés avec le site (valeurs guides, NF X31-620)
  public/          pages autonomes (HTML), bibliothèques copiées (vendor/), données (data/)
  scripts/         préparation des données (baignade, valeurs guides)
docs/              une fiche par outil
backend/           traitement par lots en Python, non utilisé par le site
```

Utilitaires communs, à réutiliser plutôt qu'à réécrire :

- `lib/fichiers.ts` : lire un classeur Excel ou CSV en onglets, télécharger
  un fichier ou un classeur ExcelJS ;
- `lib/format.ts` : nombres à trois chiffres significatifs, jour local
  (`jourIso`, à préférer à `toISOString()` qui donne le jour UTC) ;
- `components/ZoneDepot.tsx` : zone « Déposez ici… » ;
- `lib/resultats/parse.ts` : lecture de tout fichier de laboratoire.

## Conventions

- Interface, identifiants métier et messages de commit en français ;
  commentaires du code en anglais.
- Messages de commit : « Outil : ce qui change », par exemple
  « Conditions de la nappe : état physico-chimique dans la synthèse ».
- Les calculs vivent dans `lib/`, sans React, pour être testables ; les
  pages ne font que les afficher.
- Chaque valeur réglementaire ou bibliographique cite sa source (texte,
  article, tableau, référence).

## Ajouter un outil

1. La page dans `src/pages/`, la route (avec `lazy`) dans `src/App.tsx`.
2. Les calculs dans `src/lib/<outil>/`, avec leurs tests.
3. La carte de l'outil dans `CATEGORIES` (`src/pages/Accueil.tsx`).
4. Une fiche `docs/<outil>.md` et une ligne dans le tableau du README.

## Tests

Les tests sont à côté du module testé (`conformite.ts` →
`conformite.test.ts`) et se lancent avec `npm test`. Pour un calcul
réglementaire ou scientifique, préférer des cas calculés à la main, en
indiquant le calcul en commentaire.

Avant de proposer une modification : `npm run verifier` (typage, lint,
tests, build), comme la CI.

## Données de référence

- **Valeurs guides ERM** : `node scripts/valeurs-guides.mjs` depuis les trois
  classeurs de référence (voir [docs/resultats-labo.md](docs/resultats-labo.md#valeurs-guides-erm)).
- **Points de contrôle NF X31-620 et LNE** : `src/data/livrables/*.json`,
  paraphrasés avec leur clause, sans reprendre le texte de la norme.
- **Sites de baignade** : régénérés à chaque build par
  `scripts/baignade.mjs`.

## Installation derrière un proxy

La dépendance `xlsx` (SheetJS) est téléchargée depuis `cdn.sheetjs.com`, et
non depuis le registre npm. Si ce site est bloqué, `npm install` échoue
(erreur 403) : il faut alors autoriser `cdn.sheetjs.com`.
