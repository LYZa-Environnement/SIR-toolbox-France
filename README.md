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
  impression PDF et export SVG.

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
  paramètres par n° CAS ou par nom, unités converties) ; chaque campagne
  comparée peut elle aussi recevoir plusieurs fichiers. Pour les eaux souterraines,
  jusqu'à quatre campagnes peuvent être comparées
  (`src/lib/resultats/campagnes.ts`) : date et régime (hautes / basses eaux)
  de chaque campagne, association des échantillons par ouvrage (corrigeable,
  ouvrages non échantillonnés admis), et onglets « Comparaison campagnes »,
  « Évolutions et tendances » (sommes COHV, BTEX, HAP, HCT, contraste
  HE / BE) et « Graphiques évolution », limités aux ouvrages échantillonnés
  lors d'au moins deux campagnes, et « Statistiques campagnes » sur
  l'ensemble des données (distribution, par campagne, par régime, par
  ouvrage, corrélations de rang) dans l'export.
- **Interprétation PFAS** (`frontend/src/pages/InterpretationPfas.tsx`) —
  lecture des résultats PFAS en eaux souterraines ou en sols, depuis le
  fichier du laboratoire (plusieurs fichiers réunis, par exemple le TFA
  rendu à part) : les 20 PFAS de la directive (UE) 2020/2184, le TFA et le
  6:2 FTS reconnus par n° CAS, abréviation ou nom (`src/lib/pfas/lecture.ts`),
  isomères linéaires et ramifiés, AOF / EOF. Somme des 20 du laboratoire
  comparée aux seuils (0,1 µg/l eau du robinet, 2 µg/l eaux brutes) et
  située sur des échelles logarithmiques avec les valeurs publiées
  (`src/lib/pfas/reperes.ts` : ANSES, RIVM, Dauchy et al. 2019, Brusseau et
  al. 2020…), comparaison de tous les échantillons (profils, indicateurs et pistes côte à
  côte, profil de l'ensemble), profil par longueur de chaîne, indicateurs de
  composition lus d'après leur valeur et
  bilan du fluor (`src/lib/pfas/indicateurs.ts`, fractions de fluor
  calculées d'après les formules, `src/lib/pfas/substances.ts`), pistes de
  sources critère par critère (`src/lib/pfas/sources.ts`), contrôles (somme
  du laboratoire, blancs). Chaque valeur et chaque lecture renvoient à la
  bibliographie de `src/lib/pfas/references.ts` (39 références vérifiées,
  sources secondaires signalées), avec une explication des deux procédés de
  fabrication (électrochimique, télomérisation). Ouvrages classés par nom
  (Pz1, Pz2, Pz10). Exemple fictif intégré.
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
  — contrôle d'un livrable réglementé déposé en PDF, Word ou texte, en un ou
  plusieurs documents vérifiés ensemble (lus dans
  le navigateur, `src/lib/livrables/extraction.ts`) : ATTES-ALUR,
  ATTES-SECUR, ATTES-MEMOIRE, ATTES-TRAVAUX (modèles de l'arrêté du
  9 février 2022, `src/lib/livrables/attes.ts`) et déclaration IOTA
  (article R. 214-32, nomenclature R. 214-1, prescriptions générales des
  rubriques SSP, `src/lib/livrables/iota.ts`), rapports d'études, de
  travaux et offres au regard de la norme NF X31-620 (décembre 2021, parties
  1 à 5) et du référentiel de certification LNE SSP (rév. 8) — points
  paraphrasés avec leur clause, sans texte de la norme
  (`src/data/livrables/*.json`, `src/lib/livrables/normes.ts`). Chaque point de contrôle est
  recherché dans le texte (trouvé avec le passage et la page, absent,
  invalide, à vérifier), cite ses sources officielles
  (`src/lib/livrables/sources.ts`) et indique où trouver l'information ou
  comment corriger ; rapport Excel.

### Valeurs guides ERM

Les valeurs guides sont extraites des trois classeurs ERM de référence vers
`frontend/src/data/valeurs-guides.json`. Après une mise à jour d'un classeur :

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
