/**
 * Queries to the network sources, one URL builder per protocol, and the
 * normalisation of what they return into `ObjetReseau`.
 *
 * Every builder filters on the extent server side: a site's few hundred
 * metres are asked for, never a whole dataset.
 */

import { requete } from '../reseau'
import { texte } from './sources'
import type { Acces, Emprise, Geometrie, ObjetReseau, Proprietes, ResultatSource, SourceReseau } from './types'

/** Objects fetched at most per source and per search. Beyond, the source is flagged as truncated. */
export const LIMITE_OBJETS = 2000

/** Extent of a circle of `rayonM` metres around a point (equirectangular, exact enough below a few km). */
export function empriseAutour(lat: number, lon: number, rayonM: number): Emprise {
  const dLat = rayonM / 111320
  const dLon = rayonM / (111320 * Math.cos((lat * Math.PI) / 180))
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}

export function intersectent(a: Emprise, b: Emprise): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

/** Sources worth asking for this extent: national ones, and local ones whose extent meets it. */
export function sourcesConcernees(sources: SourceReseau[], emprise: Emprise): SourceReseau[] {
  return sources.filter((s) => !s.emprise || intersectent(s.emprise, emprise))
}

function polygoneWkt([o, s, e, n]: Emprise): string {
  return `POLYGON((${o} ${s},${e} ${s},${e} ${n},${o} ${n},${o} ${s}))`
}

function polygoneGeoJson([o, s, e, n]: Emprise) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [o, s],
        [e, s],
        [e, n],
        [o, n],
        [o, s],
      ],
    ],
  }
}

const arrondi = (x: number) => Number(x.toFixed(6))

/** URL that returns, as GeoJSON, the objects of a source within an extent. */
export function urlSource(acces: Acces, emprise: Emprise, limite = LIMITE_OBJETS): string {
  const [o, s, e, n] = emprise.map(arrondi) as Emprise
  switch (acces.type) {
    case 'datafair': {
      const url = new URL(`${acces.base}/datasets/${acces.dataset}/lines`)
      url.searchParams.set('bbox', `${o},${s},${e},${n}`)
      url.searchParams.set('size', String(limite))
      url.searchParams.set('format', 'geojson')
      return url.toString()
    }
    case 'ods': {
      const url = new URL(`${acces.portail}/api/explore/v2.1/catalog/datasets/${acces.dataset}/exports/geojson`)
      url.searchParams.set('where', `intersects(${acces.champGeo}, geom'${polygoneWkt([o, s, e, n])}')`)
      url.searchParams.set('limit', String(limite))
      return url.toString()
    }
    case 'wfs': {
      const url = new URL(acces.url)
      url.searchParams.set('SERVICE', 'WFS')
      url.searchParams.set('VERSION', '2.0.0')
      url.searchParams.set('REQUEST', 'GetFeature')
      url.searchParams.set('TYPENAMES', acces.couche)
      url.searchParams.set('OUTPUTFORMAT', 'application/json')
      // "EPSG:4326" in short form makes GeoServer answer in longitude/latitude order.
      url.searchParams.set('SRSNAME', 'EPSG:4326')
      url.searchParams.set('COUNT', String(limite))
      // The URN form of the CRS puts latitude first in the BBOX (WFS 2.0 axis order).
      url.searchParams.set('BBOX', `${s},${o},${n},${e},urn:ogc:def:crs:EPSG::4326`)
      return url.toString()
    }
    case 'ogcapi': {
      const url = new URL(`${acces.url}/collections/${acces.collection}/items`)
      url.searchParams.set('f', 'application/geo+json')
      url.searchParams.set('bbox', `${o},${s},${e},${n}`)
      url.searchParams.set('limit', String(limite))
      return url.toString()
    }
    case 'arcgis': {
      const url = new URL(`${acces.url}/query`)
      url.searchParams.set('where', '1=1')
      url.searchParams.set('geometry', `${o},${s},${e},${n}`)
      url.searchParams.set('geometryType', 'esriGeometryEnvelope')
      url.searchParams.set('inSR', '4326')
      url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
      url.searchParams.set('outFields', '*')
      url.searchParams.set('outSR', '4326')
      url.searchParams.set('resultRecordCount', String(limite))
      url.searchParams.set('f', 'geojson')
      return url.toString()
    }
    case 'gpu': {
      const url = new URL('https://apicarto.ign.fr/api/gpu/generateur-sup-l')
      url.searchParams.set('geom', JSON.stringify(polygoneGeoJson([o, s, e, n])))
      return url.toString()
    }
  }
}

interface FeatureBrute {
  id?: string | number
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: Proprietes | null
}

