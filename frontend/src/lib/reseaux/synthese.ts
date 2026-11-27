/**
 * What the networks around a site add up to: distance of each object to the
 * site, length of line within the search radius, and a summary per network
 * family and per operator. Pure functions, no React.
 */

import { CATEGORIES, CATEGORIE, type Geometrie, type ObjetReseau, type Reseau } from './types'

/** Metres per degree of latitude (mean Earth radius 6 371 km). */
const M_PAR_DEGRE = 111320

/** Local plane around the site, in metres: equirectangular, accurate to well under 1 % over a few kilometres. */
export function projecteur(lat0: number, lon0: number) {
  const kx = M_PAR_DEGRE * Math.cos((lat0 * Math.PI) / 180)
  return (c: number[]): [number, number] => [(c[0] - lon0) * kx, (c[1] - lat0) * M_PAR_DEGRE]
}

type Point = [number, number]
type Projection = (c: number[]) => Point

/** Distance from the origin to segment AB. */
function distanceSegment(a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / l2))
  return Math.hypot(a[0] + t * dx, a[1] + t * dy)
}

/** Length of segment AB lying within the circle of radius r centred on the origin. */
export function longueurDansCercle(a: Point, b: Point, r: number): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return 0
  // |A + t·D|² = r²  →  l2·t² + 2(A·D)·t + |A|² − r² = 0
  const bq = a[0] * dx + a[1] * dy
  const c = a[0] * a[0] + a[1] * a[1] - r * r
  const disc = bq * bq - l2 * c
  if (disc <= 0) return 0
  const racine = Math.sqrt(disc)
  const t1 = Math.max(0, (-bq - racine) / l2)
  const t2 = Math.min(1, (-bq + racine) / l2)
  return t2 > t1 ? (t2 - t1) * Math.sqrt(l2) : 0
}

/** Ray casting on a projected ring: is the origin inside? */
function origineDansAnneau(anneau: Point[]): boolean {
  let dedans = false
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i]
    const [xj, yj] = anneau[j]
    if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) dedans = !dedans
  }
  return dedans
}

function lignes(g: Geometrie): number[][][] {
  switch (g.type) {
    case 'LineString':
      return [g.coordinates]
    case 'MultiLineString':
      return g.coordinates
    case 'Polygon':
      return g.coordinates
    case 'MultiPolygon':
      return g.coordinates.flat()
    default:
      return []
  }
}

function points(g: Geometrie): number[][] {
  if (g.type === 'Point') return [g.coordinates]
  if (g.type === 'MultiPoint') return g.coordinates
  return []
}

/** Shortest distance from the site to the object, in metres (0 when a surface contains the site). */
export function distanceAuSite(g: Geometrie, proj: Projection): number {
  let min = Infinity
  for (const c of points(g)) min = Math.min(min, Math.hypot(...proj(c)))
  for (const ligne of lignes(g)) {
    const pts = ligne.map(proj)
    if (pts.length === 1) min = Math.min(min, Math.hypot(...pts[0]))
    for (let i = 1; i < pts.length; i++) min = Math.min(min, distanceSegment(pts[i - 1], pts[i]))
  }
  if (g.type === 'Polygon' && origineDansAnneau(g.coordinates[0].map(proj))) return 0
  if (g.type === 'MultiPolygon' && g.coordinates.some((poly) => origineDansAnneau(poly[0].map(proj)))) return 0
  return min
}

/** Length of a line object within the radius, in metres; 0 for points and surfaces. */
export function longueurDansRayon(g: Geometrie, proj: Projection, rayonM: number): number {
  if (g.type !== 'LineString' && g.type !== 'MultiLineString') return 0
  let total = 0
  for (const ligne of lignes(g)) {
    const pts = ligne.map(proj)
    for (let i = 1; i < pts.length; i++) total += longueurDansCercle(pts[i - 1], pts[i], rayonM)
  }
  return total
}

/** An object placed with respect to the site. */
export interface ObjetSitue extends ObjetReseau {
  distanceM: number
  longueurM: number
  lineaire: boolean
}

