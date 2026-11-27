import { describe, expect, it } from 'vitest'
import { assembler } from './assemblage.ts'
import { exemple } from './exemple.ts'
import { idw, planMoindresCarres, surfaceTendance, ecoulementDuPlan, pasRond } from './interpolation.ts'
import { classeLitho } from './lithologie.ts'
import { cleSol, depuisLogsForage, lireClasseurLogs, lireDateLog } from './logs.ts'
import { classeConcentration, construireModele, enveloppeSols, lithoA, nappeCampagne, nappeForation, panache, type Modele } from './modele.ts'
import type { Source } from './types.ts'

describe('interpolation', () => {
  it('retrouve un plan exact', () => {
    // v = 0.01·x − 0.02·y + 50, at four points.
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 60, y: 70 },
    ].map((p) => ({ ...p, v: 0.01 * p.x - 0.02 * p.y + 50 }))
    const p = planMoindresCarres(pts)!
    expect(p.a).toBeCloseTo(0.01, 9)
    expect(p.b).toBeCloseTo(-0.02, 9)
    expect(p.c).toBeCloseTo(50, 9)
  })

  it('refuse des points alignés', () => {
    expect(planMoindresCarres([0, 1, 2].map((i) => ({ x: i, y: 2 * i, v: i })))).toBeNull()
  })

  it('passe par les points (pondération inverse et tendance)', () => {
    const pts = [
      { x: 0, y: 0, v: 10 },
      { x: 50, y: 10, v: 12 },
      { x: 20, y: 60, v: 7 },
      { x: 70, y: 70, v: 9 },
    ]
    const f = surfaceTendance(pts)
    for (const p of pts) expect(f(p.x, p.y)).toBeCloseTo(p.v, 6)
    // Halfway between two points of a pair alone: their mean.
    expect(idw([{ x: 0, y: 0, v: 2 }, { x: 10, y: 0, v: 4 }], 5, 0)).toBeCloseTo(3, 9)
  })

  it('écoulement vers le bas du plan', () => {
    // Head falls 1 m per 100 m towards the east: flow to the east (90°), gradient 0.01.
    const e = ecoulementDuPlan({ a: -0.01, b: 0, c: 0 })!
    expect(e.azimut).toBeCloseTo(90, 6)
    expect(e.gradient).toBeCloseTo(0.01, 9)
  })

  it('pas ronds', () => {
    expect(pasRond(0.7)).toBe(0.5)
    expect(pasRond(13)).toBe(10)
    expect(pasRond(26)).toBe(20)
    expect(pasRond(80)).toBe(100)
  })
})

describe('lithologie', () => {
  it('composant principal : le premier écrit', () => {
    expect(classeLitho('SABLE ARGILEUX')).toBe('sable')
    expect(classeLitho('ARGILE SABLEUSE')).toBe('argile')
    expect(classeLitho('Remblais sablo-graveleux')).toBe('remb')
    expect(classeLitho('Limon brun')).toBe('silt')
    expect(classeLitho('', 'craie blanche à silex')).toBe('craie')
    expect(classeLitho('XYZ')).toBe('autre')
  })
})

