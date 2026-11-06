/**
 * Inputs of BIOCHLOR (Aziz et al., 2000, USEPA/AFCEE) and the field
 * estimate of first-order biodegradation rates it asks for, after the
 * USEPA (1998) protocol, appendix C:
 *
 * - groundwater (seepage) velocity vx = q / ne, q = K·i the Darcy velocity
 *   (eq. C.3.6);
 * - retardation R = 1 + ρb·Kd / n, Kd = Koc·foc (eq. C.3.8, C.3.13);
 * - tracer normalisation CB,corr = CB·TA/TB (eq. C.3.24), the tracer being
 *   chloride plus organic chlorine, 0.86 PCE + 0.81 TCE + 0.73 DCE +
 *   0.57 VC (eq. C.3.25);
 * - λ = −ln(CB,corr / CA) / t, t = x / (vx / R) (eq. C.3.29, C.3.30);
 * - longitudinal dispersivity from the plume length, αx = 0.83 (log10 Lp)^2.414
 *   in metres (Xu & Eckstein, 1995), the estimate BIOSCREEN and BIOCHLOR
 *   propose, αy = 0.1 αx.
 *
 * Koc defaults: USEPA (1998) table B.2.1, first value listed for each
 * compound. Typical hydraulic conductivity, porosity and bulk density by
 * material: tables C.3.1 (after Domenico & Schwartz, 1990) and C.3.2
 * (after Walton, 1988 and Domenico & Schwartz, 1990). Literature rates for
 * comparison: about 4 /yr for PCE, 1 /yr for TCE (most between 0.3 and
 * 3 /yr) and 0.6 /yr for VC (Aronson & Howard, 1997, cited in C.3.3.3.1).
 */

import type { ParamId, Valeur } from './parametres.ts'

export type ModeVitesse = 'darcy' | 'ki' | 'reelle'

export interface Milieu {
  /** Effective porosity (moves the water). */
  ne: number
  /** Total porosity (in the retardation). */
  n: number
  /** Dry bulk density, kg/l. */
  rhob: number
  /** Fraction of organic carbon of the aquifer, g/g. */
  foc: number
}

export interface Lithologie {
  id: string
  libelle: string
  /** Hydraulic conductivity range, m/s (table C.3.1, m/day ÷ 86 400). */
  K: [number, number] | null
  ne: [number, number] | null
  n: [number, number] | null
  rhob: [number, number] | null
}

const parJour = (a: number, b: number): [number, number] => [a / 86400, b / 86400]

export const LITHOLOGIES: Lithologie[] = [
  { id: 'argile', libelle: 'Argile', K: parJour(9e-7, 4e-4), ne: [0.01, 0.2], n: [0.34, 0.6], rhob: [1.0, 2.4] },
  { id: 'limon', libelle: 'Limon', K: parJour(9e-5, 2), ne: [0.01, 0.3], n: [0.34, 0.61], rhob: null },
  { id: 'sable-argileux', libelle: 'Sable argileux', K: null, ne: [0.03, 0.2], n: null, rhob: null },
  { id: 'sable-fin', libelle: 'Sable fin', K: parJour(2e-2, 2e1), ne: [0.1, 0.3], n: [0.26, 0.53], rhob: [1.37, 1.81] },
  { id: 'sable-moyen', libelle: 'Sable moyen', K: parJour(8e-2, 5e1), ne: [0.15, 0.3], n: null, rhob: [1.37, 1.81] },
  { id: 'sable-grossier', libelle: 'Sable grossier', K: parJour(8e-2, 5e2), ne: [0.2, 0.35], n: [0.31, 0.46], rhob: [1.37, 1.81] },
  { id: 'sable-graveleux', libelle: 'Sable graveleux', K: null, ne: [0.2, 0.35], n: null, rhob: [1.37, 1.81] },
  { id: 'graviers', libelle: 'Graviers', K: parJour(3e1, 3e3), ne: [0.1, 0.35], n: [0.24, 0.38], rhob: [1.36, 2.19] },
  { id: 'gres', libelle: 'Grès', K: parJour(3e-5, 5e-1), ne: [0.1, 0.4], n: [0.05, 0.3], rhob: [1.6, 2.68] },
  { id: 'calcaire', libelle: 'Calcaire, dolomie (non karstique)', K: parJour(9e-5, 5e-1), ne: [0.01, 0.24], n: [0, 0.5], rhob: [1.74, 2.79] },
  { id: 'karst', libelle: 'Calcaire karstique', K: parJour(9e-2, 2e3), ne: [0.01, 0.24], n: null, rhob: [1.74, 2.79] },
]

