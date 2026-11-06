/**
 * The transport form as typed (French decimals, units chosen by the user)
 * turned into BIOCHLOR inputs and field rate constants.
 */

import { lireNombre } from '../resultats/calc.ts'
import {
  darcy,
  dispersivite,
  ETHENES,
  focDepuisCOT,
  LITHOLOGIES,
  saisiesBiochlor,
  SECONDES_AN,
  tauxDegradation,
  vitesseReelle,
  type Ethene,
  type Milieu,
  type ModeVitesse,
  type SaisieBiochlor,
  type Taux,
} from './biochlor.ts'
import type { Jeu } from './donnees.ts'

export type UniteVitesse = 'm/s' | 'm/j' | 'm/an'

export interface SaisieHydro {
  mode: ModeVitesse
  q: string
  uniteQ: UniteVitesse
  K: string
  i: string
  vx: string
  uniteVx: UniteVitesse
  lithologie: string
  ne: string
  n: string
  rhob: string
  foc: string
  cot: string
  uniteCot: 'mg/kg' | '%'
  longueur: string
  koc: Record<Ethene, string>
  amont: string
  aval: string
  distance: string
  normaliser: boolean
  source: string
}

const virgule = (x: number) => String(x).replace('.', ',')

export const HYDRO_DEFAUT: SaisieHydro = {
  mode: 'darcy',
  q: '',
  uniteQ: 'm/j',
  K: '',
  i: '',
  vx: '',
  uniteVx: 'm/an',
  lithologie: '',
  ne: '0,2',
  n: '0,35',
  rhob: '1,6',
  foc: '0,001',
  cot: '',
  uniteCot: 'mg/kg',
  longueur: '',
  koc: Object.fromEntries(ETHENES.map((e) => [e.id, virgule(e.koc)])) as Record<Ethene, string>,
  amont: '',
  aval: '',
  distance: '',
  normaliser: true,
  source: '',
}

const PAR_AN: Record<UniteVitesse, number> = { 'm/s': SECONDES_AN, 'm/j': 365.25, 'm/an': 1 }

/** The fields a material fills (central values of the USEPA tables). */
export function avecLithologie(h: SaisieHydro, id: string): SaisieHydro {
  const l = LITHOLOGIES.find((x) => x.id === id)
  if (!l) return { ...h, lithologie: '' }
  const c = (r: [number, number] | null) => (r ? Math.round(((r[0] + r[1]) / 2) * 100) / 100 : null)
  const ne = c(l.ne)
  const n = c(l.n)
  const rhob = c(l.rhob)
  return {
    ...h,
    lithologie: id,
    ne: ne !== null ? virgule(ne) : h.ne,
    n: n !== null ? virgule(Math.max(n, ne ?? 0)) : h.n,
    rhob: rhob !== null ? virgule(rhob) : h.rhob,
  }
}

export interface Transport {
  /** Darcy velocity, m/an (null when the seepage velocity was typed directly). */
  q: number | null
  /** Seepage velocity, m/an. */
  vx: number | null
  milieu: Milieu | null
  K: number | null
  i: number | null
  /** Gradient from the water level elevations of the two sheets. */
  gradientFiches: { valeur: number; hA: number; hB: number; dates: [string, string] } | null
  taux: Taux[] | null
  facteur: number | null
  kocs: Record<Ethene, number>
  dispersivite: number | null
  saisies: SaisieBiochlor[]
  /** What is missing to compute, in plain words. */
  manque: string[]
  /** Lines for the report. */
  parametres: [string, string][]
}

