import { describe, expect, it } from 'vitest'
import { decoder, encoder } from '../dossier/format.ts'
import { exemple as exempleSuivi } from '../suivi/exemple.ts'
import { placerLots } from '../suivi/modele.ts'
import { assembler } from './assemblage.ts'
import { depuisResultatsLabo, depuisSuiviTemporel } from './dossier.ts'
import { dansPolygoneConvexe, enveloppeConvexe, zoneInterpolee } from './interpolation.ts'
import { depuisLogsForage } from './logs.ts'

/** What a tool's state becomes once written to the dossier and read back. */
const allerRetour = <T>(v: T) => decoder(encoder(v)) as T

describe('lecture des outils du dossier', () => {
  it('Suivi temporel : campagnes telles que regroupées dans l’outil', () => {
    const f = exempleSuivi()
    const campagnes = placerLots([], f.lots)
    const s = depuisSuiviTemporel(allerRetour({ fichiers: [f], campagnes, corrections: { rattachements: {}, ouvrages: {}, references: {}, exclus: {} } }))!
    expect(s.eaux!.campagnes).toHaveLength(14)
    const d = assembler([s])
    expect(d.base!.campagnes).toHaveLength(14)
    expect(d.base!.ouvrages.map((o) => o.nom)).toEqual(expect.arrayContaining(['PZ1', 'PZ2', 'PZ3', 'PZ4', 'PZ5']))
    expect(d.base!.ouvrages.find((o) => o.nom === 'PZ1')!.x).toBe(652300)
  })

  it('Suivi temporel vide : pas de source', () => {
    expect(depuisSuiviTemporel(allerRetour({ fichiers: [], campagnes: [] }))).toBeNull()
  })

  it('Résultats labo : sols à rattacher, ou campagnes d’eaux souterraines datées', () => {
    const lecture = exempleSuivi().lots[0].lecture
    const sol = depuisResultatsLabo(allerRetour({ matrice: 'sol', lecture, fichier: 'sols.xlsx', infoPrincipale: { date: '2024-05-02', regime: null } }))!
    expect(sol.sols).toHaveLength(1)
    expect(sol.sols[0].date).toBe('2024-05-02')
    const eau = depuisResultatsLabo(allerRetour({ matrice: 'eau', lecture, fichier: 'eaux.xlsx', infoPrincipale: { date: '2024-05-02', regime: 'HE' }, autres: [{ lecture, fichier: 'avant.xlsx', date: '2023-09-12', regime: 'BE' }] }))!
    expect(eau.eaux!.lots.map((l) => l.date)).toEqual(['2024-05-02', '2023-09-12'])
    expect(assembler([eau]).base!.campagnes.map((c) => c.date)).toEqual(['2023-09-12', '2024-05-02'])
    expect(depuisResultatsLabo(allerRetour({ matrice: 'air', lecture }))).toBeNull()
  })

  it('Logs de forage : les forages enregistrés dans une Map', () => {
    const etat = allerRetour({
      holes: new Map([['PZ1', { id: 'PZ1', collar: { x: 1, y: 2, z: 3 }, litho: [{ from: 0, to: 2, key: 'SABLE', desc: '' }], samples: [], water: [], construction: [], pid: [], depth: 2 }]]),
      lab: null,
    })
    expect(depuisLogsForage(etat)!.forages[0].lithologie[0].classe).toBe('sable')
  })
})

describe('emprise des interpolations', () => {
  it('enveloppe convexe et appartenance', () => {
    const poly = enveloppeConvexe([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ])
    expect(poly).toHaveLength(4)
    expect(dansPolygoneConvexe(poly, 5, 5)).toBe(true)
    expect(dansPolygoneConvexe(poly, 11, 5)).toBe(false)
    // Inside the hull, or within 2 m of a point beyond it.
    const dedans = zoneInterpolee([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2)
    expect(dedans(8, 2)).toBe(true)
    expect(dedans(11, 1)).toBe(true)
    expect(dedans(11.5, 5)).toBe(false)
  })
})
