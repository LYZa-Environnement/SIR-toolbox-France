import { describe, expect, it } from 'vitest'
import { fromLambert93 } from '../geo'
import { depuisWgs84, detecterSysteme, LAMBERT93, systemeDepuisLibelle, systemeDepuisPrj, versWgs84, WGS84, zoneCC } from './systemes'

describe('conversions', () => {
  it('projection origins land on their definition point', () => {
    // Lambert 93: origin (700 000, 6 600 000) at 3° E, 46.5° N.
    const [lon, lat] = versWgs84(700000, 6600000, LAMBERT93)
    expect(lon).toBeCloseTo(3, 9)
    expect(lat).toBeCloseTo(46.5, 9)
    // CC49: origin (1 700 000, 8 200 000) at 3° E, 49° N; CC43: (1 700 000, 2 200 000) at 43° N.
    expect(versWgs84(1700000, 8200000, 'EPSG:3949')).toEqual([expect.closeTo(3, 9), expect.closeTo(49, 9)])
    expect(versWgs84(1700000, 2200000, 'EPSG:3943')).toEqual([expect.closeTo(3, 9), expect.closeTo(43, 9)])
  })

  it('agrees with the independent Lambert 93 inversion of geo.ts', () => {
    const [lon, lat] = versWgs84(652300, 6862100, LAMBERT93)
    const [lon2, lat2] = fromLambert93(652300, 6862100)
    expect(lon).toBeCloseTo(lon2, 7)
    expect(lat).toBeCloseTo(lat2, 7)
  })

  it('goes back and forth without loss (CC49 ↔ WGS 84 ↔ Lambert 93)', () => {
    const [lon, lat] = versWgs84(1657990.951, 8190978.777, 'EPSG:3949')
    const [x, y] = depuisWgs84(lon, lat, 'EPSG:3949')
    expect(x).toBeCloseTo(1657990.951, 3)
    expect(y).toBeCloseTo(8190978.777, 3)
    // Same GRS80 ellipsoid: the Lambert 93 point converts back to the same place.
    const [x93, y93] = depuisWgs84(lon, lat, LAMBERT93)
    const [lon3, lat3] = versWgs84(x93, y93, LAMBERT93)
    expect(lon3).toBeCloseTo(lon, 9)
    expect(lat3).toBeCloseTo(lat, 9)
  })

  it('converts Lambert II étendu with the NTF datum shift', () => {
    // Origin of Lambert II étendu: (600 000, 2 200 000) is 46.8° N on the Paris
    // meridian (2°20′14.025″ E = 2.33722917° E) in NTF. In WGS 84 the same place
    // is a few tens of metres away: the datum shift, applied, but small.
    const [lon, lat] = versWgs84(600000, 2200000, 'EPSG:27572')
    const dx = (lon - 2.33722917) * 111320 * Math.cos((46.8 * Math.PI) / 180)
    const dy = (lat - 46.8) * 111130
    expect(Math.hypot(dx, dy)).toBeGreaterThan(10)
    expect(Math.hypot(dx, dy)).toBeLessThan(150)
    const [x, y] = depuisWgs84(lon, lat, 'EPSG:27572')
    expect(x).toBeCloseTo(600000, 3)
    expect(y).toBeCloseTo(2200000, 3)
  })

  it('names the CC zone of a latitude', () => {
    expect(zoneCC(48.917)).toBe('EPSG:3949')
    expect(zoneCC(43.3)).toBe('EPSG:3943')
    expect(zoneCC(51.6)).toBeNull()
  })
})

describe('system named in the file', () => {
  it.each([
    ['FRANCE-LAMB-CC49', 'EPSG:3949'],
    ['RGF_LAMBERT93', LAMBERT93],
    ['LAT LONG', WGS84],
    ['UTM/WGS84/Z31N/M', 'EPSG:32631'],
    ['WGS 84 / UTM zone 30N', 'EPSG:32630'],
    ['WGS84/WebMer/AuxSphe', 'EPSG:3857'],
    ['x_cc49', 'EPSG:3949'],
    ['X_L93', LAMBERT93],
    ['Lambert 93', LAMBERT93],
    ['EPSG:2154', LAMBERT93],
    ['urn:ogc:def:crs:EPSG::3945', 'EPSG:3945'],
    ['Lambert II étendu', 'EPSG:27572'],
    ['RGF93 CC46', 'EPSG:3946'],
    ['x_utm31', 'EPSG:32631'],
    ['Nom du point', null],
    ['X', null],
  ])('%s → %s', (libelle, attendu) => {
    expect(systemeDepuisLibelle(libelle)).toBe(attendu)
  })

  it('reads the name of an ESRI .prj', () => {
    expect(systemeDepuisPrj('PROJCS["RGF_1993_Lambert_93",GEOGCS["GCS_RGF_1993",DATUM["D_RGF_1993",SPHEROID["GRS_1980",6378137.0,298.257222101]]],PROJECTION["Lambert_Conformal_Conic"]]')).toBe(LAMBERT93)
    expect(systemeDepuisPrj('PROJCS["RGF93_CC49",GEOGCS["GCS_RGF_1993"]]')).toBe('EPSG:3949')
    expect(systemeDepuisPrj('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]]')).toBe(WGS84)
  })
})

describe('system guessed from the values', () => {
  it('recognises a CC zone from its false northing', () => {
    const d = detecterSysteme([
      [1657990.951, 8190978.777],
      [1658001.512, 8190975.402],
    ])
    expect(d).toMatchObject({ code: 'EPSG:3949', sur: true })
  })

  it('recognises Lambert 93 and degrees', () => {
    expect(detecterSysteme([[652300, 6862100]])?.code).toBe(LAMBERT93)
    expect(detecterSysteme([[2.35, 48.85]])).toMatchObject({ code: WGS84, sur: true })
  })

  it('sees latitude and longitude written the wrong way round', () => {
    expect(detecterSysteme([[48.85, 2.35]])).toMatchObject({ code: WGS84, inverse: true })
  })

  it('prefers a declared system or a telling column name to the values', () => {
    expect(detecterSysteme([[652300, 6862100]], { declare: 'RGF_LAMBERT93' })?.raison).toMatch(/déclaré/)
    expect(detecterSysteme([[1657990, 8190978]], { colonnes: ['x_cc49', 'y_cc49'] })?.raison).toMatch(/x_cc49/)
  })

  it('asks for confirmation when several systems fit, and the site settles it', () => {
    // Paris in UTM 31N (452 000, 5 411 000) also lands in France as Web Mercator.
    const seul = detecterSysteme([[452000, 5411000]])
    expect(seul?.sur).toBe(false)
    expect(seul?.autres.length).toBeGreaterThan(0)
    const avecSite = detecterSysteme([[452000, 5411000]], { reference: [2.35, 48.85] })
    expect(avecSite).toMatchObject({ code: 'EPSG:32631', sur: true })
  })

  it('gives up on values that place nothing in France', () => {
    expect(detecterSysteme([[120, 45]])).toBeNull()
    expect(detecterSysteme([])).toBeNull()
  })
})
