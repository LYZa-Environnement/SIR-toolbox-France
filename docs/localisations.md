# Localisation des points

Page : `frontend/src/pages/Localisations.tsx` (route `/localisations`) —
catégorie **2. Données de terrain**. Calculs : `frontend/src/lib/localisations/`.

Les fichiers de localisation des points d'investigation (sondages,
piézomètres, piézairs, vapor pins, prélèvements d'air, ouvrages de
traitement) sont déposés tels qu'ils arrivent ; les points sont convertis en
Lambert 93 et en WGS 84, réunis sur une carte, les doublons entre fichiers
repérés, puis exportés.

## Formats lus

| Format | Ce qui est lu |
| --- | --- |
| **EQuIS GeologyEDD** (`.xlsx`) | Onglet `Locations` : `sys_loc_code`, `x_coord`, `y_coord`, `coord_type_code` (système de chaque ligne), `loc_type`, `loc_desc`, `surf_elev`, `total_depth` ; cote du repère et profondeur de l'ouvrage depuis `Wells` (`top_casing_elev`, `depth_of_well`) et `WellDatum` (dernière `datum_value`). Les lignes commençant par `#` (types de données, libellés français) et les onglets de listes de référence (`rt_*`) sont ignorés. |
| **Export ArcGIS Field Maps / Survey123** (`.xls`, `.xlsx`, `.csv`) | `nom_ouvrage`, `type_ouvrage`, `localisation`, `x_cc49`/`y_cc49` (le nom de colonne donne le système), autres champs gardés en attributs ; `OBJECTID`, `GlobalID`, `Creator`… écartés. |
| **Tableau simple** (Excel, CSV) | Une ligne d'en-tête n'importe où dans les 30 premières lignes, avec X et Y (ou longitude et latitude) ; colonnes facultatives : nom, type, système, altitude, cote du repère, profondeur, description, date. Nombres à la française (`652 300,12`) ou à l'anglaise, degrés-minutes-secondes acceptés. Un **modèle simple** est téléchargeable sur la page. |
| **GeoJSON** | Points et contours ; WGS 84 par défaut (RFC 7946), ou le système du membre `crs` des fichiers plus anciens (QGIS). |
| **KML / KMZ** (Google Earth, My Maps) | Repères, le nom du dossier KML servant de type (« Piézomètres »), `ExtendedData`, lignes et polygones. |
| **GPX** (GPS, téléphones) | Points (`wpt`, altitude, date), itinéraires et traces en tracés. |
| **Shapefile** | Zippé, ou `.shp` + `.dbf` + `.prj` (+ `.cpg`) déposés ensemble ; le `.prj` donne le système, à défaut il est deviné. |

Les plans DAO (DXF, DWG) ne sont pas lus : exporter les points en CSV ou en
shapefile depuis le logiciel.

## Systèmes de coordonnées

Conversions par [proj4](https://github.com/proj4js/proj4js) avec les
définitions du registre EPSG (`lib/localisations/systemes.ts`) :
RGF93 / Lambert 93 (2154), Lambert CC42 à CC50 (3942 à 3950), WGS 84 (4326),
UTM 30N, 31N, 32N (WGS 84), Web Mercator (3857), NTF Lambert II étendu
(27572) et Lambert I, III, IV carto, et pour l'outre-mer RGAF09 UTM 20N,
RGFG95 UTM 22N, RGR92 UTM 40S, RGM04 UTM 38S.

- Les systèmes NTF (Lambert II étendu…) passent par le décalage à trois
  paramètres de l'IGN (−168, −60, 320 m) : 1 à 2 m d'écart avec la grille
  officielle, suffisant pour une carte, pas pour un levé.
- **Reconnaissance**, dans l'ordre : système déclaré (`coord_type_code`
  d'EQuIS, colonne « Système », `.prj`, membre `crs`), nom des colonnes
  (`x_cc49`, `X_L93`, `longitude`), puis valeurs : seul système qui place
  les points en France (une zone CC n'est retenue que dans sa bande de
  latitude), latitude et longitude inversées repérées. Quand plusieurs
  systèmes conviennent (UTM et Web Mercator, par exemple), le plus proche des
  points déjà chargés est proposé, marqué « À confirmer ».
- Le système se change fichier par fichier ; il remplace alors aussi les
  systèmes déclarés ligne par ligne.

## Familles de points

Reconnues d'après le type du fichier (types EQuIS, usages français), à défaut
d'après le préfixe du nom (`Pz`, `Pza`, `VP`, `S`, `T`, `AA`…) :
piézomètres, sondages de sol, piézairs (gaz du sol), gaz sous dalle (vapor
pins), air intérieur ou ambiant, ouvrages de traitement (extraction,
injection), eaux superficielles et sédiments, autres. Chaque famille a sa
couleur et sa forme sur la carte. Une famille décochée est aussi retirée des
exports.

## Doublons entre fichiers

Un même nom (sans tenir compte de la casse) dans plusieurs fichiers :

- à moins de **10 cm** près, les points sont **fusionnés** : la version du
  dernier fichier déposé est gardée, complétée par les autres (altitude,
  profondeur, type EQuIS, attributs) ; la source indique tous les fichiers ;
- au-delà, l'**écart** est signalé, avec sa distance, et la version retenue
  se choisit (levé de géomètre plutôt que GPS, par exemple).

Les points sans coordonnées sont listés à part (« Localisation non trouvée »,
blancs, prélèvements sur une unité de traitement).

## Exports

- **GeoJSON** : WGS 84, Lambert 93 dans les attributs — le format d'échange
  le plus simple, lu par QGIS et ArcGIS.
- **KML** : Google Earth, My Maps ; un dossier par famille, aux couleurs de
  la carte.
- **GPX** : points pour un GPS ou un téléphone de terrain.
- **CSV** et **Excel** : Lambert 93, système local du site (le système
  d'origine des points, à défaut la zone CC de la latitude) et WGS 84 ;
  l'Excel ajoute les points sans coordonnées, les écarts entre fichiers et
  une note sur les conversions.
- **EDD EQuIS** : onglet `Locations` du format GeologyEDD, en Lambert 93,
  dans le système local ou en WGS 84 (`coord_type_code` `RGF_LAMBERT93`,
  `FRANCE-LAMB-CCxx`, `LAT LONG`). Le `loc_type` d'origine est repris quand
  le point venait d'un EDD, sinon celui de sa famille. À contrôler dans EDP
  avant chargement : les listes de valeurs de la base font foi.
