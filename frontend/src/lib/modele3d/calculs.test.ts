import { describe, expect, it } from 'vitest'
import { toLambert93 } from '../geo.ts'
import { reference } from '../suivi/analyse.ts'
import { assembler } from './assemblage.ts'
import { deprojeter, detecterSysteme, projeter, systemeDe, versLambert93 } from './coordonnees.ts'
import { exemple } from './exemple.ts'
import { classerEchantillons, volumesFilieres } from './filieres.ts'
import { contactsForage, construireFormations, formationA, proposerFormations } from './formations.ts'
import { nouvelleGrille, remplir } from './interpolation.ts'
import { ajusterVariogramme, gamma, interpoler, inverser } from './krigeage.ts'
import { construireModele, evolutionPanache, isolignes, nappeCampagne } from './modele.ts'
import type { Forage } from './types.ts'

describe('systèmes de coordonnées', () => {
  it('Lambert 93 : le point d’origine et l’accord avec geo.ts', () => {
    // Origin of the projection: 3° E, 46,5° N → (700 000 ; 6 600 000).
    const [x, y] = projeter('l93', 3, 46.5)
    expect(x).toBeCloseTo(700000, 3)
    expect(y).toBeCloseTo(6600000, 3)
    const [xa, ya] = toLambert93(48.8566, 2.3522)
    const [xb, yb] = projeter('l93', 2.3522, 48.8566)
    expect(Math.abs(xa - xb)).toBeLessThan(0.01)
    expect(Math.abs(ya - yb)).toBeLessThan(0.01)
  })

  it('CC49 : origine de la zone, aller-retour au millimètre', () => {
    // Zone CC49: origin 3° E, 49° N → (1 700 000 ; 8 200 000).
    const [x, y] = projeter('cc49', 3, 49)
    expect(x).toBeCloseTo(1700000, 3)
    expect(y).toBeCloseTo(8200000, 3)
    const [lon, lat] = deprojeter('cc49', 1652000, 8186000)
    const [x2, y2] = projeter('cc49', lon, lat)
    expect(x2).toBeCloseTo(1652000, 3)
    expect(y2).toBeCloseTo(8186000, 3)
  })

  it('CC49 → Lambert 93 retrouve le même lieu', () => {
    const [lon, lat] = [2.3522, 48.8566]
    const cc = projeter('cc49', lon, lat)
    const l93 = versLambert93('cc49', cc[0], cc[1])!
    const attendu = projeter('l93', lon, lat)
    expect(Math.hypot(l93[0] - attendu[0], l93[1] - attendu[1])).toBeLessThan(0.01)
  })

  it('reconnaît le système, et la latitude écrite avant la longitude', () => {
    expect(systemeDe(652300, 6862420)).toBe('l93')
    expect(systemeDe(...projeter('cc49', 2.35, 48.85))).toBe('cc49')
    expect(systemeDe(...projeter('cc43', 3.9, 43.6))).toBe('cc43')
    expect(systemeDe(2.35, 48.85)).toBe('wgs84')
    expect(systemeDe(120, 340)).toBeNull()
    expect(detecterSysteme([{ x: 48.85, y: 2.35 }, { x: 48.86, y: 2.36 }])).toEqual({ systeme: 'wgs84', inverse: true })
    expect(detecterSysteme([{ x: 10, y: 20 }, { x: 30, y: 40 }]).systeme).toBe('local')
  })

  it('un modèle aux coordonnées GPS est converti et géoréférencé', () => {
    const d = assembler([exemple()])
    const gps = { ...d, forages: d.forages.map((f) => (f.x !== null && f.y !== null ? { ...f, ...(() => { const [lon, lat] = deprojeter('l93', f.x!, f.y!); return { x: lon, y: lat } })() } : f)) }
    const m = construireModele(gps)
    expect(m.systeme).toBe('wgs84')
    expect(m.georef).toBe(true)
    const pz2 = m.points.find((p) => p.nom === 'PZ2')!
    expect(pz2.xa!).toBeCloseTo(652355, 1)
    expect(pz2.ya!).toBeCloseTo(6862305, 1)
  })

  it('coordonnées et cote saisies dans le modèle', () => {
    const d = assembler([exemple()])
    const m = construireModele(d, { saisies: { PZ1: { x: 652310, z: 60 } } })
    const p = m.points.find((x) => x.nom === 'PZ1')!
    expect([p.xa, p.ya, p.zSol, p.origineZ, p.saisi]).toEqual([652310, 6862420, 60, 'saisie', true])
  })
})

