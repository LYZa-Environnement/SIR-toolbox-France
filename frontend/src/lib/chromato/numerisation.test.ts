import { describe, expect, test } from 'vitest'
import { exemples, temps } from './exemple.ts'
import { couleurFond, couleurTrace, extraireTrace, lireTraceTexte, type Pixels } from './numerisation.ts'
import { construireProfil } from './profil.ts'
import { entreeDepuisProfil, interpreter } from './interpretation.ts'

/** White image with a polyline drawn in black: a peak drawn as the vertical run between two columns. */
function dessiner(l: number, h: number, hauteurs: number[], options: { grille?: number; marqueur?: number } = {}): Pixels {
  const data = new Uint8ClampedArray(l * h * 4).fill(255)
  const allumer = (x: number, y: number, v = 0) => {
    if (x < 0 || x >= l || y < 0 || y >= h) return
    const i = (y * l + x) * 4
    data[i] = data[i + 1] = data[i + 2] = v
  }
  if (options.grille !== undefined) for (let x = 0; x < l; x++) allumer(x, options.grille, 0)
  if (options.marqueur !== undefined) for (let y = 0; y < h; y++) allumer(options.marqueur, y, 0)
  for (let x = 0; x < l; x++) {
    const y = h - 1 - Math.round(hauteurs[x])
    const yPrec = x > 0 ? h - 1 - Math.round(hauteurs[x - 1]) : y
    for (let k = Math.min(y, yPrec); k <= Math.max(y, yPrec); k++) allumer(x, k)
    allumer(x, y + 1) // two pixels thick
  }
  return { width: l, height: h, data }
}

describe('extraction de la trace', () => {
  test('sommet de chaque colonne, ligne de grille et repère vertical ignorés', () => {
    const l = 300
    const h = 120
    const hauteurs = Array.from({ length: l }, (_, x) => 10 + 90 * Math.exp(-0.5 * ((x - 150) / 4) ** 2))
    const img = dessiner(l, h, hauteurs, { grille: 60, marqueur: 40 })
    // Drawn with the mouse: fractional pixel coordinates.
    const cadre = { x0: 0.4, y0: 0.6, x1: l - 1.3, y1: h - 0.7 }
    const fond = couleurFond(img, cadre)
    expect(fond.r).toBeGreaterThan(240)
    const couleur = couleurTrace(img, cadre, fond)!
    const t = extraireTrace(img, cadre, couleur)
    expect(t.x.length).toBeGreaterThanOrEqual(l - 2)
    for (const x of [20, 100, 150, 200, 280]) expect(Math.abs(t.y[x] - hauteurs[x])).toBeLessThanOrEqual(1.5)
    // The marker column is interpolated from its neighbours, not read as a peak.
    expect(Math.abs(t.y[40] - hauteurs[40])).toBeLessThanOrEqual(1.5)
  })
})

describe('trace numérique', () => {
  test('virgule décimale et point-virgule, ou point et virgule', () => {
    const lignes = Array.from({ length: 25 }, (_, i) => `${(i / 10).toString().replace('.', ',')};${i * 2}`)
    const t = lireTraceTexte(['Temps;Signal', ...lignes].join('\n'))
    expect(t.x[3]).toBeCloseTo(0.3)
    expect(t.y[3]).toBe(6)
    const t2 = lireTraceTexte(Array.from({ length: 25 }, (_, i) => `${i / 10},${i}`).join('\n'))
    expect(t2.x[24]).toBeCloseTo(2.4)
  })
})

describe('de l’image à la lecture', () => {
  test('gazole biodégradé dessiné puis numérisé : même produit, même âge à ± 2 ans', () => {
    const ex = exemples().find((e) => e.id === 'gazole-degrade')!
    // Plot 1 800 px wide from 1 to 34 min, 500 px high.
    const l = 1800
    const h = 500
    const t0 = 1
    const t1 = 34
    const max = Math.max(...ex.trace.y)
    const hauteurs = Array.from({ length: l }, (_, x) => {
      const t = t0 + ((t1 - t0) * x) / (l - 1)
      let i = 0
      while (i < ex.trace.x.length - 1 && ex.trace.x[i] < t) i++
      return (Math.max(0, ex.trace.y[i]) / max) * (h - 20)
    })
    const img = dessiner(l, h, hauteurs)
    const cadre = { x0: 0, y0: 0, x1: l - 1, y1: h - 1 }
    const trace = extraireTrace(img, cadre, couleurTrace(img, cadre, couleurFond(img, cadre))!)
    const colonne = (min: number) => ((min - t0) / (t1 - t0)) * (l - 1)
    const p = construireProfil(trace, [
      { x: colonne(temps(10)), c: 10 },
      { x: colonne(temps(40)), c: 40 },
    ])
    const lecture = interpreter(entreeDepuisProfil('image', 'sol', p))
    expect(lecture.produit?.id).toBe('gazole')
    const age = lecture.ages[0]
    expect(age.applicable).toBe(true)
    expect(Math.abs(age.annees!.centre - 12)).toBeLessThan(2.5)
  })
})

describe('couleur de la trace', () => {
  test('la courbe bleue l’emporte sur des repères verticaux verts aux pixels plus nombreux', () => {
    const l = 200
    const h = 100
    const data = new Uint8ClampedArray(l * h * 4).fill(255)
    const peindre = (x: number, y: number, r: number, g: number, b: number) => {
      const i = (y * l + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
    }
    // Two green markers three pixels wide over the full height: 600 pixels.
    for (const x0 of [20, 170]) for (let x = x0; x < x0 + 3; x++) for (let y = 0; y < h; y++) peindre(x, y, 0, 160, 0)
    // A blue trace one pixel thick: 200 pixels, but in every column.
    for (let x = 0; x < l; x++) peindre(x, 60 + Math.round(10 * Math.sin(x / 10)), 16, 48, 192)
    const img = { width: l, height: h, data }
    const cadre = { x0: 0, y0: 0, x1: l - 1, y1: h - 1 }
    const c = couleurTrace(img, cadre, couleurFond(img, cadre))!
    expect(c.b).toBeGreaterThan(150)
    expect(c.g).toBeLessThan(100)
  })
})
