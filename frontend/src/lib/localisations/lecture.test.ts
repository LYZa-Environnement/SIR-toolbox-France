// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { depuisFeuilles, lireFichiers, lireGeoJson, lireGpx, lireKml } from './lecture'
import { LAMBERT93, WGS84 } from './systemes'

describe('workbooks', () => {
  it('reads an EQuIS EDD as one layer in its declared system', () => {
    const [c] = depuisFeuilles(
      [
        { nom: 'Description du format', grille: [['Nom de format GeologyEDD']] },
        {
          nom: 'Locations',
          grille: [
            ['#sys_loc_code', 'x_coord', 'y_coord', 'loc_type', 'coord_type_code'],
            ['#Texte(20)', 'Numérique', 'Numérique', 'Texte(20)', 'Texte(20)'],
            ['VP100', 1657990.951, 8190978.777, 'Soil Vapor Point', 'FRANCE-LAMB-CC49'],
          ],
        },
      ],
      'Localisation.xlsx',
    )
    expect(c).toMatchObject({ format: 'equis', systeme: 'EPSG:3949', systemeSur: true })
    expect(c.points).toHaveLength(1)
  })

  it('gives one layer per sheet with coordinates, and says why when there is none', () => {
    const couches = depuisFeuilles(
      [
        { nom: 'Sondages', grille: [['Nom', 'X', 'Y'], ['S1', 652300, 6862100]] },
        { nom: 'Notes', grille: [['Texte libre']] },
        { nom: 'Piézos', grille: [['Nom', 'X', 'Y'], ['Pz1', 652400, 6862200]] },
      ],
      'Plan.xlsx',
    )
    expect(couches.map((c) => c.nom)).toEqual(['Plan.xlsx — Sondages', 'Plan.xlsx — Piézos'])
    expect(couches[0].systeme).toBe(LAMBERT93)
    expect(() => depuisFeuilles([{ nom: 'A', grille: [['a', 'b']] }], 'vide.xlsx')).toThrow(/aucune colonne de coordonnées/)
  })

  it('reads a French CSV dropped as a file', async () => {
    const csv = '﻿Nom;Type;X;Y\r\nPz1;Piézomètre;652300,12;6862100,45\r\nS1;Sondage;652318,5;6862087,1\r\n'
    const { couches, erreurs } = await lireFichiers([new File([csv], 'points.csv', { type: 'text/csv' })])
    expect(erreurs).toEqual([])
    expect(couches[0].points.map((p) => [p.nom, p.famille, p.x])).toEqual([
      ['Pz1', 'piezometre', 652300.12],
      ['S1', 'sondage', 652318.5],
    ])
  })
})

describe('GeoJSON', () => {
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.35, 48.85, 35] }, properties: { name: 'Pz1', type: 'Piézomètre', profondeur: 12 } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[2.34, 48.84], [2.36, 48.84], [2.36, 48.86], [2.34, 48.84]]] }, properties: { nom: 'Emprise' } },
    ],
  }

  it('reads points and shapes, longitude/latitude by default', () => {
    const [c] = lireGeoJson(JSON.stringify(fc), 'site.geojson')
    expect(c.systeme).toBe(WGS84)
    expect(c.points[0]).toMatchObject({ nom: 'Pz1', famille: 'piezometre', x: 2.35, y: 48.85, altitude: 35, profondeur: 12 })
    expect(c.formes[0]).toMatchObject({ nom: 'Emprise' })
  })

  it('follows the "crs" member of older files', () => {
    const l93 = { type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } }, features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [652300, 6862100] }, properties: { ID: 'S1' } }] }
    const [c] = lireGeoJson(JSON.stringify(l93), 'l93.geojson')
    expect(c.systeme).toBe(LAMBERT93)
    expect(c.points[0].nom).toBe('S1')
  })

  it('refuses what is not GeoJSON', () => {
    expect(() => lireGeoJson('{"a":1}', 'x.json')).toThrow(/GeoJSON/)
    expect(() => lireGeoJson('pas du json', 'x.json')).toThrow(/GeoJSON/)
  })
})

describe('KML and GPX', () => {
  it('reads placemarks, their folder as type, extended data and polygons', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Folder><name>Piézomètres</name>
        <Placemark><name>Pz1</name><description><![CDATA[<b>Amont</b> du site]]></description>
          <ExtendedData><Data name="profondeur"><value>12</value></Data></ExtendedData>
          <Point><coordinates>2.35,48.85,0</coordinates></Point></Placemark>
      </Folder>
      <Placemark><name>Emprise</name><Polygon><outerBoundaryIs><LinearRing><coordinates>2.34,48.84 2.36,48.84 2.36,48.86 2.34,48.84</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`
    const [c] = lireKml(kml, 'site.kml')
    expect(c.systeme).toBe(WGS84)
    expect(c.points[0]).toMatchObject({ nom: 'Pz1', famille: 'piezometre', description: 'Amont du site', profondeur: 12, x: 2.35, y: 48.85 })
    expect(c.formes[0].geometrie.type).toBe('Polygon')
  })

  it('reads GPX waypoints and tracks', () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
      <wpt lat="48.85" lon="2.35"><ele>36.5</ele><name>S1</name><desc>Ancienne cuve</desc><time>2026-10-01T10:00:00Z</time></wpt>
      <trk><name>Cheminement</name><trkseg><trkpt lat="48.85" lon="2.35"/><trkpt lat="48.851" lon="2.351"/></trkseg></trk>
    </gpx>`
    const [c] = lireGpx(gpx, 'terrain.gpx')
    expect(c.points[0]).toMatchObject({ nom: 'S1', famille: 'sondage', altitude: 36.5, description: 'Ancienne cuve', date: '2026-10-01' })
    expect(c.formes[0]).toMatchObject({ nom: 'Cheminement' })
  })
})

