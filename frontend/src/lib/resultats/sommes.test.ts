import { describe, expect, it } from 'vitest'
import { lireGrille, type Cell } from './parse.ts'
import { ajouterSommesCalculees } from './sommes.ts'

// Sols, HAP en mg/kg MS. S1 a des valeurs quantifiées, S2 n'en a aucune.
const HAP: Cell[][] = [
  ["Désignation de l'échantillon", 'N° CAS', 'Unité', 'S1', 'S2'],
  ['Hydrocarbures aromatiques polycycliques', null, null, null, null],
  ['Naphtalène', '91-20-3', 'mg/kg MS', '1,2', '<0,05'],
  ['Fluoranthène', '206-44-0', 'mg/kg MS', '0,5', '<0,05'],
  ['Benzo(b)fluoranthène', '205-99-2', 'mg/kg MS', '0,2', '<0,05'],
  ['Benzo(k)fluoranthène', '207-08-9', 'mg/kg MS', '<0,05', '<0,05'],
  ['Benzo(a)pyrène', '50-32-8', 'mg/kg MS', '0,1', '<0,05'],
  ['Benzo(g,h,i)pérylène', '191-24-2', 'mg/kg MS', '<0,05', '<0,05'],
  ['Indéno(1,2,3-cd)pyrène', '193-39-5', 'mg/kg MS', '0,1', '<0,05'],
]

describe('sommes de HAP calculées', () => {
  const l = ajouterSommesCalculees(lireGrille(HAP, 'tout'))
  const somme = (nom: string) => l.parametres.CM.find((p) => p.nom === nom)!

  it('ajoute les sommes de 4 et 6 HAP après leur dernier composant', () => {
    const noms = l.parametres.CM.map((p) => p.nom)
    expect(noms.slice(-2).sort()).toEqual(['Somme de 4 HAP (calculée)', 'Somme de 6 HAP (calculée)'])
    expect(noms.indexOf('Indéno(1,2,3-cd)pyrène')).toBe(noms.length - 3)
    expect(somme('Somme de 6 HAP (calculée)')).toMatchObject({ somme: true, unite: 'mg/kg MS' })
  })

  it('additionne les seules valeurs quantifiées', () => {
    // 6 HAP : fluoranthène 0,5 + B(b)F 0,2 + B(a)P 0,1 + indéno 0,1 = 0,9 ; les <LQ ne comptent pas.
    const six = l.valeurs.CM.S1[somme('Somme de 6 HAP (calculée)').cle]
    expect(six.valeur).toBeCloseTo(0.9)
    expect(six).toMatchObject({ brut: '0,9', inferieur: false })
    // 4 HAP : B(b)F 0,2 + indéno 0,1 = 0,3 (B(k)F et B(ghi)P < LQ) ; le naphtalène n'en fait pas partie.
    const quatre = l.valeurs.CM.S1[somme('Somme de 4 HAP (calculée)').cle]
    expect(quatre.valeur).toBeCloseTo(0.3)
    expect(quatre).toMatchObject({ brut: '0,3', inferieur: false })
  })

  it('rend « < somme des LQ » quand rien n’est quantifié', () => {
    // 6 × 0,05 = 0,3 et 4 × 0,05 = 0,2.
    expect(l.valeurs.CM.S2[somme('Somme de 6 HAP (calculée)').cle]).toMatchObject({ brut: '<0,3', inferieur: true })
    expect(l.valeurs.CM.S2[somme('Somme de 4 HAP (calculée)').cle]).toMatchObject({ brut: '<0,2', inferieur: true })
  })

  it('ne double pas une somme déjà donnée par le laboratoire', () => {
    const avecSomme = [...HAP, ['Somme de 6 HAP', null, 'mg/kg MS', '0,9', '<0,3']]
    const noms = ajouterSommesCalculees(lireGrille(avecSomme, 'tout')).parametres.CM.map((p) => p.nom)
    expect(noms).not.toContain('Somme de 6 HAP (calculée)')
    expect(noms).toContain('Somme de 4 HAP (calculée)')
  })

  it('ne fait rien sans aucun des composants', () => {
    const sansHap = HAP.slice(0, 3)
    const lu = lireGrille(sansHap, 'tout')
    expect(ajouterSommesCalculees(lu).parametres.CM).toEqual(lu.parametres.CM)
  })
})
