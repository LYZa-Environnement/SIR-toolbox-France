# Modèle 3D du site

Page : `frontend/src/pages/Modele3D.tsx` — catégorie **4. Synthèse et
modèle conceptuel**. Calculs : `frontend/src/lib/modele3d/`, scène 3D
(three.js) : `frontend/src/components/modele3d/`.

Les logs de forage, la géologie, les eaux souterraines et les résultats
d'analyses réunis dans une même vue en trois dimensions, pour lire le site
comme un tout : sondages et piézomètres à leur place, modèle géologique
interpolé entre les logs, surface de la nappe et sens d'écoulement à chaque
campagne, panache d'un composé, sols au-dessus d'un seuil. On choisit ce
qu'on affiche, on coupe le modèle et on parcourt les dates.

## Données d'entrée

**Depuis le dossier d'étude** (`dossier.ts`) : le modèle relit, sans les
modifier, les fichiers des autres outils du dossier ouvert, et les relit au
retour sur l'onglet (les logs ou le suivi ont pu changer dans un autre
onglet) :

- `logs-forage.json` (Logs de forage) : têtes de forage (coordonnées, cote),
  lithologie, équipement (crépines), PID, niveau d'eau à la foration,
  échantillons et résultats du laboratoire rattachés à chacun ;
- `suivi-temporel.json` (Suivi temporel) : toutes les campagnes telles que
  regroupées, datées et corrigées dans l'outil (rattachements d'échantillons,
  coordonnées et cotes des ouvrages, valeurs de comparaison saisies) ;
- `resultats-labo.json` (Résultats labo) : une campagne sur sols (rattachée
  aux forages par le nom des échantillons) ou d'eaux souterraines, avec les
  campagnes comparées, et les fiches de prélèvement chargées dans
  Conditions de la nappe.

**Niveaux d'eau des fiches de prélèvement** : d'où qu'elles viennent
(déposées ici, chargées dans Suivi temporel ou dans Conditions de la nappe),
les fiches sont lues comme le fait Suivi temporel (`lib/nappe/fiches.ts`) :
niveau statique initial sous le repère, cote du repère, cote du niveau d'eau
si la fiche la donne, paramètres de fin de purge. Cote piézométrique = cote
du repère − niveau statique ; sans cote du repère, cote du sol − niveau
(approchée, signalée). Une fiche sans date lisible prend la date de la
campagne de Résultats labo. Une fiche à moins d'un mois d'une campagne
d'analyses s'y rattache ; les autres (fiches seules, tournée de niveaux)
forment leurs propres étapes dans la frise, regroupées à 20 jours près.

Chaque source se décoche. **Fichiers déposés** : le classeur de saisie des
logs (lu comme le fait Logs de forage, `logs.ts`), les rapports du
laboratoire sur sols ou sur eaux, les fiches de prélèvement et le tableau
historique (lus par Suivi temporel). Une date de prélèvement introuvable se
saisit à côté du fichier. Un exemple fictif (`exemple.ts`) reprend les cinq
ouvrages de l'exemple de Suivi temporel avec leurs logs et huit sondages.

## Assemblage

`assemblage.ts` :

- forages et ouvrages rapprochés par leur nom (« PZ 01 » = « pz-1 ») ; une
  source plus récente complète ou remplace la précédente (coordonnées,
  lithologie, équipement), les échantillons sont réunis ;
- résultats de sols rattachés par le nom de l'échantillon (forage puis
  profondeurs, « S3 (0,5-1 m) »), sur l'échantillon du log aux mêmes
  profondeurs quand il existe ; paramètres par n° CAS, sinon par nom,
  ramenés à l'unité du premier rencontré ;
- eaux souterraines consolidées par le code de Suivi temporel
  (`construireBase`) : les campagnes de Suivi temporel servent de cadre, les
  autres rapports s'y placent (moins de 20 jours d'écart) ou forment de
  nouvelles campagnes.

## Modèle

`modele.ts`, repère local (x est, y nord, z cote) :

- **position** : onglet Collars des logs, sinon onglet Ouvrages du suivi ;
  un point sans coordonnées est rangé hors modèle, au sud, et signalé ;
- **sol** : en Lambert 93, relief IGN (RGE ALTI®, service d'altimétrie de la
  Géoplateforme, grille de 14 × 14 points, `ign.ts`) recalé sur les cotes
  nivelées des forages — décalage médian appliqué à tout le relief, écarts
  restants répartis autour de chaque forage ; sans MNT, plan des moindres
  carrés par les cotes et écarts répartis par inverse distance ; sans
  aucune cote, le modèle est dessiné en profondeur, le sol à 0 ;
