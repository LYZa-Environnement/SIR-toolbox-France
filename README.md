# SIR Toolbox France

Outil interne ERM pour les études de sites et sols pollués : lecture des
données environnementales publiques d'un site, préparation et exploitation
des investigations, interprétation des résultats d'analyses, contrôle de
conformité.

Tout tourne dans le navigateur. Les pages interrogent directement les API
publiques (Géorisques, Hub'Eau, IGN, INPN, GIS Sol, Copernicus, Agence ORE…), et les
fichiers déposés (résultats de laboratoire, fiches de terrain, livrables)
sont lus sur place, sans être envoyés à un serveur.

## Les outils

Classés sur la page d'accueil dans l'ordre d'une étude, une couleur par
catégorie (`frontend/src/pages/Accueil.tsx`). Le détail de chaque outil est
dans `docs/`.

| Catégorie | Outil | Description |
| --- | --- | --- |
| 1. Contexte du site et préparation des investigations | [Assistant Site Setting](docs/site-setting.md) | Environnement d'une adresse ou de parcelles : eau, air, sols, faune et flore, risques, sur carte |
| | [Données environnementales publiques](docs/pages-autonomes.md#données-environnementales-publiques) | Explorateur cartographique : ICPE, CASIAS, SIS, BSS, captages, photos aériennes historiques… |
| | [Réseaux et concessionnaires](docs/reseaux.md) | Réseaux électriques, gaz, eau, assainissement, éclairage public, fibre et chaleur autour d'un point : distances, linéaires, exploitants à consulter (ne remplace pas la DT-DICT) |
| | [Création maillage](docs/pages-autonomes.md#création-maillage) | Maillage d'investigation sur parcelles, exports terrain |
| 2. Données de terrain | [Logs de forage](docs/pages-autonomes.md#logs-de-forage) | Logs de sondages et piézomètres au format ERM, résultats comparés aux valeurs guides |
| 3. Résultats d'analyses et interprétation | [Résultats labo](docs/resultats-labo.md) | Lecture visuelle et mise en forme des résultats, fiches de prélèvement, [conditions de la nappe](docs/conditions-nappe.md), campagnes, export expert |
| | [Suivi temporel](docs/suivi-temporel.md) | Chroniques de surveillance des eaux souterraines pour le bilan quadriennal : tendances, piézométrie, déchloration, pistes et grille du guide BRGM/INERIS 2022 |
| | [Interprétation PFAS](docs/interpretation-pfas.md) | Somme des 20, profils, indicateurs, pistes de sources, références |
| | [Lecture des chromatogrammes](docs/chromatogrammes.md) | Chromatogrammes d'hydrocarbures C10–C40 (PDF, capture, CSV), étalons C10/C40, HAP et BTEX du laboratoire : produit, origine, biodégradation, âge approché, comparaison d'échantillons (démarche BRGM RP-64174-FR) |
| 4. Contrôle de conformité | [Conformité des rejets](docs/conformite-rejets.md) | Rejets air / eau et arrêté du 2 février 1998 |
| | [Vérification de livrables SSP](docs/verification-livrables.md) | ATTES, IOTA, NF X31-620, référentiel LNE SSP |

L'accès au site et aux pages autonomes est protégé par un mot de passe
(`frontend/src/lib/acces.ts`, empreinte SHA-256) : une simple barrière, le
site étant statique.

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
