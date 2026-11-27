import { describe, expect, it } from 'vitest'
import { distanceAuSite, distanceFiable, distancesAuxPoints, formatDistance, formatLongueur, gestionnaires, longueurDansCercle, longueurDansRayon, projecteur, situer, synthese, versCsv, versCsvPoints } from './synthese'
import type { ObjetReseau } from './types'

// Site at 45° N: one degree of longitude is 111 320 × cos 45° = 78 715 m.
const LAT = 45
const LON = 5
const proj = projecteur(LAT, LON)
const M_LON = 111320 * Math.cos(Math.PI / 4)
const M_LAT = 111320

/** Point `est` metres east and `nord` metres north of the site, as [lon, lat]. */
const a = (est: number, nord: number) => [LON + est / M_LON, LAT + nord / M_LAT]

function objet(id: string, reseau: ObjetReseau['reseau'], geometrie: ObjetReseau['geometrie'], gestionnaire?: string, element = 'Ligne'): ObjetReseau {
  return { id, source: 'test', reseau, element, aerien: false, gestionnaire, geometrie, details: [] }
}

describe('longueurDansCercle', () => {
  it('keeps the chord of a segment crossing the circle', () => {
    // Horizontal line 60 m north of the centre, circle of 100 m: half chord √(100² − 60²) = 80 m, chord 160 m.
    expect(longueurDansCercle([-500, 60], [500, 60], 100)).toBeCloseTo(160, 6)
  })
  it('keeps a segment wholly inside', () => {
    expect(longueurDansCercle([-30, 0], [40, 0], 100)).toBeCloseTo(70, 6)
  })
  it('cuts a segment leaving the circle', () => {
    // From the centre to 300 m east: 100 m inside.
    expect(longueurDansCercle([0, 0], [300, 0], 100)).toBeCloseTo(100, 6)
  })
  it('gives nothing for a segment passing outside', () => {
    expect(longueurDansCercle([-500, 150], [500, 150], 100)).toBe(0)
    expect(longueurDansCercle([200, 0], [300, 0], 100)).toBe(0)
  })
})

describe('distanceAuSite', () => {
  it('measures a point', () => {
    // 30 m east, 40 m north: 50 m.
    expect(distanceAuSite({ type: 'Point', coordinates: a(30, 40) }, proj)).toBeCloseTo(50, 3)
  })
  it('measures a line to its nearest point, not its vertices', () => {
    // Line from 200 m west to 200 m east, 25 m south: 25 m.
    expect(distanceAuSite({ type: 'LineString', coordinates: [a(-200, -25), a(200, -25)] }, proj)).toBeCloseTo(25, 3)
  })
  it('gives 0 for a surface containing the site', () => {
    const anneau = [a(-10, -10), a(10, -10), a(10, 10), a(-10, 10), a(-10, -10)]
    expect(distanceAuSite({ type: 'Polygon', coordinates: [anneau] }, proj)).toBe(0)
  })
  it('measures a surface to its edge when the site is outside', () => {
    const anneau = [a(20, -10), a(40, -10), a(40, 10), a(20, 10), a(20, -10)]
    expect(distanceAuSite({ type: 'Polygon', coordinates: [anneau] }, proj)).toBeCloseTo(20, 3)
  })
})

describe('longueurDansRayon', () => {
  it('sums the parts of a polyline within the radius', () => {
    // L-shaped line: 0→80 m east (80 m inside), then 80 m east going north to 200 m:
    // inside while 80² + y² ≤ 100², i.e. y ≤ 60 m. Total 140 m.
    const g = { type: 'LineString' as const, coordinates: [a(0, 0), a(80, 0), a(80, 200)] }
    expect(longueurDansRayon(g, proj, 100)).toBeCloseTo(140, 1)
  })
  it('gives 0 for points', () => {
    expect(longueurDansRayon({ type: 'Point', coordinates: a(0, 0) }, proj, 100)).toBe(0)
  })
})