/** Places the objects with respect to the site and keeps those within the radius, nearest first. */
export function situer(objets: ObjetReseau[], lat: number, lon: number, rayonM: number): ObjetSitue[] {
  const proj = projecteur(lat, lon)
  const vus = new Set<string>()
  const situes: ObjetSitue[] = []
  for (const o of objets) {
    if (vus.has(o.id)) continue
    vus.add(o.id)
    const distanceM = distanceAuSite(o.geometrie, proj)
    if (!(distanceM <= rayonM)) continue
    const lineaire = o.geometrie.type === 'LineString' || o.geometrie.type === 'MultiLineString'
    situes.push({ ...o, distanceM, lineaire, longueurM: longueurDansRayon(o.geometrie, proj, rayonM) })
  }
  return situes.sort((a, b) => a.distanceM - b.distanceM)
}

export interface LigneSynthese {
  reseau: Reseau
  objets: number
  /** Metres of line within the radius. */
  lineaireM: number
  distanceMinM: number
  /** Operators named by the data, most frequent first. */
  gestionnaires: string[]
  /** Kinds of objects with their counts, most frequent first. */
  elements: [string, number][]
  sources: string[]
}

function parFrequence(valeurs: string[]): [string, number][] {
  const n = new Map<string, number>()
  for (const v of valeurs) n.set(v, (n.get(v) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
}

/** One line per network family present, in the order of the colour code. */
export function synthese(objets: ObjetSitue[]): LigneSynthese[] {
  return CATEGORIES.flatMap(({ id }) => {
    const du = objets.filter((o) => o.reseau === id)
    if (du.length === 0) return []
    return [
      {
        reseau: id,
        objets: du.length,
        lineaireM: du.reduce((s, o) => s + o.longueurM, 0),
        distanceMinM: Math.min(...du.map((o) => o.distanceM)),
        gestionnaires: parFrequence(du.flatMap((o) => (o.gestionnaire ? [o.gestionnaire] : []))).map(([g]) => g),
        elements: parFrequence(du.map((o) => o.element)),
        sources: [...new Set(du.map((o) => o.source))],
      },
    ]
  })
}

export interface LigneGestionnaire {
  gestionnaire: string
  reseaux: Reseau[]
  distanceMinM: number
  objets: number
}

/** Operators named by the data within the radius, nearest first: the list to check against the DT answers. */
export function gestionnaires(objets: ObjetSitue[]): LigneGestionnaire[] {
  const par = new Map<string, LigneGestionnaire>()
  for (const o of objets) {
    if (!o.gestionnaire) continue
    const l = par.get(o.gestionnaire) ?? { gestionnaire: o.gestionnaire, reseaux: [], distanceMinM: Infinity, objets: 0 }
    if (!l.reseaux.includes(o.reseau)) l.reseaux.push(o.reseau)
    l.distanceMinM = Math.min(l.distanceMinM, o.distanceM)
    l.objets++
    par.set(o.gestionnaire, l)
  }
  const ordre = CATEGORIES.map((c) => c.id)
  return [...par.values()]
    .map((l) => ({ ...l, reseaux: l.reseaux.sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b)) }))
    .sort((a, b) => a.distanceMinM - b.distanceMinM || a.gestionnaire.localeCompare(b.gestionnaire, 'fr'))
}

/** Distances shown to the metre below 100 m, to 5 m beyond: the data are not more precise than that. */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '—'
  if (m < 1) return '< 1 m'
  if (m < 100) return `${Math.round(m)} m`
  return `${Math.round(m / 5) * 5} m`
}

