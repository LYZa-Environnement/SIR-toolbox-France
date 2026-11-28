# Modèle 3D du site

Page : `frontend/src/pages/Modele3D.tsx` — catégorie **4. Synthèse et
modèle conceptuel**. Calculs : `frontend/src/lib/modele3d/` (exécutés dans
un Web Worker, `worker.ts`), scène 3D (three.js) et panneaux :
`frontend/src/components/modele3d/`.

Les logs de forage, la géologie, les eaux souterraines, les sols et les gaz
du sol réunis dans une même vue en trois dimensions, pour lire le site comme
un tout et en tirer le schéma conceptuel : formations géologiques continues
dans les parcelles du site, nappe krigée et sens d'écoulement à chaque date,
panache et son évolution, terres par filière d'évacuation, sources, voies de
transfert et cibles. On choisit ce qu'on affiche, on coupe le modèle, on
compare deux dates.

## Données d'entrée

**Depuis le dossier d'étude** (`dossier.ts`) : le modèle relit, sans les
modifier, les fichiers des autres outils du dossier ouvert, et les relit au
retour sur l'onglet (les logs ou le suivi ont pu changer dans un autre
onglet) :

- `logs-forage.json` (Logs de forage) : têtes de forage, lithologie,
  équipement, PID, observations organoleptiques (onglet Comments), niveau
  d'eau à la foration, échantillons et résultats rattachés ;
- `suivi-temporel.json` (Suivi temporel) : toutes les campagnes telles que
  regroupées, datées et corrigées (rattachements, coordonnées et cotes des
  ouvrages, valeurs de comparaison saisies), fiches de prélèvement comprises ;
- `resultats-labo.json` (Résultats labo) : sols (rattachés aux forages par
  le nom des échantillons), eaux souterraines avec les campagnes comparées
  et les fiches de Conditions de la nappe, gaz du sol (concentrations
  calculées avec le volume prélevé saisi là-bas, zone de mesure) ;
- `points.json` (Points d'investigation) : coordonnées en Lambert 93, cote
  du terrain et cote du repère des points, rapprochés par le nom (« PZ01 »
  = « Pz1 »), là où les logs et le suivi n'en donnent pas ; les repères
  passent par le code de Suivi temporel (niveaux d'eau en profondeur
  convertis en cotes), comme dans Suivi temporel ;
- `dossier.json` : les **parcelles du site** (Assistant Site Setting).

**Fichiers déposés** : classeur de saisie des logs (`logs.ts`, Comments
compris), rapports du laboratoire sur sols, eaux ou gaz du sol (en µg/m³),
fiches de prélèvement, tableau historique. Un exemple fictif (`exemple.ts`) :
les cinq ouvrages de Suivi temporel avec leurs logs, huit sondages au pack
ISDI complet, trois piézairs, la parcelle du site.

**Niveaux d'eau des fiches de prélèvement** : lus comme Suivi temporel les
lit (`lib/nappe/fiches.ts`) ; cote piézométrique = cote du repère − niveau
statique. Une fiche à moins d'un mois d'une campagne d'analyses s'y
rattache ; les autres forment leurs propres étapes dans la frise.

## Coordonnées et cotes

`coordonnees.ts` : Lambert 93, coniques conformes CC42 à CC50 et GPS
(longitude, latitude, reconnues même inversées) sont reconnus par leurs
ordres de grandeur, ou choisis, et convertis en Lambert 93 (projections
coniques conformes de Lambert sur RGF93, notes IGN NT/G 71). Tableau
« Points, coordonnées et cotes » : chaque coordonnée et chaque cote du sol
peut être saisie dans l'outil (enregistrée dans le dossier, le classeur des
logs n'est pas modifié). Coordonnées : saisies, sinon celles des fichiers,
sinon celles des points d'investigation du dossier (pas avec des fichiers
en repère local, sans lien avec le Lambert 93). Cote du sol : saisie,
sinon celle du log, sinon celle des points d'investigation, sinon le MNT
IGN (RGE ALTI®) recalé sur les forages, sinon la cote du repère.

## Géologie

`formations.ts`, représentation par défaut : **formations continues**.

- Les mots-clés des logs sont regroupés en formations ordonnées de la
  surface vers le bas. Proposition : une formation par lithologie
  principale, ordonnées par la profondeur médiane de leur toit ; une
  lithologie toujours encadrée par une même autre (« argile » dans
  « sable ») en est une lentille et la rejoint. Section « Formations
  géologiques » : renommer, recolorer, réordonner, fusionner, réaffecter
  chaque mot-clé.
