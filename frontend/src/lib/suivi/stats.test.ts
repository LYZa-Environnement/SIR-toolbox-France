import { describe, expect, it } from 'vitest'
import { anneeDecimale, dateDepuisAnnee, kendallSaisonnier, kendallTau, lowess, mannKendall, pettitt, phi, phiInverse, sen } from './stats.ts'

describe('loi normale', () => {
  it('donne les quantiles usuels', () => {
    expect(phi(1.96)).toBeCloseTo(0.975, 4)
    expect(phiInverse(0.975)).toBeCloseTo(1.959964, 5)
  })
})

describe('test de Mann-Kendall', () => {
  it('utilise la loi exacte de S pour une série courte sans ex aequo', () => {
    // 4 valeurs croissantes : S = 6, une seule permutation sur 4! = 24 l'atteint.
    const mk = mannKendall([1, 2, 3, 4])!
    expect(mk.S).toBe(6)
    expect(mk.exact).toBe(true)
    expect(mk.pUnilateral).toBeCloseTo(1 / 24, 10)
    // 5 valeurs croissantes : 1 / 5! = 1 / 120.
    expect(mannKendall([1, 2, 3, 4, 5])!.pUnilateral).toBeCloseTo(1 / 120, 10)
  })

  it('corrige la variance des ex aequo', () => {
    // [1, 1, 2, 2, 3] : deux groupes de 2 ex aequo.
    // Var(S) = [5·4·15 − 2 × 2·1·9] / 18 = (300 − 36) / 18 = 14,667 ; S = 8.
    const mk = mannKendall([1, 1, 2, 2, 3])!
    expect(mk.S).toBe(8)
    expect(mk.varS).toBeCloseTo(264 / 18, 6)
    expect(mk.exact).toBe(false)
  })

  it('applique la correction de continuité à Z', () => {
    // n = 12 sans ex aequo : Var(S) = 12·11·29 / 18 = 212,667 ; S = 56 ; Z = 55 / √212,667.
    const mk = mannKendall([5, 4, 3, 6, 8, 7, 9, 10, 12, 11, 13, 15])!
    expect(mk.S).toBe(56)
    expect(mk.varS).toBeCloseTo(212.6667, 3)
    expect(mk.Z).toBeCloseTo(55 / Math.sqrt(212.6667), 4)
  })

  it('ne conclut à rien pour une série constante', () => {
    const mk = mannKendall([2, 2, 2, 2, 2])!
    expect(mk.S).toBe(0)
    expect(mk.pBilateral).toBe(1)
  })
})

describe('pente de Theil-Sen', () => {
  it('retrouve une droite exacte, en unité par an', () => {
    const t = [2020, 2020.5, 2021, 2021.5, 2022, 2022.5]
    const x = t.map((v) => 2 * v + 1)
    const s = sen(t, x, mannKendall(x)!.varS)!
    expect(s.pente).toBeCloseTo(2, 10)
    expect(s.ordonnee).toBeCloseTo(1, 6)
  })
})

describe('test de Pettitt', () => {
  it("situe un saut de niveau et son sens", () => {
    // Cinq valeurs autour de 1 puis cinq autour de 5 : K = 25, p = 2·exp(−6·625 / (1000 + 100)).
    const p = pettitt([1, 1.2, 0.9, 1.1, 1, 5, 5.2, 4.9, 5.1, 5])!
    expect(p.indice).toBe(4)
    expect(p.hausse).toBe(true)
    expect(p.K).toBe(25)
    expect(p.p).toBeCloseTo(2 * Math.exp((-6 * 625) / 1100), 10)
  })
})

describe('Kendall saisonnier, corrélation et lissage', () => {
  it('additionne S et Var(S) des saisons', () => {
    const ks = kendallSaisonnier([
      { saison: 'HE', t: [1, 2, 3, 4], x: [1, 2, 3, 4] },
      { saison: 'BE', t: [1.5, 2.5, 3.5, 4.5], x: [2, 3, 4, 5] },
    ])!
    // Chaque saison : S = 6, Var(S) = 4·3·13 / 18 = 8,667.
    expect(ks.S).toBe(12)
    expect(ks.varS).toBeCloseTo(2 * (156 / 18), 6)
    expect(ks.pente).toBe(1)
  })

  it('donne un tau de Kendall de 1 pour deux séries concordantes', () => {
    expect(kendallTau([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])!.tau).toBe(1)
  })

  it('laisse une droite inchangée au lissage LOWESS', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8]
    lowess(x, x).forEach((v, i) => expect(v).toBeCloseTo(x[i], 6))
  })
})

describe('dates en années décimales', () => {
  it('fait l’aller-retour', () => {
    expect(anneeDecimale('2024-07-02')).toBeCloseTo(2024.5, 10)
    expect(dateDepuisAnnee(anneeDecimale('2023-03-15'))).toBe('2023-03-15')
  })
})
