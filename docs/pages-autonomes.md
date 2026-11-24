# Pages autonomes

Trois outils sont des pages HTML indépendantes de l'application React,
servies telles quelles depuis `frontend/public/`. Elles utilisent les
bibliothèques copiées dans `frontend/public/vendor/` (Leaflet, Turf, SheetJS)
et ne passent ni par le typage, ni par le lint, ni par les tests. Elles sont
protégées par le même mot de passe que le site.

## Données environnementales publiques

`frontend/public/donnees-environnementales.html` — catégorie **1. Contexte
du site et préparation des investigations**.

Explorateur cartographique complet : ICPE, CASIAS, SIS, BSS, carte
géologique, nappes, eau potable, cours d'eau, Natura 2000, établissements
sensibles, cadastre, photographies aériennes historiques.

## Création maillage

`frontend/public/creation-maillage.html` — catégorie **1. Contexte du site
et préparation des investigations**.

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

- Chaque log tient sur une page, quelle que soit la profondeur (échelle
  verticale adaptée, colonne de résultats resserrée puis en tableau).
- Les noms d'échantillons du laboratoire sont rapprochés de l'onglet
  Samples même écrits autrement (« 0.5-1.0 » / « 0,5-1 », « PZ01 » / « PZ1 »,
  « GSI-1 » / « GSI »), puis par forage et profondeur ; les rapprochements
  approchés sont signalés et chaque échantillon peut être rattaché à la
  main.
- Les résultats sont convertis dans une même unité, indiquée en tête de
  colonne, et peuvent être comparés aux valeurs guides ERM pour les sols
  (`public/data/valeurs-guides.json`) : dépassements en rouge gras,
  expliqués dans la légende et la note.