export type Ethene = 'pce' | 'tce' | 'dce' | 'cv'

export const ETHENES: { id: Ethene; libelle: string; koc: number; chlore: number; litterature: string }[] = [
  { id: 'pce', libelle: 'PCE', koc: 263, chlore: 0.86, litterature: '≈ 4 /an' },
  { id: 'tce', libelle: 'TCE', koc: 107, chlore: 0.81, litterature: '≈ 1 /an (0,3 à 3 /an)' },
  { id: 'dce', libelle: 'DCE', koc: 80.2, chlore: 0.73, litterature: '—' },
  { id: 'cv', libelle: 'CV', koc: 2.45, chlore: 0.57, litterature: '≈ 0,6 /an' },
]

export const SECONDES_AN = 365.25 * 86400
export const PIED = 0.3048

/** Darcy velocity q = K·i, m/an. */
export const darcy = (K: number, i: number) => K * i * SECONDES_AN

/** Seepage velocity vx = q / ne, m/an. */
export const vitesseReelle = (q: number, ne: number) => q / ne

export function retard(m: Milieu, koc: number): number {
  return 1 + (m.rhob * koc * m.foc) / m.n
}

/** Longitudinal dispersivity, m, from the plume length in m (Xu & Eckstein, 1995). */
export function dispersivite(longueur: number): number | null {
  if (!(longueur > 1)) return null
  return 0.83 * Math.log10(longueur) ** 2.414
}

/** foc from the organic carbon of a soil sample: mg/kg dry matter, or %. */
export function focDepuisCOT(valeur: number, unite: 'mg/kg' | '%'): number {
  return unite === '%' ? valeur / 100 : valeur / 1e6
}

type Table = Partial<Record<ParamId, Valeur>>