- Le contact entre deux formations est lu dans chaque forage (en
  descendant, une couche ne remonte jamais l'ordre) et interpolé ; un forage
  arrêté au-dessus d'un contact contraint la surface à passer sous son fond.
  Chaque formation remplit l'espace entre son toit et son mur ; volume de
  chacune.
- **Limitée aux parcelles du site** quand le dossier les donne (sinon entre
  les forages et à 1,5 espacement médian au-delà). Base du modèle : fond des
  forages les plus profonds.
- Vue éclatée (écart entre formations), coupes avec faces de coupe.

Représentation **en blocs** en option (lithologie dominante des forages
voisins à la même cote) : elle montre les lentilles.

## Interpolation

`krigeage.ts` : tendance plane des moindres carrés, puis **krigeage
ordinaire des résidus** ; variogramme expérimental ajusté (pépite, modèle
sphérique ou exponentiel, moindres carrés pondérés par le nombre de paires ;
sous 6 points, variogramme par défaut) ; écart-type de krigeage
(incertitude) ; **validation croisée** (chaque point estimé sans lui, écart
quadratique moyen). Inverse distance en option. Références : Matheron
(1962), Goovaerts (1997), Chilès et Delfiner (2012).

## Eaux souterraines

- **Nappe** à chaque date (campagne, tournée de niveaux, foration), krigée,
  plafonnée au sol ; **isopièzes** ; sens d'écoulement et gradient du plan
  des ouvrages ; option de coloration par l'incertitude du krigeage ;
  **cours d'eau comme limites** en option (cote du relief au droit du cours
  d'eau moins une valeur à régler — une approximation).
- **Panache** du composé choisi, coloré sur la nappe contre la valeur de
  comparaison de Suivi temporel ; validation croisée affichée.
- **Tendances** de Suivi temporel sur chaque ouvrage (classes MAROS,
  pente de Sen) : étiquettes, fiches, tableau.
- **Évolution du panache** (`evolutionPanache`) : à chaque campagne, surface
  au-dessus de la valeur de comparaison, masse dissoute indicative
  (C × porosité × épaisseur × surface, hypothèses réglables), concentration
  maximale ; tendance de Mann-Kendall ; graphiques et tableau.
- **Comparaison de deux dates** : écart de niveau (bleu en hausse, brun en
  baisse) ou rapport des concentrations (÷ 10 vert à × 10 rouge), sur la
  surface et les étiquettes.

## Sols, gaz du sol, terrain

- Échantillons colorés contre la valeur guide ERM (sols, sur site) ;
  enveloppe au-dessus d'un seuil (inverse distance en trois dimensions,
  limitée aux parcelles), avec son volume.
