# Suivi temporel

Page : `frontend/src/pages/SuiviTemporel.tsx` — catégorie **3. Résultats
d'analyses et interprétation**. Code : `frontend/src/lib/suivi/`,
composants `frontend/src/components/suivi/`.

Analyse dans le temps des résultats de surveillance des eaux souterraines,
ouvrage par ouvrage et composé par composé, pour le bilan quadriennal
(NF X31-620-2, prestation BQ).

## Données d'entrée

Les fichiers sont déposés en vrac et reconnus par leur contenu
(`import.ts`) :

- **rapports du laboratoire** : lus par `lib/resultats/parse.ts` ; la date
  de prélèvement est lue sur la ligne « Date de prélèvement » du rapport,
  sous chaque échantillon (jamais la date de réception ou d'analyse), sinon
  dans le nom du fichier (`dates.ts`) ;
- **fiches de prélèvement** (`lib/nappe/fiches.ts`) : date, niveau statique
  initial, cote du repère quand elle est donnée, paramètres de fin de purge
  (pH, redox, oxygène, conductivité, température) ;
- **tableau historique** au format du modèle téléchargeable (onglets
  Résultats, Ouvrages, Niveaux, colonnes reconnues par leur en-tête), ou
  l'onglet « Données consolidées » d'un export précédent (`historique.ts`).

Un jeu d'exemple fictif (`exemple.ts`) permet d'essayer l'outil.

## Base consolidée

`modele.ts` :

- campagnes : fichiers prélevés à moins de 20 jours d'intervalle réunis,
  date et régime corrigeables, un fichier déplaçable d'une campagne à
  l'autre ;
- ouvrages : rapprochés par leur nom (« PZ 01 » = « pz-1 »), rattachement
  manuel possible, blancs et doublons écartés ; position amont / au droit /
  aval proposée d'après le nom, le tableau historique ou les cotes ;
- composés : par n° CAS, sinon par nom, ramenés à l'unité de leur plus
  ancien résultat ; sommes COHV, BTEX, 16 HAP et C10–C40 recalculées ;
- niveaux : cote NGF = cote du repère − niveau statique ; sans cote du
  repère, la profondeur seule (chaque ouvrage lu pour lui-même) ; régime
  hautes / basses eaux proposé d'après les niveaux mesurés, à défaut d'après
  le mois.

## Analyse

Par série ouvrage × composé, sur la période analysée (`analyse.ts`,
`stats.ts`) :

- test de Mann-Kendall (loi exacte de S pour 10 résultats au plus sans
  ex aequo, approximation normale avec correction de continuité sinon),
  pente de Theil-Sen et intervalle de Gilbert (1987), Kendall saisonnier
  HE / BE, rupture de Pettitt, lissage LOWESS ;
- classes de tendance d'après MAROS (AFCEE, 2004), seuil de signification
  réglable ;
- résultats < LQ : censure à la LQ la plus élevée (par défaut), LQ (HYPE,
  BRGM) ou LQ/2 (directive 2009/90/CE) ; moyennes à LQ/2 ;
- demi-vie apparente et horizon d'atteinte de la valeur de référence
  (projection indicative), résultats atypiques.

À l'échelle du réseau : faits marquants classés, déchloration des
chloroéthènes (parts molaires, chlore moyen, total en moles, blocage au
stade DCE), piézométrie (battement, lien concentration – niveau, sens
d'écoulement et gradient par campagne quand les cotes NGF et les
coordonnées sont connues), comparaison amont / aval, plan des ouvrages.

## Guide « Évolution et arrêt de la surveillance des eaux souterraines »

Pistes pour le programme de surveillance et grille de lecture des étapes 2
à 4 du guide BRGM/INERIS (décembre 2022), chaque critère cité avec sa page :
réseau résiduel de 3 ouvrages (5 si le sens d'écoulement varie), ouvrage
amont et substance au-dessus d'un critère de gestion jamais abandonnés,
produits de dégradation, physico-chimie, LQ, piézométrie en m NGF, flux
continu d'amont en aval, baisse concomitante d'une nappe basse, effet
rebond après l'arrêt d'un traitement (date saisie dans les réglages).

Seuils propres à l'outil, le guide étant qualitatif sur ces points :
facteur 2 entre amont et aval, tau de Kendall ≥ 0,6 et médianes à un
facteur 2 près pour juger deux ouvrages redondants, nappe parmi le
cinquième le plus bas de ses niveaux, 3 campagnes au moins après un
traitement.

## Graphiques et exports

Les graphiques sont produits en SVG (`graphique.ts`, `figures.ts`), les
mêmes à l'écran et dans les exports (`export.ts`) :

- classeur Excel : synthèse et faits marquants, grille du guide 2022,
  tendances de toutes les séries, matrice colorée, chroniques par ouvrage et
  par composé, graphiques intégrés, piézométrie et écoulement, amont / aval,
  déchloration, pistes, qualité des données, méthode, données consolidées ;
- archive des graphiques en PNG et SVG ;
- données consolidées seules, rechargeables pour le bilan suivant.

## Tests

`stats.test.ts` (cas calculés à la main), `dates.test.ts`,
`analyse.test.ts` (évolutions connues du jeu d'exemple, pistes, grille).
