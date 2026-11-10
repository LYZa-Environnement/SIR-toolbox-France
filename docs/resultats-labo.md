# Résultats labo

Page : `frontend/src/pages/ResultatsLabo.tsx` — catégorie **3. Résultats
d'analyses et interprétation**. Code : `frontend/src/lib/resultats/`.

## Lecture du fichier du laboratoire

- Choix de la matrice : eaux souterraines, sols, gaz du sol / air.
- Fichier ALS / Wessling, Eurofins ou SGS : la disposition est reconnue
  automatiquement (`parse.ts`), sans modèle propre à chaque laboratoire.
- Gaz du sol : conversion µg/support → µg/m³ avec la durée et le débit de
  prélèvement (`calc.ts`) ; les concentrations déjà données par le
  laboratoire (canisters, Radiello…) sont reprises telles quelles.
- Une campagne rendue en plusieurs fichiers se réunit dans un même tableau
  (`fusion.ts`) : échantillons rapprochés par leur nom, paramètres par
  n° CAS ou par nom, unités converties. Chaque campagne comparée peut aussi
  recevoir plusieurs fichiers.

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
`frontend/src/data/valeurs-guides.json`. Après une mise à jour d'un
classeur :

```bash
cd frontend
node scripts/valeurs-guides.mjs "<eaux souterraines.xlsx>" "<sol.xlsx>" "<air intérieur R1 R2 R3.xlsx>"
```

Pour les eaux souterraines, la valeur reprise est la colonne K (« Valeur de
comparaison retenue ») de l'onglet « Eaux souterraines », avec sa source en
colonne L.