interface ReponseGeoJson {
  features?: FeatureBrute[]
  /** data-fair */
  total?: number
  /** WFS 2.0, OGC API */
  numberMatched?: number | string
  /** ArcGIS */
  properties?: { exceededTransferLimit?: boolean }
  exceededTransferLimit?: boolean
}

const TYPES_GEOMETRIE = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'])

function geometrieValide(g: FeatureBrute['geometry']): Geometrie | null {
  if (!g || typeof g.type !== 'string' || !TYPES_GEOMETRIE.has(g.type) || !Array.isArray(g.coordinates)) return null
  return g as Geometrie
}

/** Whether the source holds more objects than the answer carries. */
export function estTronque(acces: Acces, reponse: ReponseGeoJson, recus: number, limite = LIMITE_OBJETS): boolean {
  switch (acces.type) {
    case 'datafair':
      return typeof reponse.total === 'number' ? reponse.total > recus : recus >= limite
    case 'wfs':
    case 'ogcapi': {
      const n = Number(reponse.numberMatched)
      return Number.isFinite(n) ? n > recus : recus >= limite
    }
    case 'arcgis':
      return Boolean(reponse.properties?.exceededTransferLimit ?? reponse.exceededTransferLimit)
    case 'ods':
      return recus >= limite
    case 'gpu':
      return false
  }
}

/** Sorts and labels the features of one answer; objects the source does not class are dropped. */
export function normaliser(source: SourceReseau, reponse: ReponseGeoJson, limite = LIMITE_OBJETS): ResultatSource {
  const features = reponse.features ?? []
  const objets: ObjetReseau[] = []
  features.forEach((f, i) => {
    const geometrie = geometrieValide(f.geometry)
    if (!geometrie) return
    const p = f.properties ?? {}
    const classement = source.classer(p)
    if (!classement) return
    const details: [string, string][] = []
    for (const [cle, valeur] of source.details?.(p) ?? []) {
      const v = texte(valeur)
      if (v !== undefined) details.push([cle, v])
    }
    objets.push({
      id: `${source.id}:${f.id ?? i}`,
      source: source.id,
      reseau: classement.reseau,
      element: classement.element,
      aerien: classement.aerien ?? false,
      gestionnaire: source.gestionnaire?.(p),
      geometrie,
      details,
    })
  })
  return { objets, tronque: estTronque(source.acces, reponse, features.length, limite) }
}

/** Fetches one source over an extent. Rejects on a network or HTTP failure. */
export async function chargerSource(source: SourceReseau, emprise: Emprise, signal?: AbortSignal): Promise<ResultatSource> {
  const limite = source.limite ?? LIMITE_OBJETS
  const reponse = await requete(urlSource(source.acces, emprise, limite), { signal })
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
  return normaliser(source, (await reponse.json()) as ReponseGeoJson, limite)
}

// ——— Information attached to the commune or the point, not drawn ———

/**
 * Commune code for commune-level datasets. The address base gives Paris,
 * Lyon and Marseille by arrondissement (75104, 69383, 13208), while the
 * energy and fibre datasets list the commune itself (75056, 69123, 13055).
 */
export function codeCommune(citycode: string): string {
  if (/^751\d\d$/.test(citycode)) return '75056'
  if (/^6938\d$/.test(citycode)) return '69123'
  if (/^132\d\d$/.test(citycode)) return '13055'
  return citycode
}

/** Address nearest a point picked on the map (IGN Géoplateforme reverse geocoding). */
export interface PointAdresse {
  label: string
  citycode: string
  city: string
  postcode: string
}

export async function adresseDuPoint(lat: number, lon: number, signal?: AbortSignal): Promise<PointAdresse | null> {
  const reponse = await requete(`https://data.geopf.fr/geocodage/reverse?lon=${arrondi(lon)}&lat=${arrondi(lat)}&limit=1`, { signal })
  if (!reponse.ok) return null
  const corps = (await reponse.json()) as { features?: { properties?: Proprietes }[] }
  const p = corps.features?.[0]?.properties
  if (!p) return null
  return { label: texte(p.label) ?? '', citycode: texte(p.citycode) ?? '', city: texte(p.city) ?? '', postcode: texte(p.postcode) ?? '' }
}

/** Electricity and gas distribution operators of a commune (Agence ORE). */
export interface Distributeurs {
  commune: string
  electricite: string[]
  gaz: string[]
}

export function urlDistributeurs(codeInsee: string): string {
  const url = new URL('https://opendata.agenceore.fr/data-fair/api/v1/datasets/distributeurs-denergie-par-commune/lines')
  url.searchParams.set('qs', `code_insee_commune:"${codeInsee}"`)
  url.searchParams.set('size', '5')
  return url.toString()
}

