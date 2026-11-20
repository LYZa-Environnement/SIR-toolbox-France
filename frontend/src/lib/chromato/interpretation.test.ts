import { describe, expect, test } from 'vitest'
import { exemples } from './exemple.ts'
import { construireProfil, distributionFractions } from './profil.ts'
import { ageChristensenLarsen, ageKaplan, comparer, entreeDepuisProfil, interpreter, type Entree } from './interpretation.ts'

const lire = (id: string) => {
  const ex = exemples().find((e) => e.id === id)!
  const entree = entreeDepuisProfil(ex.nom, 'sol', construireProfil(ex.trace, ex.calage))
  return { entree, lecture: interpreter(entree) }
}

const saisie = (champs: Partial<Entree>): Entree => ({
  nom: 'saisie',
  matrice: 'sol',
  source: 'saisie',
  distribution: null,
  indicateurs: null,
  c17: null,
  pr: null,
  c18: null,
  ph: null,
  ...champs,
})

describe('équations de datation', () => {
  test('Christensen et Larsen : T = −8,4 R + 19,8', () => {
    expect(ageChristensenLarsen(1)).toBeCloseTo(11.4) // 19.8 − 8.4
    expect(ageChristensenLarsen(0)).toBeCloseTo(19.8)
    expect(ageChristensenLarsen(2.357)).toBeCloseTo(0, 1)
  })

  test('Kaplan : t = ln(6 / Rb) / 0,308', () => {
    expect(ageKaplan(1.5)).toBeCloseTo(Math.log(4) / 0.308) // 4.50 years
    expect(ageKaplan(6)).toBeCloseTo(0)
  })
})

describe('lecture des exemples', () => {
  test('gazole frais : gazole, pas de biodégradation, récent', () => {
    const { lecture } = lire('gazole')
    expect(lecture.produit?.id).toBe('gazole')
    expect(lecture.stade.code).toBe(0)
    const cl = lecture.ages[0]
    expect(cl.applicable).toBe(true)
    expect(cl.annees!.haut).toBeLessThanOrEqual(2)
  })

  test('gazole biodégradé : stade 1–2, une douzaine d’années', () => {
    const { lecture } = lire('gazole-degrade')
    expect(lecture.produit?.id).toBe('gazole')
    expect(lecture.stade.code).toBeGreaterThanOrEqual(1)
    expect(lecture.stade.code).toBeLessThanOrEqual(2)
    // R ≈ 0.92 → T ≈ −8.4 × 0.92 + 19.8 ≈ 12 years.
    expect(lecture.ages[0].annees!.centre).toBeGreaterThan(10)
    expect(lecture.ages[0].annees!.centre).toBeLessThan(14)
  })

  test('gazole très dégradé : stade avancé, pas d’âge calculable', () => {
    const { lecture } = lire('gazole-severe')
    expect(lecture.stade.code).toBeGreaterThanOrEqual(3)
    expect(lecture.ages[0].applicable).toBe(false)
  })

  test('huile : huile, la bosse n’est pas lue comme un vieillissement', () => {
    const { lecture } = lire('huile')
    expect(lecture.produit?.id).toBe('huile')
    expect(lecture.stade.code).toBeNull()
  })

  test('mélange : deux maxima signalés, âge calculé sur la part gazole', () => {
    const { lecture } = lire('melange')
    expect(lecture.melange).not.toBeNull()
    expect(lecture.ages[0].applicable).toBe(true)
  })

  test('cires végétales : signature biogène, pas de produit pétrolier retenu', () => {
    const { lecture } = lire('vegetal')
    expect(lecture.produit).toBeNull()
    expect(lecture.origine.some((o) => o.niveau === 'fort' && /végétales/.test(o.texte))).toBe(true)
  })
})

describe('saisie des valeurs du laboratoire', () => {
  test('teneurs n-C17 et pristane d’un gazole : stade et âge', () => {
    // R = 50 / 50 = 1 → 11.4 years ; 1 / 2.3 = 43 % of a fresh diesel → stage 1.
    const l = interpreter(saisie({ c17: 50, pr: 50, produitImpose: 'gazole' }))
    expect(l.stade.code).toBe(1)
    expect(l.ages[0].annees!.centre).toBeCloseTo(11.4)
  })

  test('plomb présent : antérieur à 2000', () => {
    const l = interpreter(saisie({ plomb: 'oui' }))
    expect(l.ages.some((a) => /2000/.test(a.valeur))).toBe(true)
  })

  test('fractions : profil léger → fraction légère, analyses volatiles proposées', () => {
    const d = distributionFractions([
      { bas: 10, haut: 12, valeur: 900 },
      { bas: 12, haut: 16, valeur: 100 },
    ])!
    const l = interpreter(saisie({ source: 'fractions', distribution: d }))
    expect(l.candidats[0].produit.id).toBe('leger')
    expect(l.suites.some((s) => /C5–C10/.test(s.texte))).toBe(true)
  })

  test('eau avec bosse lourde : purification sur gel de silice proposée', () => {
    const { entree } = lire('huile')
    const l = interpreter({ ...entree, matrice: 'eau' })
    expect(l.suites.some((s) => /gel de silice/.test(s.texte))).toBe(true)
  })

  test('indice proche de la LQ signalé', () => {
    const l = interpreter(saisie({ hct: 80, lq: 50 }))
    expect(l.qualite.some((q) => q.niveau === 'attention')).toBe(true)
  })
})

describe('comparaison entre échantillons', () => {
  test('même gazole frais et dégradé : correspondance probable, écarts attribués à la dégradation', () => {
    const a = lire('gazole')
    const b = lire('gazole-degrade')
    const c = comparer(a.entree, b.entree, a.lecture, b.lecture)
    expect(['correspondance', 'probable']).toContain(c.niveau)
    expect(c.prPh![0]).toBeCloseTo(c.prPh![1], 0)
  })

  test('gazole et huile : pas de correspondance', () => {
    const a = lire('gazole')
    const b = lire('huile')
    expect(comparer(a.entree, b.entree, a.lecture, b.lecture).niveau).toBe('aucune')
  })
})
