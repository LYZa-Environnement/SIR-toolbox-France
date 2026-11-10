import { describe, expect, it } from 'vitest'
import { jourIso, nombreFr, nombreFrOuTiret } from './format.ts'

// Espace fine insécable entre les milliers, selon l'usage français d'Intl.
const sansEspaces = (s: string) => s.replace(/\s/g, ' ')

describe('écriture des nombres', () => {
  it('garde trois chiffres significatifs et la virgule décimale', () => {
    expect(sansEspaces(nombreFr(1234.5))).toBe('1 230')
    expect(nombreFr(3.14159)).toBe('3,14')
    expect(nombreFr(0.012345)).toBe('0,01')
    expect(nombreFr(0.012345, 6)).toBe('0,0123')
  })

  it('écrit un tiret pour une valeur absente', () => {
    expect(nombreFrOuTiret(null)).toBe('-')
    expect(nombreFrOuTiret(Number.NaN)).toBe('-')
    expect(nombreFrOuTiret(2.5)).toBe('2,5')
  })
})

describe('jour calendaire', () => {
  it('garde le jour local, là où toISOString donnerait la veille', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Europe/Paris'
    try {
      // Minuit à Paris, comme SheetJS construit une date lue dans Excel.
      const minuit = new Date(2025, 11, 9)
      expect(minuit.toISOString().slice(0, 10)).toBe('2025-12-08')
      expect(jourIso(minuit)).toBe('2025-12-09')
      expect(jourIso(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
    } finally {
      // process.env turns undefined into the string "undefined".
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })
})
