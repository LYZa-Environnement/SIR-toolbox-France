import { describe, expect, it } from 'vitest'
import { analyser, REGLAGES_DEFAUT } from './analyse.ts'
import { exemple } from './exemple.ts'
import { lireHistorique, lotsHistorique } from './historique.ts'
import { construireBase, CORRECTIONS_VIDES, placerLots } from './modele.ts'

// Le jeu d'exemple est construit avec des évolutions connues : déchloration à la
// source (PZ2), arrivée d'un panache sur PZ4 en 2022, atténuation des BTEX sur PZ5.
function analyseExemple(reglages = REGLAGES_DEFAUT) {
  const f = exemple()
  const base = construireBase({ lots: f.lots, campagnes: placerLots([], f.lots), releves: f.releves, ouvragesDecrits: f.ouvrages, corrections: CORRECTIONS_VIDES })
  return analyser(base, CORRECTIONS_VIDES, reglages)
}

const serie = (a: ReturnType<typeof analyseExemple>, ouvrage: string, compose: string) =>
  a.series.find((s) => s.ouvrage.nom === ouvrage && s.compose.nom === compose)!

describe('analyse du jeu d’exemple', () => {
  const a = analyseExemple()

  it('regroupe les campagnes et les ouvrages', () => {
    expect(a.campagnes).toHaveLength(14)
    expect(a.ouvrages.map((o) => o.nom).sort()).toEqual(['PZ1', 'PZ2', 'PZ3', 'PZ4', 'PZ5'])
  })

  it('retrouve les tendances construites', () => {
    expect(serie(a, 'PZ2', 'Tétrachloroéthylène').classe).toBe('baisse')
    expect(serie(a, 'PZ2', 'Chlorure de vinyle').classe).toBe('hausse')
    expect(serie(a, 'PZ5', 'Benzène').classe).toBe('baisse')
    expect(serie(a, 'PZ1', 'Tétrachloroéthylène').classe).toBe('non-quantifie')
  })

  it('situe le saut de niveau du TCE sur PZ4 entre septembre 2021 et mars 2022', () => {
    expect(serie(a, 'PZ4', 'Trichloroéthylène').rupture?.entre).toEqual(['2021-09-17', '2022-03-12'])
  })

  it('signale le résultat douteux de PZ3', () => {
    expect(serie(a, 'PZ3', 'Tétrachloroéthylène').points.filter((p) => p.atypique).map((p) => p.date)).toEqual(['2021-09-17'])
  })

  it('calcule le sens d’écoulement d’après les cotes', () => {
    expect(a.ecoulement!.azimutMoyen).toBeGreaterThan(135)
    expect(a.ecoulement!.azimutMoyen).toBeLessThan(200)
    expect(a.ecoulement!.ordre[0].ouvrage.nom).toBe('PZ1')
  })

  it("ne propose jamais l'abandon de l'ouvrage amont ni d'une substance au-dessus de sa référence", () => {
    expect(a.pistes.some((p) => p.cible === 'PZ1' && (p.type === 'alleger' || p.type === 'retirer'))).toBe(false)
    expect(a.pistes.some((p) => p.cible === 'Benzène' && p.type === 'retirer')).toBe(false)
    expect(a.pistes.some((p) => p.cible === 'Tétrachlorure de carbone' && p.type === 'retirer')).toBe(true)
  })

  it('remplit la grille du guide 2022', () => {
    const point = (code: string) => a.grille.find((g) => g.code === code)!
    expect(point('2.a').statut).toBe('ok')
    expect(point('4.6').statut).toBe('non')
    expect(point('A').statut).toBe('ok')
  })

  it('détecte un effet rebond après l’arrêt d’un traitement', () => {
    const r = analyseExemple({ ...REGLAGES_DEFAUT, finTraitement: '2022-01-01' })
    expect(r.rebonds!.campagnesApres).toBe(8)
    expect(r.rebonds!.series.map((s) => s.compose.nom)).toContain('Chlorure de vinyle')
  })
})

describe('tableau historique', () => {
  it('lit un résultat < LQ et regroupe par campagne', () => {
    const grille = [
      ['Ouvrage', 'Date', 'Paramètre', 'Unité', 'Résultat'],
      ['PZ1', '15/03/2021', 'Benzène', 'µg/l', '<0,5'],
      ['PZ2', '15/03/2021', 'Benzène', 'µg/l', 12],
      ['PZ1', '20/09/2021', 'Benzène', 'µg/l', 0.8],
    ]
    const h = lireHistorique([{ nom: 'Résultats', grille }])!
    expect(h.lignes).toHaveLength(3)
    expect(h.lignes[0].mesure).toMatchObject({ valeur: 0.5, inferieur: true })
    const lots = lotsHistorique(h)
    expect(lots.map((l) => l.date)).toEqual(['2021-03-15', '2021-09-20'])
  })
})
