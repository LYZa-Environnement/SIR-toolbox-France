import { describe, expect, it } from 'vitest'
import { fusionnerLectures } from './fusion.ts'
import { LectureImpossible, lireGrille, type Cell } from './parse.ts'

// Deux fichiers d'une même campagne : Pz2 est dans les deux, le PCE est
// rendu en µg/l dans le premier et en mg/l dans le second.
const A: Cell[][] = [
  ["Désignation de l'échantillon", 'N° CAS', 'Unité', 'Pz1', 'Pz2'],
  ['Composés organohalogénés volatils', null, null, null, null],
  ['Tétrachloroéthylène', '127-18-4', 'µg/l', '12', '<0,5'],
  ['Métaux', null, null, null, null],
  ['Arsenic', '7440-38-2', 'mg/l', '0,004', '0,002'],
]
const B: Cell[][] = [
  ["Désignation de l'échantillon", 'N° CAS', 'Unité', 'Pz2', 'Pz3'],
  ['Composés organohalogénés volatils', null, null, null, null],
  ['Tétrachloroéthylène', '127-18-4', 'mg/l', '<0,0005', '0,003'],
  ['Métaux', null, null, null, null],
  ['Arsenic', '7440-38-2', 'mg/l', '0,003', '0,001'],
  ['BTEX', null, null, null, null],
  ['Benzène', '71-43-2', 'µg/l', '<0,5', '1,5'],
]

describe('fusion de plusieurs fichiers d’une campagne', () => {
  const { lecture: l, notes } = fusionnerLectures([
    { lecture: lireGrille(A, 'tout'), nom: 'A.xlsx' },
    { lecture: lireGrille(B, 'tout'), nom: 'B.xlsx' },
  ])
  const cle = (nom: string) => l.parametres.CM.find((p) => p.nom === nom)!.cle

  it('une colonne par échantillon, une ligne par paramètre', () => {
    expect(l.points.map((p) => p.nom)).toEqual(['Pz1', 'Pz2', 'Pz3'])
    expect(l.parametres.CM.map((p) => p.nom)).toEqual(['Tétrachloroéthylène', 'Arsenic', 'Benzène'])
  })

  it('convertit dans l’unité du premier fichier', () => {
    expect(l.parametres.CM[0].unite).toBe('µg/l')
    // 0,003 mg/l = 3 µg/l, sans reste d'arrondi binaire.
    expect(l.valeurs.CM.Pz3[cle('Tétrachloroéthylène')]).toEqual({ brut: '3', valeur: 3, inferieur: false })
  })

  it('garde le premier fichier quand les deux donnent un résultat, et le signale s’ils diffèrent', () => {
    // PCE de Pz2 : <0,5 µg/l et <0,0005 mg/l sont le même résultat.
    expect(l.valeurs.CM.Pz2[cle('Tétrachloroéthylène')]).toMatchObject({ valeur: 0.5, inferieur: true })
    // Arsenic de Pz2 : 0,002 puis 0,003 mg/l.
    expect(l.valeurs.CM.Pz2[cle('Arsenic')].valeur).toBe(0.002)
    expect(notes.join('\n')).toMatch(/1 résultat donné différemment .*Arsenic, Pz2 : 0,002 \/ 0,003/)
    expect(notes.join('\n')).toMatch(/1 échantillon présent dans plusieurs fichiers/)
    expect(notes.join('\n')).toMatch(/1 paramètre rendu dans une autre unité/)
  })

  it('rend un fichier seul tel quel', () => {
    const lu = lireGrille(A, 'tout')
    expect(fusionnerLectures([{ lecture: lu, nom: 'A.xlsx' }])).toEqual({ lecture: lu, notes: [] })
  })

  it('refuse de réunir des masses par support et des concentrations', () => {
    const tubes: Cell[][] = [
      ['Paramètre', 'Unité', 'T1 CM'],
      ['Benzène', 'µg/tube', '0,8'],
    ]
    expect(() =>
      fusionnerLectures([
        { lecture: lireGrille(A, 'tout'), nom: 'A.xlsx' },
        { lecture: lireGrille(tubes, 'support'), nom: 'tubes.xlsx' },
      ]),
    ).toThrow(LectureImpossible)
  })
})