- **géologie** : blocs entre le sol et le fond des forages (interpolé).
  Chaque bloc prend la lithologie dominante des forages voisins à la même
  cote, pondérée par l'inverse du carré de la distance, un mètre vertical
  comptant pour dix horizontaux. Les couches sont regroupées par leur
  composant principal, le premier mot-clé du log (`lithologie.ts`, mêmes
  mots-clés que les figurés des logs : « sable argileux » est un sable).
  Seulement entre les forages (leur enveloppe convexe) et à moins de 1,5
  fois leur espacement médian au-delà, sauf « Étendre à toute l'emprise ».
  Volume modélisé de chaque lithologie ;
- **nappe** : à chaque campagne, cote piézométrique de chaque ouvrage
  (mesurée, sinon cote du repère − profondeur de l'eau, sinon cote du sol −
  profondeur, signalé), plan des moindres carrés plus écarts répartis par
  inverse distance, plafonnée au sol ; sens d'écoulement et gradient du plan
  (comme Suivi temporel, 3 ouvrages au moins). « À la foration » : les
  niveaux de l'onglet Water Level ;
- **panache** : interpolation inverse distance sur le logarithme des
  concentrations (la moitié de la LQ pour un résultat non quantifié ; les
  paramètres de terrain sur leur valeur), entre les ouvrages seulement,
  coloré sur la surface de la nappe ;
- **sols** : échantillons au milieu de leur intervalle ; **enveloppe
  au-dessus d'un seuil** par inverse distance en trois dimensions sur le
  logarithme des résultats (un mètre vertical pour cinq horizontaux),
  limitée aux trois quarts de l'espacement des sondages échantillonnés et à
  1 m au-dessus et au-dessous de l'intervalle prélevé, avec son volume. Un
  ordre de grandeur pour orienter des investigations, pas une cubature.

## Couleurs

Contre une valeur de référence — valeur de comparaison de Suivi temporel
pour les eaux (valeurs ERM, ou saisie dans l'outil), valeur guide ERM pour
les sols (sur site) — cinq classes : non quantifié, moins de la moitié, de la
moitié à la valeur, de 1 à 10 fois, plus de 10 fois. Sans valeur de
référence, une échelle d'une seule teinte, du clair au foncé, sur l'étendue
des résultats (logarithmique pour les concentrations). Les valeurs sont
aussi écrites sur les étiquettes, dans la fiche et dans les tableaux.

## Vue

- Calques : sol (teinte, photographie aérienne IGN, Plan IGN, carte
  géologique 1/50 000 du BRGM — en Lambert 93 ; si le serveur du BRGM refuse
  l'usage de son image en 3D, elle est montrée en vignette), blocs
  géologiques (chaque lithologie se masque), forages, crépines, nappe,
  ouvrages (niveau et concentration), noms, cadre et cotes ;
- choix du composé (eaux) et du paramètre (sols), proposés d'après le
  nombre de dépassements ;
- dates : une étape par campagne, par tournée de niveaux sans analyses et
  pour la foration, curseur, précédente /
  suivante, lecture automatique ; option pour ne montrer que les sols
  prélevés à la date affichée ou avant ;
- coupes ouest–est, nord–sud et horizontale, exagération verticale
  (automatique d'après les proportions du site), vues prédéfinies ;
- clic sur un forage, un échantillon ou un bloc : fiche (lithologie,
  crépine, niveau, résultat à la date et chronique du composé, résultats de
  l'échantillon comparés aux valeurs guides) ; survol : une bulle ;
- tableaux des valeurs affichées (eaux à la date, sols), image PNG de la vue
  avec ses étiquettes (copiée dans `exports/` du dossier).

Le modèle enregistre dans le dossier (`modele-3d.json`) les fichiers déposés
dans l'outil, les sources décochées et les réglages de la vue ; les données
des autres outils restent dans leurs propres fichiers.

## Tests

`modele.test.ts` (interpolation, lithologie, lecture des logs, assemblage,
modèle de l'exemple : géologie, nappe et écoulement, panache, enveloppe des
sols), `dossier.test.ts` (fichiers des outils relus après un aller-retour
par l'encodage du dossier, niveaux des fiches de prélèvement et tournées
sans analyses, emprise des interpolations).
