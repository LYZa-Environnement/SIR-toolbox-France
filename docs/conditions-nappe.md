# Conditions de la nappe

Composant : `frontend/src/components/nappe/ConditionsNappe.tsx` — section de
[Résultats labo](resultats-labo.md) pour les eaux souterraines (l'ancienne
page `#/conditions-nappe` y renvoie). Code : `frontend/src/lib/nappe/`.

Interprétation des paramètres physico-chimiques de la nappe, et de leur
portée pour le devenir des solvants chlorés.

## Données d'entrée

- **Classeur des fiches de prélèvement**, une fiche par onglet
  (`fiches.ts`) : tableau de purge repéré par ses en-têtes, valeur de la
  dernière lecture complète, stabilisation sur les trois dernières lectures
  avec les critères de la fiche, écart du redox corrigé, observations.
- **Fichier du laboratoire** : celui déjà chargé dans Résultats labo,
  rapproché des ouvrages par leur nom (corrigeable).

Les fiches se choisissent à l'étape 2 de Résultats labo (fichiers).

## Synthèse générale

Tirée des mesures de terrain (`synthese.ts`) :

- le site : plages et médianes de pH, conductivité, température,
  répartition de l'oxygène et du redox, mesures à vérifier ;
- l'état physico-chimique de l'eau d'après l'oxygène dissous et le redox
  ensemble (réducteur, faiblement réducteur, transition suboxique,
  modérément oxydant, oxydant, mesures discordantes), applicable quel que
  soit le polluant ;
- le classement des ouvrages du plus réducteur au plus oxydant, avec une
  description de leur eau en une phrase ;
- les profils verticaux des ouvrages multi-niveaux et les ouvrages
  singuliers.

## Lecture simplifiée (données usuelles seules)

Avec les seuls paramètres de terrain, COHV, BTEX et hydrocarbures, lecture
par faisceau d'indices :

- conditions pour la déchloration réductrice d'après l'oxygène et le redox
  (seuils USEPA) ;
- produits de dégradation (part molaire, cis-DCE > 80 %, CV) ;
- sources de carbone ;
- limites qu'implique l'absence de nitrates, fer, sulfates et méthane, et
  analyses qui les lèveraient.

Le score USEPA est alors donné comme partiel (« x / y » points accessibles),
sans les classes du tableau 2.4.

## Évaluation ouvrage par ouvrage

`evaluation.ts` :

- **criblage de la déchloration réductrice** du protocole USEPA 1998
  (tableaux 2.3 et 2.4, repris par BIOCHLOR) : redox contre Ag/AgCl,
  composés filles selon le produit rejeté, critères « > 2 × le fond » sur
  les ouvrages amont désignés, points non évalués signalés ;
- **processus redox dominant** (McMahon et Chapelle 2008, classeur USGS
  2009, rapport Fe/H₂S) ;
- devenir du chlorure de vinyle, Eh, saturation en oxygène ;
- **contrôles des mesures** : sursaturation, OD nul avec redox élevé, purge
  non stabilisée, odeur H₂S…

## Récapitulatif des paramètres de terrain

`recap.ts` : minimum et maximum (ouvrage concerné entre parenthèses) et
moyenne du pH, du redox, d'Eh, de l'oxygène dissous, de la conductivité et
de la température, avec une synthèse de cinq phrases au plus (pH,
minéralisation, oxygène et redox, température, qualité des mesures).
Téléchargeable seul en Excel ou inclus dans le rapport.

## Visuels

Diagramme oxygène dissous – redox et matrice de stabilisation des purges,
cliquables (`src/components/nappe/VisuelsNappe.tsx`).

## Export

Le tout s'inscrit dans la démarche par lignes de preuve (USEPA, MACAOH).
Dans l'export de Résultats labo (`export.ts`, ouvrages classés par nom) :
onglets « Conditions physico-chimiques » (synthèse visuelle, échelles de
couleurs) et « Qualité des purges » ; l'atténuation naturelle est dans
l'export expert.
