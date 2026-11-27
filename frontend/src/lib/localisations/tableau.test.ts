import { describe, expect, it } from 'vitest'
import { familleDe } from './familles'
import { coordonnee, enrichirEquis, estEquis, lireTableau, nombre } from './tableau'

describe('numbers and coordinates', () => {
  it.each([
    [1657990.951, 1657990.951],
    ['1657990,951', 1657990.951],
    ['1 657 990,951', 1657990.951],
    ['1 657 990,951', 1657990.951],
    ['1.657.990,951', 1657990.951],
    ['1,657,990.951', 1657990.951],
    ['-0,5', -0.5],
    ['', null],
    ['abc', null],
    [null, null],
  ])('%s → %s', (v, attendu) => {
    expect(nombre(v)).toBe(attendu)
  })

  it('reads degrees, minutes, seconds', () => {
    // 48 + 51/60 + 24.2/3600 = 48.856722…
    expect(coordonnee('48°51\'24.2"N')).toBeCloseTo(48.856722, 6)
    // 2 + 21/60 + 7/3600 = 2.351944…
    expect(coordonnee('2° 21\' 07" E')).toBeCloseTo(2.351944, 6)
    expect(coordonnee('1°30\'00"W')).toBeCloseTo(-1.5, 9)
    expect(coordonnee('O 1°30\'')).toBeCloseTo(-1.5, 9)
  })
})

describe('kinds of points', () => {
  it.each([
    ['Monitoring well', 'DPzC19', 'piezometre'],
    ['Soil Vapor Point', 'VP100', 'sous-dalle'],
    ['Vapor Pin', 'VP67', 'sous-dalle'],
    ['Soil Gas Monitoring', 'Pza1', 'gaz-sol'],
    ['Air Monitor', 'AP1', 'air'],
    ['Extraction Well', 'P1bis', 'traitement'],
    ['Soil Vapor Extract', 'SVE1', 'traitement'],
    ['Soil boring', 'HPC_S2', 'sondage'],
    ['Piézomètre', 'X', 'piezometre'],
    ['Sondage', 'X', 'sondage'],
    ['', 'Pz12', 'piezometre'],
    ['', 'PZA3', 'gaz-sol'],
    ['', 'S4', 'sondage'],
    ['', 'VP-2', 'sous-dalle'],
    ['BLANK', 'BLANK', 'autre'],
  ])('%s / %s → %s', (type, nom, famille) => {
    expect(familleDe(type, nom)).toBe(famille)
  })
})

// The layout of an EQuIS GeologyEDD Locations sheet: header, then a row of
// data types and a row of French labels, both starting with "#".
const LOCATIONS = [
  ['#sys_loc_code', 'data_provider', 'x_coord', 'y_coord', 'surf_elev', 'elev_unit', 'total_depth', 'units', 'loc_desc', 'loc_type', 'coord_type_code', 'identifier'],
  ['#Texte(20)', 'Texte(40)', 'Numérique', 'Numérique', 'Numérique', 'Texte(15)', 'Numérique', 'Texte(15)', 'Texte(255)', 'Texte(20)', 'Texte(20)', 'Texte(20)'],
  ['# Nom point', 'Prestataire', 'Coordonnée x', 'Coordonnée y', 'Altitude TN', 'Unité altitude', 'Profondeur totale forage', 'Unité profondeur', 'Description du lieu', 'Type de point', 'Code système de coordonnées', 'PRIMARY'],
  ['Pz15', null, 1657921.2584, 8190994.5554, 44.45, 'm', 12, 'm', null, 'Monitoring well', 'FRANCE-LAMB-CC49', 'PRIMARY'],
  ['VP41', 'ERM', 1657950.1, 8191000.2, null, null, null, null, 'RDC', 'Soil Vapor Point', 'FRANCE-LAMB-CC49', 'PRIMARY'],
  ['AP68', null, null, null, null, null, null, null, null, 'Air Monitor', null, null],
]

