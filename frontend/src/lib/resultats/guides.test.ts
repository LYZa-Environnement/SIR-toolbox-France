import { describe, expect, it } from 'vitest'
import { facteurUnite, normaliser, valeurGuide, valeurGuideEn, type OptionsGuides } from './guides.ts'
import type { Parametre } from './parse.ts'

const parametre = (nom: string, unite: string, cas = '', famille = ''): Parametre => ({
  cle: nom.toLowerCase(),
  famille,
  nom,
  cas,
  unite,
  versMicrogrammes: 1,
  somme: false,
})
const surSite: OptionsGuides = { metaux: 'sur site', repere: 'r1' }
const horsSite: OptionsGuides = { metaux: 'hors site', repere: 'r2' }

describe('noms des substances', () => {
  it('ramène les écritures des laboratoires à celles du référentiel', () => {
    expect(normaliser('Perchloroéthylène')).toBe('tetrachloroethylene')
    expect(normaliser('Chloroforme')).toBe('trichloromethane')
    expect(normaliser('1,1-Dichloroéthène')).toBe('1 1 dichloroethylene')
    expect(normaliser('Xylènes totaux')).toBe('xylenes')
    expect(normaliser('Indice hydrocarbures C10-C40')).toBe('hydrocarbures c10 c40')
    expect(normaliser('Somme de 4 HAP (calculée)')).toBe('somme 4 hap')
  })
})

describe('conversion des unités', () => {
  it('donne le facteur entre deux unités de même nature', () => {
    expect(facteurUnite('mg/l', 'µg/L')).toBeCloseTo(1000)
    expect(facteurUnite('µg/kg MS', 'mg/kg MS')).toBeCloseTo(0.001)
    expect(facteurUnite('ng/l', 'µg/l')).toBeCloseTo(0.001)
    expect(facteurUnite('µg/m³', 'mg/m3')).toBeCloseTo(0.001)
    // « μ » grec et « µ » micro sont la même chose.
    expect(facteurUnite('μg/l', 'µg/l')).toBe(1)
  })

  it('refuse de comparer une eau, un sol et un air', () => {
    expect(facteurUnite('mg/l', 'mg/kg')).toBeNull()
    expect(facteurUnite('µg/m³', 'µg/l')).toBeNull()
    expect(facteurUnite('%', 'mg/kg')).toBeNull()
  })
})

describe('valeurs de comparaison ERM', () => {
  it('eaux souterraines : par n° CAS, ou par le nom quand le laboratoire n’en donne pas', () => {
    expect(valeurGuide('eau', parametre('Tétrachloroéthylène', 'µg/l', '127-18-4'), surSite)).toMatchObject({ valeur: 10, unite: 'µg/L' })
    expect(valeurGuide('eau', parametre('Perchloroéthylène', 'µg/l'), surSite)?.valeur).toBe(10)
    expect(valeurGuide('eau', parametre('Benzène', 'µg/l', '71-43-2'), surSite)?.valeur).toBe(1)
    expect(valeurGuide('eau', parametre('Substance inconnue', 'µg/l'), surSite)).toBeNull()
  })

  it('eaux souterraines : les écritures en « -éthène » sans n° CAS', () => {
    // Le référentiel écrit « 1,1-Dichloroéthylène », « Tétrachloroéthylène »…
    expect(valeurGuide('eau', parametre('1,1-Dichloroéthène', 'µg/l'), surSite)?.valeur).toBe(7)
    expect(valeurGuide('eau', parametre('cis-1,2-Dichloroéthène', 'µg/l'), surSite)?.valeur).toBe(70)
    expect(valeurGuide('eau', parametre('trans-1,2-Dichloroéthène', 'µg/l'), surSite)?.valeur).toBe(100)
    expect(valeurGuide('eau', parametre('Tétrachloroéthène', 'µg/l'), surSite)?.valeur).toBe(10)
    expect(valeurGuide('eau', parametre('Chloroéthène', 'µg/l'), surSite)?.valeur).toBe(0.5)
  })

  it('exprime la valeur dans l’unité du laboratoire', () => {
    // 10 µg/L = 0,01 mg/l.
    expect(valeurGuideEn('eau', parametre('Tétrachloroéthylène', 'mg/l', '127-18-4'), surSite, 'mg/l')?.valeur).toBe(0.01)
    // Une unité d'une autre nature ne donne pas de valeur plutôt qu'une valeur fausse.
    expect(valeurGuideEn('eau', parametre('Tétrachloroéthylène', 'mg/kg', '127-18-4'), surSite, 'mg/kg')).toBeNull()
  })

  it('sols, métaux : bruit de fond sur site, seuil de vigilance hors site', () => {
    const cadmium = parametre('Cadmium', 'mg/kg MS', '7440-43-9')
    expect(valeurGuide('sol', cadmium, surSite)).toMatchObject({ valeur: 0.45, source: '(a)' })
    expect(valeurGuide('sol', cadmium, horsSite)).toMatchObject({ valeur: 1, source: '(b)' })
    // Plomb : pas de seuil de vigilance, le bruit de fond reste la référence hors site.
    expect(valeurGuide('sol', parametre('Plomb', 'mg/kg MS', '7439-92-1'), horsSite)).toMatchObject({ valeur: 50, source: '(a)' })
  })

  it('sols : un résultat sur éluat n’est comparé qu’aux critères sur éluat, et inversement', () => {
    // COT sur sol brut : 30 000 mg/kg MS ; COT sur éluat : 500 mg/kg MS.
    for (const nom of ['COT', 'Carbone organique total', 'Carbone organique total (COT)']) {
      expect(valeurGuide('sol', parametre(nom, 'mg/kg MS'), surSite)?.valeur, nom).toBe(30000)
      expect(valeurGuide('sol', parametre(nom, 'mg/kg MS', '', 'Lixiviation'), surSite)?.valeur, nom).toBe(500)
    }
    expect(valeurGuide('sol', parametre('COT sur éluat', 'mg/kg MS'), surSite)?.valeur).toBe(500)
    expect(valeurGuide('sol', parametre('Indice hydrocarbures C10-C40', 'mg/kg MS'), surSite)?.valeur).toBe(500)
  })

  it('air intérieur : la valeur repère choisie, synonymes compris', () => {
    const benzene = parametre('Benzène', 'µg/m³', '71-43-2')
    expect(valeurGuide('air', benzene, surSite)).toEqual({ valeur: 0.002, unite: 'mg/m³', source: 'R1' })
    expect(valeurGuide('air', benzene, horsSite)).toEqual({ valeur: 0.01, unite: 'mg/m³', source: 'R2' })
    // 0,002 mg/m³ = 2 µg/m³.
    expect(valeurGuideEn('air', benzene, surSite, 'µg/m³')?.valeur).toBe(2)
    // « Chloroforme » répond à « Trichlorométhane (chloroforme) ».
    expect(valeurGuide('air', parametre('Chloroforme', 'µg/m³'), surSite)?.valeur).toBe(0.063)
  })
})
