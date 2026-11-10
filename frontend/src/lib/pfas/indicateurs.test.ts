import { describe, expect, it } from 'vitest'
import { composition, fluorCible, indicateurs } from './indicateurs.ts'
import { facteurUnite, identifier, ordreNaturel, sommer, type EchantillonPfas, type Valeur } from './lecture.ts'
import { fractionFluor, masseMolaire, PAR_ID, VINGT } from './substances.ts'

const v = (valeur: number, inferieur = false): Valeur => ({ valeur, inferieur, brut: '' })
const echantillon = (substances: EchantillonPfas['substances']): EchantillonPfas => ({
  nom: 'Pz1',
  type: 'echantillon',
  substances,
  isomeres: {},
  somme: null,
  sommeCalculee: true,
  aof: null,
  eof: null,
})

describe('substances PFAS', () => {
  it('compte les 20 PFAS de la directive (UE) 2020/2184', () => {
    expect(VINGT).toHaveLength(20)
    expect(VINGT.every((s) => s.famille === 'PFCA' || s.famille === 'PFSA')).toBe(true)
  })

  it('calcule masse molaire et fraction de fluor depuis la formule', () => {
    // PFOA, C8HF15O2 : 414,07 g/mol, 68,8 % de fluor.
    expect(masseMolaire(PAR_ID.PFOA)).toBeCloseTo(414.07, 1)
    expect(fractionFluor(PAR_ID.PFOA)).toBeCloseTo(0.688, 3)
  })
})

describe('lecture des résultats du laboratoire', () => {
  it('reconnaît les substances par abréviation, nom ou n° CAS', () => {
    expect(identifier({ nom: 'PFOS', cas: '' })).toMatchObject({ genre: 'substance', id: 'PFOS' })
    expect(identifier({ nom: 'Acide perfluorooctanoïque', cas: '' })).toMatchObject({ genre: 'substance', id: 'PFOA' })
    expect(identifier({ nom: 'Perfluoro-n-butanoic acid', cas: '' })).toMatchObject({ genre: 'substance', id: 'PFBA' })
    expect(identifier({ nom: 'quelconque', cas: '76-05-1' })).toMatchObject({ genre: 'substance', id: 'TFA' })
    expect(identifier({ nom: 'Somme des 20 PFAS', cas: '' })).toEqual({ genre: 'somme20' })
    expect(identifier({ nom: 'PFOS linéaire', cas: '' })).toMatchObject({ id: 'PFOS', isomere: 'lineaire' })
  })

  it('ramène les unités en ng/l (eau) ou µg/kg (sol)', () => {
    expect(facteurUnite('µg/l', 'eau')).toBe(1000)
    expect(facteurUnite('ng/l', 'eau')).toBe(1)
    expect(facteurUnite('ng/g MS', 'sol')).toBe(1)
    expect(facteurUnite('mg/kg', 'sol')).toBe(1000)
    expect(facteurUnite('µg/kg', 'eau')).toBeNull()
  })

  it('somme les valeurs quantifiées, ou les LQ quand rien n’est quantifié', () => {
    expect(sommer([v(10), v(5, true), v(2)])).toEqual({ valeur: 12, inferieur: false, brut: '' })
    expect(sommer([v(5, true), v(2, true)])).toEqual({ valeur: 7, inferieur: true, brut: '' })
    expect(sommer([])).toBeNull()
  })

  it('classe les ouvrages dans l’ordre naturel', () => {
    expect(['Pz10', 'Pz2', 'pz1'].sort(ordreNaturel)).toEqual(['pz1', 'Pz2', 'Pz10'])
  })
})

describe('indicateurs de composition', () => {
  const e = echantillon({ PFOS: v(60), PFOA: v(20), PFHxS: v(15), PFBA: v(5), PFNA: v(1, true), TFA: v(500) })

  it('somme les 20 sans le TFA ni les valeurs sous la LQ', () => {
    const c = composition(e)
    expect(c.total20).toBe(100)
    expect(c.quantifiees).toBe(4)
    expect(c.parts[0]).toMatchObject({ id: 'PFOS', part: 0.6 })
  })

  it('calcule la part des sulfonates et le rapport PFOS / PFOA', () => {
    const is = Object.fromEntries(indicateurs(e, 'eau').map((i) => [i.id, i]))
    expect(is.sulfonates.valeur).toBeCloseTo(0.75)
    expect(is.pfosPfoa.valeur).toBeCloseTo(3)
    expect(is.pfhxsPfos.valeur).toBeCloseTo(0.25)
  })

  it('ne calcule pas un rapport dont le dénominateur n’est pas quantifié', () => {
    const i = indicateurs(echantillon({ PFOS: v(10), PFOA: v(2, true) }), 'eau').find((x) => x.id === 'pfosPfoa')!
    expect(i.valeur).toBeNull()
    expect(i.raison).toMatch(/PFOA non quantifié/)
  })

  it('calcule le fluor porté par les substances', () => {
    expect(fluorCible(echantillon({ PFOA: v(100) }))).toBeCloseTo(100 * fractionFluor(PAR_ID.PFOA))
  })
})
