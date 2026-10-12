# SIR Toolbox France

Outil interne ERM de consultation des données environnementales publiques, à
l'échelle d'une adresse ou d'un ensemble de parcelles. Tout tourne dans le
navigateur : les pages interrogent directement les API publiques (Géorisques,
Hub'Eau, IGN, INPN, GIS Sol, Copernicus…), sans serveur applicatif.

## Les outils

- **Site Setting** (`frontend/src/pages/Accueil.tsx`) — saisie d'une adresse,
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

- **Résultats labo** (`frontend/src/pages/ResultatsLabo.tsx`) — mise en
  forme des résultats d'analyses : choix de la matrice (eaux souterraines,
  sols, gaz du sol / air), chargement du fichier du laboratoire (ALS /
  Wessling, Eurofins, SGS — disposition reconnue automatiquement,
  `src/lib/resultats/parse.ts`), conversion µg/support → µg/m³ pour les gaz,
  et export Excel « Tableau X - Résultats [matrice] » avec un onglet mis en
  forme et un onglet comparé aux valeurs guides ERM (mise en forme
  conditionnelle, sources sous le tableau).

- **Plans DICT** (`frontend/src/pages/PlansDict.tsx`) — synthèse des
  réseaux des exploitants répondant à une DT / DICT : dépôt de leurs PDF
  (récépissés et plans joints), exploitant et catégories lus dans chaque
  récépissé Cerfa 14435, puis calage de chaque plan sur ses coordonnées —
  écrites (`X=657792`, `657 640`…) ou dessinées en police CAO, ces
  dernières lues d'après la forme de leurs chiffres —, en Lambert 93 ou
  conique CC42 à CC50, contrôlé par la commune des travaux. Les plans sans
  coordonnées lisibles se calent à la main (un ou plusieurs points). Les
  réseaux (tracés en couleur) sont extraits de chaque plan, la grille
  colorée retirée, et réunis sur fond IGN (Plan IGN, photo aérienne,
  cadastre), une couleur par exploitant selon le code couleur des réseaux
  (NF P 98-332). Exports : PDF à l'échelle (A3, A1, A0) avec légende et
  liste des plans, PNG géoréférencé (.pgw). Code dans `src/lib/dict/`.

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
