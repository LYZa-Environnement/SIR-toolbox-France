# Résultats labo

Page : `frontend/src/pages/ResultatsLabo.tsx` — catégorie **3. Résultats
d'analyses et interprétation**. Code : `frontend/src/lib/resultats/`.

## Déroulé

La page tient en quatre étapes : matrice, fichiers (laboratoire et fiches
de prélèvement), résultats et interprétation, export. Tous les fichiers
Excel sont proposés dans la section Export finale.

Les résultats s'ouvrent sur des tuiles de chiffres clés cliquables, puis des
volets colorés repliés par défaut (`src/components/resultats/Volet.tsx`) :

- **carte des résultats** : échantillons × composés colorés selon le
  rapport à la valeur de comparaison, cliquable (`CarteResultats.tsx`,
  `src/lib/resultats/resume.ts`) ;
- conditions de prélèvement ;
- **qualité des gaz du sol** (nuage O2 / CO2, `NuageGaz.tsx`) ;
- **[conditions de la nappe](conditions-nappe.md)** (eaux souterraines) ;
- campagnes, positions hydrauliques, contrôle qualité, tableau, signatures ;
- **familles de points** (`src/lib/resultats/familles.ts`,
  `FamillesOuvrages.tsx`) : tous les composés analysés et les paramètres de
  terrain, centrés-réduits, classification de Ward, nombre de familles par
  la silhouette, carte des deux premiers axes d'une ACP, dendrogramme et
  profils.

Les tableaux de la page se trient par leurs en-têtes de colonne
(`src/lib/tri.ts`).

**Positions hydrauliques** : charge = altitude NGF du repère − niveau
statique initial (fiches), profil amont → aval des ouvrages avec les
concentrations, positions proposées d'après les cotes (`hydraulique.ts`,
`ProfilHydraulique.tsx`).

## Lecture du fichier du laboratoire

- Choix de la matrice : eaux souterraines, sols, gaz du sol / air.
- Fichier ALS / Wessling, Eurofins ou SGS : la disposition est reconnue
  automatiquement (`parse.ts`), sans modèle propre à chaque laboratoire.
- Gaz du sol : conversion µg/support → µg/m³ avec la durée et le débit de
  prélèvement (`calc.ts`) ; les concentrations déjà données par le
  laboratoire (canisters, Radiello…) sont reprises telles quelles.
- Zones de mesure et de contrôle des tubes lues aussi ligne par ligne
  (synthèses Eurofins gaz du sol : « (zone 1) » / « (zone 2) »,
  « Benzène » / « Benzène (2) » ; zone 1 = mesure, zone 2 = contrôle).
- Valeurs de comparaison au choix par matrice, dont « Aucune ».
- Une campagne rendue en plusieurs fichiers se réunit dans un même tableau
  (`fusion.ts`) : échantillons rapprochés par leur nom, paramètres par
  n° CAS ou par nom, unités converties. Chaque campagne comparée peut aussi
  recevoir plusieurs fichiers.

## Fiches de prélèvement

- **Gaz du sol** (`src/lib/resultats/fichesGaz.ts`) : une fiche par onglet,
  échantillons rapprochés par leur nom ; durée mesurée par ERM, affichée sur
  la pompe ou tirée des horaires au choix ; débits relevés en début et fin
  d'échantillonnage. Durées discordantes, dérive du débit et écart au volume
  noté sur la fiche sont signalés.
- **Qualité des gaz du sol captés** d'après les mesures O2, CO2, H2S, CO,
  LIE et PID des fiches (`src/lib/resultats/qualiteGaz.ts`, guide BRGM /
  INERIS 2016), règles de débit du tableau 11 de ce guide ; onglet
  « Qualité gaz du sol » dans l'export.
- **Eaux souterraines** : voir [Conditions de la nappe](conditions-nappe.md).

## Export Excel

« Tableau X - Résultats [matrice] », avec :

- un onglet mis en forme ;
- un onglet comparé aux valeurs guides ERM (mise en forme conditionnelle,
  sources sous le tableau).

## Export expert

En plus de l'export standard, un export « expert » (`expert/`) ajoute des
feuilles d'interprétation, chacune avec son mode de lecture et une figure :

- déchloration des solvants chlorés et des chlorobenzènes (bilans molaires
  des chaînes PCE → TCE → DCE → CV → éthène, USEPA 1998,
  `expert/diagnostics.ts`) ;
- sources et toxicité des HAP, hydrocarbures pétroliers et BTEX ;
- admission des terres en ISDI (arrêté du 12 décembre 2014, annexe II,
  `expert/isdi.ts`) ;
- lecture amont / aval des eaux souterraines (`expert/amontAval.ts`) ;
- profondeur des échantillons de sol lue dans leur nom, pour les classer
  par sondage puis par profondeur (`expert/profondeur.ts`) ;
- signatures de composition (`signatures.ts`) : part de chaque composé
  quantifié dans le total de sa famille (COHV, BTEX, HAP, PFAS, fractions
  d'hydrocarbures ; métaux en sols, sur le sol brut et sans les éléments
  majeurs), en camemberts. Les camemberts se téléchargent aussi en ZIP pour
  une carte (`src/components/Signatures.tsx`) : surface proportionnelle au
  total de l'échantillon, composés désignés par leur abréviation, et
  `totaux_et_diametres.csv` pour des symboles proportionnels dans un SIG.

## Comparaison de campagnes (eaux souterraines)

Jusqu'à quatre campagnes (`campagnes.ts`) :

- date et régime (hautes / basses eaux) de chaque campagne ;
- association des échantillons par ouvrage, corrigeable, ouvrages non
  échantillonnés admis ;
- onglets « Comparaison campagnes », « Évolutions et tendances » (sommes
  COHV, BTEX, HAP, HCT, contraste HE / BE) et « Graphiques évolution »,
  limités aux ouvrages échantillonnés lors d'au moins deux campagnes ;
- onglet « Statistiques campagnes » sur l'ensemble des données :
  distribution, par campagne, par régime, par ouvrage, corrélations de rang.

## Valeurs guides ERM

Les valeurs guides sont extraites des trois classeurs ERM de référence vers
`frontend/src/data/valeurs-guides.json` (Résultats labo), avec une copie
dans `frontend/public/data/valeurs-guides.json` lue par la page Logs de
forage. Après une mise à jour d'un classeur :

```bash
cd frontend
node scripts/valeurs-guides.mjs "<eaux souterraines.xlsx>" "<sol.xlsx>" "<air intérieur R1 R2 R3.xlsx>"
```

Pour les eaux souterraines, la valeur reprise est la colonne K (« Valeur de
comparaison retenue ») de l'onglet « Eaux souterraines », avec sa source en
colonne L.