describe('EQuIS EDD', () => {
  it('reads the Locations sheet, skipping the comment rows', () => {
    const r = lireTableau(LOCATIONS)!
    expect(r.points.map((p) => p.nom)).toEqual(['Pz15', 'VP41', 'AP68'])
    expect(r.points[0]).toMatchObject({ x: 1657921.2584, y: 8190994.5554, altitude: 44.45, profondeur: 12, famille: 'piezometre', typeOrigine: 'Monitoring well', systeme: 'EPSG:3949' })
    expect(r.points[1]).toMatchObject({ description: 'RDC', famille: 'sous-dalle', attributs: { data_provider: 'ERM' } })
    // Technical EQuIS fields are not kept as attributes.
    expect(r.points[0].attributs).not.toHaveProperty('identifier')
    expect(r.points[2]).toMatchObject({ x: null, y: null })
    expect(r.remarques.join(' ')).toMatch(/2 lignes de commentaire.*1 point sans coordonnées/)
    expect(r.declare).toBe('FRANCE-LAMB-CC49')
  })

  it('takes the top of casing from Wells and the latest measuring point from WellDatum', () => {
    const feuilles = [
      { nom: 'Locations', grille: LOCATIONS },
      { nom: 'Wells', grille: [['#sys_loc_code', 'top_casing_elev', 'depth_of_well'], ['#Texte(20)', 'Numérique', 'Numérique'], ['Pz15', 44.6, 12.5]] },
      {
        nom: 'WellDatum',
        grille: [
          ['#sys_loc_code', 'start_date', 'datum_value'],
          ['Pz15', 45000, 44.62],
          ['Pz15', 46000, 44.65],
        ],
      },
    ]
    expect(estEquis(feuilles)).toBe(true)
    const r = lireTableau(LOCATIONS)!
    enrichirEquis(r.points, feuilles)
    // The well's own depth (total_depth) is kept; the latest datum (2025) wins over Wells.
    expect(r.points[0]).toMatchObject({ repere: 44.65, profondeur: 12 })
  })
})

describe('other tables', () => {
  it('reads an ArcGIS Field Maps export', () => {
    const r = lireTableau([
      ['OBJECTID', 'nom_ouvrage', 'type_ouvrage', 'georeferencement', 'localisation', 'revetement', 'x_cc49', 'y_cc49', 'GlobalID', 'Creator'],
      [1, 'VP67', 'Vapor Pin', '', 'Restaurant entrée buffet', 'Parquet vinyle', 1657888.0513, 8191069.8122, '{D80B3A76}', 'x@y'],
    ])!
    expect(r.colonnesXY).toEqual(['x_cc49', 'y_cc49'])
    expect(r.points[0]).toMatchObject({ nom: 'VP67', typeOrigine: 'Vapor Pin', famille: 'sous-dalle', description: 'Restaurant entrée buffet', x: 1657888.0513 })
    expect(r.points[0].attributs).toEqual({ revetement: 'Parquet vinyle' })
  })

  it('finds the header below title rows and reads French numbers', () => {
    const r = lireTableau([
      ['Implantation des sondages — octobre 2026'],
      [],
      ['N°', 'Coordonnée X', 'Coordonnée Y', 'Prof. (m)'],
      ['S1', '652300,12', '6862100,45', '3,5'],
      ['S2', '652318,5', '6862087,1', '2'],
    ])!
    expect(r.colonnes.ligneEntete).toBe(2)
    // "N°" is not a recognised name column: the points are numbered.
    expect(r.points[0]).toMatchObject({ x: 652300.12, y: 6862100.45, profondeur: 3.5 })
  })

  it('reads longitude and latitude columns', () => {
    const r = lireTableau([
      ['Nom', 'Latitude', 'Longitude'],
      ['P1', 48.85, 2.35],
    ])!
    expect(r.geographique).toBe(true)
    expect(r.points[0]).toMatchObject({ x: 2.35, y: 48.85 })
  })

  it('returns nothing for a sheet without coordinates', () => {
    expect(lireTableau([['Échantillon', 'Benzène'], ['S1', 0.5]])).toBeNull()
  })
})