// ---- A shapefile made by hand: two points and a NOM field. --------------------------

function shapefilePoints(points: [number, number, string][]): { shp: ArrayBuffer; dbf: ArrayBuffer } {
  const n = points.length
  const shp = new DataView(new ArrayBuffer(100 + n * 28))
  shp.setInt32(0, 9994) // file code, big endian
  shp.setInt32(24, (100 + n * 28) / 2) // length in 16-bit words
  shp.setInt32(28, 1000, true)
  shp.setInt32(32, 1, true) // Point
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  ;[Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].forEach((v, i) => shp.setFloat64(36 + i * 8, v, true))
  points.forEach(([x, y], i) => {
    const o = 100 + i * 28
    shp.setInt32(o, i + 1)
    shp.setInt32(o + 4, 10) // content: 20 bytes
    shp.setInt32(o + 8, 1, true)
    shp.setFloat64(o + 12, x, true)
    shp.setFloat64(o + 20, y, true)
  })
  const largeur = 10
  const entete = 32 + 32 + 1
  const dbf = new Uint8Array(entete + n * (1 + largeur) + 1)
  const v = new DataView(dbf.buffer)
  dbf[0] = 3
  v.setUint32(4, n, true)
  v.setUint16(8, entete, true)
  v.setUint16(10, 1 + largeur, true)
  dbf.set(new TextEncoder().encode('NOM'), 32)
  dbf[32 + 11] = 'C'.charCodeAt(0)
  dbf[32 + 16] = largeur
  dbf[64] = 0x0d
  points.forEach(([, , nom], i) => {
    const o = entete + i * (1 + largeur)
    dbf[o] = 0x20
    dbf.set(new TextEncoder().encode(nom.padEnd(largeur, ' ')), o + 1)
  })
  dbf[dbf.length - 1] = 0x1a
  return { shp: shp.buffer, dbf: dbf.buffer }
}

describe('shapefiles', () => {
  const { shp, dbf } = shapefilePoints([
    [652300, 6862100, 'Pz1'],
    [652318.5, 6862087.1, 'S1'],
  ])
  const prj = 'PROJCS["RGF_1993_Lambert_93",GEOGCS["GCS_RGF_1993",DATUM["D_RGF_1993",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic"],PARAMETER["False_Easting",700000.0],PARAMETER["False_Northing",6600000.0],PARAMETER["Central_Meridian",3.0],PARAMETER["Standard_Parallel_1",49.0],PARAMETER["Standard_Parallel_2",44.0],PARAMETER["Latitude_Of_Origin",46.5],UNIT["Meter",1.0]]'

  it('reads .shp, .dbf and .prj dropped together, keeping the coordinates as they are', async () => {
    const { couches, erreurs } = await lireFichiers([new File([shp], 'points.shp'), new File([dbf], 'points.dbf'), new File([prj], 'points.prj')])
    expect(erreurs).toEqual([])
    expect(couches[0]).toMatchObject({ format: 'shapefile', systeme: LAMBERT93, raisonSysteme: 'fichier .prj' })
    expect(couches[0].points.map((p) => [p.nom, p.x, p.y])).toEqual([
      ['Pz1', 652300, 6862100],
      ['S1', 652318.5, 6862087.1],
    ])
  })

  it('reads a zipped shapefile, and guesses the system without .prj', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('couche/points.shp', shp)
    zip.file('couche/points.dbf', dbf)
    const octets = await zip.generateAsync({ type: 'arraybuffer' })
    const { couches } = await lireFichiers([new File([octets], 'points.zip')])
    expect(couches[0]).toMatchObject({ systeme: LAMBERT93 })
    expect(couches[0].remarques.join(' ')).toMatch(/\.prj absent/)
  })

  it('reports a .dbf dropped without its .shp, and an unknown format', async () => {
    const { couches, erreurs } = await lireFichiers([new File([dbf], 'seul.dbf'), new File(['x'], 'plan.dwg')])
    expect(couches).toEqual([])
    expect(erreurs.join(' ')).toMatch(/\.shp manque/)
    expect(erreurs.join(' ')).toMatch(/DAO/)
  })
})
