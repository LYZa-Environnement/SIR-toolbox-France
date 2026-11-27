/**
 * Coordinate reference systems met in French site investigations, the
 * conversions between them and the guess of which one a file uses.
 *
 * Definitions are the PROJ strings of the EPSG registry (epsg.io). Old
 * French systems (NTF, Lambert II étendu) go through the 3-parameter shift
 * of the IGN (−168, −60, 320 m): about 1 to 2 m off the official grid
 * shift — enough to place a borehole on a map, not for a survey.
 */

import proj4 from 'proj4'

export interface Systeme {
  /** "EPSG:2154", or "prj" for a definition read from a shapefile. */
  code: string
  nom: string
  /** Short name for tables and buttons. */
  court: string
  def: string
  /** Longitude/latitude in degrees rather than metres. */
  geographique?: boolean
  /** Said next to the system when chosen: precision, area of use. */
  note?: string
}

const GRS80 = '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
const NTF = '+a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs'
const NOTE_NTF = 'Ancien système NTF : conversion à 1 ou 2 m près (décalage à trois paramètres de l’IGN).'

/** Lambert conic conformal 9 zones (CC42 to CC50), EPSG:3942 to 3950. */
function cc(n: number): Systeme {
  return {
    code: `EPSG:${3900 + n}`,
    nom: `RGF93 / Lambert CC${n}`,
    court: `CC${n}`,
    def: `+proj=lcc +lat_0=${n} +lon_0=3 +lat_1=${n - 0.75} +lat_2=${n + 0.75} +x_0=1700000 +y_0=${(n - 41) * 1000000 + 200000} ${GRS80}`,
    note: `Zone de latitude ${n - 0.5}° à ${n + 0.5}° N.`,
  }
}

function utm(zone: number, sud = false, nom = `WGS 84 / UTM ${zone}${sud ? 'S' : 'N'}`, code = `EPSG:${sud ? 327 : 326}${zone}`, datum = '+datum=WGS84 +units=m +no_defs'): Systeme {
  return { code, nom, court: `UTM ${zone}${sud ? 'S' : 'N'}`, def: `+proj=utm +zone=${zone}${sud ? ' +south' : ''} ${datum}` }
}

export const WGS84 = 'EPSG:4326'
export const LAMBERT93 = 'EPSG:2154'

export const SYSTEMES: Systeme[] = [
  { code: LAMBERT93, nom: 'RGF93 / Lambert 93', court: 'Lambert 93', def: `+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 ${GRS80}` },
  ...[42, 43, 44, 45, 46, 47, 48, 49, 50].map(cc),
  { code: WGS84, nom: 'WGS 84 — longitude, latitude (GPS)', court: 'WGS 84', def: '+proj=longlat +datum=WGS84 +no_defs', geographique: true },
  { code: 'EPSG:27572', nom: 'NTF (Paris) / Lambert II étendu', court: 'Lambert II ét.', def: `+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 ${NTF}`, note: NOTE_NTF },
  { code: 'EPSG:27571', nom: 'NTF (Paris) / Lambert I carto', court: 'Lambert I', def: `+proj=lcc +lat_1=49.5 +lat_0=49.5 +lon_0=0 +k_0=0.999877341 +x_0=600000 +y_0=1200000 ${NTF}`, note: NOTE_NTF },
  { code: 'EPSG:27573', nom: 'NTF (Paris) / Lambert III carto', court: 'Lambert III', def: `+proj=lcc +lat_1=44.1 +lat_0=44.1 +lon_0=0 +k_0=0.999877499 +x_0=600000 +y_0=3200000 ${NTF}`, note: NOTE_NTF },
  { code: 'EPSG:27574', nom: 'NTF (Paris) / Lambert IV carto', court: 'Lambert IV', def: `+proj=lcc +lat_1=42.165 +lat_0=42.165 +lon_0=0 +k_0=0.99994471 +x_0=234.358 +y_0=4185861.369 ${NTF}`, note: NOTE_NTF },
  utm(30),
  utm(31),
  utm(32),
  {
    code: 'EPSG:3857',
    nom: 'WGS 84 / Pseudo-Mercator (web)',
    court: 'Web Mercator',
    def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
    note: 'Système des cartes en ligne (ArcGIS Online, Google) : les distances y sont faussées, à n’utiliser que pour l’affichage.',
  },
  utm(20, false, 'RGAF09 / UTM 20N (Antilles)', 'EPSG:5490', GRS80),
  utm(22, false, 'RGFG95 / UTM 22N (Guyane)', 'EPSG:2972', '+ellps=GRS80 +towgs84=2,2,-2,0,0,0,0 +units=m +no_defs'),
  utm(40, true, 'RGR92 / UTM 40S (La Réunion)', 'EPSG:2975', GRS80),
  utm(38, true, 'RGM04 / UTM 38S (Mayotte)', 'EPSG:4471', GRS80),
]