- **Filières d'évacuation** (`filieres.ts`) : ISDI d'après l'annexe II de
  l'arrêté du 12 décembre 2014 et ses notes (module de Résultats labo) ;
  ISDND / ISDD d'après les seuils de lixiviation de la décision 2003/33/CE
  (annexe, 2.2.2 et 2.4.1) ; au-delà, traitement préalable ; pack incomplet :
  indéterminé. Volumes et tonnages par filière dans le site (chaque bloc
  prend la filière de l'échantillon le plus proche). Orientation indicative :
  le caractère dangereux dépend des propriétés HP 1 à HP 15, l'exploitant du
  site receveur a le dernier mot.
- **Gaz du sol** au niveau de la crépine des piézairs, comparés à titre de
  repère à la valeur R1 de l'air intérieur.
- **PID** en anneaux le long des forages, **observations organoleptiques**
  en repères.

## Schéma conceptuel

`conceptuel.ts`, `cibles.ts` : proposé d'après les données (méthodologie
nationale de gestion des sites et sols pollués, avril 2017) — sources (sols
au-dessus des valeurs guides ou volatils quantifiés, indices
organoleptiques, eaux au-dessus des valeurs de comparaison à la dernière
campagne, gaz du sol), voies de transfert (contact direct, volatilisation,
lixiviation, migration dans la nappe avec son sens), cibles (usagers,
bâtiments du site et riverains de la BD TOPO selon leur usage, prélèvements
déclarés à la BNPE et cours d'eau en aval). Chaque élément se garde ou
s'écarte ; export SVG.

Les cibles bâties suivent l'**usage des bâtiments** (voir ci-dessous) :
usage actuel du site, occupants des bâtiments du site (habitants compris
quand des logements y sont recensés), riverains habitants (bâtiments
résidentiels ou avec logements, nombre de logements, en aval), riverains
travailleurs et public des activités voisines ; bâtiments d'usage non
renseigné à vérifier ; rappel de vérifier les établissements sensibles
quand il y a des commerces et services (circulaire du 8 février 2007).

## Bâtiments et usages

`usages.ts`, `cibles.ts` : les bâtiments de la BD TOPO® (IGN, couche
`batiment`, par API Carto) autour du modèle, avec leurs attributs `usage_1`
et `usage_2` (usage principal et secondaire, issus des Fichiers fonciers de
la DGFiP), `nature`, `hauteur`, `nombre_de_logements`, `nombre_d_etages`.

| Classe | Couleur | Usage BD TOPO |
| --- | --- | --- |
| Résidentiel | ambre `#f2a600` | Résidentiel |
| Commercial et services | framboise `#c2396e` | Commercial et services (bureaux, services, établissements recevant du public) |
| Industriel | violet `#5b44d6` | Industriel |
| Agricole | olive `#7d8f3a` | Agricole |
| Activité sans précision | violet clair `#a99be8` | nature « Industriel, agricole ou commercial » sans usage renseigné |
| Autre usage ou non renseigné | gris `#d6d1c8` | Annexe, Religieux, Sportif, Indifférencié |

Usage « Indifférencié » : l'usage secondaire, sinon des logements recensés
(résidentiel), sinon la nature du bâtiment (serre, silo : agricole) ; la
classe est alors signalée comme déduite. Ambre pour l'habitat et violet pour
l'industrie reprennent les cartes d'occupation du sol (PLU, MOS) ; la palette
est vérifiée pour les daltonismes sur le fond clair de la vue.

Dans la vue : calque « Bâtiments et usages » et préréglage du même nom ;
bâtiments à leur hauteur réelle (sans exagération, 6 m quand elle manque),
ceux du site en transparence pour voir les forages, les voisins opaques, ou
en emprise au sol en option ; toit de la couleur de l'usage secondaire quand
il diffère (rez-de-chaussée commercial sous des logements) ; légende avec le
nombre de bâtiments par usage ; fiche au clic (usages, nature, occupants,
logements, étages, hauteur) ; tableau des bâtiments (usage, emplacement sur
le site ou voisin, amont / aval d'après l'écoulement de la dernière
campagne). Usages à confirmer par la visite du site et de ses abords.

## Vue

- Préréglages : Géologie, Nappe et panache, Sols et gaz, Bâtiments et
  usages, Vue d'ensemble.
- Panneau en onglets (Calques, Géologie, Eaux, Sols et gaz, Coupe et vue) ;
  légende repliable.
- Frise proportionnelle au temps : hautes eaux (bleu), basses eaux (ocre),
  niveaux seuls (cercle vide), foration (carré) ; lecture automatique ;
  clavier (flèches, début, fin).
- Outils : sélection (fiches), **forage virtuel** (clic sur le sol :
  colonne de formations avec l'incertitude de leur toit, nappe, concentration
  estimée), **mesure** (distance, horizontale, dénivelé réel).
- Étiquettes désencombrées (piézomètres et sélection d'abord), valeurs au
  survol en option ; lien de chaque fiche vers le log (Logs de forage, ancre
  `#forage=`).
- Bâtiments BD TOPO colorés par usage (voir Bâtiments et usages).
- Image PNG avec les étiquettes ; tableaux des valeurs affichées.
- Calculs lourds (modèle, formations, krigeage, volumes, évolution,
  tendances) dans un Web Worker ; blocs réduits à leurs faces visibles.

Le modèle enregistre dans le dossier (`modele-3d.json`) les fichiers
déposés dans l'outil, les sources décochées, les coordonnées et cotes
saisies, le regroupement des formations, les choix du schéma conceptuel et
les réglages de la vue.

## Tests

`modele.test.ts`, `calculs.test.ts` (projections et reconnaissance des
systèmes, saisies, points d'investigation du dossier, krigeage, formations et contacts, filières, isopièzes,
évolution du panache, schéma conceptuel), `dossier.test.ts` (fichiers des
outils relus après un aller-retour par l'encodage du dossier, fiches de
prélèvement, tournées sans analyses, emprise des interpolations),
`usages.test.ts` (classement des usages, usages mixtes et déduits, lecture
des propriétés de la BD TOPO) ; cibles selon l'usage dans `calculs.test.ts`.
