import { describe, expect, it } from 'vitest'
import { convertir, formatConcentration, lireNombre, volumeLitres } from './calc.ts'
import { LectureImpossible, lireClasseur, lireGrille, lireMesure, type Cell } from './parse.ts'

describe('lecture des valeurs', () => {
  it('lit les écritures usuelles des laboratoires', () => {
    expect(lireMesure('<0,2')).toEqual({ brut: '<0,2', valeur: 0.2, inferieur: true })
    expect(lireMesure('< 0.16')).toEqual({ brut: '< 0.16', valeur: 0.16, inferieur: true })
    expect(lireMesure('1 700')).toMatchObject({ valeur: 1700, inferieur: false })
    expect(lireMesure(3.6)).toMatchObject({ valeur: 3.6, inferieur: false })
    expect(lireMesure('n.d.')).toBeNull()
    expect(lireMesure('-/-')).toBeNull()
    expect(lireMesure('voir note')).toBeNull()
  })
})

// Eaux souterraines, disposition proche d'un rapport ALS / Eurofins :
// en-têtes, une ligne de noms d'échantillons, une colonne d'unités, des familles.
const EAU: Cell[][] = [
  ['Rapport 2026-001', null, null, null, null],
  ["Désignation de l'échantillon", 'N° CAS', 'Unité', 'Pz1', 'Pz2'],
  ['Composés organohalogénés volatils', null, null, null, null],
  ['Tétrachloroéthylène', '127-18-4', 'µg/l', '12', '<0,5'],
  ['Trichloroéthylène', '79-01-6', 'µg/l', '3,4', '<0,5'],
  ['Métaux', null, null, null, null],
  ['Arsenic', '7440-38-2', 'mg/l', '0,004', 'n.d.'],
  ["Date d'extraction", null, null, '2026-10-01', '2026-10-01'],
]

describe('lecture d’un rapport de laboratoire', () => {
  const l = lireGrille(EAU, 'tout')

  it('trouve les échantillons, les paramètres, les familles et les n° CAS', () => {
    expect(l.points.map((p) => p.nom)).toEqual(['Pz1', 'Pz2'])
    expect(l.parametres.CM.map((p) => p.nom)).toEqual(['Tétrachloroéthylène', 'Trichloroéthylène', 'Arsenic'])
    expect(l.parametres.CM[0]).toMatchObject({ famille: 'Composés organohalogénés volatils', cas: '127-18-4', unite: 'µg/l' })
    expect(l.parametres.CM[2]).toMatchObject({ famille: 'Métaux', versMicrogrammes: 1000 })
  })

  it('rattache chaque valeur à son échantillon et garde les <LQ', () => {
    const pce = l.parametres.CM[0].cle
    expect(l.valeurs.CM.Pz1[pce]).toMatchObject({ valeur: 12, inferieur: false })
    expect(l.valeurs.CM.Pz2[pce]).toMatchObject({ valeur: 0.5, inferieur: true })
    // "n.d." : pas de valeur.
    expect(l.valeurs.CM.Pz2[l.parametres.CM[2].cle]).toBeUndefined()
  })

  it('choisit dans un classeur l’onglet qui se lit le mieux', () => {
    const lu = lireClasseur(
      [
        { nom: 'Garde', grille: [['Laboratoire'], ['Client : ERM']] },
        { nom: 'Résultats', grille: EAU },
      ],
      'tout',
    )
    expect(lu.feuille).toBe('Résultats')
  })

  it('refuse un fichier sans résultats', () => {
    expect(() => lireGrille([['Bonjour'], ['Rien ici']], 'tout')).toThrow(LectureImpossible)
  })
})

// Gaz du sol sur tubes : masses par support, zones de mesure et de contrôle.
const TUBES: Cell[][] = [
  ['Paramètre', 'Unité', 'PzaB CM', 'PzaB CC'],
  ['Benzène', 'µg/tube', '0,8', '<0,1'],
  ['Toluène', 'µg/tube', '2,4', '0,2'],
]

describe('gaz du sol : tubes et conversion en concentration', () => {
  it('réunit les deux zones d’un même tube', () => {
    const l = lireGrille(TUBES, 'support')
    expect(l.points.map((p) => p.nom)).toEqual(['PzaB'])
    expect(l.coucheControle).toBe(true)
    expect(l.valeurs.CC.PzaB[l.parametres.CC[1].cle]).toMatchObject({ valeur: 0.2 })
  })

  it('convertit µg/tube en µg/m³ avec le volume prélevé', () => {
    // (0,2 + 0,2) / 2 L/min × 100 min = 20 L = 0,02 m³ ; 0,8 µg / 0,02 m³ = 40 µg/m³.
    const l = lireGrille(TUBES, 'support')
    const volume = volumeLitres({ debitDebut: 0.2, debitFin: 0.2, duree: 100 })
    expect(volume).toBeCloseTo(20)
    const benzene = l.parametres.CM[0]
    expect(convertir(l.valeurs.CM.PzaB[benzene.cle], benzene, volume, 'µg/m³')!.valeur).toBeCloseTo(40)
    expect(convertir(l.valeurs.CM.PzaB[benzene.cle], benzene, volume, 'mg/m³')!.valeur).toBeCloseTo(0.04)
  })

  it('met en forme comme le tableau exporté', () => {
    expect(formatConcentration({ valeur: 40, inferieur: false })).toBe('40,0')
    expect(formatConcentration({ valeur: 0.123, inferieur: true })).toBe('<0,12')
    expect(lireNombre('1,25')).toBe(1.25)
    expect(lireNombre('')).toBeNull()
  })
})
