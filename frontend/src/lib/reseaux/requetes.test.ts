import { describe, expect, it } from 'vitest'
import { codeCommune, empriseAutour, estTronque, intersectent, lireChaleur, lireDistributeurs, lireFibre, normaliser, sourcesConcernees, urlDistributeurs, urlFibre, urlSource } from './requetes'
import { SOURCE, SOURCES } from './sources'
import type { Emprise } from './types'

const EMPRISE: Emprise = [2.3, 48.8, 2.31, 48.81]

describe('empriseAutour', () => {
  it('spans the radius in both directions', () => {
    // 100 m at 45° N: 100 / 111 320 = 0.000898° of latitude, 100 / 78 715 = 0.001270° of longitude.
    const [o, s, e, n] = empriseAutour(45, 5, 100)
    expect(n - 45).toBeCloseTo(0.000898, 6)
    expect(45 - s).toBeCloseTo(0.000898, 6)
    expect(e - 5).toBeCloseTo(0.00127, 6)
    expect(5 - o).toBeCloseTo(0.00127, 6)
  })
})

describe('sourcesConcernees', () => {
  it('keeps national sources and only the local ones covering the extent', () => {
    expect(intersectent([0, 0, 1, 1], [1, 1, 2, 2])).toBe(true)
    expect(intersectent([0, 0, 1, 1], [1.1, 0, 2, 1])).toBe(false)
    // Rue de Rivoli, Paris.
    const ids = sourcesConcernees(SOURCES, empriseAutour(48.8566, 2.3522, 200)).map((s) => s.id)
    expect(ids).toContain('ore-bt-souterrain')
    expect(ids).toContain('paris-eclairage')
    expect(ids).not.toContain('lyon-fibre')
    expect(ids).not.toContain('nantes-eclairage')
  })
})

describe('urlSource', () => {
  it('data-fair: bbox in longitude/latitude order', () => {
    const u = new URL(urlSource({ type: 'datafair', base: 'https://exemple.fr/data-fair/api/v1', dataset: 'jdd' }, EMPRISE, 500))
    expect(u.pathname).toBe('/data-fair/api/v1/datasets/jdd/lines')
    expect(u.searchParams.get('bbox')).toBe('2.3,48.8,2.31,48.81')
    expect(u.searchParams.get('size')).toBe('500')
    expect(u.searchParams.get('format')).toBe('geojson')
  })
  it('Opendatasoft: intersects() on the geo field with a closed WKT polygon', () => {
    const u = new URL(urlSource({ type: 'ods', portail: 'https://data.exemple.fr', dataset: 'jdd', champGeo: 'geo_shape' }, EMPRISE))
    expect(u.pathname).toBe('/api/explore/v2.1/catalog/datasets/jdd/exports/geojson')
    expect(u.searchParams.get('where')).toBe("intersects(geo_shape, geom'POLYGON((2.3 48.8,2.31 48.8,2.31 48.81,2.3 48.81,2.3 48.8))')")
  })
  it('WFS 2.0: latitude first in the URN bbox, answer in EPSG:4326', () => {
    const u = new URL(urlSource({ type: 'wfs', url: 'https://exemple.fr/geoserver/ows', couche: 'ws:couche' }, EMPRISE))
    expect(u.searchParams.get('BBOX')).toBe('48.8,2.3,48.81,2.31,urn:ogc:def:crs:EPSG::4326')
    expect(u.searchParams.get('SRSNAME')).toBe('EPSG:4326')
    expect(u.searchParams.get('TYPENAMES')).toBe('ws:couche')
  })
  it('OGC API Features and ArcGIS: envelope in longitude/latitude order', () => {
    const ogc = new URL(urlSource({ type: 'ogcapi', url: 'https://exemple.fr/ogc/features/v1', collection: 'a:b' }, EMPRISE))
    expect(ogc.pathname).toBe('/ogc/features/v1/collections/a:b/items')
    expect(ogc.searchParams.get('bbox')).toBe('2.3,48.8,2.31,48.81')
    const arc = new URL(urlSource({ type: 'arcgis', url: 'https://exemple.fr/arcgis/rest/services/x/FeatureServer/0' }, EMPRISE))
    expect(arc.pathname.endsWith('/FeatureServer/0/query')).toBe(true)
    expect(arc.searchParams.get('geometry')).toBe('2.3,48.8,2.31,48.81')
    expect(arc.searchParams.get('outSR')).toBe('4326')
    expect(arc.searchParams.get('f')).toBe('geojson')
  })
  it('GPU: the extent as a GeoJSON polygon', () => {
    const u = new URL(urlSource({ type: 'gpu' }, EMPRISE))
    expect(JSON.parse(u.searchParams.get('geom') ?? '')).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [2.3, 48.8],
          [2.31, 48.8],
          [2.31, 48.81],
          [2.3, 48.81],
          [2.3, 48.8],
        ],
      ],
    })
  })
})

describe('estTronque', () => {
  it('reads each protocol’s own count', () => {
    expect(estTronque({ type: 'datafair', base: '', dataset: '' }, { total: 3000 }, 2000)).toBe(true)
    expect(estTronque({ type: 'datafair', base: '', dataset: '' }, { total: 12 }, 12)).toBe(false)
    expect(estTronque({ type: 'wfs', url: '', couche: '' }, { numberMatched: 40 }, 40)).toBe(false)
    expect(estTronque({ type: 'wfs', url: '', couche: '' }, { numberMatched: 'unknown' }, 2000)).toBe(true)
    expect(estTronque({ type: 'arcgis', url: '' }, { properties: { exceededTransferLimit: true } }, 1000)).toBe(true)
    expect(estTronque({ type: 'ods', portail: '', dataset: '', champGeo: '' }, {}, 1999)).toBe(false)
  })
})

