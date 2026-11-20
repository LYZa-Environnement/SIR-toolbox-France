import { describe, expect, it } from 'vitest'
import { codeCommuneEntiere } from './communes'

describe('code de la commune entière', () => {
  it('ramène un arrondissement de Paris, Lyon ou Marseille à sa commune', () => {
    expect(codeCommuneEntiere('75101')).toBe('75056')
    expect(codeCommuneEntiere('75107')).toBe('75056')
    expect(codeCommuneEntiere('75120')).toBe('75056')
    expect(codeCommuneEntiere('69381')).toBe('69123')
    expect(codeCommuneEntiere('69389')).toBe('69123')
    expect(codeCommuneEntiere('13201')).toBe('13055')
    expect(codeCommuneEntiere('13216')).toBe('13055')
  })

  it('laisse les autres communes telles quelles', () => {
    // Nantes ; des codes voisins qui ne sont pas des arrondissements.
    expect(codeCommuneEntiere('44109')).toBe('44109')
    expect(codeCommuneEntiere('75121')).toBe('75121')
    expect(codeCommuneEntiere('69380')).toBe('69380')
    expect(codeCommuneEntiere('13217')).toBe('13217')
    // Corse : code alphanumérique.
    expect(codeCommuneEntiere('2A004')).toBe('2A004')
    expect(codeCommuneEntiere('')).toBe('')
  })
})