/** The field holds one operator; a slash or semicolon, if ever used, separates several.
 * Commas and "et" are not separators: "Energie et Services de Seyssel" is one name. */
export function separerGestionnaires(v: unknown): string[] {
  const s = texte(v)
  if (!s) return []
  return s
    .split(/\s*[/;|]\s*/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(aucun|néant|neant|sans objet|-)$/i.test(x))
}

export function lireDistributeurs(reponse: { results?: Proprietes[] }): Distributeurs | null {
  const ligne = reponse.results?.[0]
  if (!ligne) return null
  return {
    commune: texte(ligne.commune) ?? '',
    electricite: separerGestionnaires(ligne.grd_elec),
    gaz: separerGestionnaires(ligne.grd_gaz),
  }
}

export async function chargerDistributeurs(codeInsee: string, signal?: AbortSignal): Promise<Distributeurs | null> {
  const reponse = await requete(urlDistributeurs(codeInsee), { signal })
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
  return lireDistributeurs(await reponse.json())
}

/** Nearest heating network (France Chaleur Urbaine). */
export interface ReseauChaleurProche {
  nom: string
  gestionnaire?: string
  distanceM: number
  identifiant?: string
  /** The network is "classé": connection is compulsory for new buildings in its priority development zone. */
  classe: boolean
  /** The point lies in that priority development zone. */
  dansPdp: boolean
}

export function urlChaleur(lat: number, lon: number): string {
  return `https://france-chaleur-urbaine.beta.gouv.fr/api/v1/eligibility?lat=${arrondi(lat)}&lon=${arrondi(lon)}`
}

export function lireChaleur(r: Proprietes): ReseauChaleurProche | null {
  const distance = Number(r.distance)
  const nom = texte(r.name)
  if (!nom || !Number.isFinite(distance)) return null
  return { nom, gestionnaire: texte(r.gestionnaire), distanceM: distance, identifiant: texte(r.id), classe: r.isClasse === true, dansPdp: r.inPDP === true }
}

export async function chargerChaleur(lat: number, lon: number, signal?: AbortSignal): Promise<ReseauChaleurProche | null> {
  const reponse = await requete(urlChaleur(lat, lon), { signal })
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
  return lireChaleur(await reponse.json())
}

/**
 * Fibre network of a commune: indicator "France Très Haut Débit" (ANCT),
 * read through the data.gouv.fr tabular API. It names the project owner,
 * the operator running the FttH network and the zoning (AMII, AMEL, RIP),
 * plus the schedule of the copper network's closure by Orange.
 */
export const RESSOURCE_FIBRE = '35dc0362-960f-4353-8a9b-0cdcf5a1a270'
export const FICHE_FIBRE = 'https://www.data.gouv.fr/datasets/indicateur-france-tres-haut-debit-etat-des-deploiements-de-la-fibre-optique-et-decommissionnement-du-cuivre'

export interface FibreCommune {
  commune: string
  zonage?: string
  categorie?: string
  porteur?: string
  exploitant?: string
  operateurInfrastructure?: string
  locaux?: number
  locauxFtth?: number
  /** First year with copper lines closed, or undefined if no closure is scheduled up to 2030. */
  fermetureCuivre?: number
  trimestre?: string
}

export function urlFibre(codeInsee: string): string {
  return `https://tabular-api.data.gouv.fr/api/resources/${RESSOURCE_FIBRE}/data/?insee_com__exact=${encodeURIComponent(codeInsee)}&page_size=5`
}

export function lireFibre(reponse: { data?: Proprietes[] }): FibreCommune | null {
  const l = reponse.data?.[0]
  if (!l) return null
  const nombre = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  let fermeture: number | undefined
  for (let annee = 2025; annee <= 2030; annee++) {
    const n = nombre(l[`ferm_cu${annee - 2000}`])
    if (n && n > 0) {
      fermeture = annee
      break
    }
  }
  return {
    commune: texte(l.com_lib) ?? '',
    zonage: texte(l.zonage_fthd),
    categorie: texte(l.categorie_fthd),
    porteur: texte(l.porteur_projet),
    exploitant: texte(l.exploitant),
    operateurInfrastructure: texte(l.oi_exploitant),
    locaux: nombre(l.locaux_arcep),
    locauxFtth: nombre(l.locaux_ftth),
    fermetureCuivre: fermeture,
    trimestre: texte(l.trimestre),
  }
}

export async function chargerFibre(codeInsee: string, signal?: AbortSignal): Promise<FibreCommune | null> {
  const reponse = await requete(urlFibre(codeInsee), { signal })
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
  return lireFibre(await reponse.json())
}
