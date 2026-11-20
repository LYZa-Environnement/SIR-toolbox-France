import { describe, expect, it } from 'vitest'
import { lireGrille, type Cell } from './parse.ts'
import { statistiques, valeursCompose, type Valeur } from './stats.ts'

const q = (echantillon: string, valeur: number): Valeur => ({ echantillon, valeur, inferieur: false })
const lq = (echantillon: string, valeur: number): Valeur => ({ echantillon, valeur, inferieur: true })

describe('statistiques par composé', () => {
  // Cinq valeurs quantifiées 1, 2, 3, 4, 10 et deux résultats < LQ (0,5 et 20).
  const valeurs = [q('A', 1), q('B', 2), lq('F', 0.5), q('C', 3), q('D', 4), q('E', 10), lq('G', 20)]

  it('calcule la distribution sur les seules valeurs quantifiées', () => {
    const s = statistiques(valeurs, null)
    expect(s).toMatchObject({ analyses: 7, quantifies: 5, lqMin: 0.5, lqMax: 20, min: 1, max: 10, echantillonMax: 'E', mediane: 3 })
    expect(s.frequence).toBeCloseTo((5 / 7) * 100)
    // Moyenne 20 / 5 = 4.
    expect(s.moyenne).toBe(4)
    // Écart-type de l'échantillon : écarts −3, −2, −1, 0, 6 ; Σ² = 50 ; √(50 / 4) = 3,5355.
    expect(s.ecartType).toBeCloseTo(Math.sqrt(12.5))
    // 90e centile comme CENTILE.INCLURE d'Excel : rang 4 × 0,9 = 3,6 → 4 + 0,6 × (10 − 4) = 7,6.
    expect(s.p90).toBeCloseTo(7.6)
  })

  it('compte les dépassements de la valeur de comparaison', () => {
    const s = statistiques(valeurs, 3)
    // > 3 : D (4) et E (10) ; 3 n'est pas un dépassement.
    expect(s.depassements).toBe(2)
    expect(s.echantillonsDepassement).toEqual(['D', 'E'])
    expect(s.frequenceDepassement).toBeCloseTo((2 / 7) * 100)
    expect(s.ratioMaxGuide).toBeCloseTo(10 / 3)
    // « < 20 » ne permet pas de conclure sous une valeur de 3.
    expect(s.lqSuperieures).toBe(1)
  })

  it('reste vide sans valeur de comparaison ni résultat', () => {
    expect(statistiques(valeurs, null)).toMatchObject({ depassements: 0, frequenceDepassement: null, ratioMaxGuide: null, lqSuperieures: 0 })
    expect(statistiques([], 1)).toMatchObject({ analyses: 0, quantifies: 0, frequence: null, min: null, max: null, moyenne: null, mediane: null, p90: null })
    // Un seul résultat : pas d'écart-type.
    expect(statistiques([q('A', 2)], null)).toMatchObject({ moyenne: 2, mediane: 2, p90: 2, ecartType: null })
  })
})

describe('valeurs retenues pour un composé', () => {
  const TUBES: Cell[][] = [
    ['Paramètre', 'Unité', 'T1 CM', 'T2 CM', 'Blanc CM'],
    ['Benzène', 'µg/tube', '0,8', '<0,1', '<0,1'],
  ]
  const l = lireGrille(TUBES, 'support')
  const benzene = l.parametres.CM[0]

  it('garde les échantillons demandés, dans les unités du laboratoire', () => {
    expect(valeursCompose(l, benzene, ['T1', 'T2'], null)).toEqual([
      { echantillon: 'T1', valeur: 0.8, inferieur: false },
      { echantillon: 'T2', valeur: 0.1, inferieur: true },
    ])
  })

  it('convertit en concentration et écarte un tube sans volume prélevé', () => {
    // T1 : 0,5 L/min × 40 min = 20 L = 0,02 m³ ; 0,8 µg / 0,02 m³ = 40 µg/m³. T2 : pas de durée.
    const prelevements = { T1: { debitDebut: 0.5, debitFin: 0.5, duree: 40 }, T2: { debitDebut: 0.5, debitFin: null, duree: null } }
    const v = valeursCompose(l, benzene, ['T1', 'T2'], { prelevements, unite: 'µg/m³' })
    expect(v).toHaveLength(1)
    expect(v[0].echantillon).toBe('T1')
    expect(v[0].valeur).toBeCloseTo(40)
  })
})
