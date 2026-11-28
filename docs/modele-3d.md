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

## Délimitation du panache

`delimitation.ts` : le panache est-il délimité par les ouvrages ? Pour le
composé choisi, à la campagne affichée dans la frise, contre la valeur de
comparaison de Suivi temporel (section « Délimitation du panache » sous la
vue, calcul dans le Web Worker).

- **Fermeture, ouvrage par ouvrage** : autour de chaque ouvrage au-dessus de
  la valeur, quatre quadrants de 90° orientés sur l'écoulement de la date
  (sinon de la dernière campagne, sinon sur le nord) : aval, côté droit et
  côté gauche en regardant vers l'aval, amont. Un côté est fermé quand son
  quadrant contient un ouvrage sous la valeur : nettement (moins de la
  moitié de la valeur, ou non quantifié avec une LQ au plus égale à la
  moitié), ou de justesse (entre la moitié et la valeur). Un ouvrage non
  quantifié avec une LQ au-dessus de la valeur ne ferme rien (signalé). Pour
  chaque côté : délimité, de justesse ou non délimité, les ouvrages du front
  (au-dessus de la valeur, sans autre ouvrage au-dessus de la valeur
  au-delà) et l'ouvrage qui ferme le plus proche. Un quadrant est convexe :
  les témoins des ouvrages situés plus loin sont aussi ceux de l'ouvrage.
- **Pourtour des ouvrages** : le long de l'enveloppe convexe des ouvrages
  analysés, la part où le champ interpolé atteint la valeur ; tracée au sol
  dans la vue (rouge : le panache sort des ouvrages ; vert : en deçà).
- **Probabilité de dépassement** à chaque nœud, d'après le krigeage du
  logarithme des concentrations, l'erreur supposée gaussienne :
  P = 1 − Φ((log10 valeur − m) / σ) (Goovaerts, 1997, chapitre 7). Surfaces
  où P ≥ 50 % et P ≥ 90 %, et surface au classement douteux
  Σ min(P, 1 − P) × maille. Option « Colorer la nappe selon la probabilité
  de dépasser la valeur de comparaison » (onglet Eaux : vert sûrement en
  dessous, gris douteux, rouge sûrement au-dessus) ; probabilité au forage
  virtuel.
- **Emplacements proposés** (0 à 5, 3 par défaut) : d'abord un au-delà du
  front de chaque côté ouvert, dans l'axe de ce côté, là où le modèle situe
  la fin du panache (probabilité de dépassement de 25 % au plus), sinon au
  bout de la portée de l'interpolation (le modèle ne lit pas plus loin : le
  panache peut continuer) ; puis là où le classement au-dessus ou
  au-dessous de la valeur est le plus douteux, la variance de krigeage
  recalculée avec chaque ouvrage ajouté (elle ne dépend que des positions ;
  Ranjan, Bingham et Michailidis, 2008 ; Bect et al., 2012). Pour chacun :
  coordonnées, position par rapport à l'ouvrage le plus proche, probabilité
  de dépassement et concentration estimées, profondeur de l'eau estimée,
  sur le site ou non, surface douteuse restante. Tubes violets N1, N2… dans
  la vue, fiche au clic, export CSV.
- Limites : en inverse distance, ni probabilité ni emplacement « douteux »
  (fermeture seule) ; sous six ouvrages, variogramme par défaut
  (probabilités indicatives) ; la variance de la tendance n'est pas comptée
  (régression-krigeage), l'incertitude est sous-estimée loin des ouvrages.
  Emplacements indicatifs : accès, propriété, réseaux (DT-DICT) et crépine
  à vérifier.

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
bâtiments du site et riverains de la BD TOPO, prélèvements déclarés à la
BNPE et cours d'eau en aval). Chaque élément se garde ou s'écarte ; export
SVG.

## Vue

- Préréglages : Géologie, Nappe et panache, Sols et gaz, Vue d'ensemble.
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
- Bâtiments BD TOPO : ceux du site en volume, les voisins en emprise.
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
évolution du panache, délimitation du panache : quadrants, fermetures calculées à la main, exemple, schéma conceptuel), `dossier.test.ts` (fichiers des
outils relus après un aller-retour par l'encodage du dossier, fiches de
prélèvement, tournées sans analyses, emprise des interpolations).