describe('normaliser', () => {
  it('sorts ORE features and keeps the operator and attributes', () => {
    const r = normaliser(SOURCE['ore-bt-aerien'], {
      total: 2,
      features: [
        { id: 'a', geometry: { type: 'LineString', coordinates: [[2.3, 48.8], [2.301, 48.8]] }, properties: { nom_grd: 'Enedis', tension: 'BT', position: 'aérien', commune: 'Paris', date_maj: '' } },
        { id: 'b', geometry: null, properties: { nom_grd: 'Enedis' } },
      ],
    })
    expect(r.tronque).toBe(false)
    expect(r.objets).toHaveLength(1)
    const o = r.objets[0]
    expect(o).toMatchObject({ id: 'ore-bt-aerien:a', reseau: 'electricite', element: 'Ligne BT aérienne', aerien: true, gestionnaire: 'Enedis' })
    // Empty attributes are left out of the popup.
    expect(o.details).toEqual([
      ['Tension', 'BT'],
      ['Position', 'aérien'],
      ['Commune', 'Paris'],
    ])
  })

  it('sorts easements by category and drops those that are not networks', () => {
    const geometry = { type: 'LineString', coordinates: [[2.3, 48.8], [2.31, 48.8]] }
    const r = normaliser(SOURCE['gpu-servitudes'], {
      features: [
        { geometry, properties: { suptype: 'i4', nomgen: 'Ligne 225 kV' } },
        { geometry, properties: { suptype: 'a5', nomgen: 'Collecteur eaux usées' } },
        { geometry, properties: { suptype: 'A5', nomgen: 'Conduite AEP' } },
        { geometry, properties: { suptype: 'pt3' } },
        { geometry, properties: { suptype: 'a4', typegen: "Cours d'eau" } },
      ],
    })
    expect(r.objets.map((o) => o.reseau)).toEqual(['electricite', 'assainissement', 'eau', 'telecom'])
  })

  it('sorts Bordeaux PCRS fittings by network and ignores the other themes', () => {
    const geometry = { type: 'Point', coordinates: [-0.57, 44.84] }
    const r = normaliser(SOURCE['bordeaux-pcrs-affleurants'], {
      features: [
        { geometry, properties: { sstheme: 'ASSA', classe: 'REG' } },
        { geometry, properties: { sstheme: 'GAZ', classe: 'VAN' } },
        { geometry, properties: { sstheme: 'SLT', classe: 'POT_FEU' } },
      ],
    })
    expect(r.objets.map((o) => [o.reseau, o.element])).toEqual([
      ['assainissement', 'Regard (ASSA)'],
      ['gaz', 'Vanne / bouche à clé (GAZ)'],
    ])
  })
})

describe('commune and point information', () => {
  it('folds the arrondissements of Paris, Lyon and Marseille into their commune', () => {
    expect(codeCommune('75104')).toBe('75056')
    expect(codeCommune('69383')).toBe('69123')
    expect(codeCommune('13208')).toBe('13055')
    expect(codeCommune('44109')).toBe('44109')
    // Not an arrondissement: Saint-Didier-au-Mont-d'Or (69194) and Aix-en-Provence (13001).
    expect(codeCommune('69194')).toBe('69194')
    expect(codeCommune('13001')).toBe('13001')
  })

  it('reads the distribution operators of a commune', () => {
    expect(decodeURIComponent(urlDistributeurs('44109'))).toContain('qs=code_insee_commune:"44109"')
    expect(lireDistributeurs({ results: [{ commune: 'Nantes', grd_elec: 'Enedis', grd_gaz: 'GRDF' }] })).toEqual({ commune: 'Nantes', electricite: ['Enedis'], gaz: ['GRDF'] })
    expect(lireDistributeurs({ results: [{ commune: 'X', grd_elec: 'Energie et Services de Seyssel', grd_gaz: null }] })).toEqual({
      commune: 'X',
      electricite: ['Energie et Services de Seyssel'],
      gaz: [],
    })
    expect(lireDistributeurs({ results: [] })).toBeNull()
  })

  it('reads the nearest heating network', () => {
    expect(lireChaleur({ distance: 100, gestionnaire: 'Énergies du Grand Paris', id: '7501C', inPDP: false, isClasse: true, name: 'Énergies du Grand Paris' })).toEqual({
      nom: 'Énergies du Grand Paris',
      gestionnaire: 'Énergies du Grand Paris',
      distanceM: 100,
      identifiant: '7501C',
      classe: true,
      dansPdp: false,
    })
    expect(lireChaleur({ isEligible: false })).toBeNull()
  })

  it('reads the fibre network of a commune and the first year of copper closure', () => {
    expect(urlFibre('01004')).toContain('insee_com__exact=01004')
    const f = lireFibre({
      data: [
        {
          com_lib: 'Ambérieu-en-Bugey',
          zonage_fthd: 'ZIPRI - AMII ORANGE',
          categorie_fthd: 'AMII',
          porteur_projet: 'Orange',
          exploitant: 'Orange',
          oi_exploitant: 'Orange',
          locaux_arcep: 10623,
          locaux_ftth: 10563,
          ferm_cu25: 0,
          ferm_cu26: 0,
          ferm_cu27: 0,
          ferm_cu28: 0,
          ferm_cu29: 10623,
          ferm_cu30: 10623,
          trimestre: '2026 T2',
        },
      ],
    })
    expect(f).toMatchObject({ commune: 'Ambérieu-en-Bugey', categorie: 'AMII', operateurInfrastructure: 'Orange', locauxFtth: 10563, fermetureCuivre: 2029 })
    expect(lireFibre({ data: [] })).toBeNull()
  })
})
