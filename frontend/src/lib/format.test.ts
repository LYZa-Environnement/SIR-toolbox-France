import { describe, expect, it } from 'vitest'
import { nombreFr, nombreFrOuTiret } from './format.ts'

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
