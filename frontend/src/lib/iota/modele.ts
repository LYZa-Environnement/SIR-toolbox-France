/**
 * The declaration dossier as the reader fills it: cover data, declarant,
 * site, nomenclature quantities, works (wells), the text of each section, and
 * the figures and appendices. Everything is plain data so it can be saved to
 * a JSON file and loaded back.
 *
 * The completeness check follows article R. 214-32 of the code de
 * l'environnement as amended by décret n° 2022-989 du 4 juillet 2022
 * (version in force since 25 July 2022).
 */

import type { Contexte } from './contexte'
import { nombre, synthese, type Synthese, type Valeurs } from './nomenclature'

export type TypeOuvrage = 'piezometre' | 'puits' | 'forage' | 'pointe'
export type StatutOuvrage = 'existant' | 'a-creer' | 'a-reboucher'

export interface Ouvrage {
  id: string
  nom: string
  type: TypeOuvrage
  statut: StatutOuvrage
  profondeur: string
  /** Drilling diameter, mm — the purge volume is reckoned on it (tube +
   * filter pack), as ERM does. */
  diametreForage: string
  /** Casing, e.g. "PEHD 2 pouces". */
  tube: string
  crepineDe: string
  crepineA: string
  /** Water level below ground, m. */
  niveauEau: string
}

export const LIBELLE_TYPE: Record<TypeOuvrage, string> = {
  piezometre: 'Piézomètre',
  puits: 'Puits',
  forage: 'Forage de pompage',
  pointe: 'Pointe filtrante',
}

export const LIBELLE_STATUT: Record<StatutOuvrage, string> = {
  existant: 'Existant, conservé',
  'a-creer': 'À créer',
  'a-reboucher': 'À reboucher',
}

export type GestionEaux = 'charbon' | 'evacuation' | 'reseau' | 'autre'

export const LIBELLE_GESTION: Record<GestionEaux, string> = {
  charbon: 'Traitement sur site par filtration sur charbon actif avant rejet',
  evacuation: 'Collecte en cuve et élimination en filière agréée',
  reseau: 'Rejet au réseau après autorisation de déversement',
  autre: 'Autre (à décrire)',
}

export type Maitrise = 'proprietaire' | 'autorise' | 'procedure'

export const LIBELLE_MAITRISE: Record<Maitrise, string> = {
  proprietaire: 'Le déclarant est propriétaire du terrain',
  autorise: 'Le déclarant dispose du droit de réaliser le projet (convention, bail, accord du propriétaire)',
  procedure: 'Une procédure est en cours pour conférer ce droit au déclarant',
}

export type EvalEnv = 'non' | 'dispense' | 'etude-impact'

export interface Figure {
  id: string
  titre: string
  /** The figure will be inserted by the cartographer. */
  prevue: boolean
}

/** Text sections of the three documents. */
export type SectionId =
  | 'contexteDemande'
  | 'topographie'
  | 'geologieRegionale'
  | 'geologieLocale'
  | 'hydrologie'
  | 'hydrogeologie'
  | 'usages'
  | 'zonesProtegees'
  | 'zonagesEau'
  | 'descriptionProjet'
  | 'modalitesTravaux'
  | 'programmeSuivi'
  | 'procedurePrelevement'
  | 'gestionEaux'
  | 'choixProjet'
  | 'incidencesQuantitatives'
  | 'incidencesQualitatives'
  | 'incidencesMilieux'
  | 'incidencesChantier'
  | 'variations'
  | 'compatibiliteSdage'
  | 'compatibiliteSage'
  | 'compatibilitePgri'
  | 'objectifsQualite'
  | 'mesuresErc'
  | 'prescriptionsSpecifiques'
  | 'moyensSurveillance'
  | 'moyensIntervention'
  | 'autresProcedures'
  | 'conclusion'
  | 'naturaAnalyse'
  | 'naturaConclusion'
  | 'rntProjet'
  | 'rntIncidences'

export interface Dossier {
  format: 'erm-iota'
  version: 1
  document: {
    titreProjet: string
    gms: string
    version: string
    date: string
    auteurs: string
    directeurNom: string
    directeurFonction: string
    chefNom: string
    chefFonction: string
  }
  declarant: {
    nom: string
    morale: boolean
    siret: string
    dateNaissance: string
    adresse: string
    representant: string
  }
  site: {
    adresse: string
    commune: string
    codeInsee: string
    codePostal: string
    departement: string
    autresDepartements: string
    parcelles: string
    lat: number | null
    lon: number | null
    maitrise: Maitrise
    pieceMaitrise: string
  }
  rubriques: { actives: string[]; valeurs: Record<string, Valeurs> }
  ouvrages: Ouvrage[]
  purge: { nbVolumes: string; campagnesAn: string; gestion: GestionEaux }
  evalEnv: EvalEnv
  hydraulique: boolean
  naturaIncidence: 'absence' | 'possible'
  textes: Partial<Record<SectionId, string>>
  /** Last reading of the public services, saved with the dossier. */
  contexte: Contexte | null
  figures: Figure[]
  annexes: string[]
}

