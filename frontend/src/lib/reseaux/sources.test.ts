import { describe, expect, it } from 'vitest'
import { SOURCES } from './sources'
import { CATEGORIE } from './types'

describe('catalogue des sources', () => {
  it('has unique identifiers', () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every local source a sensible extent in France', () => {
    for (const s of SOURCES) {
      if (!s.emprise) continue
      const [o, sud, e, n] = s.emprise
      expect(o, s.id).toBeLessThan(e)
      expect(sud, s.id).toBeLessThan(n)
      // Metropolitan France: no local extent should be wider than a region.
      expect(o, s.id).toBeGreaterThan(-5.5)
      expect(e, s.id).toBeLessThan(10)
      expect(sud, s.id).toBeGreaterThan(41)
      expect(n, s.id).toBeLessThan(51.5)
      expect(e - o, s.id).toBeLessThan(2.5)
    }
  })

  it('declares known network families and an https page', () => {
    for (const s of SOURCES) {
      expect(s.reseaux.length, s.id).toBeGreaterThan(0)
      for (const r of s.reseaux) expect(CATEGORIE[r], `${s.id}: ${r}`).toBeDefined()
      expect(s.fiche.startsWith('https://'), s.id).toBe(true)
    }
  })

  it('classes an object into one of the families it declares', () => {
    for (const s of SOURCES) {
      const c = s.classer({})
      if (c) expect(s.reseaux, s.id).toContain(c.reseau)
    }
  })
})
