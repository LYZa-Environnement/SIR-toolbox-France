# SIR Toolbox France

Outil interne ERM pour les études de sites et sols pollués : lecture des
données environnementales publiques d'un site, préparation et exploitation
des investigations, interprétation des résultats d'analyses, contrôle de
conformité.

Tout tourne dans le navigateur. Les pages interrogent directement les API
publiques (Géorisques, Hub'Eau, IGN, INPN, GIS Sol, Copernicus…), et les
fichiers déposés (résultats de laboratoire, fiches de terrain, livrables)
sont lus sur place, sans être envoyés à un serveur.

## Les outils

Classés sur la page d'accueil dans l'ordre d'une étude, une couleur par
catégorie (`frontend/src/pages/Accueil.tsx`). Le détail de chaque outil est
dans `docs/`.

| Catégorie | Outil | Description |
| --- | --- | --- |
| 1. Contexte du site et plan d'investigation | [Assistant Site Setting](docs/site-setting.md) | Environnement d'une adresse ou de parcelles : eau, air, sols, faune et flore, risques, sur carte |
| | [Données environnementales publiques](docs/pages-autonomes.md#données-environnementales-publiques) | Explorateur cartographique : ICPE, CASIAS, SIS, BSS, captages, photos aériennes historiques… |
| | [Création maillage](docs/pages-autonomes.md#création-maillage) | Maillage d'investigation sur parcelles, exports terrain |
| 2. Données de terrain | [Logs de forage](docs/pages-autonomes.md#logs-de-forage) | Logs de sondages et piézomètres au format ERM |
| | [Conditions de la nappe](docs/conditions-nappe.md) | Paramètres physico-chimiques, redox, criblage USEPA 1998, entrées BIOCHLOR |
| 3. Résultats d'analyses et interprétation | [Résultats labo](docs/resultats-labo.md) | Mise en forme des résultats, valeurs guides ERM, campagnes, export expert |
| | [Interprétation PFAS](docs/interpretation-pfas.md) | Somme des 20, profils, indicateurs, pistes de sources, références |
| 4. Contrôle de conformité | [Conformité des rejets](docs/conformite-rejets.md) | Rejets air / eau et arrêté du 2 février 1998 |
| | [Vérification de livrables SSP](docs/verification-livrables.md) | ATTES, IOTA, NF X31-620, référentiel LNE SSP |

## Développement

```bash
cd frontend
npm install
npm run dev        # serveur de développement
npm test           # tests des calculs (Vitest)
npm run verifier   # typage, lint, tests et build, comme la CI
```

`npm run build` collecte les données de baignade (`scripts/baignade.mjs`),
puis produit le site statique dans `frontend/dist/`.

Organisation du code, conventions et mises à jour des données de
référence : voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Mise en ligne

- `.github/workflows/verification.yml` vérifie chaque pull request (typage,
  lint, tests, build).
- `.github/workflows/deploy-pages.yml` publie le site sur GitHub Pages à
  chaque push sur `main`, après les tests, et le reconstruit chaque matin
  pour tenir les données de baignade à jour. Le préfixe d'URL suit
  automatiquement le nom du dépôt.

Le dossier `backend/` (FastAPI) n'est pas utilisé par le site en ligne ; il
est conservé pour du traitement par lots (`backend/app/analytics/`).

## Avertissement

Les données restituées appartiennent à leurs producteurs respectifs. La
plateforme donne une lecture documentaire à distance et ne remplace ni une
visite de site, ni une étude réglementaire.