export const PAR_CODE = new Map(SYSTEMES.map((s) => [s.code, s]))

export function nomSysteme(code: string): string {
  return PAR_CODE.get(code)?.nom ?? (code === 'prj' ? 'Système du fichier .prj' : code)
}
export function courtSysteme(code: string): string {
  return PAR_CODE.get(code)?.court ?? (code === 'prj' ? '.prj' : code)
}

// ---- Conversions ----------------------------------------------------------

type Convertisseur = (x: number, y: number) => [number, number]
const cache = new Map<string, { versWgs: Convertisseur; depuisWgs: Convertisseur }>()

function convertisseur(code: string, prj?: string) {
  const cle = code === 'prj' ? `prj:${prj ?? ''}` : code
  let c = cache.get(cle)
  if (!c) {
    const def = code === 'prj' ? prj : PAR_CODE.get(code)?.def
    if (!def) throw new Error(`Système de coordonnées inconnu : ${code}`)
    const p = proj4(def, PAR_CODE.get(WGS84)!.def)
    c = {
      versWgs: (x, y) => p.forward([x, y]) as [number, number],
      depuisWgs: (lon, lat) => p.inverse([lon, lat]) as [number, number],
    }
    cache.set(cle, c)
  }
  return c
}

/** [longitude, latitude] of a point given in `code` (or the .prj text). */
export function versWgs84(x: number, y: number, code: string, prj?: string): [number, number] {
  if (code === WGS84) return [x, y]
  return convertisseur(code, prj).versWgs(x, y)
}

/** Coordinates in `code` of a longitude/latitude. */
export function depuisWgs84(lon: number, lat: number, code: string): [number, number] {
  if (code === WGS84) return [lon, lat]
  return convertisseur(code).depuisWgs(lon, lat)
}

/** Whether a .prj (WKT) text can be used at all. */
export function prjUtilisable(prj: string): boolean {
  try {
    convertisseur('prj', prj).versWgs(0, 0)
    return true
  } catch {
    return false
  }
}

/** The CC zone a latitude falls in (CC42 to CC50), as used for a site's survey. */
export function zoneCC(lat: number): string | null {
  const n = Math.round(lat)
  return n >= 42 && n <= 50 ? `EPSG:${3900 + n}` : null
}

// ---- Areas the points are expected in --------------------------------------

interface Zone {
  nom: string
  ouest: number
  sud: number
  est: number
  nord: number
}
const ZONES: Zone[] = [
  { nom: 'France métropolitaine', ouest: -5.8, sud: 41.2, est: 9.8, nord: 51.3 },
  { nom: 'Antilles', ouest: -63.3, sud: 14.3, est: -60.7, nord: 18.2 },
  { nom: 'Guyane', ouest: -54.7, sud: 2.0, est: -51.5, nord: 6.0 },
  { nom: 'La Réunion', ouest: 55.1, sud: -21.5, est: 55.9, nord: -20.8 },
  { nom: 'Mayotte', ouest: 44.9, sud: -13.1, est: 45.4, nord: -12.5 },
]
export function enFrance(lon: number, lat: number): boolean {
  return ZONES.some((z) => lon >= z.ouest && lon <= z.est && lat >= z.sud && lat <= z.nord)
}