export function formatLongueur(m: number): string {
  if (m <= 0) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`
}

/** Objects as a GeoJSON FeatureCollection, for a GIS or a CAD import. */
export function versGeoJson(objets: ObjetSitue[], titreSource: (id: string) => string): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: objets.map((o) => ({
      type: 'Feature',
      geometry: o.geometrie,
      properties: {
        reseau: CATEGORIE[o.reseau].libelle,
        element: o.element,
        gestionnaire: o.gestionnaire ?? null,
        aerien: o.aerien,
        distance_site_m: Math.round(o.distanceM),
        longueur_dans_rayon_m: o.lineaire ? Math.round(o.longueurM) : null,
        source: titreSource(o.source),
        ...Object.fromEntries(o.details),
      },
    })),
  })
}

function cellule(v: string | number): string {
  const s = String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Summary as CSV (semicolon separator, as French spreadsheets expect). */
export function versCsv(lignes: LigneSynthese[], titreSource: (id: string) => string): string {
  const entete = ['Réseau', 'Objets', 'Linéaire dans le rayon (m)', 'Distance au site (m)', 'Gestionnaires', 'Objets par type', 'Sources']
  const corps = lignes.map((l) => [
    CATEGORIE[l.reseau].libelle,
    l.objets,
    Math.round(l.lineaireM),
    Math.round(l.distanceMinM),
    l.gestionnaires.join(', '),
    l.elements.map(([e, n]) => `${e} (${n})`).join(', '),
    l.sources.map(titreSource).join(', '),
  ])
  return [entete, ...corps].map((l) => l.map(cellule).join(';')).join('\r\n')
}

// ---- Investigation points of the dossier -------------------------------------------------------

export interface DistancesPoint {
  nom: string
  /** Metres to the nearest loaded object of each network. */
  parReseau: Partial<Record<Reseau, number>>
  plusProche: { reseau: Reseau; element: string; distanceM: number } | null
  /**
   * Networks are fetched on the square around the search point: up to this
   * distance from the investigation point everything is loaded; a network
   * further away may have a nearer object outside the square.
   */
  fiableM: number
}

/**
 * Distance from each investigation point to the networks loaded, nearest
 * first. Points outside the search square are left out (`horsZone` counts
 * them): the networks around them were not fetched.
 */
export function distancesAuxPoints(
  points: { nom: string; lat: number; lon: number }[],
  objets: ObjetReseau[],
  centre: { lat: number; lon: number },
  rayonM: number,
): { lignes: DistancesPoint[]; horsZone: number } {
  const versCentre = projecteur(centre.lat, centre.lon)
  const uniques = [...new Map(objets.map((o) => [o.id, o])).values()]
  const lignes: DistancesPoint[] = []
  let horsZone = 0
  for (const p of points) {
    const [dx, dy] = versCentre([p.lon, p.lat])
    const fiableM = rayonM - Math.max(Math.abs(dx), Math.abs(dy))
    if (fiableM <= 0) {
      horsZone++
      continue
    }
    const proj = projecteur(p.lat, p.lon)
    const parReseau: Partial<Record<Reseau, number>> = {}
    let plusProche: DistancesPoint['plusProche'] = null
    for (const o of uniques) {
      const d = distanceAuSite(o.geometrie, proj)
      if (!Number.isFinite(d)) continue
      if (parReseau[o.reseau] === undefined || d < parReseau[o.reseau]!) parReseau[o.reseau] = d
      if (!plusProche || d < plusProche.distanceM) plusProche = { reseau: o.reseau, element: o.element, distanceM: d }
    }
    lignes.push({ nom: p.nom, parReseau, plusProche, fiableM })
  }
  const cle = (l: DistancesPoint) => (l.plusProche && l.plusProche.distanceM <= l.fiableM ? l.plusProche.distanceM : Infinity)
  lignes.sort((a, b) => cle(a) - cle(b) || a.nom.localeCompare(b.nom, 'fr', { numeric: true }))
  return { lignes, horsZone }
}

/** "3 m", or "> 40 m" when a nearer object could lie outside the search square. */
export function distanceFiable(d: number | undefined, fiableM: number): string {
  if (d !== undefined && d <= fiableM) return d < 10 ? `${(Math.round(d * 10) / 10).toLocaleString('fr-FR')} m` : `${Math.round(d)} m`
  return `> ${Math.floor(fiableM)} m`
}

export function versCsvPoints(lignes: DistancesPoint[], reseaux: Reseau[]): string {
  const entete = ['Point', 'Réseau le plus proche', 'Élément', 'Distance (m)', ...reseaux.map((r) => `${CATEGORIE[r].libelle} (m)`), 'Distances sûres jusqu’à (m)']
  const m = (d: number | undefined, l: DistancesPoint) => (d !== undefined && d <= l.fiableM ? (Math.round(d * 10) / 10).toString().replace('.', ',') : `> ${Math.floor(l.fiableM)}`)
  const corps = lignes.map((l) => [
    l.nom,
    l.plusProche && l.plusProche.distanceM <= l.fiableM ? CATEGORIE[l.plusProche.reseau].libelle : '',
    l.plusProche && l.plusProche.distanceM <= l.fiableM ? l.plusProche.element : '',
    m(l.plusProche?.distanceM, l),
    ...reseaux.map((r) => m(l.parReseau[r], l)),
    Math.floor(l.fiableM),
  ])
  return [entete, ...corps].map((l) => l.map(cellule).join(';')).join('\r\n')
}
