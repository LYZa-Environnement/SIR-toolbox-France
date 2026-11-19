import { describe, expect, it } from 'vitest'
import { dateDepuisNom, datesPrelevement, lireDate, regimePropose } from './dates.ts'
import type { Lecture } from '../resultats/parse.ts'

describe('lecture des dates', () => {
  it('lit les trois écritures d’une même date', () => {
    expect(lireDate('09/12/2025')).toBe('2025-12-09')
    expect(lireDate('2025-12-09')).toBe('2025-12-09')
    // Numéro de série Excel (calendrier 1900) du 09/12/2025.
    expect(lireDate(46000)).toBe('2025-12-09')
  })

  it("garde le jour local d'une date Excel", () => {
    const tz = process.env.TZ
    process.env.TZ = 'Europe/Paris'
    try {
      expect(lireDate(new Date(2025, 11, 9))).toBe('2025-12-09')
    } finally {
      process.env.TZ = tz
    }
  })

  it('trouve une date dans le nom du fichier', () => {
    expect(dateDepuisNom('Rapport 2023-03-14.xlsx')).toBe('2023-03-14')
    expect(dateDepuisNom('PZ campagne 14-03-2023.xlsx')).toBe('2023-03-14')
    expect(dateDepuisNom('Résultats mars 2023.xlsx')).toBe('2023-03-15')
    expect(dateDepuisNom('Rapport 26E0045.xlsx')).toBeNull()
  })

  it('propose le régime d’après le mois', () => {
    expect(regimePropose('2024-03-12')).toBe('HE')
    expect(regimePropose('2024-09-17')).toBe('BE')
  })
})

describe('dates de prélèvement d’un rapport', () => {
  it('lit la date sous chaque échantillon, pas celle de réception', () => {
    const grille = [
      ['Date de réception', null, null, '13/03/2026', '13/03/2026'],
      ['Désignation', null, null, 'PZ1', 'PZ2'],
      ['Date de prélèvement', null, null, '10/03/2026', '11/03/2026'],
      ['Benzène', '71-43-2', 'µg/l', '<0,5', '1,2'],
    ]
    const lecture = { points: [{ nom: 'PZ1', libelles: { CM: 'PZ1' } }, { nom: 'PZ2', libelles: { CM: 'PZ2' } }] } as unknown as Lecture
    const d = datesPrelevement([{ nom: 'Résultats', grille }], lecture)
    expect(d.parEchantillon).toEqual({ PZ1: '2026-03-10', PZ2: '2026-03-11' })
    expect(d.toutes).not.toContain('2026-03-13')
  })
})
