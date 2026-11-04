/**
 * Environmental context of a site for the incidence study, read live from
 * public services: water planning zonings (Sandre WFS: bassin DCE, SAGE, zone
 * de répartition des eaux, zones sensibles et vulnérables, masses d'eau
 * souterraines), the watercourse network (IGN BD TOPO), groundwater records
 * (Hub'Eau ADES, BNPE), protected areas (IGN API Carto, INPN layers), relief
 * (IGN altimetry), flood zones (Géorisques AZI) and the 1/50 000 geological
 * sheet (BRGM).
 *
 * Every source is optional: a service that does not answer leaves its field
 * empty and adds a line to `lacunes`, so the text proposals say "à compléter"
 * rather than inventing a reading.
 *
 * Sandre layers were checked live at Issoudun (36): bassin G (Loire-Bretagne),
 * SAGE Cher amont, ZRE « Bassin hydrographique du Cher », zone sensible « Le
 * Cher », zone vulnérable, three captive groundwater bodies.
 */

import { findNearestAdesPoint, fetchPrelevements, type AdesReferencePoint, type OuvragePrelevement } from '../hubeau'
import { fetchZonagesNaturels, type ZonageNaturel } from '../nature'
import { findReseauHydro, type ReseauHydro } from '../reseauHydro'
import { fetchTopographie, type Topographie } from '../topographie'
import { bearingDegrees, cardinalDirection, nearestPointOnSegment, ringsOfGeometry, type PolygonGeometry } from '../geo'

const SANDRE_WFS = 'https://services.sandre.eaufrance.fr/geo/sandre'
const GEORISQUES_AZI = 'https://georisques.gouv.fr/api/v1/gaspar/azi'
const BRGM_GEOL = 'https://geoservices.brgm.fr/geologie'
const DELAI_MS = 25000

export interface SageZone {
  code: string
  nom: string
  /** Reading of the Sandre progress code. */
  etat: string
}

export interface MasseEauSouterraine {
  code: string
  nom: string
  captive: boolean
}

export type Zonage = Omit<ZonageNaturel, 'geometrie'>

export interface Contexte {
  /** ISO date the reading was made. */
  date: string
  lat: number
  lon: number
  topographie: Topographie | null
  feuilleGeologique: { numero: string; nom: string | null } | null
  reseau: ReseauHydro | null
  ades: AdesReferencePoint | null
  prelevements: OuvragePrelevement[]
  /** Without their outlines: only names, distances and directions are kept,
   * so the reading can be saved with the dossier. */
  zonages: Zonage[]
  bassin: { code: string; nom: string; sdage: string } | null
  sages: SageZone[]
  zre: string[]
  zonesSensibles: string[]
  zoneVulnerable: boolean | null
  massesEau: MasseEauSouterraine[]
  /** Flood-zone atlases (AZI) covering the commune — GASPAR answers at the
   * commune level, so this says nothing yet about the plot itself. */
  atlasInondation: string[] | null
  /** Sources actually used, for the report's references. */
  sources: string[]
  /** Sources that did not answer. */
  lacunes: string[]
}

async function avecDelai<T>(p: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), DELAI_MS)
  try {
    return await p(c.signal)
  } finally {
    clearTimeout(t)
  }
}

/** Features of a Sandre layer at a point (a ~50 m box around it). */
async function sandre(couche: string, lat: number, lon: number, nombre = 10): Promise<Record<string, unknown>[] | null> {
  const d = 0.0003
  const url = new URL(SANDRE_WFS)
  url.search = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: `sa:${couche}`,
    COUNT: String(nombre),
    OUTPUTFORMAT: 'geojson',
    SRSNAME: 'EPSG:4326',
    BBOX: `${lat - d},${lon - d},${lat + d},${lon + d},urn:ogc:def:crs:EPSG::4326`,
  }).toString()
  try {
    return await avecDelai(async (signal) => {
      const r = await fetch(url.toString(), { signal })
      if (!r.ok) return null
      const j = (await r.json()) as { features?: { properties?: Record<string, unknown> }[] }
      return (j.features ?? []).map((f) => f.properties ?? {})
    })
  } catch {
    return null
  }
}

type Position = [number, number]

function anneauContient(lat: number, lon: number, ring: Position[]): boolean {
  let dedans = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans
  }
  return dedans
}

