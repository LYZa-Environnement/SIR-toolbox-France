import { describe, expect, test } from 'vitest'
import { lireGrille, type Cell } from '../resultats/parse.ts'
import { COMPOSES_VIDES, composesDepuisLecture, echantillonsComposes, lireComposes, type Composes } from './composes.ts'
import { interpreter, type Entree } from './interpretation.ts'

const avec = (c: Partial<Composes>): Composes => ({ ...COMPOSES_VIDES, ...c })

// mg/kg, fictitious.
const DISTILLAT_FRAIS = { Nap: 50, Acy: 0, Ace: 6, Flu: 9, Phe: 20, Ant: 0.5, Fla: 1.5, Pyr: 3, BaA: 0.2, Chr: 0.6, BbF: 0, BkF: 0, BaP: 0, DahA: 0, BghiP: 0, IcdP: 0 }
const DISTILLAT_ALTERE = { ...DISTILLAT_FRAIS, Nap: 0.5, Ace: 0.5, Flu: 3 }
const DISTILLAT_TRES_ALTERE = { ...DISTILLAT_FRAIS, Nap: 0, Acy: 0, Ace: 0, Flu: 0, Phe: 0.4, Ant: 0, Fla: 1.5, Pyr: 3, Chr: 0.6 }
const COMBUSTION = { Nap: 2, Phe: 10, Ant: 3, Fla: 15, Pyr: 12, BaA: 8, Chr: 8, BbF: 9, BkF: 4, BaP: 7, IcdP: 5, BghiP: 5, DahA: 1 }

describe('origine des HAP', () => {
  test('distillat : pétrogénique', () => {
    expect(lireComposes(avec({ hap: DISTILLAT_FRAIS }), 'sol').origine?.verdict).toBe('pétrogénique')
  })
  test('suies, goudrons : pyrolytique, et pas de séquence d’altération', () => {
    const l = lireComposes(avec({ hap: COMBUSTION }), 'sol')
    expect(l.origine?.verdict).toBe('pyrolytique')
    expect(l.sequence?.code).toBeNull()
  })
})

describe('séquence d’altération', () => {
  test('naphtalène dominant et BTEX présents : composés légers encore là', () => {
    // Nap / Phe = 50 / 20 = 2.5 ≥ 1, BTEX quantified → step 0.
    const l = lireComposes(avec({ hap: DISTILLAT_FRAIS, btex: { B: 0.1, T: 0.5, E: 0.3, X: 1 } }), 'sol')
    expect(l.sequence?.code).toBe(0)
  })
  test('BTEX sous la LQ : altération engagée même si le naphtalène domine', () => {
    const l = lireComposes(avec({ hap: DISTILLAT_FRAIS, btex: { B: 0, T: 0, E: 0, X: 0 } }), 'sol')
    expect(l.sequence?.code).toBe(1)
  })
  test('naphtalène presque disparu : altération avancée', () => {
    // Nap / Phe = 0.5 / 20 = 0.025 < 0.1, 2–3 rings still above 4–6 rings → step 2.
    expect(lireComposes(avec({ hap: DISTILLAT_ALTERE }), 'sol').sequence?.code).toBe(2)
  })
  test('HAP légers partis, 4–6 cycles dominants : très avancée', () => {
    // 2–3 rings: 0.4 ; 4–6 rings: 1.5 + 3 + 0.2 + 0.6 = 5.3 → ratio < 1, no naphthalene → step 3.
    expect(lireComposes(avec({ hap: DISTILLAT_TRES_ALTERE }), 'sol').sequence?.code).toBe(3)
  })
})

describe('BTEX', () => {
  test('eau : benzène majoritaire signalé', () => {
    const l = lireComposes(avec({ btex: { B: 50, T: 2, E: 5, X: 8 } }), 'eau')
    expect(l.constats.some((c) => /Benzène majoritaire/.test(c.texte))).toBe(true)
  })
  test('toluène consommé, éthylbenzène enrichi : dégradation anaérobie', () => {
    const l = lireComposes(avec({ btex: { B: 5, T: 1, E: 10, X: 12 } }), 'eau')
    expect(l.constats.some((c) => /anaérobie/.test(c.texte))).toBe(true)
  })
  test('le rapport de Kaplan est calculé à partir des BTEX du laboratoire', () => {
    const e: Entree = {
      nom: 'x',
      matrice: 'eau',
      source: 'saisie',
      distribution: null,
      indicateurs: null,
      c17: null,
      pr: null,
      c18: null,
      ph: null,
      composes: avec({ btex: { B: 10, T: 20, E: 5, X: 15 } }),
    }
    // Rb = (10 + 20) / (5 + 15) = 1.5 → t = ln(6 / 1.5) / 0.308 = 4.5 years.
    const k = interpreter(e).ages.find((a) => /Kaplan/.test(a.methode))!
    expect(k.applicable).toBe(true)
    expect(k.annees!.centre).toBeCloseTo(4.5, 1)
  })
})

describe('sans isoprénoïdes ni chromatogramme', () => {
  test('la séquence HAP / BTEX donne le stade', () => {
    const e: Entree = {
      nom: 'x',
      matrice: 'sol',
      source: 'saisie',
      distribution: null,
      indicateurs: null,
      c17: null,
      pr: null,
      c18: null,
      ph: null,
      composes: avec({ hap: DISTILLAT_ALTERE }),
    }
    const l = interpreter(e)
    expect(l.stade.code).toBe(2)
    expect(l.stade.pm).toMatch(/HAP/)
  })
})

describe('fichier du laboratoire', () => {
  test('HAP, BTEX (xylènes en deux lignes), indice et fractions lus, unités harmonisées', () => {
    const g: Cell[][] = [
      ['Paramètre', 'N° CAS', 'Unité', 'S1 (0-1 m)', 'S2 (1-2 m)'],
      ['Naphtalène', '91-20-3', 'mg/kg MS', 12, '<0,05'],
      ['Phénanthrène', '85-01-8', 'mg/kg MS', 4, 2],
      ['Fluoranthène', '206-44-0', 'mg/kg MS', 0.5, 1],
      ['Pyrène', '129-00-0', 'mg/kg MS', 0.8, 1.2],
      ['Benzène', '71-43-2', 'µg/kg MS', 300, '<50'],
      ['Toluène', '108-88-3', 'mg/kg MS', 2, '<0,05'],
      ['Ethylbenzène', '100-41-4', 'mg/kg MS', 1, '<0,05'],
      ['o-Xylène', '95-47-6', 'mg/kg MS', 1, '<0,05'],
      ['m+p-Xylène', '', 'mg/kg MS', 2, '<0,05'],
      ['Xylènes (somme)', '1330-20-7', 'mg/kg MS', 3, '<0,1'],
      ['Indice hydrocarbures C10-C40', '', 'mg/kg MS', 2500, 800],
      ['Fraction C10-C12', '', 'mg/kg MS', 300, 20],
      ['Fraction C12-C16', '', 'mg/kg MS', 900, 150],
    ]
    const l = lireGrille(g, 'tout')
    expect(echantillonsComposes(l).length).toBe(2)
    const c = composesDepuisLecture(l, l.points[0].nom)
    expect(c.hap.Nap).toBe(12)
    expect(c.btex.B).toBeCloseTo(0.3) // 300 µg/kg → 0.3 mg/kg
    expect(c.btex.X).toBe(3)
    expect(c.hct).toBe(2500)
    expect(c.fractions).toHaveLength(2)
    const c2 = composesDepuisLecture(l, l.points[1].nom)
    expect(c2.hap.Nap).toBe(0)
    expect(c2.btex.T).toBe(0)
  })
})