// ---- What a file says about its system --------------------------------------

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * The system named by a label: an EQuIS coord_type_code ("FRANCE-LAMB-CC49",
 * "RGF_LAMBERT93", "LAT LONG", "UTM/WGS84/Z31N/M"), an EPSG code, a column
 * name ("x_cc49", "X_L93", "longitude"), or the name in a .prj file.
 */
export function systemeDepuisLibelle(libelle: string | null | undefined): string | null {
  if (!libelle) return null
  const s = sansAccents(String(libelle)).toUpperCase()
  let m = s.match(/(?:^|[^A-Z0-9])(?:EPSG[: ]*)?(\d{4,5})(?:$|[^0-9])/)
  if (m && PAR_CODE.has(`EPSG:${m[1]}`)) return `EPSG:${m[1]}`
  if (m && ['4171', '4275', '4258'].includes(m[1])) return WGS84
  m = s.match(/CC[ _-]?(4[2-9]|50)(?![0-9])/)
  if (m) return `EPSG:${3900 + Number(m[1])}`
  if (/LAMB(ERT)?[ _-]?93|(^|[^A-Z])L93($|[^0-9])|RGF[ _-]?(19)?93[ _/-]*LAMB/.test(s)) return LAMBERT93
  if (/LAMB(ERT)?[ _-]?(II|2)[ _-]*(ET|ETENDU|E|EXT|EXTENDED)?([^A-Z]|$)|L2E|LIIE/.test(s)) return 'EPSG:27572'
  // "UTM/WGS84/Z31N/M", "WGS 84 / UTM zone 31N", "x_utm31".
  m = s.match(/UTM.*?(?:ZONE[ _]*|Z)?(?<![0-9])(\d{1,2})[ _]?([NS])(?![A-Z])/) ?? s.match(/UTM[ _-]*(?:ZONE[ _]*|Z)?(\d{1,2})(?![0-9])/)
  if (m) {
    const zone = Number(m[1])
    const sud = m[2] === 'S'
    const trouve = SYSTEMES.find((x) => x.court === `UTM ${zone}${sud ? 'S' : 'N'}`)
    if (trouve) return trouve.code
  }
  if (/WEB[ _-]?MER|PSEUDO[ _-]?MERC|900913|AUX(ILIARY)?[ _-]?SPH/.test(s)) return 'EPSG:3857'
  if (/(^|[^A-Z])(LAT|LON|LONG|LNG|LATITUDE|LONGITUDE|GPS|WGS[ _-]?84|GEOGRAPHI)/.test(s)) return WGS84
  return null
}

/**
 * The system of a .prj (ESRI WKT): a known system when its name says so,
 * so that the file's points are tagged "Lambert 93" rather than ".prj".
 */
export function systemeDepuisPrj(prj: string): string | null {
  const nom = prj.match(/PROJCS\["([^"]+)"/)?.[1] ?? (/^\s*GEOGCS/.test(prj) ? 'WGS84' : null)
  if (!nom) return null
  if (/^\s*GEOGCS/.test(prj) && /WGS|RGF|ETRS|GRS/i.test(prj)) return WGS84
  return systemeDepuisLibelle(nom.replace(/_/g, ' '))
}

// ---- Guess from the values ---------------------------------------------------

export interface Detection {
  code: string
  /** In French, shown to the reader: why this system. */
  raison: string
  /** False when another system would fit as well: the reader should confirm. */
  sur: boolean
  /** The other systems the values fit. */
  autres: string[]
  /** Longitude and latitude columns swapped. */
  inverse?: boolean
}