export const FIGURES_DEFAUT: Figure[] = [
  { id: 'loc', titre: 'Localisation générale du site', prevue: true },
  { id: 'geol', titre: 'Contexte géologique du site', prevue: true },
  { id: 'ouvrages', titre: 'Localisation des ouvrages', prevue: true },
  { id: 'captages', titre: 'Localisation des captages d’eau souterraine dans le voisinage du site', prevue: true },
  { id: 'nature', titre: 'Localisation des sites naturels protégés dans le voisinage du site', prevue: true },
  { id: 'n2000', titre: 'Localisation des zones Natura 2000 dans le voisinage du site', prevue: true },
]

export function dossierVide(): Dossier {
  return {
    format: 'erm-iota',
    version: 1,
    document: {
      titreProjet: '',
      gms: '',
      version: '1',
      date: new Date().toISOString().slice(0, 10),
      auteurs: '',
      directeurNom: '',
      directeurFonction: 'Directeur de projet',
      chefNom: '',
      chefFonction: 'Chef de projet',
    },
    declarant: { nom: '', morale: true, siret: '', dateNaissance: '', adresse: '', representant: '' },
    site: {
      adresse: '',
      commune: '',
      codeInsee: '',
      codePostal: '',
      departement: '',
      autresDepartements: '',
      parcelles: '',
      lat: null,
      lon: null,
      maitrise: 'proprietaire',
      pieceMaitrise: '',
    },
    rubriques: { actives: [], valeurs: {} },
    ouvrages: [],
    purge: { nbVolumes: '3', campagnesAn: '2', gestion: 'charbon' },
    evalEnv: 'non',
    hydraulique: false,
    naturaIncidence: 'absence',
    textes: {},
    contexte: null,
    figures: FIGURES_DEFAUT.map((f) => ({ ...f })),
    annexes: ['Logs géologiques et techniques des ouvrages'],
  }
}

/** Fill gaps of a loaded file with today's defaults (older or partial files). */
export function normaliser(x: unknown): Dossier {
  const v = dossierVide()
  if (!x || typeof x !== 'object' || (x as { format?: string }).format !== 'erm-iota') throw new Error('Ce fichier n’est pas un dossier IOTA enregistré par l’outil.')
  const d = x as Partial<Dossier>
  return {
    ...v,
    ...d,
    document: { ...v.document, ...d.document },
    declarant: { ...v.declarant, ...d.declarant },
    site: { ...v.site, ...d.site },
    rubriques: { actives: d.rubriques?.actives ?? [], valeurs: d.rubriques?.valeurs ?? {} },
    purge: { ...v.purge, ...d.purge },
    textes: { ...d.textes },
    contexte: d.contexte ?? null,
    figures: d.figures ?? v.figures,
    annexes: d.annexes ?? v.annexes,
    ouvrages: d.ouvrages ?? [],
  }
}

export function nouvelOuvrage(n: number): Ouvrage {
  return {
    id: `o${Date.now().toString(36)}${n}`,
    nom: `Pz${n}`,
    type: 'piezometre',
    statut: 'existant',
    profondeur: '',
    diametreForage: '',
    tube: 'PEHD 2 pouces',
    crepineDe: '',
    crepineA: '',
    niveauEau: '',
  }
}

// ---- Volumes de purge -----------------------------------------------------------

export interface PurgeOuvrage {
  ouvrage: Ouvrage
  rayonM: number
  hauteurEauM: number
  volumeM3: number
}

export interface Purge {
  lignes: PurgeOuvrage[]
  /** Wells left out, and why. */
  ignores: string[]
  nbVolumes: number
  parCampagneM3: number
  campagnesAn: number
  annuelM3: number
}

/** Purge volume: π r² × water column × number of volumes renewed, r being
 * the drilling radius (casing and filter pack), as in the ERM monitoring
 * dossiers. Wells to be plugged are not sampled. */
export function volumesPurge(d: Dossier): Purge {
  const nbVolumes = nombre(d.purge.nbVolumes) ?? 3
  const campagnesAn = nombre(d.purge.campagnesAn) ?? 0
  const lignes: PurgeOuvrage[] = []
  const ignores: string[] = []
  for (const o of d.ouvrages) {
    if (o.statut === 'a-reboucher') continue
    const prof = nombre(o.profondeur)
    const diam = nombre(o.diametreForage)
    const niveau = nombre(o.niveauEau)
    if (prof === null || diam === null || niveau === null) {
      ignores.push(`${o.nom || 'ouvrage sans nom'} (profondeur, diamètre ou niveau d’eau manquant)`)
      continue
    }
    const h = Math.max(0, prof - niveau)
    const r = diam / 2000
    lignes.push({ ouvrage: o, rayonM: r, hauteurEauM: h, volumeM3: Math.PI * r * r * h * nbVolumes })
  }
  const parCampagneM3 = lignes.reduce((a, l) => a + l.volumeM3, 0)
  return { lignes, ignores, nbVolumes, parCampagneM3, campagnesAn, annuelM3: parCampagneM3 * campagnesAn }
}

export function syntheseDossier(d: Dossier): Synthese {
  return synthese(d.rubriques.actives, d.rubriques.valeurs)
}

/** The earliest date works may start, two months after the complete
 * dossier is received (II de l'article L. 214-3, R. 214-35). */
export function dateDebutPossible(depot: string): string | null {
  const d = new Date(depot)
  if (Number.isNaN(d.getTime())) return null
  d.setMonth(d.getMonth() + 2)
  return d.toISOString().slice(0, 10)
}
