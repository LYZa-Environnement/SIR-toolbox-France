import { describe, expect, it } from 'vitest'
import { ordonnerCOHV } from './cohv.ts'
import { lireGrille, type Cell } from './parse.ts'

// Ordre alphabétique du laboratoire, COHV entre deux autres familles.
const GRILLE: Cell[][] = [
  ["Désignation de l'échantillon", 'Unité', 'Pz1'],
  ['BTEX', null, null],
  ['Benzène', 'µg/l', '1'],
  ['Composés organohalogénés volatils', null, null],
  ['1,1,1-Trichloroéthane', 'µg/l', '<0,5'],
  ['1,1-Dichloroéthane', 'µg/l', '<0,5'],
  ['Chlorure de vinyle', 'µg/l', '0,8'],
  ['Chloroforme', 'µg/l', '<0,5'],
  ['cis-1,2-Dichloroéthène', 'µg/l', '4'],
  ['Hexachlorobutadiène', 'µg/l', '<0,5'],
  ['Somme des COHV', 'µg/l', '17'],
  ['Tétrachloroéthylène', 'µg/l', '10'],
  ['Tétrachlorométhane', 'µg/l', '<0,5'],
  ['Trichloroéthylène', 'µg/l', '2'],
  ['Métaux', null, null],
  ['Arsenic', 'µg/l', '3'],
]

describe('COHV dans l’ordre de la déchloration', () => {
  const avant = lireGrille(GRILLE, 'tout')
  const apres = ordonnerCOHV(avant).parametres.CM

  it('range chaque chaîne du composé parent aux produits de dégradation', () => {
    expect(apres.map((p) => p.nom)).toEqual([
      'Benzène',
      // PCE → TCE → cis-DCE → CV
      'Tétrachloroéthylène',
      'Trichloroéthylène',
      'cis-1,2-Dichloroéthène',
      'Chlorure de vinyle',
      // 1,1,1-TCA → 1,1-DCA
      '1,1,1-Trichloroéthane',
      '1,1-Dichloroéthane',
      // tétrachlorure de carbone → chloroforme
      'Tétrachlorométhane',
      'Chloroforme',
      // ni chaîne ni somme, puis les sommes
      'Hexachlorobutadiène',
      'Somme des COHV',
      'Arsenic',
    ])
  })

  it('donne une famille par chaîne, sans toucher aux clés', () => {
    const famille = (nom: string) => apres.find((p) => p.nom === nom)!.famille
    expect(famille('Tétrachloroéthylène')).toBe('COHV — Chloroéthènes')
    expect(famille('1,1-Dichloroéthane')).toBe('COHV — Chloroéthanes')
    expect(famille('Chloroforme')).toBe('COHV — Chlorométhanes')
    expect(famille('Hexachlorobutadiène')).toBe('COHV — Autres')
    expect(famille('Somme des COHV')).toBe('COHV — Sommes')
    expect(famille('Benzène')).toBe(avant.parametres.CM[0].famille)
    expect(new Set(apres.map((p) => p.cle))).toEqual(new Set(avant.parametres.CM.map((p) => p.cle)))
  })

  it('laisse un tableau sans COHV tel quel', () => {
    const sans = lireGrille(GRILLE.filter((l) => !/chlor|cohv|halog/i.test(String(l[0]))), 'tout')
    expect(ordonnerCOHV(sans).parametres.CM).toBe(sans.parametres.CM)
  })
})
