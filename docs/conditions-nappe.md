# Conditions de la nappe

Page : `frontend/src/pages/ConditionsNappe.tsx` — catégorie **2. Données de
terrain**. Code : `frontend/src/lib/nappe/`.

Interprétation des paramètres physico-chimiques de la nappe, et de leur
portée pour le devenir des solvants chlorés.

## Données d'entrée

- **Classeur des fiches de prélèvement**, une fiche par onglet
  (`fiches.ts`) : tableau de purge repéré par ses en-têtes, valeur de la
  dernière lecture complète, stabilisation sur les trois dernières lectures
  avec les critères de la fiche, écart du redox corrigé, observations.
- **Fichiers du laboratoire**, en option : lus comme dans
  [Résultats labo](resultats-labo.md) et rapprochés des ouvrages par leur
  nom (corrigeable).

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

## Données d'entrée BIOCHLOR (option, usage expert)

`biochlor.ts`, `transport.ts`, `src/components/nappe/TransportBiochlor.tsx` :

- vitesse de l'eau depuis la vitesse de Darcy, K × gradient (gradient
  proposé d'après les cotes NGF des fiches) ou une vitesse réelle connue ;
- porosités et masse volumique types par lithologie (USEPA 1998, tableaux
  C.3.1 et C.3.2) ;
- foc depuis le COT d'un sol ;
- dispersivité d'après la longueur du panache (Xu et Eckstein, 1995) ;
- constantes de biodégradation entre deux ouvrages (normalisées par les
  chlorures si disponibles, USEPA 1998 annexe C) ;
- tableau des valeurs à saisir dans BIOCHLOR, en unités SI et US ; chaque
  champ explique où trouver la valeur.

## Rapport

Le tout s'inscrit dans la démarche par lignes de preuve (USEPA, MACAOH) et
s'exporte en rapport Excel (`export.ts`).