const mediane = (v: number[]) => {
  const t = [...v].sort((a, b) => a - b)
  return t.length ? t[Math.floor(t.length / 2)] : NaN
}

/** Systems whose definition puts the (median) point in France. */
function candidats(x: number, y: number): string[] {
  const out: string[] = []
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    if (enFrance(x, y)) out.push(WGS84)
    return out
  }
  for (const s of SYSTEMES) {
    if (s.geographique) continue
    try {
      const [lon, lat] = versWgs84(x, y, s.code)
      if (!enFrance(lon, lat)) continue
      // A CC zone is only used within its own band of latitude.
      const zone = s.court.match(/^CC(\d\d)$/)
      if (zone && Math.abs(lat - Number(zone[1])) > 0.6) continue
      out.push(s.code)
    } catch {
      /* outside the projection's domain */
    }
  }
  return out
}

/** Preference among systems that all fit: the usual ones first. */
const PREFERENCE = [LAMBERT93, ...[42, 43, 44, 45, 46, 47, 48, 49, 50].map((n) => `EPSG:${3900 + n}`), WGS84, 'EPSG:32631', 'EPSG:32630', 'EPSG:32632', 'EPSG:27572', 'EPSG:3857']
const rang = (c: string) => {
  const i = PREFERENCE.indexOf(c)
  return i < 0 ? PREFERENCE.length : i
}

const distanceKm = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180
  const dLat = (b[1] - a[1]) * r
  const dLon = (b[0] - a[0]) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/**
 * The system of a set of coordinates, from what the file declares, then
 * from the values. `reference` (longitude, latitude of the site or of the
 * points already loaded) settles between systems that all land in France:
 * the one nearest to it wins.
 */
export function detecterSysteme(
  coords: [number, number][],
  indices: { declare?: string | null; colonnes?: (string | null | undefined)[]; reference?: [number, number] | null } = {},
): Detection | null {
  const declare = systemeDepuisLibelle(indices.declare)
  if (declare) return { code: declare, raison: `déclaré dans le fichier (« ${indices.declare} »)`, sur: true, autres: [] }
  for (const c of indices.colonnes ?? []) {
    const code = c ? systemeDepuisLibelle(c) : null
    if (code && code !== WGS84) return { code, raison: `nom de colonne « ${c} »`, sur: true, autres: [] }
  }
  const valides = coords.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && !(x === 0 && y === 0))
  if (!valides.length) return null
  const x = mediane(valides.map((c) => c[0]))
  const y = mediane(valides.map((c) => c[1]))
  const liste = candidats(x, y)
  if (!liste.length) {
    // Latitude written before longitude.
    if (Math.abs(x) <= 90 && Math.abs(y) <= 180 && enFrance(y, x)) {
      return { code: WGS84, raison: 'valeurs en degrés, latitude et longitude inversées', sur: true, autres: [], inverse: true }
    }
    return null
  }
  if (liste.length === 1) {
    return { code: liste[0], raison: liste[0] === WGS84 ? 'valeurs en degrés' : 'seul système qui place les points en France', sur: true, autres: [] }
  }
  let tri = [...liste].sort((a, b) => rang(a) - rang(b))
  let raison = 'valeurs compatibles avec plusieurs systèmes'
  if (indices.reference) {
    const ref = indices.reference
    const d = new Map(liste.map((c) => [c, distanceKm(versWgs84(x, y, c), ref)]))
    tri = [...liste].sort((a, b) => d.get(a)! - d.get(b)!)
    const premier = d.get(tri[0])!
    const second = d.get(tri[1])!
    if (premier < 5 && second > 20) {
      return { code: tri[0], raison: `le seul qui place les points près du site (${premier < 1 ? 'moins d’1' : Math.round(premier)} km)`, sur: true, autres: tri.slice(1) }
    }
    raison = 'valeurs compatibles avec plusieurs systèmes, le plus proche du site retenu'
  }
  return { code: tri[0], raison, sur: false, autres: tri.slice(1) }
}