describe('krigeage', () => {
  it('inverse une matrice', () => {
    const inv = inverser([
      [4, 7],
      [2, 6],
    ])!
    // 1/10 × [[6, −7], [−2, 4]]
    expect(inv[0][0]).toBeCloseTo(0.6, 12)
    expect(inv[0][1]).toBeCloseTo(-0.7, 12)
    expect(inv[1][0]).toBeCloseTo(-0.2, 12)
    expect(inv[1][1]).toBeCloseTo(0.4, 12)
    expect(inverser([[1, 2], [2, 4]])).toBeNull()
  })

  it('modèle sphérique : palier atteint à la portée', () => {
    const v = { modele: 'spherique' as const, pepite: 0.1, palier: 1, portee: 50, ajuste: true, experimental: [] }
    expect(gamma(v, 0)).toBe(0)
    expect(gamma(v, 50)).toBeCloseTo(1, 12)
    // h = a/2 : 0,1 + 0,9 × (0,75 − 0,0625) = 0,71875
    expect(gamma(v, 25)).toBeCloseTo(0.71875, 12)
  })

  it('passe par les points, incertitude nulle sur eux et croissante loin d’eux', () => {
    const pts = [
      [0, 0, 10],
      [40, 5, 12],
      [10, 50, 7],
      [60, 60, 9],
      [30, 25, 11],
      [70, 10, 13],
      [5, 80, 6],
    ].map(([x, y, v]) => ({ x, y, v }))
    const k = interpoler(pts, 'krigeage')
    for (const p of pts) {
      const e = k.estimer(p.x, p.y)
      expect(e.v).toBeCloseTo(p.v, 9)
      expect(e.ecart).toBeCloseTo(0, 9)
    }
    expect(k.estimer(200, 200).ecart).toBeGreaterThan(k.estimer(32, 27).ecart)
    expect(k.validation!.erreurs).toHaveLength(7)
  })

  it('une surface plane est retrouvée exactement (tendance)', () => {
    const pts = [0, 1, 2, 3, 4, 5].map((i) => ({ x: (i * 37) % 100, y: (i * 61) % 90, v: 50 - 0.01 * ((i * 37) % 100) + 0.02 * ((i * 61) % 90) }))
    const k = interpoler(pts, 'krigeage')
    expect(k.estimer(55, 33).v).toBeCloseTo(50 - 0.55 + 0.66, 6)
    expect(k.validation!.rmse).toBeLessThan(1e-6)
  })

  it('ajuste un variogramme sur des données structurées', () => {
    const pts = Array.from({ length: 40 }, (_, i) => {
      const x = (i * 53) % 200
      const y = (i * 97) % 200
      return { x, y, v: Math.sin(x / 40) + Math.cos(y / 50) }
    })
    const v = ajusterVariogramme(pts)
    expect(v.ajuste).toBe(true)
    expect(v.portee).toBeGreaterThan(20)
    expect(v.palier).toBeGreaterThan(v.pepite)
  })
})