describe('situer and synthese', () => {
  const objets = [
    objet('bt1', 'electricite', { type: 'LineString', coordinates: [a(-100, 20), a(100, 20)] }, 'Enedis', 'Ligne BT souterraine'),
    objet('bt1', 'electricite', { type: 'LineString', coordinates: [a(-100, 20), a(100, 20)] }, 'Enedis', 'Ligne BT souterraine'),
    objet('poste', 'electricite', { type: 'Point', coordinates: a(0, -45) }, 'Enedis', 'Poste HTA/BT'),
    objet('gaz', 'gaz', { type: 'LineString', coordinates: [a(-100, 70), a(100, 70)] }, 'GRDF', 'Canalisation'),
    objet('loin', 'eau', { type: 'Point', coordinates: a(300, 0) }, 'Régie'),
  ]
  const situes = situer(objets, LAT, LON, 100)

  it('drops duplicates and objects beyond the radius, nearest first', () => {
    expect(situes.map((o) => o.id)).toEqual(['bt1', 'poste', 'gaz'])
  })

  it('sums the line within the radius per network', () => {
    const lignes = synthese(situes)
    expect(lignes.map((l) => l.reseau)).toEqual(['electricite', 'gaz'])
    const elec = lignes[0]
    expect(elec.objets).toBe(2)
    // Line 20 m north of the site, both ends 101.98 m away: chord 2·√(100² − 20²) = 195.96 m.
    expect(elec.lineaireM).toBeCloseTo(195.96, 1)
    expect(elec.distanceMinM).toBeCloseTo(20, 3)
    expect(elec.gestionnaires).toEqual(['Enedis'])
    expect(elec.elements).toEqual([
      ['Ligne BT souterraine', 1],
      ['Poste HTA/BT', 1],
    ])
    // 70 m north: chord 2·√(100² − 70²) = 142.83 m.
    expect(lignes[1].lineaireM).toBeCloseTo(142.83, 1)
  })

  it('lists operators nearest first', () => {
    expect(gestionnaires(situes).map((g) => [g.gestionnaire, g.reseaux, Math.round(g.distanceMinM)])).toEqual([
      ['Enedis', ['electricite'], 20],
      ['GRDF', ['gaz'], 70],
    ])
  })

  it('writes a CSV with semicolons and quotes where needed', () => {
    const csv = versCsv(synthese(situes), (id) => `Source ; ${id}`)
    const [entete, premiere] = csv.split('\r\n')
    expect(entete.split(';')[0]).toBe('Réseau')
    expect(premiere.startsWith('Électricité;2;196;20;Enedis;')).toBe(true)
    expect(premiere.endsWith('"Source ; test"')).toBe(true)
  })
})

describe('formats', () => {
  it('rounds distances to the precision of the data', () => {
    expect(formatDistance(0.4)).toBe('< 1 m')
    expect(formatDistance(42.6)).toBe('43 m')
    expect(formatDistance(212)).toBe('210 m')
    expect(formatDistance(Infinity)).toBe('—')
  })
  it('writes lengths in m or km', () => {
    expect(formatLongueur(0)).toBe('—')
    expect(formatLongueur(196.2)).toBe('196 m')
    expect(formatLongueur(1250)).toMatch(/^1,25\s?km$/)
  })
})

describe('distancesAuxPoints', () => {
  // Gas line running north–south 20 m east of the search point; electricity 3 m west of S1.
  const objets = [
    objet('g', 'gaz', { type: 'LineString', coordinates: [a(20, -300), a(20, 300)] }),
    objet('e', 'electricite', { type: 'Point', coordinates: a(-33, 0) }, undefined, 'Poste'),
  ]
  const point = (nom: string, est: number, nord: number) => {
    const [lon, lat] = a(est, nord)
    return { nom, lon, lat }
  }

  it('gives each point its nearest network, nearest point first', () => {
    const { lignes, horsZone } = distancesAuxPoints([point('PZ1', 15, 0), point('S1', -30, 0), point('LOIN', 500, 0)], objets, { lat: LAT, lon: LON }, 100)
    expect(horsZone).toBe(1)
    expect(lignes.map((l) => l.nom)).toEqual(['S1', 'PZ1'])
    // S1, 30 m west: electricity 3 m away, gas 50 m away.
    expect(lignes[0].plusProche).toMatchObject({ reseau: 'electricite', element: 'Poste' })
    expect(lignes[0].plusProche!.distanceM).toBeCloseTo(3, 1)
    expect(lignes[0].parReseau.gaz).toBeCloseTo(50, 1)
    // 30 m from the centre in a 100 m square: networks all loaded within 70 m of S1.
    expect(lignes[0].fiableM).toBeCloseTo(70, 1)
    expect(lignes[1].plusProche).toMatchObject({ reseau: 'gaz' })
    expect(lignes[1].plusProche!.distanceM).toBeCloseTo(5, 1)
  })

  it('does not claim a distance beyond what was loaded', () => {
    expect(distanceFiable(4.26, 70)).toBe('4,3 m')
    expect(distanceFiable(50, 70)).toBe('50 m')
    expect(distanceFiable(90, 70)).toBe('> 70 m')
    expect(distanceFiable(undefined, 70.6)).toBe('> 70 m')
    const { lignes } = distancesAuxPoints([point('S1', -30, 0)], objets, { lat: LAT, lon: LON }, 100)
    const csv = versCsvPoints(lignes, ['electricite', 'gaz'])
    expect(csv.split('\r\n')[1]).toBe('S1;Électricité;Poste;3;3;50;70')
  })
})
