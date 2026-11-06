/**
 * Transport inputs of BIOCHLOR (Aziz et al., 2000, USEPA/AFCEE) and the
 * field estimate of first-order biodegradation rates it asks for, after the
 * USEPA (1998) protocol, appendix C:
 *
 * - seepage velocity vx = K·i / ne (eq. C.3.6);
 * - retardation R = 1 + ρb·Kd / n, Kd = Koc·foc (eq. C.3.8, C.3.13);
 * - tracer normalisation CB,corr = CB·TA/TB (eq. C.3.24), the tracer being
 *   chloride plus organic chlorine, 0.86 PCE + 0.81 TCE + 0.73 DCE +
 *   0.57 VC (eq. C.3.25);
 * - λ = −ln(CB,corr / CA) / t, t = x / (vx / R) (eq. C.3.29, C.3.30).
 *
 * Koc defaults: USEPA (1998) table B.2.1, first value listed for each
 * compound. Literature rates for comparison: about 4 /yr for PCE, 1 /yr for
 * TCE (most between 0.3 and 3 /yr) and 0.6 /yr for VC (Aronson & Howard,
 * 1997, cited in section C.3.3.3.1).
 */

import type { ParamId, Valeur } from './parametres.ts'

export interface Aquifere {
  /** Hydraulic conductivity, m/s. */
  K: number
  /** Hydraulic gradient, m/m. */
  i: number
  /** Effective porosity. */
  ne: number
  /** Total porosity. */
  n: number
  /** Bulk density, kg/l. */
  rhob: number
  /** Fraction of organic carbon, g/g. */
  foc: number
}

export const AQUIFERE_DEFAUT: Aquifere = { K: 1e-4, i: 0.005, ne: 0.25, n: 0.3, rhob: 1.7, foc: 0.001 }

export type Ethene = 'pce' | 'tce' | 'dce' | 'cv'

export const ETHENES: { id: Ethene; libelle: string; koc: number; chlore: number; litterature: string }[] = [
  { id: 'pce', libelle: 'PCE', koc: 263, chlore: 0.86, litterature: '≈ 4 /an' },
  { id: 'tce', libelle: 'TCE', koc: 107, chlore: 0.81, litterature: '≈ 1 /an (0,3 à 3 /an)' },
  { id: 'dce', libelle: 'DCE', koc: 80.2, chlore: 0.73, litterature: '—' },
  { id: 'cv', libelle: 'CV', koc: 2.45, chlore: 0.57, litterature: '≈ 0,6 /an' },
]

const SECONDES_AN = 365.25 * 86400

/** m/an. */
export function vitesse(a: Aquifere): number {
  return ((a.K * a.i) / a.ne) * SECONDES_AN
}

export function retard(a: Aquifere, koc: number): number {
  return 1 + (a.rhob * koc * a.foc) / a.n
}

type Table = Partial<Record<ParamId, Valeur>>

/** µg/l, quantified only (DCE: sum of the isomers). */
export function concentration(t: Table, e: Ethene): number | null {
  const ids: ParamId[] = e === 'dce' ? ['cisdce', 'transdce', 'dce11'] : [e]
  const vs = ids.map((id) => t[id]).filter((v): v is Valeur => !!v)
  if (!vs.length) return null
  return vs.filter((v) => !v.inferieur).reduce((s, v) => s + v.valeur, 0)
}

/** Chloride plus organic chlorine, mg/l; null without chloride. */
export function traceur(t: Table): number | null {
  if (!t.chlorure) return null
  let s = t.chlorure.inferieur ? 0 : t.chlorure.valeur
  for (const e of ETHENES) s += ((concentration(t, e.id) ?? 0) / 1000) * e.chlore
  return s
}

export interface Taux {
  compose: Ethene
  cA: number | null
  cB: number | null
  cBcorr: number | null
  retard: number
  /** Travel time between the wells, years. */
  temps: number
  /** Biodegradation rate, 1/yr. */
  lambda: number | null
  note?: string
}

export function tauxDegradation(a: Aquifere, distance: number, tA: Table, tB: Table, normaliser: boolean, koc: Record<Ethene, number>): { vx: number; facteur: number | null; taux: Taux[] } {
  const vx = vitesse(a)
  const TA = traceur(tA)
  const TB = traceur(tB)
  const facteur = normaliser && TA && TB ? TA / TB : null
  const taux = ETHENES.map((e): Taux => {
    const R = retard(a, koc[e.id])
    const temps = distance / (vx / R)
    const cA = concentration(tA, e.id)
    const cB = concentration(tB, e.id)
    const cBcorr = cB === null ? null : facteur !== null ? cB * facteur : normaliser ? null : cB
    const base = { compose: e.id, cA, cB, cBcorr, retard: R, temps }
    if (normaliser && facteur === null) return { ...base, lambda: null, note: 'Chlorures nécessaires aux deux ouvrages pour la normalisation' }
    if (!cA || cBcorr === null) return { ...base, lambda: null, note: 'Composé non quantifié à l’ouvrage amont' }
    if (!cBcorr) return { ...base, lambda: null, note: 'Composé non quantifié à l’ouvrage aval : taux non calculable (au moins égal à la valeur obtenue avec la LQ)' }
    const lambda = -Math.log(cBcorr / cA) / temps
    return {
      ...base,
      lambda,
      note:
        lambda < 0
          ? e.id === 'pce'
            ? 'Concentration croissante vers l’aval : apport latéral ou source à l’aval, taux non représentatif'
            : 'Concentration croissante vers l’aval : produit de dégradation formé plus vite qu’il ne se dégrade (taux net)'
          : e.id === 'pce'
            ? undefined
            : 'Taux net : le composé est aussi formé à partir de son parent',
    }
  })
  return { vx, facteur, taux }
}
