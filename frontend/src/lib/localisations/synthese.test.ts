// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { classeurEquis, codeEquis, modeleSimple, systemeLocal, versCsv, versGeoJson, versGpx, versKml } from './export'
import { lireFichiers, lireKml } from './lecture'
import { LAMBERT93, WGS84 } from './systemes'
import { pointsPourDossier, synthese } from './synthese'
import type { Couche, PointLu } from './types'

const point = (nom: string, x: number | null, y: number | null, extra: Partial<PointLu> = {}): PointLu => ({ nom, typeOrigine: '', famille: 'autre', description: '', x, y, attributs: {}, ...extra })

const couche = (id: string, points: PointLu[], extra: Partial<Couche> = {}): Couche => ({
  id,
  nom: `${id}.xlsx`,
  fichier: `${id}.xlsx`,
  format: 'tableau',
  systeme: 'EPSG:3949',
  raisonSysteme: '',
  systemeSur: true,
  autresSystemes: [],
  points,
  formes: [],
  remarques: [],
  importe: '2026-11-27T10:00:00Z',
  ...extra,
})

describe('merging the files', () => {
  const edd = couche('edd', [point('VP100', 1657990.951, 8190978.777, { typeOrigine: 'Soil Vapor Point', famille: 'sous-dalle', attributs: { data_provider: 'ERM' } }), point('Pz15', 1657921.2584, 8190994.5554, { altitude: 44.45 }), point('AP68', null, null)], { format: 'equis' })
  const terrain = couche('terrain', [
    // Same pin, 0.7 mm away: the same position.
    point('VP100', 1657990.9508, 8190978.7772, { typeOrigine: 'Vapor Pin', famille: 'sous-dalle', description: 'Allée 4' }),
    // Same well, 2 m east: a disagreement.
    point('PZ15', 1657923.2584, 8190994.5554),
  ])

  it('merges a point found at the same place in two files, the last file first', () => {
    const s = synthese([edd, terrain])
    const vp = s.points.find((p) => p.nom === 'VP100')!
    expect(vp).toMatchObject({ source: 'terrain.xlsx', autresSources: ['edd.xlsx'], typeOrigine: 'Vapor Pin', typeEquis: 'Soil Vapor Point', description: 'Allée 4', attributs: { data_provider: 'ERM' } })
    expect(s.fusionnes).toBe(1)
    expect(s.points).toHaveLength(2)
  })

  it('sets apart a point whose positions disagree, names compared without case', () => {
    const s = synthese([edd, terrain])
    expect(s.conflits).toHaveLength(1)
    expect(s.conflits[0].nom).toBe('PZ15')
    expect(s.conflits[0].ecartM).toBeCloseTo(2, 2)
    // The version kept completes itself with the other one's ground level.
    expect(s.points.find((p) => p.nom === 'PZ15')).toMatchObject({ altitude: 44.45, x: 1657923.2584 })
    // The reader's choice wins.
    const autre = s.conflits[0].versions.find((v) => v.coucheId === 'edd')!
    const s2 = synthese([edd, terrain], { PZ15: autre.id })
    expect(s2.points.find((p) => p.nom === 'Pz15')?.x).toBe(1657921.2584)
  })

  it('lists the points without coordinates and frames the others', () => {
    const s = synthese([edd, terrain])
    expect(s.sansCoordonnees.map((p) => p.nom)).toEqual(['AP68'])
    const [[sud, ouest], [nord, est]] = s.emprise!
    expect(sud).toBeGreaterThan(48.9)
    expect(nord).toBeLessThan(48.93)
    expect(ouest).toBeGreaterThan(2.4)
    expect(est).toBeLessThan(2.44)
  })

  it('leaves hidden layers out, and applies a system chosen by the reader to every row', () => {
    expect(synthese([edd, { ...terrain, masquee: true }]).points.find((p) => p.nom === 'VP100')?.source).toBe('edd.xlsx')
    const faux = couche('faux', [point('S1', 652300, 6862100, { systeme: 'EPSG:3949' })])
    expect(synthese([faux]).horsFrance).toHaveLength(1)
    const corrige = synthese([{ ...faux, systemeForce: LAMBERT93 }])
    expect(corrige.horsFrance).toHaveLength(0)
    expect(corrige.points[0]).toMatchObject({ x93: 652300, y93: 6862100 })
  })

  it('swaps longitude and latitude when the file has them the wrong way round', () => {
    const s = synthese([couche('gps', [point('P1', 48.85, 2.35)], { systeme: WGS84, inverse: true })])
    expect(s.points[0]).toMatchObject({ lon: 2.35, lat: 48.85 })
  })
})

