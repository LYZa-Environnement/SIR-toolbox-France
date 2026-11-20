/**
 * Fictitious chromatograms, built from the shapes described in the BRGM
 * report (§ 5.1) and the ITRC fact sheet: a fresh diesel (n-alkane bell
 * C10–C25, n-C17/Pr ≈ 2.3), the same diesel biodegraded, a lubricating
 * oil (hump beyond C25), a diesel + oil mixture and plant waxes (odd
 * n-alkanes C25–C33). They serve the demonstration and the tests; the
 * time axis is slightly curved, as a real oven program gives, so that the
 * refinement of the carbon axis is exercised.
 */

import type { PointCalage, Trace } from './profil.ts'

export interface Exemple {
  id: string
  nom: string
  description: string
  trace: Trace
  calage: PointCalage[]
  /** n-C10 and n-C40 standards added by the lab. */
  etalons?: boolean
}

/**
 * The same trace with what many lab chromatograms show: a solvent front
 * before C10 and the n-C10 and n-C40 standards added to the extract, all
 * three far taller than the product.
 */
export function avecEtalons(t: Trace, hauteur = 4): Trace {
  const pics = [
    { t: temps(9.2), h: hauteur * 1.5 },
    { t: temps(10), h: hauteur },
    { t: temps(40), h: hauteur },
  ]
  return {
    x: t.x,
    y: t.y.map((v, i) => v + pics.reduce((s, p) => s + p.h * Math.exp(-0.5 * ((t.x[i] - p.t) / 0.02) ** 2), 0)),
  }
}

/** Retention time (min) of a carbon number: slightly curved, as with a temperature program. */
export const temps = (c: number) => 2 + 0.9 * (c - 10) + 0.004 * (c - 10) ** 2

function alea(graine: number) {
  let s = graine >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const gauss = (x: number, mu: number, s: number) => Math.exp(-0.5 * ((x - mu) / s) ** 2)

interface Composante {
  /** n-alkane height by carbon number. */
  alcane?: (n: number) => number
  pristane?: number
  phytane?: number
  /** Hump: height, centre and width in carbons. */
  ucm?: [number, number, number]
  /** Minor resolved peaks (branched, cyclic compounds): count and height scale. */
  mineurs?: [number, number, number, number]
}

function generer(composantes: Composante[], graine: number, bruit = 0.004): Trace {
  const rnd = alea(graine)
  const pics: { c: number; h: number }[] = []
  for (const k of composantes) {
    if (k.alcane) for (let n = 10; n <= 40; n++) pics.push({ c: n, h: k.alcane(n) })
    if (k.pristane) pics.push({ c: 17.07, h: k.pristane })
    if (k.phytane) pics.push({ c: 18.11, h: k.phytane })
    if (k.mineurs) {
      const [nombre, echelle, centre, largeur] = k.mineurs
      for (let i = 0; i < nombre; i++) {
        const c = 10 + rnd() * 30
        const frac = c - Math.floor(c)
        if (frac < 0.15 || frac > 0.85) continue // keep the n-alkane positions clear
        pics.push({ c, h: echelle * rnd() * gauss(c, centre, largeur) })
      }
    }
  }
  const x: number[] = []
  const y: number[] = []
  for (let c = 9; c <= 41; c += 0.004) {
    let v = 0.02 + 0.01 * (c - 9) / 32 // baseline drift (column bleed)
    for (const k of composantes) if (k.ucm) v += k.ucm[0] * gauss(c, k.ucm[1], k.ucm[2])
    for (const p of pics) if (Math.abs(c - p.c) < 0.15) v += p.h * gauss(c, p.c, 0.018)
    v += (rnd() - 0.5) * 2 * bruit
    x.push(temps(c))
    y.push(v)
  }
  return { x, y }
}

const CALAGE: PointCalage[] = [
  { x: temps(10), c: 10 },
  { x: temps(40), c: 40 },
]

const enveloppe = (centre: number, largeur: number) => (n: number) => gauss(n, centre, largeur)

/** Fresh diesel: bell of n-alkanes centred on C16, Pr = n-C17/2.3, Ph = n-C18/2.2. */
const gazole = (degradation: number, isoPerdus = 0): Composante => {
  const env = enveloppe(15.5, 3.2)
  return {
    alcane: (n) => (n <= 26 ? env(n) * (1 - degradation) : 0),
    pristane: (env(17) / 2.3) * (1 - isoPerdus),
    phytane: (env(18) / 2.2) * (1 - isoPerdus),
    ucm: [0.12 + 0.35 * degradation, 16.5, 3.2],
    mineurs: [260, 0.18, 16, 3.5],
  }
}

const huile: Composante = { ucm: [0.55, 29, 4], mineurs: [80, 0.03, 29, 4] }

export function exemples(): Exemple[] {
  return [
    {
      id: 'gazole',
      nom: 'Gazole frais',
      description: 'Série complète de n-alcanes C10–C25 centrée vers C16, doublets n-C17/pristane et n-C18/phytane.',
      trace: generer([gazole(0)], 1),
      calage: CALAGE,
    },
    {
      id: 'gazole-degrade',
      nom: 'Gazole biodégradé',
      description: 'Le même gazole après consommation de 60 % des n-alcanes : isoprénoïdes prédominants dans les doublets, bosse plus haute.',
      trace: generer([gazole(0.6)], 2),
      calage: CALAGE,
    },
    {
      id: 'gazole-severe',
      nom: 'Gazole très dégradé',
      description: 'n-alcanes et isoprénoïdes consommés : il ne reste que la bosse non résolue.',
      trace: generer([gazole(0.99, 0.99)], 3),
      calage: CALAGE,
    },
    {
      id: 'gazole-etalons',
      nom: 'Gazole biodégradé + étalons C10/C40',
      description: 'Le gazole biodégradé tel que le rendent certains laboratoires : front de solvant, puis n-C10 et n-C40 ajoutés comme repères, bien plus hauts que le produit.',
      trace: avecEtalons(generer([gazole(0.6)], 2)),
      calage: CALAGE,
      etalons: true,
    },
    {
      id: 'huile',
      nom: 'Huile lubrifiante',
      description: 'Bosse non résolue centrée vers C29, sans série de n-alcanes.',
      trace: generer([huile], 4),
      calage: CALAGE,
    },
    {
      id: 'melange',
      nom: 'Gazole + huile',
      description: 'Deux massifs : n-alcanes du gazole vers C16 et bosse de l’huile vers C29.',
      trace: generer([gazole(0.2), huile], 5),
      calage: CALAGE,
    },
    {
      id: 'vegetal',
      nom: 'Cires végétales',
      description: 'n-alcanes impairs C25–C33 prédominants (C29, C31) : hydrocarbures biogènes, non pétroliers.',
      trace: generer([{ alcane: (n) => (n >= 21 ? (n % 2 ? 1 : 0.12) * gauss(n, 29.5, 2.6) : 0), ucm: [0.03, 28, 4] }], 6),
      calage: CALAGE,
    },
  ]
}
