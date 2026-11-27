import { describe, expect, it } from 'vitest'
import { decoder, encoder } from '../dossier/format.ts'
import { exemple as exempleSuivi } from '../suivi/exemple.ts'
import { placerLots } from '../suivi/modele.ts'
import { assembler } from './assemblage.ts'
import { depuisResultatsLabo, depuisSuiviTemporel } from './dossier.ts'
import { dansPolygoneConvexe, enveloppeConvexe, zoneInterpolee } from './interpolation.ts'
import { depuisLogsForage } from './logs.ts'
import { construireModele, nappeNiveaux, relevesSansCampagne } from './modele.ts'
import type { FicheTerrain } from '../nappe/fiches.ts'
import type { Source } from './types.ts'

/** A groundwater sampling sheet as Conditions de la nappe keeps it (only what the levels need). */
const fiche = (ouvrage: string, date: string, niveauStatique: number | null, altitudeRepere: number | null, finale = {}) =>
  ({ onglet: ouvrage, ouvrage, date, niveauStatique, altitudeRepere, charge: null, finale, vide: false }) as unknown as FicheTerrain

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

describe('niveaux d’eau des fiches de prélèvement', () => {
  it('Résultats labo : les fiches de Conditions de la nappe donnent les niveaux, à la date de la campagne à défaut', () => {
    const lecture = exempleSuivi().lots[0].lecture
    const s = depuisResultatsLabo(
      allerRetour({
        matrice: 'eau',
        lecture,
        fichier: 'eaux.xlsx',
        infoPrincipale: { date: '2024-05-02', regime: 'HE' },
        etatNappe: { fiches: [fiche('PZ1', '03/05/2024', 1.62, 54.2, { ph: { valeur: 7.1 } }), fiche('PZ2', '', 2.3, 53.8)] },
      }),
    )!
    expect(s.eaux!.releves.map((r) => [r.ouvrage, r.date, r.profondeur, r.repere])).toEqual([
      ['PZ1', '2024-05-03', 1.62, 54.2],
      ['PZ2', '2024-05-02', 2.3, 53.8],
    ])
    expect(s.eaux!.releves[0].terrain.ph).toBe(7.1)
    // Head = measuring point − static level, attached to the campaign of the same days.
    const base = assembler([s]).base!
    const n = base.niveaux.find((x) => x.ouvrage === 'PZ1')!
    expect(n.charge).toBeCloseTo(52.58, 6)
    expect(n.campagne).toBe(base.campagnes[0].id)
  })

  it('Résultats labo : des fiches sans résultats du laboratoire suffisent', () => {
    const s = depuisResultatsLabo(allerRetour({ matrice: 'eau', lecture: null, etatNappe: { fiches: [fiche('PZ1', '2024-05-03', 1.6, 54)] } }))!
    expect(s.eaux!.lots).toHaveLength(0)
    expect(s.eaux!.releves).toHaveLength(1)
  })

  it('fiches seules : une étape par tournée de niveaux, la nappe de chaque tournée', () => {
    const ouvrages = [
      { nom: 'PZ1', x: 652300, y: 6862420, repere: 54.2 },
      { nom: 'PZ2', x: 652355, y: 6862305, repere: 53.8 },
      { nom: 'PZ3', x: 652430, y: 6862205, repere: 53.1 },
    ]
    const releves = [
      ...ouvrages.map((o, i) => ({ ouvrage: o.nom, date: `2024-03-1${i}`, profondeur: 1.5 + i * 0.3, charge: null, terrain: {}, repere: o.repere, source: 'fiches' })),
      ...ouvrages.map((o) => ({ ouvrage: o.nom, date: '2024-09-20', profondeur: 2.1, charge: null, terrain: {}, repere: o.repere, source: 'fiches' })),
    ]
    const source: Source = {
      id: 'f',
      origine: 'fichier',
      nom: 'fiches.xlsx',
      resume: '',
      forages: [],
      parametresSol: [],
      sols: [],
      eaux: { lots: [], campagnes: [], releves, ouvrages: ouvrages.map((o) => ({ ...o, position: null })), corrections: null },
      avertissements: [],
    }
    const d = assembler([source])
    expect(d.base!.campagnes).toHaveLength(0)
    const tournees = relevesSansCampagne(d.base!)
    expect(tournees.map((t) => [t.debut, t.fin, t.niveaux.length])).toEqual([
      ['2024-03-10', '2024-03-12', 3],
      ['2024-09-20', '2024-09-20', 3],
    ])
    const m = construireModele(d)
    const n = nappeNiveaux(m, tournees[0].niveaux)
    expect(n.charges.map((c) => [c.nom, c.charge])).toEqual([
      ['PZ1', 52.7],
      ['PZ2', 52],
      ['PZ3', 51],
    ])
    expect(n.ecoulement).not.toBeNull()
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
