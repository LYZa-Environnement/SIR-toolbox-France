/**
 * Utility networks around a site: categories, colours and the shape of a
 * source and of a drawn object.
 */

/** Network family, as split by the colour code of the networks. */
export type Reseau = 'electricite' | 'eclairage' | 'gaz' | 'hydrocarbures' | 'eau' | 'assainissement' | 'pluvial' | 'telecom' | 'chaleur'

export interface Categorie {
  id: Reseau
  libelle: string
  /** Colour of the network family (code couleur NF P 98-332, see `CATEGORIES`). */
  couleur: string
}

/**
 * Network families in display order, coloured after the colour code of
 * buried and overhead networks (norme NF P 98-332, taken up by the guide
 * d'application de la réglementation anti-endommagement, fascicule 2): red
 * for electricity and street lighting, yellow for gas, orange for
 * hydrocarbons and chemicals, blue for drinking water, brown for sewers and
 * storm water, green for telecommunications, purple for heating and cooling.
 *
 * Street lighting and storm water keep their family's hue, in a darker or
 * lighter shade, so that a reader used to the code reads them at once while
 * still telling them apart on the map.
 */
export const CATEGORIES: Categorie[] = [
  { id: 'electricite', libelle: 'Électricité', couleur: '#e02424' },
  { id: 'eclairage', libelle: 'Éclairage public', couleur: '#9b1c1c' },
  { id: 'gaz', libelle: 'Gaz', couleur: '#e3a008' },
  { id: 'hydrocarbures', libelle: 'Hydrocarbures et produits chimiques', couleur: '#ff7a00' },
  { id: 'eau', libelle: 'Eau potable', couleur: '#1c64f2' },
  { id: 'assainissement', libelle: 'Assainissement (eaux usées, unitaire)', couleur: '#7c4a1e' },
  { id: 'pluvial', libelle: 'Eaux pluviales', couleur: '#b7834a' },
  { id: 'telecom', libelle: 'Télécommunications (fibre)', couleur: '#0e9f6e' },
  { id: 'chaleur', libelle: 'Chaleur et froid urbains', couleur: '#7e3af2' },
]

export const CATEGORIE: Record<Reseau, Categorie> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<Reseau, Categorie>

/** West, south, east, north in WGS84 degrees. */
export type Emprise = [number, number, number, number]

export type Proprietes = Record<string, unknown>

/** How a source is queried. Each protocol filters on the map extent server side. */
export type Acces =
  /** data-fair (Agence ORE, Koumoul, Côtes-d'Armor, Grand Poitiers…): `/lines?bbox=`. */
  | { type: 'datafair'; base: string; dataset: string }
  /** Opendatasoft Explore v2.1: GeoJSON export filtered with `intersects()`. */
  | { type: 'ods'; portail: string; dataset: string; champGeo: string }
  /** OGC WFS 2.0 with GeoJSON output (GeoServer, Géoplateforme). */
  | { type: 'wfs'; url: string; couche: string }
  /** OGC API Features. */
  | { type: 'ogcapi'; url: string; collection: string }
  /** ArcGIS REST layer (FeatureServer or MapServer), `query` with an envelope. */
  | { type: 'arcgis'; url: string }
  /** Géoportail de l'Urbanisme through API Carto: generators of public-utility easements. */
  | { type: 'gpu' }

/** What one object of a source is. `null` drops the object. */
export interface Classement {
  reseau: Reseau
  /** Kind of object, as written in the legend: "Ligne BT aérienne", "Regard"… */
  element: string
  aerien?: boolean
}

export interface SourceReseau {
  id: string
  /** Layer name as listed to the reader. */
  titre: string
  /** Body publishing the data. */
  producteur: string
  /** Territory covered, in words. */
  territoire: string
  /** Area where the source has data; a national source has none. */
  emprise?: Emprise
  /** Families this source can return, for the coverage table. */
  reseaux: Reseau[]
  acces: Acces
  /** Public page of the dataset. */
  fiche: string
  /** Licence as stated by the portal; left out when the portal does not say it, the dataset page does. */
  licence?: string
  /** Objects fetched at most per search, when the default is too low for a dense source. */
  limite?: number
  /** Caveat shown with the source (age, scale, partial content). */
  note?: string
  classer: (p: Proprietes) => Classement | null
  /** Network operator named by the object, when the data gives it. */
  gestionnaire?: (p: Proprietes) => string | undefined
  /** Attribute lines for the object's popup. */
  details?: (p: Proprietes) => [string, string | number | null | undefined][]
}

export type Geometrie =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

/** One network object, normalised from any source. */
export interface ObjetReseau {
  id: string
  source: string
  reseau: Reseau
  element: string
  aerien: boolean
  gestionnaire?: string
  geometrie: Geometrie
  details: [string, string][]
}

/** Result of one source for one extent. */
export interface ResultatSource {
  objets: ObjetReseau[]
  /** The source holds more objects than were fetched for this extent. */
  tronque: boolean
}
