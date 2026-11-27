/**
 * The points of a study written out for other software: GeoJSON (QGIS,
 * ArcGIS, the simplest exchange format), KML (Google Earth, My Maps), GPX
 * (GPS, phones in the field), CSV and Excel (tables for the report), EQuIS
 * Locations sheet (EDD), and a blank template of the simplest table.
 */

import type { Workbook } from 'exceljs'
import { FAMILLE } from './familles'
import { courtSysteme, depuisWgs84, LAMBERT93, nomSysteme, WGS84, zoneCC } from './systemes'
import type { FormeSituee, PointSitue, Synthese } from './synthese'

const echapperXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const arrondi = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n

/** Properties of a point as written in GeoJSON and KML. */
function proprietes(p: PointSitue): Record<string, string | number> {
  const o: Record<string, string | number> = { nom: p.nom, type: p.typeOrigine || FAMILLE[p.famille].libelle, famille: FAMILLE[p.famille].libelle }
  if (p.description) o.description = p.description
  if (p.x93 !== null) {
    o.x_l93 = arrondi(p.x93, 3)
    o.y_l93 = arrondi(p.y93!, 3)
  }
  if (p.altitude !== undefined) o.altitude_tn = p.altitude
  if (p.repere !== undefined) o.cote_repere = p.repere
  if (p.profondeur !== undefined) o.profondeur = p.profondeur
  if (p.date) o.date = p.date
  o.source = [p.source, ...p.autresSources].join(' ; ')
  for (const [k, v] of Object.entries(p.attributs)) if (!(k in o)) o[k] = v
  return o
}

const formeProps = (f: FormeSituee) => ({ nom: f.nom, source: f.source, ...f.attributs })

/** GeoJSON (RFC 7946): longitude, latitude in WGS 84, as every GIS reads it. */
export function versGeoJson(s: Synthese): string {
  const fc = {
    type: 'FeatureCollection',
    features: [
      ...s.points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [arrondi(p.lon!, 8), arrondi(p.lat!, 8)] }, properties: proprietes(p) })),
      ...s.formes.map((f) => ({ type: 'Feature', geometry: f.wgs, properties: formeProps(f) })),
    ],
  }
  return JSON.stringify(fc, null, 1)
}

/** KML colour: aabbggrr. */
const couleurKml = (hex: string, alpha = 'ff') => `${alpha}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`

function geometrieKml(g: GeoJSON.Geometry): string {
  const c = (p: GeoJSON.Position) => `${arrondi(p[0], 8)},${arrondi(p[1], 8)}`
  const anneau = (l: GeoJSON.Position[]) => `<LinearRing><coordinates>${l.map(c).join(' ')}</coordinates></LinearRing>`
  const polygone = (p: GeoJSON.Position[][]) =>
    `<Polygon><outerBoundaryIs>${anneau(p[0])}</outerBoundaryIs>${p
      .slice(1)
      .map((l) => `<innerBoundaryIs>${anneau(l)}</innerBoundaryIs>`)
      .join('')}</Polygon>`
  switch (g.type) {
    case 'Point':
      return `<Point><coordinates>${c(g.coordinates)}</coordinates></Point>`
    case 'LineString':
      return `<LineString><coordinates>${g.coordinates.map(c).join(' ')}</coordinates></LineString>`
    case 'Polygon':
      return polygone(g.coordinates)
    case 'MultiPoint':
      return `<MultiGeometry>${g.coordinates.map((p) => `<Point><coordinates>${c(p)}</coordinates></Point>`).join('')}</MultiGeometry>`
    case 'MultiLineString':
      return `<MultiGeometry>${g.coordinates.map((l) => `<LineString><coordinates>${l.map(c).join(' ')}</coordinates></LineString>`).join('')}</MultiGeometry>`
    case 'MultiPolygon':
      return `<MultiGeometry>${g.coordinates.map(polygone).join('')}</MultiGeometry>`
    case 'GeometryCollection':
      return `<MultiGeometry>${g.geometries.map(geometrieKml).join('')}</MultiGeometry>`
  }
}

