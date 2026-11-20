import { describe, expect, test } from 'vitest'
import { exemples, temps } from './exemple.ts'
import { bruitDe, construireProfil, cpiBrayEvans, distributionFractions, distributionProfil, indicateursProfil, ligneDeBase, versCarbone } from './profil.ts'

const ex = (id: string) => exemples().find((e) => e.id === id)!

describe('axe des carbones', () => {
  test('interpolation linéaire entre les repères, prolongée au-delà', () => {
    // C10 at 2 min, C40 at 32 min: one carbon per minute.
    const f = versCarbone([
      { x: 2, c: 10 },
      { x: 32, c: 40 },
    ])
    expect(f(17)).toBeCloseTo(25)
    expect(f(0)).toBeCloseTo(8)
  })

  test('repères dans le désordre refusés', () => {
    expect(() =>
      versCarbone([
        { x: 2, c: 40 },
        { x: 32, c: 10 },
      ]),
    ).toThrow()
  })

  test('le recalage sur la série corrige un programme de four courbe', () => {
    // On the straight line between the markers, n-C25 reads at about C24.1
    // (temps() is curved); after refinement it sits on 25.
    const lu = versCarbone(ex('gazole').calage)(temps(25))
    expect(lu).toBeLessThan(24.3)
    const p = construireProfil(ex('gazole').trace, ex('gazole').calage)
    expect(p.recalage).toBeGreaterThanOrEqual(5)
    for (const n of [12, 16, 20, 24]) expect(p.alcanes[n]!.c).toBeCloseTo(n, 1)
  })
})

describe('ligne de base et bruit', () => {
  test('enveloppe convexe inférieure : suit une dérive linéaire, passe sous une bosse', () => {
    const c = Array.from({ length: 101 }, (_, i) => i / 10)
    const y = c.map((v) => 1 + 0.1 * v + 3 * Math.exp(-((v - 5) ** 2)))
    const base = ligneDeBase(c, y)
    expect(base[0]).toBeCloseTo(1)
    expect(base[50]).toBeCloseTo(1.5, 1) // drift only, the hump stays above
    expect(base[100]).toBeCloseTo(2)
  })

  test('bruit nul sur une droite', () => {
    expect(bruitDe([1, 2, 3, 4, 5, 6])).toBe(0)
  })
})

describe('isoprénoïdes', () => {
  test('gazole frais : n-C17/Pr ≈ 2,3 et n-C18/Ph ≈ 2,2 (valeurs du générateur)', () => {
    const p = construireProfil(ex('gazole').trace, ex('gazole').calage)
    expect(p.doublets.c17).toBe('resolu')
    expect(p.pristane!.c).toBeCloseTo(17.07, 1)
    expect(p.alcanes[17]!.hauteur / p.pristane!.hauteur).toBeCloseTo(2.3, 0)
    expect(p.alcanes[18]!.hauteur / p.phytane!.hauteur).toBeCloseTo(2.2, 0)
  })

  test('gazole biodégradé à 60 % : n-C17/Pr ≈ 2,3 × 0,4 = 0,92', () => {
    const p = construireProfil(ex('gazole-degrade').trace, ex('gazole-degrade').calage)
    const r = p.alcanes[17]!.hauteur / p.pristane!.hauteur
    expect(r).toBeGreaterThan(0.8)
    expect(r).toBeLessThan(1.05)
  })

  test('sans série d’alcanes (huile) : aucun alcane ni isoprénoïde attribué', () => {
    const p = construireProfil(ex('huile').trace, ex('huile').calage)
    expect(p.recalage).toBe(0)
    expect(p.alcanes.every((a) => a === null)).toBe(true)
    expect(p.pristane).toBeNull()
  })
})

describe('distribution', () => {
  test('gazole : médiane vers C16–C17, bosse minoritaire', () => {
    const p = construireProfil(ex('gazole').trace, ex('gazole').calage)
    const d = distributionProfil(p)!
    expect(d.q50).toBeGreaterThan(15.5)
    expect(d.q50).toBeLessThan(17.5)
    expect(d.lobes).toHaveLength(1)
  })

  test('mélange gazole + huile : deux maxima', () => {
    const p = construireProfil(ex('melange').trace, ex('melange').calage)
    const d = distributionProfil(p)!
    expect(d.lobes.length).toBe(2)
    expect(d.lobes[0]).toBeLessThan(19)
    expect(d.lobes[1]).toBeGreaterThan(26)
  })

  test('fractions du laboratoire réparties sur leur plage', () => {
    // 100 between C10 and C20, 100 between C20 and C40: median at C20.
    const d = distributionFractions([
      { bas: 10, haut: 20, valeur: 100 },
      { bas: 20, haut: 40, valeur: 100 },
    ])!
    expect(d.q50).toBeCloseTo(20, 1)
    expect(d.partUcm).toBeNull()
  })
})

describe('CPI (Bray et Evans, 1961)', () => {
  test('pas de préférence : CPI = 1', () => {
    expect(cpiBrayEvans(() => 1)).toBeCloseTo(1)
  })

  test('impairs trois fois plus hauts : CPI = 3', () => {
    // Σ odd C25–C33 = 5 × 3 = 15 ; Σ even C24–C32 = 5 ; Σ even C26–C34 = 5 → ½ (3 + 3) = 3.
    expect(cpiBrayEvans((n) => (n % 2 ? 3 : 1))).toBeCloseTo(3)
  })

  test('cires végétales : CPI élevé', () => {
    const p = construireProfil(ex('vegetal').trace, ex('vegetal').calage)
    const ind = indicateursProfil(p, distributionProfil(p)!)
    expect(ind.cpi).toBeGreaterThan(3)
  })
})