export function calculerTransport(h: SaisieHydro, jeu: Jeu, sourceDefaut: string): Transport {
  const nb = (s: string) => {
    const x = lireNombre(s)
    return x !== null && x > 0 ? x : null
  }
  const manque: string[] = []
  const ne = nb(h.ne)
  const n = nb(h.n)
  const rhob = nb(h.rhob)
  const cot = nb(h.cot)
  const foc = cot !== null ? focDepuisCOT(cot, h.uniteCot) : nb(h.foc)
  const milieu = ne && n && rhob && foc ? { ne, n: Math.max(n, ne), rhob, foc } : null
  if (!ne) manque.push('porosité efficace')

  const K = h.mode === 'ki' ? nb(h.K) : null
  const i = h.mode === 'ki' ? nb(h.i) : null
  let q: number | null = null
  let vx: number | null = null
  if (h.mode === 'darcy') {
    const x = nb(h.q)
    q = x !== null ? x * PAR_AN[h.uniteQ] : null
    if (q === null) manque.push('vitesse de Darcy')
  } else if (h.mode === 'ki') {
    if (!K) manque.push('conductivité hydraulique K')
    if (!i) manque.push('gradient hydraulique i')
    q = K && i ? darcy(K, i) : null
  } else {
    const x = nb(h.vx)
    vx = x !== null ? x * PAR_AN[h.uniteVx] : null
    if (vx === null) manque.push('vitesse réelle')
  }
  if (q !== null && ne) vx = vitesseReelle(q, ne)

  const kocs = Object.fromEntries(ETHENES.map((e) => [e.id, nb(h.koc[e.id]) ?? e.koc])) as Record<Ethene, number>
  const dist = nb(h.distance)
  const oA = jeu.ouvrages.find((o) => o.cle === h.amont)
  const oB = jeu.ouvrages.find((o) => o.cle === h.aval)
  const hA = oA?.fiche?.coteNiveau ?? null
  const hB = oB?.fiche?.coteNiveau ?? null
  const gradientFiches = hA !== null && hB !== null && dist && h.amont !== h.aval ? { valeur: (hA - hB) / dist, hA, hB, dates: [oA!.date, oB!.date] as [string, string] } : null

  let taux: Taux[] | null = null
  let facteur: number | null = null
  if (vx && milieu && oA && oB && h.amont !== h.aval && dist) {
    const r = tauxDegradation(vx, milieu, dist, jeu.valeurs[oA.cle] ?? {}, jeu.valeurs[oB.cle] ?? {}, h.normaliser, kocs)
    taux = r.taux
    facteur = r.facteur
  }
  const longueur = nb(h.longueur)
  const sourceCle = h.source || sourceDefaut
  const oS = jeu.ouvrages.find((o) => o.cle === sourceCle)
  const saisies =
    vx && milieu
      ? saisiesBiochlor({ vx, K, i, milieu, koc: kocs, longueur, taux, source: oS ? { nom: oS.nom, t: jeu.valeurs[oS.cle] ?? {} } : null })
      : []

  const f = (x: number | null, u = '') => (x === null ? '-' : `${Number(x.toPrecision(3)).toLocaleString('fr-FR', { maximumFractionDigits: 8 })}${u}`)
  const lith = LITHOLOGIES.find((l) => l.id === h.lithologie)
  const parametres: [string, string][] = [
    ['Mode de calcul de la vitesse', h.mode === 'darcy' ? 'vitesse de Darcy et porosité efficace' : h.mode === 'ki' ? 'K × gradient, porosité efficace' : 'vitesse réelle saisie'],
    ...(h.mode === 'ki' ? ([['Conductivité hydraulique K', f(K, ' m/s')], ['Gradient hydraulique i', f(i, ' m/m')]] as [string, string][]) : []),
    ['Vitesse de Darcy q = K·i', f(q, ' m/an')],
    ['Porosité efficace ne', f(ne)],
    ['Vitesse réelle vx = q / ne', f(vx, ' m/an')],
    ['Lithologie (valeurs types USEPA 1998)', lith?.libelle ?? 'non précisée'],
    ['Porosité totale n', f(milieu?.n ?? null)],
    ['Masse volumique apparente ρb', f(rhob, ' kg/l')],
    ['Carbone organique foc', cot !== null ? `${f(foc)} (COT du sol ${f(cot, ` ${h.uniteCot}`)})` : f(foc)],
    ['Longueur du panache', f(longueur, ' m')],
    ['Dispersivité longitudinale αx (Xu et Eckstein, 1995)', f(longueur ? dispersivite(longueur) : null, ' m')],
    ['Ouvrage amont (A) / aval (B)', oA && oB ? `${oA.nom} → ${oB.nom}` : '-'],
    ['Distance A → B', f(dist, ' m')],
    ['Normalisation par les chlorures + chlore organique', h.normaliser ? `oui (TA/TB = ${f(facteur)})` : 'non'],
  ]
  return { q, vx, milieu, K, i, gradientFiches, taux, facteur, kocs, dispersivite: longueur ? dispersivite(longueur) : null, saisies, manque, parametres }
}
