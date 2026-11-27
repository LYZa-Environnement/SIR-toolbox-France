/**
 * What the 3D model is made of, whatever tool or file it comes from:
 * boreholes with their lithology, equipment and soil samples (Logs de
 * forage, soil lab reports), and the groundwater monitoring (Suivi
 * temporel, Résultats labo, lab reports and sampling sheets) as lots and
 * campaigns, consolidated by the Suivi temporel's own code.
 */

import type { Lecture } from '../resultats/parse.ts'
import type { CampagneSaisie, Corrections, Lot, Releve } from '../suivi/modele.ts'
import type { Position } from '../resultats/expert/amontAval.ts'

/** A depth interval below ground, in metres. */
export interface Intervalle {
  de: number
  a: number
}

export interface CoucheLitho extends Intervalle {
  /** Keyword of the log ("SABLE ARGILEUX"). */
  cle: string
  description: string
  /** Main component (lithologie.ts). */
  classe: string
}

/** Well construction: "CREPINE", "TUBE PLEIN", "MASSIF FILTRANT", "BENTONITE"… */
export interface Equipement extends Intervalle {
  element: string
}

export interface MesurePid extends Intervalle {
  valeur: number
}

/** Remarks and organoleptic observations of the log (Comments sheet). */
export interface Observation extends Intervalle {
  /** Odour, colour, sheen… as written. */
  organoleptique: string
  remarque: string
  humidite: string
}

export interface ValeurSol {
  /** In the parameter's unit; the LQ itself when `inferieur`. */
  valeur: number | null
  inferieur: boolean
  brut: string
}

export interface EchantillonSol extends Intervalle {
  id: string
  /** Sampling date (ISO), or ''. */
  date: string
  /** By soil parameter key. */
  resultats: Record<string, ValeurSol>
}

export interface ParametreSol {
  cle: string
  nom: string
  cas: string
  unite: string
  famille: string
  eluat: boolean
}

export interface Forage {
  /** Name as written in the source. */
  nom: string
  /** Matching key (cleOuvrage: "PZ 01" = "pz-1"). */
  cle: string
  /** Collar, in the source's projected system (Lambert 93 as a rule), and its elevation (m NGF). */
  x: number | null
  y: number | null
  z: number | null
  profondeur: number
  lithologie: CoucheLitho[]
  equipement: Equipement[]
  pid: MesurePid[]
  observations: Observation[]
  /** Water depth met while drilling, below ground (m). */
  niveauEau: number | null
  echantillons: EchantillonSol[]
  /** Drilling date (ISO), when the log gives it. */
  date: string
}

/** A well described in a history table: position, coordinates, elevation of its measuring point. */
export interface OuvrageDecrit {
  nom: string
  position: Position | null
  x: number | null
  y: number | null
  repere: number | null
}

/** Monitoring data in the Suivi temporel's own terms, consolidated with construireBase. */
export interface DonneesEaux {
  lots: Lot[]
  /** Campaigns as grouped by the user in Suivi temporel; lots of other sources are placed in them. */
  campagnes: CampagneSaisie[]
  releves: Releve[]
  ouvrages: OuvrageDecrit[]
  corrections: Corrections | null
}

/** Soil gas results, in a concentration (µg/m³ or mg/m³), by sampling point. */
export interface LectureGaz {
  fichier: string
  date: string
  parametres: ParametreSol[]
  /** By point name (the gas probe, matched with a borehole by name). */
  points: Record<string, Record<string, ValeurSol>>
}

/** Soil results not yet attached to a borehole: matched by sample name ("S3 (0,5-1 m)"). */
export interface LectureSol {
  fichier: string
  lecture: Lecture
  /** Sampling date of the report (ISO), or ''. */
  date: string
}

export type Origine = 'dossier' | 'fichier' | 'exemple'

/** One source of the model: a tool's file in the dossier, a dropped file, the example. */
export interface Source {
  id: string
  origine: Origine
  /** Tool of the dossier the data comes from. */
  outil?: 'logs-forage' | 'suivi-temporel' | 'resultats-labo'
  nom: string
  /** One line: what the source holds. */
  resume: string
  forages: Forage[]
  parametresSol: ParametreSol[]
  sols: LectureSol[]
  eaux: DonneesEaux | null
  gaz?: LectureGaz[]
  /** Outline of the site's parcels, Lambert 93 rings (the example's; a dossier's site wins). */
  parcelles?: [number, number][][]
  avertissements: string[]
}