/** Inside any part of a (multi)polygon — a Natura 2000 site is often a
 * scatter of islets, and only testing the first one misses the others. */
function contient(lat: number, lon: number, g: PolygonGeometry): boolean {
  const parties = g.type === 'Polygon' ? [g.coordinates as Position[][]] : (g.coordinates as Position[][][])
  return parties.some((p) => p[0] && anneauContient(lat, lon, p[0]))
}

/** Distance and direction to the nearest point of the outline. The direction
 * of the centroid says little for a site made of islets spread over several
 * kilometres: the nearest islet is what the report must name. */
export function auPlusProche(lat: number, lon: number, g: PolygonGeometry): { inclus: boolean; distanceM: number; direction: string | null } {
  if (contient(lat, lon, g)) return { inclus: true, distanceM: 0, direction: null }
  let best = { lat, lon, distanceM: Infinity }
  for (const ring of ringsOfGeometry(g))
    for (let i = 0; i < ring.length - 1; i++) {
      const q = nearestPointOnSegment(lat, lon, ring[i][1], ring[i][0], ring[i + 1][1], ring[i + 1][0])
      if (q.distanceM < best.distanceM) best = q
    }
  return { inclus: false, distanceM: best.distanceM, direction: Number.isFinite(best.distanceM) ? cardinalDirection(bearingDegrees(lat, lon, best.lat, best.lon)) : null }
}

const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** SDAGE of each DCE basin, by the first letter of its Sandre code. */
const SDAGE: Record<string, string> = {
  A: 'SDAGE Artois-Picardie',
  B: 'SDAGE Rhin-Meuse (district Meuse)',
  C: 'SDAGE Rhin-Meuse (district Rhin)',
  D: 'SDAGE Rhône-Méditerranée',
  E: 'SDAGE de Corse',
  F: 'SDAGE Adour-Garonne',
  G: 'SDAGE Loire-Bretagne',
  H: 'SDAGE Seine-Normandie',
  I: 'SDAGE de la Guadeloupe',
  J: 'SDAGE de la Martinique',
  K: 'SDAGE de la Guyane',
  L: 'SDAGE de La Réunion',
  M: 'SDAGE de Mayotte',
}

function etatSage(code: unknown): string {
  const n = typeof code === 'number' ? code : Number(code)
  if (!Number.isFinite(n)) return 'état non renseigné'
  if (n >= 5) return 'en révision'
  if (n >= 4) return 'approuvé, en mise en œuvre'
  if (n >= 3) return 'en élaboration'
  if (n >= 2) return 'en instruction'
  return 'en émergence'
}

async function atlasInondation(lat: number, lon: number): Promise<string[] | null> {
  try {
    return await avecDelai(async (signal) => {
      const r = await fetch(`${GEORISQUES_AZI}?latlon=${lon},${lat}&rayon=100`, { signal })
      if (!r.ok) return null
      const j = (await r.json()) as { data?: { libelle_azi?: string }[] }
      if (!Array.isArray(j.data)) return null
      return [...new Set(j.data.map((x) => s(x.libelle_azi)).filter((x): x is string => !!x))]
    })
  } catch {
    return null
  }
}

async function feuilleGeologique(lat: number, lon: number): Promise<{ numero: string; nom: string | null } | null> {
  const d = 0.01
  const url = `${BRGM_GEOL}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=ms:SCAN_F_GEOL50_CATALOG&BBOX=${lon - d},${lat - d},${lon + d},${lat + d}`
  try {
    return await avecDelai(async (signal) => {
      const r = await fetch(url, { signal })
      if (!r.ok) return null
      const t = await r.text()
      const numero = t.match(/<ms:numero>([^<]*)<\/ms:numero>/)?.[1]
      const nom = t.match(/<ms:nom>([^<]*)<\/ms:nom>/)?.[1] ?? null
      return numero ? { numero, nom } : null
    })
  } catch {
    return null
  }
}

