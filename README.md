# SIR toolbox France

Outil interne ERM de consultation des données environnementales publiques, à
l'échelle d'une adresse ou d'un ensemble de parcelles. Tout tourne dans le
navigateur : les pages interrogent directement les API publiques (Géorisques,
Hub'Eau, IGN, INPN, GIS Sol, Copernicus…), sans serveur applicatif.

## Les trois outils

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

### Valeurs guides ERM

Les valeurs guides sont extraites des trois classeurs ERM de référence vers
`frontend/src/data/valeurs-guides.json`. Après une mise à jour d'un classeur :

```bash
cd frontend
node scripts/valeurs-guides.mjs "<eaux souterraines.xlsx>" "<sol.xlsx>" "<air intérieur R1 R2 R3.xlsx>"
```

Pour les eaux souterraines, la valeur retenue est recalculée par l'outil à
partir des rangs de la feuille « Hierarchisation » (rang 1 = source
prioritaire pour le cas choisi).

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
