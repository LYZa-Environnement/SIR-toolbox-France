/**
 * Coordinate systems met in site investigation files, brought to Lambert 93
 * (EPSG:2154), the system the model, the IGN relief and the maps work in:
 * - Lambert 93 itself;
 * - the nine conic conformal zones CC42 to CC50 (EPSG:3942 to 3950), still
 *   common on surveyor plans;
 * - GPS longitude / latitude (WGS84, taken as RGF93: they differ by less
 *   than a metre in France).
 *
 * All are Lambert conformal conic projections of RGF93 (GRS80 ellipsoid),
 * so the conversion goes through latitude / longitude with no datum shift.
 * Formulas: IGN, « Projection cartographique conique conforme de Lambert »,
 * notes techniques NT/G 71 (ALG0001 to ALG0004), two standard parallels.
 */

const A = 6378137
const E = 0.0818191910428158 // GRS80 first eccentricity
const RAD = Math.PI / 180

export type Systeme = 'l93' | 'cc42' | 'cc43' | 'cc44' | 'cc45' | 'cc46' | 'cc47' | 'cc48' | 'cc49' | 'cc50' | 'wgs84' | 'local'

export const LIBELLES_SYSTEME: Record<Systeme, string> = {
  l93: 'Lambert 93',
  cc42: 'Lambert CC42',
  cc43: 'Lambert CC43',
  cc44: 'Lambert CC44',
  cc45: 'Lambert CC45',
  cc46: 'Lambert CC46',
  cc47: 'Lambert CC47',
  cc48: 'Lambert CC48',
  cc49: 'Lambert CC49',
  cc50: 'Lambert CC50',
  wgs84: 'GPS (longitude, latitude)',
  local: 'Coordonnées locales (non géoréférencées)',
}

interface Conique {
  n: number
  F: number
  r0: number
  lon0: number
  x0: number
  y0: number
}

const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - E * E * Math.sin(phi) ** 2)
const t = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi))) ** (E / 2)

function conique(lat0: number, lat1: number, lat2: number, lon0: number, x0: number, y0: number): Conique {
  const [p0, p1, p2] = [lat0 * RAD, lat1 * RAD, lat2 * RAD]
  const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2)))
  const F = m(p1) / (n * t(p1) ** n)
  return { n, F, r0: A * F * t(p0) ** n, lon0: lon0 * RAD, x0, y0 }
}

const PROJECTIONS: Partial<Record<Systeme, Conique>> = { l93: conique(46.5, 44, 49, 3, 700000, 6600000) }
for (let z = 42; z <= 50; z++) PROJECTIONS[`cc${z}` as Systeme] = conique(z, z - 0.75, z + 0.75, 3, 1700000, (z - 41) * 1000000 + 200000)

/** Longitude, latitude (degrees) → projected x, y. */
export function projeter(sys: Systeme, lon: number, lat: number): [number, number] {
  const c = PROJECTIONS[sys]
  if (!c) throw new Error(`Système non projeté : ${sys}`)
  const r = A * c.F * t(lat * RAD) ** c.n
  const g = c.n * (lon * RAD - c.lon0)
  return [c.x0 + r * Math.sin(g), c.y0 + c.r0 - r * Math.cos(g)]
}

/** Projected x, y → longitude, latitude (degrees). */
export function deprojeter(sys: Systeme, x: number, y: number): [number, number] {
  const c = PROJECTIONS[sys]
  if (!c) throw new Error(`Système non projeté : ${sys}`)
  const dx = x - c.x0
  const dy = c.r0 - (y - c.y0)
  const r = Math.sign(c.n) * Math.hypot(dx, dy)
  const tt = (r / (A * c.F)) ** (1 / c.n)
  const g = Math.atan2(dx, dy)
  let phi = Math.PI / 2 - 2 * Math.atan(tt)
  for (let i = 0; i < 10; i++) phi = Math.PI / 2 - 2 * Math.atan(tt * ((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi))) ** (E / 2))
  return [(g / c.n + c.lon0) / RAD, phi / RAD]
}

/** A point in a system → Lambert 93; null for local coordinates. */
export function versLambert93(sys: Systeme, x: number, y: number): [number, number] | null {
  if (sys === 'l93') return [x, y]
  if (sys === 'local') return null
  if (sys === 'wgs84') return projeter('l93', x, y)
  const [lon, lat] = deprojeter(sys, x, y)
  return projeter('l93', lon, lat)
}

const enFranceLonLat = (lon: number, lat: number) => lon > -6 && lon < 10 && lat > 41 && lat < 52

/** System of one coordinate pair, from its magnitudes; null when it fits none. */
export function systemeDe(x: number, y: number): Systeme | null {
  if (enFranceLonLat(x, y)) return 'wgs84'
  if (x > 50_000 && x < 1_300_000 && y > 6_000_000 && y < 7_200_000) return 'l93'
  if (x > 1_300_000 && x < 2_200_000 && y > 1_000_000 && y < 9_400_000) {
    const z = Math.round((y - 200_000) / 1_000_000) + 41
    if (z >= 42 && z <= 50) return `cc${z}` as Systeme
  }
  return null
}

/**
 * The system of a set of points: the one most of them fit. Latitude and
 * longitude written the wrong way round (latitude first) are recognised and
 * reported as swapped. Points that fit no system make it local.
 */
export function detecterSysteme(points: { x: number; y: number }[]): { systeme: Systeme; inverse: boolean } {
  if (!points.length) return { systeme: 'local', inverse: false }
  const compte = new Map<Systeme, number>()
  let inverses = 0
  for (const p of points) {
    const s = systemeDe(p.x, p.y)
    if (s) compte.set(s, (compte.get(s) ?? 0) + 1)
    else if (enFranceLonLat(p.y, p.x)) inverses++
  }
  const [meilleur, n] = [...compte].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  if (inverses > n) return { systeme: 'wgs84', inverse: true }
  // Most points must agree: a handful of plausible numbers in a local grid is a coincidence.
  if (meilleur && n >= points.length / 2) return { systeme: meilleur, inverse: false }
  return { systeme: 'local', inverse: false }
}