const donneesKml = (o: Record<string, string | number>) =>
  `<ExtendedData>${Object.entries(o)
    .map(([k, v]) => `<Data name="${echapperXml(k)}"><value>${echapperXml(String(v))}</value></Data>`)
    .join('')}</ExtendedData>`

/** KML for Google Earth and My Maps: one folder per kind of point, coloured as on the map. */
export function versKml(s: Synthese, titre: string): string {
  const styles = Object.values(FAMILLE)
    .map((f) => `<Style id="${f.id}"><IconStyle><color>${couleurKml(f.couleur)}</color><scale>0.9</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>`)
    .join('')
  const dossiers = Object.values(FAMILLE)
    .map((f) => {
      const pts = s.points.filter((p) => p.famille === f.id)
      if (!pts.length) return ''
      return `<Folder><name>${echapperXml(f.libelle)}</name>${pts
        .map((p) => {
          const props = proprietes(p)
          return `<Placemark><name>${echapperXml(p.nom)}</name>${p.description ? `<description>${echapperXml(p.description)}</description>` : ''}<styleUrl>#${f.id}</styleUrl>${donneesKml(props)}${geometrieKml({ type: 'Point', coordinates: [p.lon!, p.lat!] })}</Placemark>`
        })
        .join('')}</Folder>`
    })
    .join('')
  const formes = s.formes.length
    ? `<Folder><name>Contours et tracés</name>${s.formes.map((f) => `<Placemark><name>${echapperXml(f.nom)}</name><Style><LineStyle><color>ff2a2a0d</color><width>2</width></LineStyle><PolyStyle><color>330d2a2a</color></PolyStyle></Style>${geometrieKml(f.wgs)}</Placemark>`).join('')}</Folder>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${echapperXml(titre)}</name>${styles}${dossiers}${formes}</Document></kml>\n`
}

/** GPX waypoints, to find the points in the field with a GPS or a phone. */
export function versGpx(s: Synthese): string {
  const wpt = s.points
    .map((p) => {
      const desc = [FAMILLE[p.famille].libelle, p.description].filter(Boolean).join(' — ')
      return `<wpt lat="${arrondi(p.lat!, 8)}" lon="${arrondi(p.lon!, 8)}">${p.altitude !== undefined ? `<ele>${p.altitude}</ele>` : ''}<name>${echapperXml(p.nom)}</name>${desc ? `<desc>${echapperXml(desc)}</desc>` : ''}<type>${echapperXml(p.typeOrigine || FAMILLE[p.famille].libelle)}</type></wpt>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="SIR Toolbox France" xmlns="http://www.topografix.com/GPX/1/1">\n${wpt}\n</gpx>\n`
}

/**
 * The local system of the site, written next to Lambert 93: the one most
 * points came in when it is projected and not Lambert 93, else the CC zone
 * of the site's latitude (the system surveyors use on site).
 */
export function systemeLocal(s: Synthese): string | null {
  const n = new Map<string, number>()
  for (const p of s.points) if (p.systemeUtilise && p.systemeUtilise !== LAMBERT93 && p.systemeUtilise !== WGS84 && p.systemeUtilise !== 'prj') n.set(p.systemeUtilise, (n.get(p.systemeUtilise) ?? 0) + 1)
  const [premier] = [...n.entries()].sort((a, b) => b[1] - a[1])
  if (premier) return premier[0]
  const lat = s.emprise ? (s.emprise[0][0] + s.emprise[1][0]) / 2 : null
  return lat === null ? null : zoneCC(lat)
}

interface Colonne {
  titre: string
  largeur: number
  valeur: (p: PointSitue, local: [number, number] | null) => string | number | null
}

function colonnes(local: string | null): Colonne[] {
  const cols: Colonne[] = [
    { titre: 'Nom', largeur: 14, valeur: (p) => p.nom },
    { titre: 'Type', largeur: 22, valeur: (p) => p.typeOrigine || null },
    { titre: 'Famille', largeur: 26, valeur: (p) => FAMILLE[p.famille].libelle },
    { titre: 'X Lambert 93 (m)', largeur: 15, valeur: (p) => (p.x93 === null ? null : arrondi(p.x93, 3)) },
    { titre: 'Y Lambert 93 (m)', largeur: 15, valeur: (p) => (p.y93 === null ? null : arrondi(p.y93, 3)) },
  ]
  if (local) {
    const court = courtSysteme(local)
    cols.push({ titre: `X ${court} (m)`, largeur: 15, valeur: (_p, l) => (l ? arrondi(l[0], 3) : null) }, { titre: `Y ${court} (m)`, largeur: 15, valeur: (_p, l) => (l ? arrondi(l[1], 3) : null) })
  }
  cols.push(
    { titre: 'Longitude (WGS 84)', largeur: 13, valeur: (p) => (p.lon === null ? null : arrondi(p.lon, 7)) },
    { titre: 'Latitude (WGS 84)', largeur: 13, valeur: (p) => (p.lat === null ? null : arrondi(p.lat, 7)) },
    { titre: 'Altitude TN (m)', largeur: 11, valeur: (p) => p.altitude ?? null },
    { titre: 'Cote du repère (m)', largeur: 11, valeur: (p) => p.repere ?? null },
    { titre: 'Profondeur (m)', largeur: 11, valeur: (p) => p.profondeur ?? null },
    { titre: 'Date', largeur: 11, valeur: (p) => p.date ?? null },
    { titre: 'Description', largeur: 40, valeur: (p) => p.description || null },
    { titre: 'Source', largeur: 30, valeur: (p) => [p.source, ...p.autresSources].join(' ; ') },
  )
  return cols
}

const enLocal = (p: PointSitue, local: string | null): [number, number] | null => {
  if (!local || p.lon === null) return null
  if (p.systemeUtilise === local && p.x !== null) return [p.x, p.y!]
  return depuisWgs84(p.lon, p.lat!, local)
}

/** CSV for a French Excel: ";" between columns, decimal comma, BOM for the accents. */
export function versCsv(s: Synthese): string {
  const local = systemeLocal(s)
  const cols = colonnes(local)
  const cellule = (v: string | number | null) => {
    if (v === null) return ''
    if (typeof v === 'number') return String(v).replace('.', ',')
    return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  const lignes = [...s.points, ...s.sansCoordonnees].map((p) => {
    const l = enLocal(p, local)
    return cols.map((c) => cellule(c.valeur(p, l))).join(';')
  })
  return `﻿${[cols.map((c) => c.titre).join(';'), ...lignes].join('\r\n')}\r\n`
}

/** Excel workbook for the report: points, points without coordinates, disagreements between files. */
export async function classeurExcel(s: Synthese): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const local = systemeLocal(s)
  const cols = colonnes(local)
  const feuille = (nom: string, points: PointSitue[]) => {
    const ws = wb.addWorksheet(nom, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = cols.map((c) => ({ header: c.titre, width: c.largeur }))
    const entete = ws.getRow(1)
    entete.font = { bold: true }
    entete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCDDCD1' } }
    entete.alignment = { vertical: 'middle', wrapText: true }
    for (const p of points) {
      const l = enLocal(p, local)
      ws.addRow(cols.map((c) => c.valeur(p, l)))
    }
    return ws
  }
  feuille('Points', s.points)
  if (s.sansCoordonnees.length) feuille('Sans coordonnées', s.sansCoordonnees)
  if (s.conflits.length) {
    const ws = wb.addWorksheet('Écarts entre fichiers')
    ws.columns = [
      { header: 'Nom', width: 14 },
      { header: 'Écart (m)', width: 10 },
      { header: 'Fichier', width: 40 },
      { header: 'X Lambert 93 (m)', width: 15 },
      { header: 'Y Lambert 93 (m)', width: 15 },
      { header: 'Retenu', width: 8 },
    ]
    ws.getRow(1).font = { bold: true }
    for (const c of s.conflits) for (const v of c.versions) ws.addRow([c.nom, arrondi(c.ecartM, 2), v.source, v.x93 === null ? null : arrondi(v.x93, 3), v.y93 === null ? null : arrondi(v.y93, 3), v.id === c.retenu ? 'oui' : ''])
  }
  const notes = wb.addWorksheet('Notes')
  notes.columns = [{ width: 110 }]
  for (const t of [
    `Coordonnées en RGF93 / Lambert 93 (EPSG:2154)${local ? `, en ${nomSysteme(local)} (${local})` : ''} et en WGS 84 (EPSG:4326).`,
    'Conversions par proj4 avec les définitions du registre EPSG ; les anciens systèmes NTF (Lambert II étendu) sont convertis à 1 ou 2 m près.',
    'Un point présent dans plusieurs fichiers à moins de 10 cm près est fusionné ; au-delà, l’écart est listé dans l’onglet « Écarts entre fichiers ».',
    `Produit par SIR Toolbox France le ${new Date().toLocaleDateString('fr-FR')}.`,
  ])
    notes.addRow([t])
  return wb
}

/** EQuIS coord_type_code of a system, as in ERM's reference list. */
export function codeEquis(systeme: string): string {
  if (systeme === LAMBERT93) return 'RGF_LAMBERT93'
  if (systeme === WGS84) return 'LAT LONG'
  const cc = courtSysteme(systeme).match(/^CC(\d\d)$/)
  if (cc) return `FRANCE-LAMB-CC${cc[1]}`
  const utm = courtSysteme(systeme).match(/^UTM (\d+)([NS])$/)
  if (utm) return `UTM/WGS84/Z${utm[1]}${utm[2]}/M`
  return systeme
}

/**
 * Locations sheet of the EQuIS GeologyEDD format: the header row of the
 * template, one row per point, coordinates in the chosen system.
 */
export async function classeurEquis(s: Synthese, systeme: string): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Locations')
  ws.addRow(['#sys_loc_code', 'data_provider', 'x_coord', 'y_coord', 'surf_elev', 'elev_unit', 'total_depth', 'units', 'loc_name', 'loc_desc', 'loc_type', 'coord_type_code', 'start_date', 'identifier'])
  ws.getRow(1).font = { bold: true }
  const code = codeEquis(systeme)
  const decimales = systeme === WGS84 ? 8 : 3
  for (const p of s.points) {
    const [x, y] = p.systemeUtilise === systeme && p.x !== null ? [p.x, p.y!] : depuisWgs84(p.lon!, p.lat!, systeme)
    const fournisseur = p.attributs.data_provider ?? ''
    ws.addRow([
      p.nom.slice(0, 20),
      fournisseur,
      arrondi(x, decimales),
      arrondi(y, decimales),
      p.altitude ?? null,
      p.altitude !== undefined ? 'm' : null,
      p.profondeur ?? null,
      p.profondeur !== undefined ? 'm' : null,
      null,
      p.description ? p.description.slice(0, 255) : null,
      p.typeEquis ?? FAMILLE[p.famille].equis,
      code,
      p.date ?? null,
      'PRIMARY',
    ])
  }
  ws.columns.forEach((c) => (c.width = 16))
  return wb
}

/** The simplest table the tool reads: a name, X, Y and the system. */
export function modeleSimple(): string {
  return `﻿${[
    'Nom;Type;X;Y;Système;Altitude TN (m);Profondeur (m);Description',
    'Pz1;Piézomètre;652300,12;6862100,45;Lambert 93;45,32;12;Amont hydraulique',
    'S1;Sondage;652318,50;6862087,10;Lambert 93;;3;Ancienne cuve',
    'VP1;Vapor pin;2,345678;48,856789;WGS 84;;;Sous dalle atelier',
  ].join('\r\n')}\r\n`
}