describe('lecture des logs', () => {
  it('lit le classeur de saisie ERM', () => {
    const s = lireClasseurLogs(
      [
        { nom: 'Collars', grille: [['Hole ID', 'Easting', 'Northing', 'Elevation', 'Starting Depth', 'Ending Depth'], ['PZ1', 652300, 6862420, 53.6, 0, 12]] },
        { nom: 'Lithology', grille: [['Hole ID', 'From', 'To', 'Lithology Keyword', 'Lithology Description'], ['PZ1', 0, 0.5, 'TERRE VEGETALE', ''], ['PZ1', 0.5, 12, 'SABLE ARGILEUX', 'Sable beige']] },
        { nom: 'Well Construction', grille: [['Hole ID', 'From', 'To', 'Item'], ['PZ1', 4, 12, 'Crépine PVC']] },
        { nom: 'Water Level', grille: [['Hole ID', 'Depth'], ['PZ1', 5.2]] },
        { nom: 'Samples', grille: [['Hole ID', 'From', 'To', 'Sample ID', 'Date'], ['PZ1', 0, 0.5, 'PZ1 (0-0,5 m)', '01/02/2026']] },
      ],
      'logs.xlsx',
    )!
    expect(s.forages).toHaveLength(1)
    const f = s.forages[0]
    expect([f.x, f.y, f.z, f.profondeur, f.niveauEau]).toEqual([652300, 6862420, 53.6, 12, 5.2])
    expect(f.lithologie.map((l) => l.classe)).toEqual(['veg', 'sable'])
    expect(f.equipement[0].element).toBe('CREPINE')
    expect(f.echantillons[0].date).toBe('2026-02-01')
  })

  it('ignore un classeur qui n’est pas un classeur de logs', () => {
    expect(lireClasseurLogs([{ nom: 'Résultats', grille: [['a', 'b']] }], 'x.xlsx')).toBeNull()
  })

  it('lit l’état de Logs de forage enregistré dans le dossier, résultats rattachés', () => {
    const s = depuisLogsForage({
      holes: new Map([
        [
          'S1',
          {
            id: 'S1',
            collar: { x: 10, y: 20, z: 50 },
            litho: [{ from: 0, to: 3, key: 'REMBLAIS', desc: '' }],
            construction: [],
            pid: [],
            water: [{ depth: 2.1 }],
            samples: [{ id: 'S1 (0-1 m)', from: 0, to: 1, date: '05/03/2025', labIdx: 0 }],
            depth: 3,
          },
        ],
      ]),
      lab: { fileName: 'labo.xlsx', params: [{ name: 'Plomb', unit: 'mg/kg MS', cas: '7439-92-1', fam: 'Métaux', vals: [{ num: 85, lt: false }] }] },
    })!
    const f = s.forages[0]
    expect(f.niveauEau).toBe(2.1)
    expect(f.echantillons[0].resultats[cleSol('Plomb', '7439-92-1', false)]).toEqual({ valeur: 85, inferieur: false, brut: '85' })
    expect(s.parametresSol[0].unite).toBe('mg/kg MS')
  })

  it('dates', () => {
    expect(lireDateLog('12/03/2024 - 09h00')).toBe('2024-03-12')
    expect(lireDateLog('2024-03-12')).toBe('2024-03-12')
    expect(lireDateLog('')).toBe('')
  })
})

describe('assemblage', () => {
  it('complète un forage d’une source par une autre et rattache des résultats de sols par leur nom', () => {
    const vide = { parametresSol: [], sols: [], eaux: null, avertissements: [], resume: '', origine: 'fichier' as const }
    const a: Source = {
      ...vide,
      id: 'a',
      nom: 'a',
      forages: [{ nom: 'S 01', cle: 'S1', x: 1, y: 2, z: 50, profondeur: 4, lithologie: [{ de: 0, a: 4, cle: 'SABLE', description: '', classe: 'sable' }], equipement: [], pid: [], niveauEau: null, echantillons: [], date: '' }],
    }
    const b: Source = {
      ...vide,
      id: 'b',
      nom: 'b',
      forages: [{ nom: 'S1', cle: 'S1', x: null, y: null, z: null, profondeur: 0, lithologie: [], equipement: [], pid: [], niveauEau: 1.2, echantillons: [], date: '' }],
      sols: [
        {
          fichier: 'labo.xlsx',
          date: '2025-01-10',
          lecture: {
            points: [{ nom: 'S1 (0,5-1)', libelles: {} }],
            parametres: { CM: [{ cle: 'pb', famille: 'Métaux', nom: 'Plomb', cas: '7439-92-1', unite: 'mg/kg MS', versMicrogrammes: 1000, somme: false }], CC: [] },
            valeurs: { CM: { 'S1 (0,5-1)': { pb: { brut: '120', valeur: 120, inferieur: false } } }, CC: {} },
            coucheControle: false,
            lignesIgnorees: [],
            unites: ['mg/kg MS'],
            mode: 'tout',
          },
        },
      ],
    }
    const d = assembler([a, b])
    expect(d.forages).toHaveLength(1)
    const f = d.forages[0]
    expect([f.x, f.y, f.z, f.niveauEau, f.lithologie.length]).toEqual([1, 2, 50, 1.2, 1])
    expect(f.echantillons).toHaveLength(1)
    expect(f.echantillons[0].de).toBe(0.5)
    expect(Object.values(f.echantillons[0].resultats)[0].valeur).toBe(120)
    expect(d.parametresSol.map((p) => p.nom)).toEqual(['Plomb'])
  })
})

