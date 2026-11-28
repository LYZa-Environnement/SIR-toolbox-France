import { describe, expect, it } from 'vitest'
import { toLambert93 } from '../geo.ts'
import { reference } from '../suivi/analyse.ts'
import type { Resultat } from '../suivi/modele.ts'
import { assembler } from './assemblage.ts'
import { deprojeter, detecterSysteme, projeter, systemeDe, versLambert93 } from './coordonnees.ts'
import { comportement, partSolubilite } from './comportement.ts'
import { coteDe, delimiterPanache, fermetureDe, fermeturesPanache, versDirection } from './delimitation.ts'
import { aquifereDe, crepineConseillee, HYPOTHESES_DEFAUT, lirePermeabilite, longueurStationnaire, RAPPORT_ANISOTROPIE, transportDe } from './hydrogeologie.ts'
import { exemple } from './exemple.ts'
import { classerEchantillons, volumesFilieres } from './filieres.ts'
import { contactsForage, construireFormations, formationA, proposerFormations } from './formations.ts'
import { nouvelleGrille, remplir, transformeur } from './interpolation.ts'
import { ajusterVariogramme, ecartsKrigeage, gamma, interpoler, inverser } from './krigeage.ts'
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

  it('points d’investigation du dossier : coordonnées, cotes et repères que les fichiers ne donnent pas', () => {
    const ref = construireModele(assembler([exemple()]))
    const src = exemple()
    const nu = {
      ...src,
      forages: src.forages.map((f) => ({ ...f, x: null, y: null, z: null })),
      eaux: src.eaux && { ...src.eaux, ouvrages: src.eaux.ouvrages.map((o) => ({ ...o, x: null, y: null, repere: null })) },
    }
    // Names written otherwise in the points file ("PZ01" for "PZ1").
    const points = ref.points.map((p) => ({ nom: p.nom.replace(/(\D)(\d)$/, '$10$2'), x93: p.xa!, y93: p.ya!, altitude: p.zSol, repere: p.ouvrage?.repere ?? undefined }))
    expect(construireModele(assembler([nu])).points.some((p) => p.place)).toBe(false)
    expect(points.filter((p) => p.repere !== undefined).length).toBeGreaterThan(2)
    const avec = construireModele(assembler([nu], points))
    expect(avec.systeme).toBe('l93')
    for (const p of avec.points) {
      const r = ref.points.find((q) => q.cle === p.cle)!
      expect([p.place, p.xa, p.ya, p.zSol, p.origineZ]).toEqual([true, r.xa, r.ya, r.zSol, 'dossier'])
      // Measuring points reach the monitoring, as in Suivi temporel.
      expect(p.ouvrage?.repere ?? null).toBe(r.ouvrage?.repere ?? null)
    }
    // A coordinate or an elevation of the files still wins.
    const pz1 = construireModele(assembler([exemple()], points.map((p) => ({ ...p, x93: p.x93 + 100, altitude: 99 })))).points.find((p) => p.nom === 'PZ1')!
    expect([pz1.xa, pz1.zSol, pz1.origineZ]).toEqual([652300, 53.6, 'forage'])
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

  it('l’incertitude ne dépend que de la position des points', () => {
    const pts = [
      { x: 0, y: 0, v: 1 },
      { x: 10, y: 0, v: 3 },
      { x: 0, y: 10, v: 2 },
      { x: 10, y: 10, v: 5 },
      { x: 5, y: 5, v: 4 },
      { x: 15, y: 3, v: 2.5 },
    ]
    const k = interpoler(pts, 'krigeage', false)
    const s = ecartsKrigeage(pts, k.variogramme!)!
    for (const [x, y] of [
      [3, 4],
      [12, 8],
      [20, 20],
    ])
      expect(s(x, y)).toBeCloseTo(k.estimer(x, y).ecart, 9)
    // One more point: less uncertainty around it, none on it.
    const s2 = ecartsKrigeage([...pts, { x: 20, y: 20 }], k.variogramme!)!
    expect(s2(20, 20)).toBe(0)
    expect(s2(18, 18)).toBeLessThan(s(18, 18))
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

describe('délimitation du panache', () => {
  const res = (valeur: number, inferieur = false): Resultat => ({
    id: '',
    ouvrage: '',
    compose: 'c',
    campagne: 'k',
    date: '2025-03-12',
    t: 2025.2,
    valeur,
    inferieur,
    brut: inferieur ? `<${valeur}` : String(valeur),
    fichier: '',
    exclu: false,
  })
  const pt = (nom: string, x: number, y: number, valeur: number, inferieur = false) => ({ cle: nom, nom, x, y, resultat: res(valeur, inferieur) })

  it('quadrants autour de l’écoulement', () => {
    // Flow to the south (180°): south downgradient; looking south, west is on the right, east on the left.
    expect(coteDe(0, -10, 180)).toBe('aval')
    expect(coteDe(-10, 0, 180)).toBe('droite')
    expect(coteDe(10, 0, 180)).toBe('gauche')
    expect(coteDe(0, 10, 180)).toBe('amont')
    // Azimuth 220° is 40° from the flow: downgradient; 230° is 50° from it: on the right.
    const vers = (az: number): [number, number] => [Math.sin((az * Math.PI) / 180), Math.cos((az * Math.PI) / 180)]
    expect(coteDe(...vers(220), 180)).toBe('aval')
    expect(coteDe(...vers(230), 180)).toBe('droite')
  })

  it('ce qui ferme le panache, contre une valeur de 10', () => {
    expect(fermetureDe(res(3), 10)).toBe('nette') // under half the value
    expect(fermetureDe(res(7), 10)).toBe('juste') // between half the value and the value
    expect(fermetureDe(res(10), 10)).toBeNull() // at the value: above it
    expect(fermetureDe(res(5, true), 10)).toBe('nette') // < LQ, the LQ at half the value
    expect(fermetureDe(res(8, true), 10)).toBe('juste')
    expect(fermetureDe(res(20, true), 10)).toBeNull() // an LQ above the value says nothing
  })

  it('un ouvrage entouré : chaque côté fermé, un de justesse', () => {
    // W at 5 × the value; south 3 (net), east 7 (just), west and north not quantified (LQ 0.5).
    const f = fermeturesPanache([pt('W', 0, 0, 50), pt('S', 0, -50, 3), pt('E', 50, 0, 7), pt('O', -50, 0, 0.5, true), pt('N', 0, 50, 0.5, true)], 10, 180)
    expect(Object.fromEntries(f.cotes.map((c) => [c.cote, c.statut]))).toEqual({ aval: 'delimite', droite: 'delimite', gauche: 'juste', amont: 'delimite' })
    expect(f.depassants[0].rapport).toBe(5)
    expect(f.cotes.find((c) => c.cote === 'aval')!.temoins[0]).toMatchObject({ nom: 'S', distance: 50 })
    // Sides: downgradient south, right west, left east, upgradient north.
    expect(f.cotes.map((c) => c.azimut)).toEqual([180, 270, 90, 0])
  })

  it('panache ouvert vers l’aval : le front est l’ouvrage le plus en aval, une LQ trop haute ne ferme rien', () => {
    // A 100 and B 30 (40 m south of A) above 10; M not quantified 60 m north; L not quantified at an LQ of 20.
    const f = fermeturesPanache([pt('A', 0, 0, 100), pt('B', 0, -40, 30), pt('M', 0, 60, 0.5, true), pt('L', 30, -20, 20, true)], 10, 180)
    const aval = f.cotes.find((c) => c.cote === 'aval')!
    expect(aval.statut).toBe('ouvert')
    // A has B beyond it: B alone is the front.
    expect(aval.front).toEqual(['B'])
    expect(f.lqHautes).toEqual(['L'])
    expect(f.cotes.find((c) => c.cote === 'amont')!.statut).toBe('delimite')
    expect(f.cotes.find((c) => c.cote === 'gauche')!.statut).toBe('ouvert')
  })

  const d = assembler([exemple()])
  const base = d.base!
  const pce = base.composes.find((c) => c.cas === '127-18-4')!
  const ref = reference(pce, d.corrections)!.valeur
  const derniere = base.campagnes[base.campagnes.length - 1]

  it('exemple : le tétrachloroéthylène n’est pas délimité à l’est, les emplacements proposés le ferment', () => {
    const m = construireModele(d)
    const n = nappeCampagne(m, base, derniere.id)
    const r = delimiterPanache(m, base, pce.cle, derniere.id, ref, { aval: n.ecoulement!.azimut, nappe: { grille: n.grille, plan: n.plan }, propositions: 3 })
    expect(r.verdict).toBe('non-delimite')
    expect(r.depassants.map((w) => w.nom).sort()).toEqual(['PZ2', 'PZ3'])
    // The wells stand in a line along the flow: nothing east of the source.
    const gauche = r.cotes.find((c) => c.cote === 'gauche')!
    expect(gauche.statut).toBe('ouvert')
    expect(versDirection(gauche.azimut)).toBe('l’est')
    expect(r.cotes.find((c) => c.cote === 'aval')!.temoins[0].nom).toBe('PZ4')
    expect(r.cotes.find((c) => c.cote === 'amont')!.temoins[0].nom).toBe('PZ1')
    expect(r.partBord).toBeGreaterThan(0)
    const ps = [...r.probabilite!].filter(Number.isFinite)
    expect(Math.min(...ps)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ps)).toBeLessThanOrEqual(1)
    expect(r.aire90!).toBeLessThanOrEqual(r.aire50!)
    // First the wells closing the east side, east of a front well; each well leaves less doubt.
    expect(r.propositions).toHaveLength(3)
    const p0 = r.propositions[0]
    expect(p0.motif).toMatchObject({ type: 'fermeture', cote: 'gauche' })
    expect(versDirection(p0.pres.azimut)).toBe('l’est')
    expect(p0.profondeurEau!).toBeGreaterThan(0)
    const doutes = [r.douteux!, ...r.propositions.map((p) => p.douteuxApres!)]
    for (let i = 1; i < doutes.length; i++) expect(doutes[i]).toBeLessThan(doutes[i - 1])
  })

  it('en inverse distance : la fermeture sans probabilité', () => {
    const m = construireModele(d, { methode: 'idw' })
    const r = delimiterPanache(m, base, pce.cle, derniere.id, ref, { aval: 170, propositions: 3 })
    expect(r.verdict).toBe('non-delimite')
    expect(r.probabilite).toBeNull()
    expect(r.propositions.length).toBeGreaterThan(0)
    expect(r.propositions.every((p) => p.motif.type === 'fermeture' && p.probabilite === null && p.concentration !== null)).toBe(true)
  })

  it('pas de dépassement : rien à délimiter', () => {
    const m = construireModele(d)
    const ni = base.composes.find((c) => c.cas === '7440-02-0')!
    const r = delimiterPanache(m, base, ni.cle, derniere.id, 1000, { aval: 170, propositions: 0 })
    expect(r.verdict).toBe('aucun-depassement')
    expect(r.depassants).toHaveLength(0)
    expect(r.propositions).toHaveLength(0)
  })
})

describe('géologie et comportement des polluants (BRGM)', () => {
  it('comportement des composés : tableaux du guide BRGM/RP-74064-FR et familles', () => {
    const pce = comportement({ cas: '127-18-4', nom: 'Tétrachloroéthylène', famille: 'COHV' })
    expect(pce.famille).toBe('cohv')
    expect(pce.phase).toBe('dnapl')
    expect(pce.substance!.densite).toBe(1.62)
    expect(pce.substance!.solubilite).toEqual([100, 200])
    expect(pce.logKoc).toEqual([1.5, 2.5])
    expect(pce.sources[0]).toContain('tableau 13')
    expect(comportement({ cas: '71-43-2', nom: 'Benzène', famille: 'BTEX' }).phase).toBe('lnapl')
    // Vinyl chloride boils at −13,4 °C: no liquid phase.
    expect(comportement({ cas: '75-01-4', nom: 'Chlorure de vinyle', famille: 'COHV' }).phase).toBe('dissous')
    // An isomer of the xylenes, a compound with no CAS number, a salt, a metal.
    expect(comportement({ cas: '95-47-6', nom: 'o-Xylène', famille: '' }).substance!.nom).toBe('Xylènes')
    expect(comportement({ cas: '', nom: 'Hydrocarbures C10-C40', famille: 'Hydrocarbures' })).toMatchObject({ famille: 'hydrocarbures', phase: 'lnapl' })
    expect(comportement({ cas: '16887-00-6', nom: 'Chlorures', famille: 'Anions' }).famille).toBe('autre')
    expect(comportement({ cas: '7440-38-2', nom: 'Arsenic', famille: 'Métaux' })).toMatchObject({ famille: 'metaux', phase: 'dissous', logKoc: null })
  })

  it('part de la solubilité : une phase organique probable dès 1 % pour les COHV', () => {
    // 2 000 µg/l of PCE = 2 mg/l against 100 mg/l (low end of the range): 2 %.
    expect(partSolubilite(2000, comportement({ cas: '127-18-4', nom: '', famille: '' }))).toBeCloseTo(0.02, 12)
    expect(partSolubilite(2000, comportement({ cas: '71-43-2', nom: '', famille: '' }))).toBeNull()
  })

  it('perméabilité saisie à la française', () => {
    expect(lirePermeabilite('5e-4')).toBeCloseTo(5e-4, 15)
    expect(lirePermeabilite('5.10-4')).toBeCloseTo(5e-4, 15)
    expect(lirePermeabilite('2,5×10^-3')).toBeCloseTo(2.5e-3, 15)
    expect(lirePermeabilite('0,0005')).toBeCloseTo(5e-4, 15)
    expect(lirePermeabilite('')).toBeNull()
    expect(lirePermeabilite('abc')).toBeNull()
  })

  it('vitesses : l’exemple du guide BRGM (K = 10⁻⁴ m/s, J = 0,5 %, ωc = 5 % → 315 m/an) et le facteur de retard', () => {
    const pce = comportement({ cas: '127-18-4', nom: '', famille: '' })
    const t = transportDe(null, { ...HYPOTHESES_DEFAUT, K: 1e-4, porositeCinematique: 0.05 }, 0.005, pce)
    // u = 1e-4 × 0.005 / 0.05 = 1e-5 m/s = 315.58 m/year (Documents du BRGM 300, annexe 4: « 315 m/an »).
    expect(t.vitesseEau!).toBeCloseTo(315.576, 2)
    // R = 1 + 1.7 × 10^logKoc × 0.001 / 0.3: 1.1792 for log Koc 1.5, 2.7920 for 2.5.
    expect(t.retard![0]).toBeCloseTo(1.179196, 5)
    expect(t.retard![1]).toBeCloseTo(2.791957, 5)
    expect(t.vitessePolluant![0]).toBeCloseTo(315.576 / 1.179196, 1)
    // No measured K: no velocity.
    expect(transportDe(null, HYPOTHESES_DEFAUT, 0.005, pce).vitesseEau).toBeNull()
  })

  it('longueur d’un panache stationnaire : v·ln(C / valeur) / λ', () => {
    // 100 m/year, half-life 1 year, 10 × the value: 100 × log2(10) = 332.19 m.
    expect(longueurStationnaire(100, 1, 10)).toBeCloseTo(332.193, 2)
    expect(longueurStationnaire(100, 1, 0.5)).toBe(0)
  })

  it('anisotropie : 10 m en travers de l’écoulement comptent pour 30 m', () => {
    // Flow to the east (90°), ratio 3: a point east stays at 10 m, a point north goes to 30 m.
    const t = transformeur({ azimut: 90, rapport: 3 })
    const [a, b] = t(10, 0)
    expect(Math.hypot(a, b)).toBeCloseTo(10, 9)
    const [c, d] = t(0, 10)
    expect(Math.hypot(c, d)).toBeCloseTo(30, 9)
    expect(RAPPORT_ANISOTROPIE).toBeCloseTo(Math.sqrt(10), 12)
  })

  it('crépine conseillée selon la densité du composé', () => {
    // Ground 50, water 48 to 49, aquifer from 47 down to its base at 40 (m NGF).
    const eau = { haute: 49, basse: 48 }
    const aq = { toit: 47, mur: 40 }
    expect(crepineConseillee('dnapl', 50, eau, aq, 'Marne')).toMatchObject({ de: 3, a: 10, profondeur: 10 })
    expect(crepineConseillee('dnapl', 50, eau, aq, 'Marne')!.raison).toContain('mur')
    // Light phase: from 0.5 m below the ground (high water + 0.5 = 49.5) to low water − 2 = 46.
    expect(crepineConseillee('lnapl', 50, eau, aq, null)).toMatchObject({ de: 0.5, a: 4 })
    expect(crepineConseillee('dissous', 50, eau, aq, null)).toMatchObject({ de: 3, a: 10 })
  })

  const d = assembler([exemple()])
  const base = d.base!
  const m = construireModele(d)
  const derniere = base.campagnes[base.campagnes.length - 1]
  const n = nappeCampagne(m, base, derniere.id)
  const charges = Object.fromEntries(n.charges.map((c) => [c.cle, c.charge]))

  it('exemple : l’aquifère des crépines, sables et graviers sur les marnes', () => {
    const aq = aquifereDe(m, base)!
    expect(aq.origine).toBe('crepines')
    expect(aq.unites.map((u) => u.classe)).toEqual(['sable', 'grav'])
    expect(aq.mur!.nom).toBe('Marne')
    expect(aq.dansAquifere).toBe(aq.crepines)
  })

  it('un ouvrage crépiné hors de l’aquifère est écarté ; une crépine mal placée ferme sous réserve', () => {
    const res = (valeur: number) => ({ id: '', ouvrage: '', compose: 'c', campagne: 'k', date: '', t: 0, valeur, inferieur: false, brut: String(valeur), fichier: '', exclu: false })
    const pts = [
      { cle: 'A', nom: 'A', x: 0, y: 0, resultat: res(50) },
      { cle: 'S', nom: 'S', x: 0, y: -40, resultat: res(1) },
      { cle: 'N', nom: 'N', x: 0, y: 40, resultat: res(1) },
    ]
    const f = fermeturesPanache(pts, 10, 180, (q) => (q.cle === 'S' ? { exclu: 'crépiné hors de l’aquifère (marnes)' } : q.cle === 'N' ? { reserve: 'crépine trop courte' } : null))
    const aval = f.cotes.find((c) => c.cote === 'aval')!
    expect(aval.statut).toBe('ouvert')
    expect(aval.ecartes).toEqual([{ nom: 'S', motif: 'crépiné hors de l’aquifère (marnes)' }])
    const amont = f.cotes.find((c) => c.cote === 'amont')!
    expect(amont.statut).toBe('reserve')
    expect(amont.temoins[0].reserve).toBe('crépine trop courte')
  })

  it('exemple : le benzène (plus léger que l’eau) n’est fermé que sous réserve par des crépines sous la nappe', () => {
    const bz = base.composes.find((c) => c.cas === '71-43-2')!
    const r = delimiterPanache(m, base, bz.cle, derniere.id, reference(bz, d.corrections)!.valeur, { aval: n.ecoulement!.azimut, charges, nappe: { grille: n.grille, plan: n.plan } })
    expect(r.comportement.phase).toBe('lnapl')
    const amont = r.cotes.find((c) => c.cote === 'amont')!
    expect(amont.statut).toBe('reserve')
    expect(amont.temoins[0].reserve).toContain('sous la nappe')
    // Screens advised across the water table.
    expect(r.propositions.length).toBeGreaterThan(0)
    for (const p of r.propositions.filter((x) => x.crepine)) expect(p.crepine!.de).toBeLessThan(p.profondeurEau!)
  })

  it('exemple : le trichloroéthylène (plus dense) se crépine jusqu’au mur ; avec K et demi-vie, le transport situe la fin du panache', () => {
    const tce = base.composes.find((c) => c.cas === '79-01-6')!
    const r = delimiterPanache(m, base, tce.cle, derniere.id, reference(tce, d.corrections)!.valeur, {
      aval: n.ecoulement!.azimut,
      gradient: n.ecoulement!.gradient,
      charges,
      nappe: { grille: n.grille, plan: n.plan },
      anisotropie: RAPPORT_ANISOTROPIE,
      hypotheses: { ...HYPOTHESES_DEFAUT, K: 5e-4, demiVie: 3 },
    })
    expect(r.comportement.phase).toBe('dnapl')
    expect(r.anisotropie).toBeCloseTo(Math.sqrt(10), 9)
    expect(r.transport.vitesseEau).toBeGreaterThan(0)
    // The closing well downgradient of PZ4 tells the end of the steady plume, far beyond the site.
    const aval = r.propositions.find((p) => p.motif.type === 'fermeture' && p.motif.cote === 'aval')!
    expect(aval.motif.type === 'fermeture' && aval.motif.transport).toBeGreaterThan(1000)
    // Screens down to the base of the aquifer (the marls, about 10 m deep).
    expect(aval.crepine!.raison).toContain('Marne')
    expect(aval.crepine!.a).toBeGreaterThan(9)
  })
})
