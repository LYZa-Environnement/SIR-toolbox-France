import { describe, expect, it } from 'vitest'
import { cleOuvrage as cleCampagnes } from '../resultats/campagnes'
import { centrePoints, cleOuvrage, extrairePoints, indexer, type PointDossier } from './points'

const point = (nom: string, extra: Partial<PointDossier> = {}): PointDossier => ({ nom, famille: 'piezometre', type: '', description: '', lon: 2.42, lat: 48.91, x93: 657990, y93: 6868758, source: 'a.xlsx', ...extra })

describe('names of the dossier points', () => {
  it.each(['PZ01', 'Pz 1', 'pz-1', 'PZ.1', 'HPC_S2', 'HPC S02', 'Piézo/3', "Dpz1'", 'S10', 'VP100'])('reads %s as Résultats labo does', (nom) => {
    expect(cleOuvrage(nom)).toBe(cleCampagnes(nom))
  })

  it('finds a point whatever the writing, without mixing different points', () => {
    const trouver = indexer([point('Pz1'), point('Dpz1'), point("Dpz1'"), point('PZ10')])
    expect(trouver('PZ01')?.nom).toBe('Pz1')
    expect(trouver('pz-10')?.nom).toBe('PZ10')
    expect(trouver("DPZ1'")?.nom).toBe("Dpz1'")
    expect(trouver('PZ2')).toBeNull()
  })
})

describe('points read from points.json', () => {
  it('keeps the valid rows of a hand-edited file', () => {
    const points = extrairePoints({
      couches: [],
      points: [point('Pz1', { repere: 44.65 }), { nom: 'S1', lon: 'x' }, null, { ...point('S2'), altitude: 'haut' }],
    })
    expect(points.map((p) => p.nom)).toEqual(['Pz1', 'S2'])
    expect(points[0].repere).toBe(44.65)
    expect(points[1]).not.toHaveProperty('altitude')
    expect(extrairePoints(null)).toEqual([])
    expect(extrairePoints({ couches: [] })).toEqual([])
  })

  it('frames the points', () => {
    expect(centrePoints([point('a', { lon: 2, lat: 48 }), point('b', { lon: 3, lat: 49 })])).toEqual({ lon: 2.5, lat: 48.5 })
    expect(centrePoints([])).toBeNull()
  })
})
