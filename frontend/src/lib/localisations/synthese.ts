/**
 * The points of a study once every layer is read: converted to longitude /
 * latitude and Lambert 93, the same point found in several files merged
 * (an EDD made from a Field Maps export lists the same pins twice), and the
 * points whose positions disagree between files set apart for the reader.
 */

import type { PointDossier } from '../dossier/points'
import { depuisWgs84, enFrance, LAMBERT93, versWgs84, WGS84 } from './systemes'
import type { Couche, Famille, FormeLue, PointLu } from './types'

/** Below this distance two positions of one point are the same position. */
export const TOLERANCE_M = 0.1

export interface PointSitue extends PointLu {
  /** Layer id and row: stable while the layer is kept. */
  id: string
  coucheId: string
  source: string
  /** System the coordinates were converted from. */
  systemeUtilise: string | null
  lon: number | null
  lat: number | null
  x93: number | null
  y93: number | null
  horsFrance: boolean
  /** Other files giving this point at the same place. */
  autresSources: string[]
  /** loc_type of an EQuIS file giving this point, written back in an EDD. */
  typeEquis?: string
}

export interface FormeSituee extends FormeLue {
  id: string
  source: string
  /** Geometry in longitude/latitude. */
  wgs: GeoJSON.Geometry
}

export interface Conflit {
  nom: string
  /** The versions, each from its file, all with coordinates. */
  versions: PointSitue[]
  /** Largest distance between two versions, m. */
  ecartM: number
  /** Id of the version kept. */
  retenu: string
}

export interface Synthese {
  /** One per point name, with coordinates. */
  points: PointSitue[]
  sansCoordonnees: PointSitue[]
  horsFrance: PointSitue[]
  formes: FormeSituee[]
  conflits: Conflit[]
  /** Points found identical in several files, merged. */
  fusionnes: number
  /** [[south, west], [north, east]] of what is drawn. */
  emprise: [[number, number], [number, number]] | null
  parFamille: Map<Famille, number>
}

export const systemeDe = (c: Couche, p?: PointLu) => c.systemeForce ?? p?.systeme ?? c.systeme

export const cleNom = (nom: string) => nom.trim().replace(/\s+/g, ' ').toUpperCase()

/** A point of a layer, placed: longitude/latitude and Lambert 93. */
export function situer(c: Couche, p: PointLu, i: number): PointSitue {
  const systeme = systemeDe(c, p)
  let lon: number | null = null
  let lat: number | null = null
  let x93: number | null = null
  let y93: number | null = null
  if (p.x !== null && p.y !== null && systeme) {
    const [x, y] = c.inverse && systeme === WGS84 && !c.systemeForce ? [p.y, p.x] : [p.x, p.y]
    try {
      ;[lon, lat] = versWgs84(x, y, systeme, c.prj)
      if (systeme === LAMBERT93) [x93, y93] = [x, y]
      else [x93, y93] = depuisWgs84(lon, lat, LAMBERT93)
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) lon = lat = x93 = y93 = null
    } catch {
      lon = lat = x93 = y93 = null
    }
  }
  return {
    ...p,
    id: `${c.id}:${i}`,
    coucheId: c.id,
    source: c.nom,
    systemeUtilise: systeme,
    lon,
    lat,
    x93,
    y93,
    horsFrance: lon !== null && lat !== null && !enFrance(lon, lat),
    autresSources: [],
    ...(c.format === 'equis' && p.typeOrigine ? { typeEquis: p.typeOrigine } : {}),
  }
}

function reprojeter(g: GeoJSON.Geometry, f: (x: number, y: number) => [number, number]): GeoJSON.Geometry {
  const pos = (c: GeoJSON.Position): GeoJSON.Position => [...f(c[0], c[1]), ...c.slice(2)]
  switch (g.type) {
    case 'Point':
      return { type: 'Point', coordinates: pos(g.coordinates) }
    case 'MultiPoint':
    case 'LineString':
      return { type: g.type, coordinates: g.coordinates.map(pos) } as GeoJSON.Geometry
    case 'MultiLineString':
    case 'Polygon':
      return { type: g.type, coordinates: g.coordinates.map((l) => l.map(pos)) } as GeoJSON.Geometry
    case 'MultiPolygon':
      return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map((l) => l.map(pos))) }
    case 'GeometryCollection':
      return { type: 'GeometryCollection', geometries: g.geometries.map((s) => reprojeter(s, f)) }
  }
}

const distance93 = (a: PointSitue, b: PointSitue) => (a.x93 === null || b.x93 === null ? Infinity : Math.hypot(a.x93 - b.x93!, a.y93! - b.y93!))

/** Fields a merged point takes from its other versions when it lacks them. */
function completer(p: PointSitue, autres: PointSitue[]): PointSitue {
  const q = { ...p, attributs: { ...p.attributs } }
  for (const a of autres) {
    if (q.altitude === undefined && a.altitude !== undefined) q.altitude = a.altitude
    if (q.repere === undefined && a.repere !== undefined) q.repere = a.repere
    if (q.profondeur === undefined && a.profondeur !== undefined) q.profondeur = a.profondeur
    if (q.date === undefined && a.date !== undefined) q.date = a.date
    if (!q.description && a.description) q.description = a.description
    if (!q.typeEquis && a.typeEquis) q.typeEquis = a.typeEquis
    if (!q.typeOrigine && a.typeOrigine) {
      q.typeOrigine = a.typeOrigine
      q.famille = a.famille
    }
    for (const [k, v] of Object.entries(a.attributs)) if (!(k in q.attributs)) q.attributs[k] = v
  }
  return q
}

