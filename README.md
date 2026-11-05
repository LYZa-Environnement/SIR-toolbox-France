# SIR Toolbox France

Outil interne ERM de consultation des données environnementales publiques, à
l'échelle d'une adresse ou d'un ensemble de parcelles. Tout tourne dans le
navigateur : les pages interrogent directement les API publiques (Géorisques,
Hub'Eau, IGN, INPN, GIS Sol, Copernicus…), sans serveur applicatif.

## Les outils

- **Assistant Site Setting** (`frontend/src/pages/SiteSetting.tsx`) — saisie d'une adresse,
  délimitation du site par ses parcelles cadastrales, puis six lectures
  cartographiées : eau, air, sols, faune et flore, climat, risques.
- **Données environnementales publiques**
  (`frontend/public/donnees-environnementales.html`) — explorateur
  cartographique complet : ICPE, CASIAS, SIS, BSS, carte géologique, nappes,
  eau potable, cours d'eau, Natura 2000, établissements sensibles, cadastre,
  photographies aériennes historiques.
- **Création maillage** (`frontend/public/creation-maillage.html`) — maillage
  d'investigation sur parcelles : taille et orientation de maille, zones
  multiples, exclusions, types de points, exports terrain (GPX, tableaux).

- **Logs de forage** (`frontend/public/logs-forage.html`) — logs de
  sondages et de piézomètres au format ERM depuis le classeur de saisie
  (Collars, Log Info, Lithology, Well Construction, PID, Water Level,
  Comments, Samples ; modèle vierge téléchargeable), avec en option les
  résultats d'analyses rattachés aux échantillons, contrôles de cohérence,
  impression PDF et export SVG. Chaque log tient sur une page, quelle que
  soit la profondeur (échelle verticale adaptée, colonne de résultats
  resserrée puis en tableau). Les noms d'échantillons du laboratoire sont
  rapprochés de l'onglet Samples même écrits autrement (« 0.5-1.0 » /
  « 0,5-1 », « PZ01 » / « PZ1 », « GSI-1 » / « GSI »), puis par forage et
  profondeur ; les rapprochements approchés sont signalés et chaque
  échantillon peut être rattaché à la main. Les résultats sont convertis
  dans une même unité, indiquée en tête de colonne, et peuvent être comparés
  aux valeurs guides ERM pour les sols (`public/data/valeurs-guides.json`) :
  dépassements en rouge gras, expliqués dans la légende et la note.

- **Résultats labo** (`frontend/src/pages/ResultatsLabo.tsx`) — mise en
  forme des résultats d'analyses : choix de la matrice (eaux souterraines,
  sols, gaz du sol / air), chargement du fichier du laboratoire (ALS /
  Wessling, Eurofins, SGS — disposition reconnue automatiquement,
  `src/lib/resultats/parse.ts`), conversion µg/support → µg/m³ pour les gaz,
  et export Excel « Tableau X - Résultats [matrice] » avec un onglet mis en
  forme et un onglet comparé aux valeurs guides ERM (mise en forme
  conditionnelle, sources sous le tableau). Une campagne rendue en
  plusieurs fichiers par le laboratoire se réunit dans un même tableau
  (`src/lib/resultats/fusion.ts` : échantillons rapprochés par leur nom,
  paramètres par n° CAS ou par nom, unités converties). Pour les eaux souterraines,
  jusqu'à quatre campagnes peuvent être comparées
  (`src/lib/resultats/campagnes.ts`) : date et régime (hautes / basses eaux)
  de chaque campagne, association des échantillons par ouvrage (corrigeable,
  ouvrages non échantillonnés admis), et onglets « Comparaison campagnes »,
  « Évolutions et tendances » (sommes COHV, BTEX, HAP, HCT, contraste
  HE / BE) et « Graphiques évolution », limités aux ouvrages échantillonnés
  lors d'au moins deux campagnes, et « Statistiques campagnes » sur
  l'ensemble des données (distribution, par campagne, par régime, par
  ouvrage, corrélations de rang) dans l'export.
- **Conformité des rejets** (`frontend/src/pages/ConformiteRejets.tsx`) —
  rejets d'une unité de traitement d'air ou d'eau comparés aux valeurs
  limites générales de l'arrêté du 2 février 1998 modifié
  (`src/lib/rejets/`) : article 27 pour l'air (seuils de flux horaire, COV en
  carbone total, sommes annexe III, CMR et halogénés H341/H351, métaux,
  cancérigènes de l'annexe IV, oxydation, conditions normales et oxygène de
  référence), articles 31, 32 et 34 pour l'eau (pH, température, MES, DBO5,
  DCO, azote et phosphore, substances des 3° et 4°, raccordement à une
  station d'épuration). Résultats lus dans le fichier du laboratoire (tous
  les onglets, un échantillon par onglet admis) ou saisis, bilan échantillon
  par échantillon (entrée, intermédiaire, rejet), résultats <LQ en bornes basse et haute, tolérance de 10 % de
  l'autosurveillance permanente (article 21), rapport Excel.

- **Vérification de livrables SSP** (`frontend/src/pages/VerificationLivrables.tsx`)
  — contrôle d'un livrable réglementé déposé en PDF, Word ou texte (lu dans
  le navigateur, `src/lib/livrables/extraction.ts`) : ATTES-ALUR,
  ATTES-SECUR, ATTES-MEMOIRE, ATTES-TRAVAUX (modèles de l'arrêté du
  9 février 2022, `src/lib/livrables/attes.ts`) et déclaration IOTA
  (article R. 214-32, nomenclature R. 214-1, prescriptions générales des
  rubriques SSP, `src/lib/livrables/iota.ts`). Chaque point de contrôle est
  recherché dans le texte (trouvé avec le passage et la page, absent,
  invalide, à vérifier), cite ses sources officielles
  (`src/lib/livrables/sources.ts`) et indique où trouver l'information ou
  comment corriger ; rapport Excel.

### Valeurs guides ERM

Les valeurs guides sont extraites des trois classeurs ERM de référence vers
`frontend/src/data/valeurs-guides.json` (outil Résultats labo), avec une copie
dans `frontend/public/data/valeurs-guides.json` lue par la page Logs de forage. Après une mise à jour d'un classeur :

```bash
cd frontend
node scripts/valeurs-guides.mjs "<eaux souterraines.xlsx>" "<sol.xlsx>" "<air intérieur R1 R2 R3.xlsx>"
```

Pour les eaux souterraines, la valeur reprise est la colonne K (« Valeur de
comparaison retenue ») de l'onglet « Eaux souterraines », avec sa source en
colonne L.

## Développement

```bash
cd frontend
npm install
npm run dev
```

`npm run build` collecte les données de baignade (`scripts/`), puis produit le site statique dans `frontend/dist/`.

## Mise en ligne

Le workflow `.github/workflows/deploy-pages.yml` publie le site sur GitHub
Pages à chaque push sur `main`, et le reconstruit chaque matin pour tenir les
données de baignade à jour. Le préfixe d'URL suit automatiquement le nom du dépôt.

Le dossier `backend/` (FastAPI) n'est pas utilisé par le site en ligne ; il
est conservé pour du traitement par lots (`backend/app/analytics/`).

## Avertissement

Les données restituées appartiennent à leurs producteurs respectifs. La
plateforme donne une lecture documentaire à distance et ne remplace ni une
visite de site, ni une étude réglementaire.
