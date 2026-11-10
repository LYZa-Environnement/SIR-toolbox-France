# Pages autonomes

Trois outils sont des pages HTML indépendantes de l'application React,
servies telles quelles depuis `frontend/public/`. Elles utilisent les
bibliothèques copiées dans `frontend/public/vendor/` (Leaflet, Turf, SheetJS)
et ne passent ni par le typage, ni par le lint, ni par les tests.

## Données environnementales publiques

`frontend/public/donnees-environnementales.html` — catégorie **1. Contexte
du site et plan d'investigation**.

Explorateur cartographique complet : ICPE, CASIAS, SIS, BSS, carte
géologique, nappes, eau potable, cours d'eau, Natura 2000, établissements
sensibles, cadastre, photographies aériennes historiques.

## Création maillage

`frontend/public/creation-maillage.html` — catégorie **1. Contexte du site
et plan d'investigation**.

Maillage d'investigation sur parcelles : taille et orientation de maille,
zones multiples, exclusions, types de points, exports terrain (GPX,
tableaux).

## Logs de forage

`frontend/public/logs-forage.html` — catégorie **2. Données de terrain**.

Logs de sondages et de piézomètres au format ERM depuis le classeur de
saisie (onglets Collars, Log Info, Lithology, Well Construction, PID, Water
Level, Comments, Samples ; modèle vierge téléchargeable), avec en option les
résultats d'analyses rattachés aux échantillons, contrôles de cohérence,
impression PDF et export SVG.