describe('exports', () => {
  const s = synthese([
    couche('edd', [point('Pz15', 1657921.2584, 8190994.5554, { typeOrigine: 'Monitoring well', famille: 'piezometre', altitude: 44.45, profondeur: 12, description: 'Amont; parking' }), point('AP68', null, null)], { format: 'equis' }),
  ])

  it('writes RFC 7946 GeoJSON with Lambert 93 in the properties', () => {
    const fc = JSON.parse(versGeoJson(s))
    expect(fc.features).toHaveLength(1)
    const [f] = fc.features
    expect(f.geometry.coordinates[0]).toBeCloseTo(s.points[0].lon!, 7)
    expect(f.properties).toMatchObject({ nom: 'Pz15', type: 'Monitoring well', famille: 'Piézomètres', altitude_tn: 44.45, profondeur: 12 })
    expect(f.properties.x_l93).toBeCloseTo(s.points[0].x93!, 3)
  })

  it('writes a CSV for a French Excel, with the local system of the site', () => {
    expect(systemeLocal(s)).toBe('EPSG:3949')
    const csv = versCsv(s)
    expect(csv.startsWith('﻿Nom;Type;Famille;X Lambert 93 (m);Y Lambert 93 (m);X CC49 (m);Y CC49 (m);Longitude')).toBe(true)
    const ligne = csv.split('\r\n')[1].split(';')
    expect(ligne[5]).toBe('1657921,258')
    // A description with ";" is quoted, and the point without coordinates is listed too.
    expect(csv).toContain('"Amont; parking"')
    expect(csv).toContain('AP68;')
  })

  it('writes KML that reads back to the same points', () => {
    const [c] = lireKml(versKml(s, 'Site'), 'retour.kml')
    expect(c.points[0]).toMatchObject({ nom: 'Pz15', famille: 'piezometre' })
    expect(c.points[0].x).toBeCloseTo(s.points[0].lon!, 7)
  })

  it('writes GPX waypoints', () => {
    expect(versGpx(s)).toMatch(/<wpt lat="48\.\d+" lon="2\.\d+"><ele>44\.45<\/ele><name>Pz15<\/name>/)
  })

  it('writes the EQuIS Locations sheet in the chosen system', async () => {
    expect(codeEquis('EPSG:3949')).toBe('FRANCE-LAMB-CC49')
    expect(codeEquis(LAMBERT93)).toBe('RGF_LAMBERT93')
    expect(codeEquis(WGS84)).toBe('LAT LONG')
    const wb = await classeurEquis(s, LAMBERT93)
    const ws = wb.getWorksheet('Locations')!
    expect(ws.getRow(1).getCell(1).value).toBe('#sys_loc_code')
    const r = ws.getRow(2)
    expect(r.getCell(1).value).toBe('Pz15')
    expect(r.getCell(3).value as number).toBeCloseTo(s.points[0].x93!, 3)
    expect(r.getCell(11).value).toBe('Monitoring well')
    expect(r.getCell(12).value).toBe('RGF_LAMBERT93')
  })

  it('offers a template that the tool reads back, each row in its own system', async () => {
    const { couches, erreurs } = await lireFichiers([new File([modeleSimple()], 'modele.csv', { type: 'text/csv' })])
    expect(erreurs).toEqual([])
    const t = synthese(couches)
    expect(t.points.map((p) => [p.nom, p.famille])).toEqual([
      ['Pz1', 'piezometre'],
      ['S1', 'sondage'],
      ['VP1', 'sous-dalle'],
    ])
    expect(t.horsFrance).toEqual([])
    expect(t.points[2]).toMatchObject({ lon: 2.345678, lat: 48.856789 })
    expect(couches[0].remarques.join(' ')).toMatch(/Plusieurs systèmes/)
  })
})

describe('points shared with the dossier', () => {
  it('keeps the placed points, rounded, with what the tools need', () => {
    const s = synthese([
      couche('edd', [point('Pz15', 1657921.2584, 8190994.5554, { famille: 'piezometre', typeOrigine: 'Monitoring well', repere: 44.65, profondeur: 12 }), point('AP68', null, null)]),
      couche('faux', [point('LOIN', 100, 100)], { systeme: LAMBERT93 }),
    ])
    const p = pointsPourDossier(s)
    expect(p.map((x) => x.nom)).toEqual(['Pz15'])
    expect(p[0]).toMatchObject({ famille: 'piezometre', type: 'Monitoring well', repere: 44.65, profondeur: 12, source: 'edd.xlsx' })
    expect(p[0].x93).toBe(Math.round(s.points[0].x93! * 1000) / 1000)
  })
})