/** Read the whole context. `rayonNature` bounds the protected-area search. */
export async function lireContexte(lat: number, lon: number, emprise?: PolygonGeometry, rayonNature = 10000): Promise<Contexte> {
  const lacunes: string[] = []
  const sources: string[] = []
  const ou = <T>(p: Promise<T | null>, nom: string, source: string): Promise<T | null> =>
    p
      .catch(() => null)
      .then((v) => {
        if (v === null) lacunes.push(nom)
        else sources.push(source)
        return v
      })

  const [topographie, feuille, reseau, ades, prelevements, zonages, bassin, sages, zre, sensibles, vuln, masses, azi] = await Promise.all([
    ou(fetchTopographie(lat, lon, emprise), 'Altimétrie (IGN)', 'IGN, service d’altimétrie de la Géoplateforme (RGE ALTI®)'),
    ou(feuilleGeologique(lat, lon), 'Carte géologique 1/50 000 (BRGM)', 'BRGM, carte géologique de la France au 1/50 000 (InfoTerre)'),
    ou(findReseauHydro(lat, lon), 'Réseau hydrographique (IGN BD TOPO)', 'IGN, BD TOPO® — réseau hydrographique'),
    ou(findNearestAdesPoint(lat, lon), 'Points d’eau ADES (Hub’Eau)', 'Hub’Eau, ADES — qualité et niveaux des nappes'),
    ou(fetchPrelevements(lat, lon, 3000), 'Ouvrages de prélèvement (BNPE)', 'Hub’Eau, BNPE — ouvrages de prélèvement'),
    ou(fetchZonagesNaturels(lat, lon, rayonNature), 'Zonages naturels (INPN)', 'IGN API Carto — couches MNHN/INPN (Natura 2000, ZNIEFF, parcs, réserves)'),
    ou(sandre('BassinDCE', lat, lon, 1), 'Bassin DCE (Sandre)', 'Sandre — bassins DCE'),
    ou(sandre('Sage', lat, lon), 'SAGE (Sandre)', 'Sandre / Gest’eau — périmètres des SAGE'),
    ou(sandre('ZRE', lat, lon), 'Zones de répartition des eaux (Sandre)', 'Sandre — zones de répartition des eaux'),
    ou(sandre('ZoneSensible_Eutrophe_FXX', lat, lon), 'Zones sensibles (Sandre)', 'Sandre — zones sensibles à l’eutrophisation'),
    ou(sandre('ZoneVuln', lat, lon, 2), 'Zones vulnérables (Sandre)', 'Sandre — zones vulnérables aux nitrates'),
    ou(sandre('MasseDEauSouterraine_VEDL2013_FXX', lat, lon, 20), 'Masses d’eau souterraines (Sandre)', 'Sandre — masses d’eau souterraines (référentiel 2013)'),
    ou(atlasInondation(lat, lon), 'Atlas des zones inondables (Géorisques)', 'Géorisques — GASPAR, atlas des zones inondables'),
  ])

  const b = bassin?.[0]
  const code = s(b?.CdBassinDCE)
  return {
    date: new Date().toISOString().slice(0, 10),
    lat,
    lon,
    topographie,
    feuilleGeologique: feuille,
    reseau,
    ades,
    prelevements: prelevements ?? [],
    zonages: (zonages ?? [])
      .map(({ geometrie, ...z }) => ({ ...z, ...auPlusProche(lat, lon, geometrie) }))
      .sort((a, b) => a.distanceM - b.distanceM),
    bassin: code
      ? { code, nom: s(b?.NomBassinDCE) ?? code, sdage: SDAGE[code[0]] ?? `SDAGE du bassin ${s(b?.NomBassinDCE) ?? code}` }
      : null,
    sages: (sages ?? []).map((p) => ({ code: s(p.CodeNatZone) ?? '', nom: s(p.NomZone) ?? 'SAGE', etat: etatSage(p.EtatAvancementSage) })),
    zre: (zre ?? []).map((p) => s(p.NomZone)).filter((x): x is string => !!x),
    zonesSensibles: (sensibles ?? []).map((p) => s(p.NomZone)).filter((x): x is string => !!x),
    zoneVulnerable: vuln === null ? null : vuln.length > 0,
    massesEau: (masses ?? [])
      .map((p) => ({ code: s(p.CdEuMasseDEau) ?? s(p.CdMasseDEau) ?? '', nom: s(p.NomMasseDEau) ?? '', captive: /captif/i.test(s(p.NomMasseDEau) ?? '') }))
      .filter((m) => m.nom),
    atlasInondation: azi,
    sources,
    lacunes,
  }
}

export const estNatura = (z: Zonage) => z.categorie.startsWith('Natura 2000')