/**
 * Every visible layer, merged. When a point is in several files, the one of
 * the file loaded last is kept, unless `choix` names another version (by id);
 * the others complete what it lacks.
 */
export function synthese(couches: Couche[], choix: Record<string, string> = {}): Synthese {
  const visibles = couches.filter((c) => !c.masquee)
  const parNom = new Map<string, PointSitue[]>()
  for (const c of visibles) {
    c.points.forEach((p, i) => {
      const s = situer(c, p, i)
      const k = cleNom(p.nom)
      parNom.set(k, [...(parNom.get(k) ?? []), s])
    })
  }
  const points: PointSitue[] = []
  const sansCoordonnees: PointSitue[] = []
  const conflits: Conflit[] = []
  let fusionnes = 0
  for (const [k, versions] of parNom) {
    const placees = versions.filter((v) => v.lon !== null)
    if (!placees.length) {
      sansCoordonnees.push(completer(versions[versions.length - 1], versions.slice(0, -1).reverse()))
      continue
    }
    let ecartM = 0
    for (let i = 0; i < placees.length; i++) for (let j = i + 1; j < placees.length; j++) ecartM = Math.max(ecartM, distance93(placees[i], placees[j]))
    const choisi = placees.find((v) => v.id === choix[k]) ?? placees[placees.length - 1]
    const autres = versions.filter((v) => v !== choisi).reverse()
    const p = completer(choisi, autres)
    p.autresSources = [...new Set(autres.filter((a) => a.lon !== null && distance93(a, choisi) <= TOLERANCE_M && a.source !== choisi.source).map((a) => a.source))]
    if (placees.length > 1 && ecartM > TOLERANCE_M) conflits.push({ nom: choisi.nom, versions: placees, ecartM, retenu: choisi.id })
    else if (placees.length > 1) fusionnes += placees.length - 1
    points.push(p)
  }
  const formes: FormeSituee[] = []
  for (const c of visibles) {
    const systeme = systemeDe(c)
    if (!systeme) continue
    c.formes.forEach((f, i) => {
      try {
        formes.push({ ...f, id: `${c.id}:f${i}`, source: c.nom, wgs: reprojeter(f.geometrie, (x, y) => versWgs84(x, y, systeme, c.prj)) })
      } catch {
        /* a shape that cannot be converted is left out of the map */
      }
    })
  }
  const dansFrance = points.filter((p) => !p.horsFrance)
  const lats = dansFrance.map((p) => p.lat!)
  const lons = dansFrance.map((p) => p.lon!)
  for (const f of formes) {
    const c = coordonnees(f.wgs)
    for (const [lo, la] of c) {
      if (!enFrance(lo, la)) continue
      lons.push(lo)
      lats.push(la)
    }
  }
  const parFamille = new Map<Famille, number>()
  for (const p of points) parFamille.set(p.famille, (parFamille.get(p.famille) ?? 0) + 1)
  return {
    points,
    sansCoordonnees,
    horsFrance: points.filter((p) => p.horsFrance),
    formes,
    conflits: conflits.sort((a, b) => b.ecartM - a.ecartM),
    fusionnes,
    emprise: lats.length
      ? [
          [Math.min(...lats), Math.min(...lons)],
          [Math.max(...lats), Math.max(...lons)],
        ]
      : null,
    parFamille,
  }
}

function coordonnees(g: GeoJSON.Geometry): [number, number][] {
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(coordonnees)
  const out: [number, number][] = []
  const parcourir = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number') out.push([c[0], c[1] as number])
    else if (Array.isArray(c)) c.forEach(parcourir)
  }
  parcourir(g.coordinates)
  return out
}

/** Centre of the points, as a reference for guessing the system of the next file. */
export function centre(s: Synthese): [number, number] | null {
  if (!s.emprise) return null
  const [[sud, ouest], [nord, est]] = s.emprise
  return [(ouest + est) / 2, (sud + nord) / 2]
}

/**
 * The points shared with the other tools of the dossier: one per name,
 * placed in France, with what they need to match and place them.
 */
export function pointsPourDossier(s: Synthese): PointDossier[] {
  return s.points
    .filter((p) => !p.horsFrance && p.lon !== null && p.x93 !== null)
    .map((p) => {
      const q: PointDossier = {
        nom: p.nom,
        famille: p.famille,
        type: p.typeOrigine,
        description: p.description,
        lon: Math.round(p.lon! * 1e8) / 1e8,
        lat: Math.round(p.lat! * 1e8) / 1e8,
        x93: Math.round(p.x93! * 1000) / 1000,
        y93: Math.round(p.y93! * 1000) / 1000,
        source: [p.source, ...p.autresSources].join(' ; '),
      }
      if (p.altitude !== undefined) q.altitude = p.altitude
      if (p.repere !== undefined) q.repere = p.repere
      if (p.profondeur !== undefined) q.profondeur = p.profondeur
      return q
    })
}
