import { describe, expect, it } from 'vitest'
import { classer, lireSite, processusRedox, scorer, solubiliteO2, STATUTS_DEFAUT, type Options } from './evaluation.ts'
import type { ParamId, Valeur } from './parametres.ts'

type Table = Partial<Record<ParamId, Valeur>>
const v = (valeur: number, inferieur = false): Valeur => ({ valeur, inferieur, source: 'test' })
const opts: Options = { decalage: 200, fond: [], statuts: STATUTS_DEFAUT }
const points = (t: Table, id: string, site = lireSite({ a: t }, [])) => scorer(t, site, opts).criteres.find((c) => c.id === id)!.points

describe('criblage USEPA 1998 (tableaux 2.3 et 2.4)', () => {
  it('classe le score selon le tableau 2.4', () => {
    expect(classer(5)).toBe('insuffisante')
    expect(classer(6)).toBe('limitee')
    expect(classer(14)).toBe('limitee')
    expect(classer(15)).toBe('suffisante')
    expect(classer(20)).toBe('suffisante')
    expect(classer(21)).toBe('forte')
  })

  it('note l’oxygène dissous : +3 sous 0,5 mg/l, −3 au-delà de 5 mg/l', () => {
    expect(points({ od: v(0.3) }, 'od')).toBe(3)
    expect(points({ od: v(2) }, 'od')).toBe(0)
    expect(points({ od: v(6) }, 'od')).toBe(-3)
    // LQ au-dessus du seuil : non concluant.
    expect(points({ od: v(1, true) }, 'od')).toBeNull()
  })

  it('note le redox mesuré contre Ag/AgCl', () => {
    expect(points({ orp: v(-150) }, 'orp')).toBe(2)
    expect(points({ orp: v(0) }, 'orp')).toBe(1)
    expect(points({ orp: v(100) }, 'orp')).toBe(0)
  })

  it('compte le DCE comme produit de dégradation quand le cis-DCE dépasse 80 % du DCE total', () => {
    expect(points({ cisdce: v(90), transdce: v(10) }, 'dce')).toBe(2)
    expect(points({ cisdce: v(70), transdce: v(30) }, 'dce')).toBe(0)
  })

  it('compte le TCE seulement si du PCE est quantifié sur le site', () => {
    const sansPce = { tce: v(10) }
    expect(points(sansPce, 'tce')).toBe(0)
    const avecPce = lireSite({ a: { tce: v(10) }, b: { pce: v(5) } }, [])
    expect(points(sansPce, 'tce', avecPce)).toBe(2)
  })

  it('compare les chlorures à deux fois le fond des ouvrages amont', () => {
    const valeurs = { amont: { chlorure: v(20) }, aval: { chlorure: v(50) } }
    const site = lireSite(valeurs, ['amont'])
    expect(scorer(valeurs.aval, site, opts).criteres.find((c) => c.id === 'chlorure')!.points).toBe(2)
    expect(scorer({ chlorure: v(30) }, site, opts).criteres.find((c) => c.id === 'chlorure')!.points).toBe(0)
  })

  it('signale un score partiel quand la géochimie manque', () => {
    const s = scorer({ od: v(0.2), orp: v(-150) }, lireSite({}, []), opts)
    expect(s.total).toBe(5)
    expect(s.complet).toBe(false)
    expect(s.geochimieManquante).toEqual(['nitrates', 'fer ferreux', 'sulfates', 'méthane'])
    expect(s.potentiel).toBeGreaterThan(0)
  })
})

describe('processus redox (McMahon et Chapelle, 2008)', () => {
  it('reconnaît une eau oxique', () => {
    expect(processusRedox({ od: v(6), nitrate: v(10), mn: v(0.01, true), fe2: v(0.05, true), sulfate: v(30) }).processus).toBe('O₂')
  })

  it('reconnaît la dénitrification', () => {
    // 10 mg NO3/l = 2,26 mg N/l ≥ 0,5.
    expect(processusRedox({ od: v(0.2), nitrate: v(10), mn: v(0.01), fe2: v(0.05), sulfate: v(30) }).processus).toBe('NO₃')
  })

  it('départage fer et sulfates par le rapport Fe/H₂S', () => {
    const base = { od: v(0.2), nitrate: v(0.5, true), mn: v(0.2), fe2: v(5), sulfate: v(30) }
    expect(processusRedox({ ...base, sulfure: v(0.1) }).processus).toBe('Fe(III)')
    expect(processusRedox({ ...base, sulfure: v(20) }).processus).toBe('SO₄')
    expect(processusRedox({ ...base, sulfate: v(0.2) }).processus).toBe('CH₄gen')
  })

  it('reste non déterminé sans oxygène dissous', () => {
    expect(processusRedox({}).categorie).toBe('Non déterminé')
  })
})

describe('saturation en oxygène (APHA 4500-O)', () => {
  it('donne la solubilité de l’oxygène en eau douce', () => {
    // Valeurs tabulées : 11,29 mg/l à 10 °C, 9,09 mg/l à 20 °C.
    expect(solubiliteO2(10)).toBeCloseTo(11.29, 1)
    expect(solubiliteO2(20)).toBeCloseTo(9.09, 1)
  })
})
