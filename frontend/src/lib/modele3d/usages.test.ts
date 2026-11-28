import { describe, expect, it } from 'vitest'
import { lireBatiment } from './cibles.ts'
import { classerBatiment, compterUsages, resumeUsages } from './usages.ts'

const attributs = (a: Partial<Parameters<typeof classerBatiment>[0]>) => ({ usage1: null, usage2: null, nature: null, logements: null, ...a })

describe('usage des bâtiments (BD TOPO)', () => {
  it('usage principal de la BD TOPO, accents et casse indifférents', () => {
    expect(classerBatiment(attributs({ usage1: 'Résidentiel' }))).toEqual({ categorie: 'residentiel', secondaire: null, deduit: null, habite: true })
    expect(classerBatiment(attributs({ usage1: 'Commercial et services' })).categorie).toBe('commercial')
    expect(classerBatiment(attributs({ usage1: 'INDUSTRIEL' })).categorie).toBe('industriel')
    expect(classerBatiment(attributs({ usage1: 'Agricole' })).categorie).toBe('agricole')
    for (const u of ['Annexe', 'Religieux', 'Sportif']) expect(classerBatiment(attributs({ usage1: u })).categorie).toBe('autre')
  })

  it('usage mixte : le secondaire au toit, les logements font un bâtiment habité', () => {
    // Shops below, flats above: commercial, with residents.
    const c = classerBatiment(attributs({ usage1: 'Commercial et services', usage2: 'Résidentiel' }))
    expect(c).toEqual({ categorie: 'commercial', secondaire: 'residentiel', deduit: null, habite: true })
    // Dwellings counted in an industrial building (caretaker's flat).
    expect(classerBatiment(attributs({ usage1: 'Industriel', logements: 1 }))).toEqual({ categorie: 'industriel', secondaire: 'residentiel', deduit: null, habite: true })
    // Same use twice: no secondary.
    expect(classerBatiment(attributs({ usage1: 'Résidentiel', usage2: 'Résidentiel' })).secondaire).toBeNull()
  })

  it('usage indifférencié : déduit du secondaire, des logements, puis de la nature', () => {
    expect(classerBatiment(attributs({ usage1: 'Indifférencié', usage2: 'Industriel' }))).toMatchObject({ categorie: 'industriel', deduit: 'usage secondaire dans la BD TOPO' })
    expect(classerBatiment(attributs({ usage1: 'Indifférencié', logements: 4 }))).toMatchObject({ categorie: 'residentiel', habite: true, deduit: 'logements recensés dans les Fichiers fonciers' })
    expect(classerBatiment(attributs({ usage1: 'Indifférencié', nature: 'Industriel, agricole ou commercial' }))).toMatchObject({ categorie: 'activite', habite: false, deduit: 'nature du bâtiment dans la BD TOPO' })
    expect(classerBatiment(attributs({ nature: 'Serre' })).categorie).toBe('agricole')
    expect(classerBatiment(attributs({ usage1: 'Indifférencié', nature: 'Indifférenciée' }))).toEqual({ categorie: 'autre', secondaire: null, deduit: null, habite: false })
  })

  it('lecture des propriétés d’un bâtiment de la BD TOPO', () => {
    const b = lireBatiment(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      { usage_1: 'Résidentiel', usage_2: 'Commercial et services', nature: 'Indifférenciée', hauteur: 12.5, nombre_de_logements: '8', nombre_d_etages: 4 },
    )
    expect(b).toMatchObject({ usage: 'Résidentiel, Commercial et services', hauteur: 12.5, logements: 8, etages: 4, categorie: 'residentiel', secondaire: 'commercial', habite: true })
    const vide = lireBatiment([], { usage_1: null, hauteur: 0 })
    expect(vide).toMatchObject({ usage: 'Indifférencié', hauteur: null, logements: null, etages: null, categorie: 'autre' })
  })

  it('décompte et résumé, dans l’ordre de la légende', () => {
    const liste = [{ categorie: 'industriel' as const }, { categorie: 'residentiel' as const }, { categorie: 'residentiel' as const }]
    expect(compterUsages(liste)).toEqual([
      ['residentiel', 2],
      ['industriel', 1],
    ])
    expect(resumeUsages(liste)).toBe('3 bâtiments (2 résidentiels, 1 industriel)')
    expect(resumeUsages([{ categorie: 'industriel' }])).toBe('1 bâtiment industriel')
    expect(resumeUsages(liste.slice(1))).toBe('2 bâtiments résidentiels')
  })
})