describe('formations', () => {
  const d = assembler([exemple()])
  const logs = d.forages.filter((f) => f.lithologie.length)

  it('propose les formations dans l’ordre, la lentille d’argile rattachée au sable', () => {
    const c = proposerFormations(logs)
    expect(c.formations.map((f) => f.id)).toEqual(['remb', 'silt', 'sable', 'grav', 'marne'])
    expect(c.formations[2].nom).toContain('argile')
    expect(c.affectation['ARGILE']).toBe('sable')
  })

  it('lit les contacts d’un forage, et ceux qu’il n’atteint pas', () => {
    const c = proposerFormations(logs)
    const pz3 = logs.find((f) => f.nom === 'PZ3')!
    const contacts = contactsForage(pz3, c)
    // Remblais / limon at the base of the fill, sable / graviers under the lens and the lower sands.
    expect('profondeur' in contacts[0]).toBe(true)
    expect(contacts[0]).toEqual({ profondeur: pz3.lithologie[1].de })
    const s3 = logs.find((f) => f.nom === 'S3')!
    // A 4 m soil boring does not reach the gravels: censored.
    expect(contactsForage(s3, c)[2]).toEqual({ censure: 4 })
  })

  it('couches continues, empilées, limitées à la parcelle', () => {
    const m = construireModele(d)
    const r = m.formations!
    expect(r.formations).toHaveLength(5)
    const g = m.sol
    for (let q = 0; q < g.nx * g.ny; q++)
      for (let i = 0; i < r.formations.length; i++) {
        expect(r.toits[i][q]).toBeGreaterThanOrEqual(r.murs[i][q] - 1e-9)
        if (i > 0) expect(r.toits[i][q]).toBeCloseTo(r.murs[i - 1][q], 9)
      }
    // Under PZ2 (in the parcel), sand at 6 m depth.
    const pz2 = m.points.find((p) => p.nom === 'PZ2')!
    const q = Math.round((pz2.y - g.y0) / g.dy) * g.nx + Math.round((pz2.x - g.x0) / g.dx)
    expect(r.formations[formationA(r, q, pz2.zSol - 6)].id).toBe('sable')
    // The parcel: modelled cells around PZ2, not around PZ4 (off site).
    const pz4 = m.points.find((p) => p.nom === 'PZ4')!
    const cellule = (x: number, y: number) => Math.floor((y - g.y0) / g.dy) * (g.nx - 1) + Math.floor((x - g.x0) / g.dx)
    expect(r.masque[cellule(pz2.x, pz2.y)]).toBe(1)
    expect(r.masque[cellule(pz4.x, pz4.y)]).toBe(0)
    expect(r.volumes.every((v) => v >= 0)).toBe(true)
    expect(r.volumes[2]).toBeGreaterThan(0)
  })

  it('un contact atteint par aucun forage : la formation n’est pas modélisée', () => {
    const f: Forage = { nom: 'A', cle: 'A', x: 0, y: 0, z: 10, profondeur: 2, lithologie: [{ de: 0, a: 2, cle: 'SABLE', description: '', classe: 'sable' }], equipement: [], pid: [], observations: [], niveauEau: null, echantillons: [], date: '' }
    const sol = remplir(nouvelleGrille(-10, -10, 10, 10, 5, 5), () => 10)
    const base = remplir(nouvelleGrille(-10, -10, 10, 10, 5, 5), () => 5)
    const r = construireFormations(
      [{ cle: 'A', nom: 'A', x: 0, y: 0, zSol: 10, forage: f }],
      sol,
      base,
      { formations: [{ id: 'sable', nom: 'Sable', couleur: '#fff' }, { id: 'argile', nom: 'Argile', couleur: '#000' }], affectation: { SABLE: 'sable' } },
      'idw',
      () => true,
    )
    expect(r.volumes[1]).toBe(0)
    expect(r.avertissements[0]).toContain('atteint par aucun forage')
  })
})

describe('filières des terres', () => {
  const d = assembler([exemple()])
  const m = construireModele(d)

  it('classe les échantillons : ISDI, ISDND, ISDD', () => {
    const c = classerEchantillons(m, d.parametresSol)!
    const de = (id: string) => c.find((x) => x.echantillon === id)!
    expect(de('PZ1 (0,5-1 m)').filiere).toBe('isdi')
    // HCT 2600 > 500 mg/kg: not inert; leaching below the ISDND limits.
    expect(de('PZ5 (1-1,5 m)').filiere).toBe('isdnd')
    // Soluble fraction and sulphates both above: note (1) does not compensate.
    expect(de('PZ2 (0,5-1 m)').filiere).toBe('isdnd')
    // Lead in the leachate 12 > 10 mg/kg (ISDND), ≤ 50 (ISDD).
    expect(de('S5 (0,5-1 m)').filiere).toBe('isdd')
    expect(de('S1 (0,3-1 m)').remarques.join(' ')).toContain('COHV')
  })

  it('volumes par filière dans la parcelle', () => {
    const v = volumesFilieres(m, d.parametresSol)!
    expect(v.volumes.isdi).toBeGreaterThan(0)
    expect(v.volumes.isdnd).toBeGreaterThan(0)
    expect(v.volumes.isdd).toBeGreaterThan(0)
    expect(v.volumes.isdd).toBeLessThan(v.volumes.isdnd)
  })
})