describe('modèle de l’exemple', () => {
  const donnees = assembler([exemple()])
  const m: Modele = construireModele(donnees)

  it('réunit forages et ouvrages, en Lambert 93', () => {
    expect(m.georef).toBe(true)
    expect(m.relatif).toBe(false)
    expect(m.points).toHaveLength(13)
    expect(donnees.base!.campagnes).toHaveLength(14)
    const pz2 = m.points.find((p) => p.nom === 'PZ2')!
    expect(pz2.forage).not.toBeNull()
    expect(pz2.ouvrage).not.toBeNull()
    expect(pz2.zSol).toBe(53.2)
    expect(pz2.crepine).toEqual({ de: 3, a: 11 })
  })

  it('modèle géologique : les couches des logs, empilées', () => {
    const g = m.geologie!
    expect(g.classes).toEqual(expect.arrayContaining(['remb', 'silt', 'sable', 'grav', 'marne', 'argile']))
    // Under PZ2, the block at 6 m depth is sandy gravel, the one at 0.4 m is fill.
    const pz2 = m.points.find((p) => p.nom === 'PZ2')!
    const bloc = (prof: number) => {
      const b = m.blocs
      const i = Math.floor((pz2.x - b.x0) / b.dx)
      const j = Math.floor((pz2.y - b.y0) / b.dy)
      const k = Math.floor((pz2.zSol - prof - b.z0) / b.dz)
      return g.classes[g.valeurs[(k * b.ny + j) * b.nx + i] - 1]
    }
    expect(bloc(6)).toBe('sable')
    expect(bloc(0.4)).toBe('remb')
    expect(lithoA(pz2.forage!, 20)?.classe).toBe('marne')
    expect(g.volumes.sable).toBeGreaterThan(0)
  })

  it('nappe : écoulement vers le sud-est, comme les charges de l’exemple', () => {
    const c = donnees.base!.campagnes[0]
    const n = nappeCampagne(m, donnees.base!, c.id)
    expect(n.charges).toHaveLength(5)
    expect(n.charges.every((x) => x.origine === 'cote')).toBe(true)
    expect(n.ecoulement!.azimut).toBeGreaterThan(110)
    expect(n.ecoulement!.azimut).toBeLessThan(170)
    expect(n.grille).not.toBeNull()
    const f = nappeForation(m)
    expect(f.charges.length).toBe(13)
  })

  it('panache : tétrachloroéthylène plus fort au droit de PZ2', () => {
    const base = donnees.base!
    const pce = base.composes.find((c) => c.cas === '127-18-4')!
    const p = panache(m, base, pce.cle, base.campagnes[0].id)
    const v = (nom: string) => p.valeurs.find((x) => x.nom === nom)!.resultat.valeur
    expect(v('PZ2')).toBeGreaterThan(v('PZ3'))
    expect(p.champ!.some((x) => Number.isFinite(x))).toBe(true)
  })

  it('sols : enveloppe au-dessus d’un seuil, autour de la source', () => {
    const pce = donnees.parametresSol.find((p) => p.cas === '127-18-4')!
    const e = enveloppeSols(m, pce.cle, 10)
    // PZ2 62 and 18, S1 140 and 46, S2 33 and 11 mg/kg.
    expect(e.depassements).toBe(6)
    expect(e.volume).toBeGreaterThan(0)
    // A threshold no result reaches: nothing.
    expect(enveloppeSols(m, pce.cle, 1000).volume).toBe(0)
  })

  it('classes de concentration', () => {
    expect(classeConcentration(5, true, 10)).toBe('nq')
    expect(classeConcentration(4, false, 10)).toBe('faible')
    expect(classeConcentration(8, false, 10)).toBe('proche')
    expect(classeConcentration(10, false, 10)).toBe('depasse')
    expect(classeConcentration(150, false, 10)).toBe('fort')
    expect(classeConcentration(150, false, null)).toBeNull()
  })
})
