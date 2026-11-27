/**
 * Geographic data of a study: the points (boreholes, wells, soil-gas probes,
 * sub-slab pins, air samplers…) and the shapes (site outline, zones, trench
 * lines) read from the files dropped by the user.
 *
 * Coordinates are kept as the file gives them, with their system: a wrong
 * guess of the system is corrected by choosing another one, without reading
 * the file again. Longitude/latitude and Lambert 93 are derived (synthese.ts).
 */

export type Format = 'equis' | 'tableau' | 'geojson' | 'kml' | 'gpx' | 'shapefile'

/** Kind of point, normalised from the many names used in the files. */
export type Famille = 'piezometre' | 'sondage' | 'gaz-sol' | 'sous-dalle' | 'air' | 'traitement' | 'eau-surface' | 'autre'

export type Valeur = string | number

export interface PointLu {
  nom: string
  /** Type as written in the file ("Monitoring well", "Vapor Pin", "PZ"…). */
  typeOrigine: string
  famille: Famille
  description: string
  /** Coordinates as in the file; null when the file has none for this point. */
  x: number | null
  y: number | null
  /** System declared on the row itself (EQuIS coord_type_code). */
  systeme?: string
  /** Ground level, m (NGF unless the file says otherwise). */
  altitude?: number
  /** Top of casing or measuring point, m. */
  repere?: number
  /** Depth of the borehole or well, m. */
  profondeur?: number
  /** Date of the work, ISO day. */
  date?: string
  /** Other columns of the file worth keeping (floor, cover, remarks…). */
  attributs: Record<string, Valeur>
}

/** A line or polygon (site outline, zone, network) from a GIS file. */
export interface FormeLue {
  nom: string
  /** GeoJSON geometry, coordinates in the layer's system. */
  geometrie: GeoJSON.Geometry
  attributs: Record<string, Valeur>
}

/** What one file (or one sheet of a workbook) gave. */
export interface Couche {
  id: string
  /** File name, and sheet when the workbook has several useful ones. */
  nom: string
  fichier: string
  format: Format
  /** System detected or declared for the layer. */
  systeme: string | null
  /** Why that system, in French (shown next to it). */
  raisonSysteme: string
  /** False when the values fit several systems: to be confirmed. */
  systemeSur: boolean
  /** Other systems the values fit, offered first when changing. */
  autresSystemes: string[]
  /** Chosen by the user: replaces the detected and the per-row systems. */
  systemeForce?: string
  /** WKT of a shapefile's .prj, when it names no known system. */
  prj?: string
  /** Longitude and latitude columns swapped in the file. */
  inverse?: boolean
  points: PointLu[]
  formes: FormeLue[]
  /** Read, with remarks for the reader (columns not found, rows skipped…). */
  remarques: string[]
  /** ISO time of the import. */
  importe: string
  masquee?: boolean
}