describe('nappe et panache', () => {
  const d = assembler([exemple()])
  const m = construireModele(d)
  const base = d.base!

  it('isopièzes : des segments sur la nappe, aux bonnes cotes', () => {
    const n = nappeCampagne(m, base, base.campagnes[0].id)
    const lignes = isolignes(n.grille!, [51.5])
    expect(lignes[0].segments.length).toBeGreaterThan(3)
    // A plane z = x: the 0.5 line is x = 0.5.
    const g = remplir(nouvelleGrille(0, 0, 1, 1, 3, 3), (x) => x)
    const l = isolignes(g, [0.25])[0]
    for (const [x1, , x2] of l.segments) {
      expect(x1).toBeCloseTo(0.25, 9)
      expect(x2).toBeCloseTo(0.25, 9)
    }
  })

  it('évolution : le panache de tétrachloroéthylène régresse, celui de cis-DCE progresse', () => {
    const pce = base.composes.find((c) => c.cas === '127-18-4')!
    const dce = base.composes.find((c) => c.cas === '156-59-2')!
    const e = evolutionPanache(m, base, pce.cle, reference(pce, d.corrections)?.valeur ?? null)
    expect(e.etats).toHaveLength(14)
    expect(e.tendanceMasse!.S).toBeLessThan(0)
    const e2 = evolutionPanache(m, base, dce.cle, reference(dce, d.corrections)?.valeur ?? null)
    expect(e2.tendanceMasse!.S).toBeGreaterThan(0)
  })
})

describe('schéma conceptuel', () => {
  it('sources, voies de transfert et cibles d’après les données', async () => {
    const { schemaConceptuel, schemaSvg, positionHydraulique } = await import('./conceptuel.ts')
    const { valeurGuideEn } = await import('../resultats/guides.ts')
    const d = assembler([exemple()])
    const m = construireModele(d)
    const base = d.base!
    const derniere = base.campagnes[base.campagnes.length - 1]
    const s = schemaConceptuel({
      modele: m,
      donnees: d,
      guideSol: (cle) => {
        const p = d.parametresSol.find((x) => x.cle === cle)!
        return valeurGuideEn('sol', { cle, famille: p.famille, nom: p.nom, cas: p.cas, unite: p.unite, versMicrogrammes: 1, somme: false }, { metaux: 'sur site', repere: 'r1' }, p.unite)?.valeur ?? null
      },
      referenceEau: (cle) => reference(base.composes.find((c) => c.cle === cle)!, d.corrections)?.valeur ?? null,
      referenceGaz: () => null,
      nappe: nappeCampagne(m, base, derniere.id),
      cibles: null,
    })
    const ids = s.elements.map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining(['contact', 'volatilisation', 'lixiviation', 'migration', 'usagers', 'organoleptique']))
    expect(ids.some((i) => i.startsWith('sol:'))).toBe(true)
    expect(ids.some((i) => i.startsWith('eau:'))).toBe(true)
    expect(ids.some((i) => i.startsWith('gaz:'))).toBe(true)
    expect(s.liens).toContainEqual({ de: 'lixiviation', vers: 'migration' })
    expect(schemaSvg(s, 'Site')).toContain('VOIES DE TRANSFERT')
    // Flow to the east (90°): a point to the east is downstream, to the west upstream, to the north aside.
    expect(positionHydraulique(90, 100, 0)).toBe('aval')
    expect(positionHydraulique(90, -100, 0)).toBe('amont')
    expect(positionHydraulique(90, 0, 100)).toBe('lateral')
  })
})