/** µg/l, quantified only (DCE: sum of the isomers). */
export function concentration(t: Table, e: Ethene | 'eth'): number | null {
  const ids: ParamId[] = e === 'dce' ? ['cisdce', 'transdce', 'dce11'] : e === 'eth' ? ['ethene'] : [e]
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

export function tauxDegradation(
  vx: number,
  m: Milieu,
  distance: number,
  tA: Table,
  tB: Table,
  normaliser: boolean,
  koc: Record<Ethene, number>,
): { facteur: number | null; taux: Taux[] } {
  const TA = traceur(tA)
  const TB = traceur(tB)
  const facteur = normaliser && TA && TB ? TA / TB : null
  const taux = ETHENES.map((e): Taux => {
    const R = retard(m, koc[e.id])
    const temps = distance / (vx / R)
    const cA = concentration(tA, e.id)
    const cB = concentration(tB, e.id)
    const cBcorr = cB === null ? null : facteur !== null ? cB * facteur : normaliser ? null : cB
    const base = { compose: e.id, cA, cB, cBcorr, retard: R, temps }
    if (normaliser && facteur === null) return { ...base, lambda: null, note: 'Chlorures nécessaires aux deux ouvrages pour la normalisation (ou décocher la normalisation)' }
    if (!cA || cBcorr === null) return { ...base, lambda: null, note: 'Composé non quantifié à l’ouvrage amont' }
    if (!cBcorr) return { ...base, lambda: null, note: 'Composé non quantifié à l’ouvrage aval : taux non calculable' }
    const lambda = -Math.log(cBcorr / cA) / temps
    return {
      ...base,
      lambda,
      note:
        lambda < 0
          ? e.id === 'pce'
            ? 'Concentration croissante vers l’aval : apport latéral ou source à l’aval, taux non représentatif'
            : 'Concentration croissante vers l’aval : produit de dégradation formé plus vite qu’il ne se dégrade (taux net)'
          : [
              e.id === 'pce' ? '' : 'Taux net : le composé est aussi formé à partir de son parent',
              normaliser ? '' : 'Non normalisé : dilution et dispersion comptées comme dégradation (taux majoré)',
            ]
              .filter(Boolean)
              .join(' ; ') || undefined,
    }
  })
  return { facteur, taux }
}

/** What to type in BIOCHLOR, in its (US) units and in SI. */
export interface SaisieBiochlor {
  section: string
  champ: string
  si: string
  biochlor: string
}

const f = (x: number, c = 3) => Number(x.toPrecision(c)).toLocaleString('fr-FR', { maximumFractionDigits: 8 })

export function saisiesBiochlor(p: {
  vx: number
  K: number | null
  i: number | null
  milieu: Milieu
  koc: Record<Ethene, number>
  longueur: number | null
  taux: Taux[] | null
  source: { nom: string; t: Table } | null
}): SaisieBiochlor[] {
  const s: SaisieBiochlor[] = []
  s.push({ section: '1. Advection', champ: 'Vitesse réelle (seepage velocity) Vs', si: `${f(p.vx)} m/an`, biochlor: `${f(p.vx / PIED)} ft/yr` })
  if (p.K !== null) s.push({ section: '1. Advection', champ: 'Conductivité hydraulique K', si: `${f(p.K)} m/s`, biochlor: `${f(p.K * 100)} cm/sec` })
  if (p.i !== null) s.push({ section: '1. Advection', champ: 'Gradient hydraulique i', si: `${f(p.i)} m/m`, biochlor: `${f(p.i)} ft/ft` })
  s.push({ section: '1. Advection', champ: 'Porosité efficace n', si: f(p.milieu.ne), biochlor: f(p.milieu.ne) })
  const ax = p.longueur ? dispersivite(p.longueur) : null
  if (ax !== null) {
    s.push({ section: '2. Dispersion', champ: 'Dispersivité longitudinale αx (Xu et Eckstein)', si: `${f(ax)} m`, biochlor: `${f(ax / PIED)} ft` })
    s.push({ section: '2. Dispersion', champ: 'Dispersivité transversale αy (0,1 αx)', si: `${f(ax / 10)} m`, biochlor: `${f(ax / 10 / PIED)} ft` })
    s.push({ section: '2. Dispersion', champ: 'Dispersivité verticale αz', si: 'très faible (≈ 0)', biochlor: 'valeur par défaut du logiciel' })
  }
  s.push({ section: '3. Adsorption', champ: 'Masse volumique apparente ρb', si: `${f(p.milieu.rhob)} kg/l`, biochlor: `${f(p.milieu.rhob)} kg/L` })
  s.push({ section: '3. Adsorption', champ: 'Fraction de carbone organique foc', si: f(p.milieu.foc), biochlor: f(p.milieu.foc) })
  for (const e of ETHENES) s.push({ section: '3. Adsorption', champ: `Koc ${e.libelle} → retard R`, si: `${f(p.koc[e.id])} l/kg → R = ${f(retard(p.milieu, p.koc[e.id]))}`, biochlor: `${f(p.koc[e.id])} L/kg` })
  if (p.taux) {
    for (const x of p.taux) {
      const e = ETHENES.find((y) => y.id === x.compose)!
      if (x.lambda !== null && x.lambda > 0) s.push({ section: '4. Biotransformation', champ: `λ ${e.libelle}`, si: `${f(x.lambda)} /an`, biochlor: `${f(x.lambda)} 1/yr` })
    }
  }
  if (p.source) {
    for (const e of [...ETHENES.map((x) => ({ id: x.id as Ethene | 'eth', libelle: x.libelle })), { id: 'eth' as const, libelle: 'Éthène' }]) {
      const c = concentration(p.source.t, e.id)
      if (c !== null) s.push({ section: `6. Source (${p.source.nom})`, champ: `Concentration ${e.libelle}`, si: `${f(c)} µg/l`, biochlor: `${f(c / 1000)} mg/L` })
    }
  }
  return s
}
