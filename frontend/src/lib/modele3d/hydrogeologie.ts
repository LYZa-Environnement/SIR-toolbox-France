/**
 * The aquifer of the plume and the transport in it, for the delineation:
 * which formations the wells are screened in, where the aquifer lies, how
 * fast water and pollutant move, and where a new well should be screened.
 *
 * - Aquifer: the formations crossed by the screens of the sampled wells,
 *   each weighed by the screened length in it, read in the well's own log
 *   (its keywords grouped as the model's formations, else its lithology
 *   classes). The heaviest formation and those next to it holding at least
 *   a quarter of its weight form the aquifer; the formation below is its
 *   base (« mur »). Without any screen: the formation where the water was
 *   met while drilling. The aquifer's top and base at any point come from
 *   the continuous formations of the model.
 * - Hydraulic conductivity K: entered (a test), else an order of magnitude
 *   for the dominant lithology of each formation (R. A. Freeze,
 *   J. A. Cherry, « Groundwater », 1979, table 2.2, geometric middle of the
 *   range), the aquifer's being their mean weighted by the screened length
 *   (flow parallel to the layers). An order of magnitude only: the BRGM
 *   guide of 2024 gives these ranges as a figure (RP-74064-FR, § 2.3).
 * - Transport, after the BRGM guide on the behaviour of pollutants (Lemière
 *   et al., Documents du BRGM 300, 2008, annexe 4): real velocity of the
 *   water u = K·J / ωc, ωc the kinematic porosity (1 to 10 %, against 25 to
 *   35 % of total porosity: § A4.4.2); retardation R = 1 + ρd·Kd / ω with
 *   Kd = Koc·foc (§ A4.3.6); pollutant velocity u / R; transverse
 *   dispersivity a tenth of the longitudinal one, αT = αL / 10, and
 *   αL ≈ L / 10 for a distance travelled L (§ A4.4.1 b). A plume then
 *   spreads about √10 times less across the flow than along it: the ratio
 *   of the anisotropic interpolation.
 * - A steady plume beyond a well at C (advection and first-order decay,
 *   dispersion left out): C(x) = C·exp(−λ·x / v), λ = ln 2 / t½, so the
 *   comparison value is reached at x = v·ln(C / valeur) / λ.
 *
 * Pure.
 */

import type { Base } from '../suivi/modele.ts'
import type { Comportement, Phase } from './comportement.ts'
import { cleMotCle } from './formations.ts'
import { CLASSES_LITHO } from './lithologie.ts'
import type { Modele, PointModele } from './modele.ts'

/** Seconds in a (Julian) year. */
const AN = 365.25 * 86400

/** Hydraulic conductivity of a lithology (m/s): Freeze and Cherry (1979), table 2.2. */
export const PERMEABILITES: Partial<Record<string, { min: number; max: number; libelle: string }>> = {
  grav: { min: 1e-3, max: 1, libelle: 'gravier' },
  galet: { min: 1e-3, max: 1, libelle: 'gravier' },
  sable: { min: 1e-6, max: 1e-2, libelle: 'sable propre' },
  silt: { min: 1e-9, max: 1e-5, libelle: 'limon, lœss' },
  argile: { min: 1e-12, max: 1e-9, libelle: 'argile non altérée' },
  gres: { min: 1e-10, max: 1e-6, libelle: 'grès' },
  calc: { min: 1e-9, max: 1e-6, libelle: 'calcaire et dolomie (non karstiques)' },
}

/** Geometric middle of a range. */
const milieu = (p: { min: number; max: number }) => Math.sqrt(p.min * p.max)

export interface Unite {
  /** Formation id (or lithology class without continuous formations). */
  id: string
  nom: string
  /** Dominant lithology class in the logs. */
  classe: string | null
  /** Screened length in it, over all the sampled wells (m). */
  poids: number
}

export interface Aquifere {
  /** Formations of the aquifer, from the top. */
  unites: Unite[]
  /** Their indices among the model's formations (null without continuous formations). */
  indices: number[] | null
  /** The formation under the aquifer. */
  mur: { id: string; nom: string } | null
  /** Sampled wells with a known screen, and those screened in the aquifer. */
  crepines: number
  dansAquifere: number
  origine: 'crepines' | 'foration'
}

export interface Crepine {
  /** Screened interval, depth below ground (m) and elevation (m NGF). */
  de: number
  a: number
  zHaut: number
  zBas: number
  /** Screened length in each unit (m). */
  unites: Map<string, number>
}

/** Unit of a log layer: its formation in the model, else its lithology class. */
function uniteDe(m: Modele, l: { cle: string; classe: string }): string {
  return m.configFormations ? (m.configFormations.affectation[cleMotCle(l)] ?? l.classe) : l.classe
}

function nomUnite(m: Modele, id: string): string {
  return m.configFormations?.formations.find((f) => f.id === id)?.nom ?? CLASSES_LITHO[id]?.libelle ?? id
}

/** A well's screen and the units it crosses, from its log. */
export function crepineLue(m: Modele, p: PointModele): Crepine | null {
  const c = p.crepine
  if (!c || !(c.a > c.de)) return null
  const unites = new Map<string, number>()
  for (const l of p.forage?.lithologie ?? []) {
    const recouvrement = Math.min(c.a, l.a) - Math.max(c.de, l.de)
    if (recouvrement > 0) {
      const u = uniteDe(m, l)
      unites.set(u, (unites.get(u) ?? 0) + recouvrement)
    }
  }
  return { de: c.de, a: c.a, zHaut: p.zSol - c.de, zBas: p.zSol - c.a, unites }
}

/** Order of the units from the top: the formations' order, else the median depth of their tops in the logs. */
function ordreUnites(m: Modele): string[] {
  if (m.configFormations) return m.configFormations.formations.map((f) => f.id)
  const tops = new Map<string, number[]>()
  for (const p of m.points)
    for (const l of p.forage?.lithologie ?? []) {
      const u = uniteDe(m, l)
      ;(tops.get(u) ?? tops.set(u, []).get(u)!).push(l.de)
    }
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]
  return [...tops.keys()].sort((a, b) => med(tops.get(a)!) - med(tops.get(b)!))
}

/** Dominant lithology class of a unit, by thickness in the logs. */
function classeDominante(m: Modele, id: string): string | null {
  const epaisseurs = new Map<string, number>()
  for (const p of m.points)
    for (const l of p.forage?.lithologie ?? []) if (uniteDe(m, l) === id) epaisseurs.set(l.classe, (epaisseurs.get(l.classe) ?? 0) + (l.a - l.de))
  let meilleure: string | null = null
  for (const [c, e] of epaisseurs) if (meilleure === null || e > epaisseurs.get(meilleure)!) meilleure = c
  return meilleure
}

/** The aquifer the sampled wells are screened in (see the head of the file); null when nothing tells it. */
export function aquifereDe(m: Modele, base: Base | null): Aquifere | null {
  const analyses = new Set((base?.resultats ?? []).filter((r) => !r.exclu).map((r) => r.ouvrage))
  const poids = new Map<string, number>()
  let crepines = 0
  for (const p of m.points) {
    if (!analyses.has(p.cle)) continue
    const c = crepineLue(m, p)
    if (!c || !c.unites.size) continue
    crepines++
    for (const [u, l] of c.unites) poids.set(u, (poids.get(u) ?? 0) + l)
  }
  let origine: Aquifere['origine'] = 'crepines'
  if (!poids.size) {
    // No screen: where the water was met while drilling.
    origine = 'foration'
    for (const p of m.points) {
      const prof = p.forage?.niveauEau
      if (prof == null) continue
      const l = p.forage!.lithologie.find((x) => x.de <= prof && x.a >= prof)
      if (l) poids.set(uniteDe(m, l), (poids.get(uniteDe(m, l)) ?? 0) + 1)
    }
  }
  if (!poids.size) return null
  const ordre = ordreUnites(m)
  const rang = (u: string) => ordre.indexOf(u)
  const principale = [...poids.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const seuil = poids.get(principale)! / 4
  // The heaviest unit and its neighbours above and below while they weigh enough.
  let haut = rang(principale)
  let bas = rang(principale)
  while (haut > 0 && (poids.get(ordre[haut - 1]) ?? 0) >= seuil) haut--
  while (bas >= 0 && bas < ordre.length - 1 && (poids.get(ordre[bas + 1]) ?? 0) >= seuil) bas++
  const ids = rang(principale) < 0 ? [principale] : ordre.slice(haut, bas + 1)
  const unites = ids.map((id) => ({ id, nom: nomUnite(m, id), classe: m.configFormations ? classeDominante(m, id) : id, poids: poids.get(id) ?? 0 }))
  const sous = bas >= 0 && bas < ordre.length - 1 ? ordre[bas + 1] : null
  const indices = m.formations ? ids.map((id) => m.formations!.formations.findIndex((f) => f.id === id)).filter((i) => i >= 0) : null
  let dansAquifere = 0
  for (const p of m.points) {
    if (!analyses.has(p.cle)) continue
    const c = crepineLue(m, p)
    if (c && ids.some((id) => c.unites.has(id))) dansAquifere++
  }
  return { unites, indices: indices?.length ? indices : null, mur: sous ? { id: sous, nom: nomUnite(m, sous) } : null, crepines, dansAquifere, origine }
}

/** Top and base of the aquifer at a node of the ground grid (m NGF), from the continuous formations. */
export function aquifereEnNoeud(m: Modele, aq: Aquifere, q: number): { toit: number; mur: number } | null {
  const r = m.formations
  if (!r || !aq.indices) return null
  const toit = Math.max(...aq.indices.map((i) => r.toits[i][q]))
  const mur = Math.min(...aq.indices.map((i) => r.murs[i][q]))
  return toit > mur ? { toit, mur } : null
}

/** Nodes of the ground grid where the aquifer exists (thicker than 5 cm); null without continuous formations. */
export function masqueAquifere(m: Modele, aq: Aquifere | null): Uint8Array | null {
  if (!aq?.indices || !m.formations) return null
  const r = m.formations
  const g = m.sol
  const masque = new Uint8Array(g.nx * g.ny)
  for (let q = 0; q < masque.length; q++) {
    let e = 0
    for (const i of aq.indices) e += Math.max(0, r.toits[i][q] - r.murs[i][q])
    masque[q] = e > 0.05 ? 1 : 0
  }
  return masque
}

/**
 * The aquifer in a well's own log: depth of its top and base below the
 * ground, the base null when the log stops in the aquifer.
 */
export function aquifereAuForage(m: Modele, aq: Aquifere, p: PointModele): { toit: number; mur: number | null } | null {
  const ls = p.forage?.lithologie ?? []
  const ids = new Set(aq.unites.map((u) => u.id))
  const dans = ls.filter((l) => ids.has(uniteDe(m, l)))
  if (!dans.length) return null
  const toit = Math.min(...dans.map((l) => l.de))
  const fond = Math.max(...dans.map((l) => l.a))
  // The base is seen when a layer of another unit follows below.
  const dessous = ls.some((l) => l.de >= fond - 0.01 && !ids.has(uniteDe(m, l)))
  return { toit, mur: dessous ? fond : null }
}

export interface Permeabilite {
  /** m/s */
  valeur: number
  plage: [number, number] | null
  origine: 'saisie' | 'lithologie'
  /** What the order of magnitude is made of. */
  detail: string
}

/** K of the aquifer: entered, else the lithologies' orders of magnitude weighted by the screened length. */
export function permeabiliteDe(aq: Aquifere | null, saisie: number | null): Permeabilite | null {
  if (saisie !== null && saisie > 0) return { valeur: saisie, plage: null, origine: 'saisie', detail: 'saisie (essai)' }
  if (!aq) return null
  const connues = aq.unites.flatMap((u) => {
    const k = u.classe ? PERMEABILITES[u.classe] : undefined
    return k ? [{ u, k, w: Math.max(u.poids, 1e-6) }] : []
  })
  if (!connues.length) return null
  const w = connues.reduce((s, c) => s + c.w, 0)
  const moyenne = (f: (k: { min: number; max: number }) => number) => connues.reduce((s, c) => s + c.w * f(c.k), 0) / w
  return {
    valeur: moyenne(milieu),
    plage: [moyenne((k) => k.min), moyenne((k) => k.max)],
    origine: 'lithologie',
    detail: connues.map((c) => `${c.u.nom} : ${c.k.libelle}`).join(' ; '),
  }
}

export interface HypothesesTransport {
  /** Hydraulic conductivity entered (m/s), null: the lithology's order of magnitude. */
  K: number | null
  /** Kinematic porosity (BRGM: 1 to 10 %). */
  porositeCinematique: number
  /** Total porosity, for the retardation (BRGM: 25 to 35 %). */
  porositeTotale: number
  /** Dry bulk density of the aquifer (kg/l). */
  masseVolumique: number
  /** Fraction of organic carbon of the aquifer. */
  foc: number
  /** Half-life of the compound in the aquifer (years), null: unknown. */
  demiVie: number | null
}

export const HYPOTHESES_DEFAUT: HypothesesTransport = { K: null, porositeCinematique: 0.05, porositeTotale: 0.3, masseVolumique: 1.7, foc: 0.001, demiVie: null }

export interface Transport {
  permeabilite: Permeabilite | null
  gradient: number | null
  /** Real velocity of the water (m/year), from a measured K only. */
  vitesseEau: number | null
  /** Retardation for the low and the high log Koc of the family. */
  retard: [number, number] | null
  /** Pollutant velocity (m/year): the fastest (low Koc) and the slowest. */
  vitessePolluant: [number, number] | null
  demiVie: number | null
  /** The velocities rest on a measured K (not an order of magnitude). */
  mesure: boolean
}

/**
 * Velocities of the water and the pollutant. Only from a measured K: the
 * lithologies' ranges span three to six orders of magnitude, their middle
 * would give velocities with no meaning.
 */
export function transportDe(aq: Aquifere | null, h: HypothesesTransport, gradient: number | null, c: Comportement): Transport {
  const permeabilite = permeabiliteDe(aq, h.K)
  const vitesseEau =
    permeabilite?.origine === 'saisie' && gradient !== null && gradient > 0 && h.porositeCinematique > 0 ? ((permeabilite.valeur * gradient) / h.porositeCinematique) * AN : null
  const retard = c.logKoc ? (c.logKoc.map((l) => 1 + (h.masseVolumique * 10 ** l * h.foc) / h.porositeTotale) as [number, number]) : null
  const vitessePolluant = vitesseEau === null ? null : retard ? ([vitesseEau / retard[0], vitesseEau / retard[1]] as [number, number]) : null
  return { permeabilite, gradient, vitesseEau, retard, vitessePolluant, demiVie: h.demiVie, mesure: permeabilite?.origine === 'saisie' }
}

/** Distance beyond a well at `rapport` times the comparison value where a steady plume falls to it (m). */
export function longueurStationnaire(vitesse: number, demiVie: number, rapport: number): number {
  if (!(vitesse > 0) || !(demiVie > 0) || !(rapport > 1)) return 0
  return (vitesse * Math.log(rapport)) / (Math.LN2 / demiVie)
}

/** Ratio of the plume's spread along the flow over its spread across: √(αL / αT), αT = αL / 10 (BRGM 2008, § A4.4.1). */
export const RAPPORT_ANISOTROPIE = Math.sqrt(10)

export interface CrepineConseillee {
  /** Screen, depth below ground (m). */
  de: number
  a: number
  /** Depth of the borehole (m). */
  profondeur: number
  raison: string
}

/**
 * Where to screen a new well for a compound: across the water table's
 * swing for a light phase, down to the aquifer's base for a dense one
 * (without going through it), over the saturated aquifer otherwise.
 * Elevations in m NGF: ground, water at the date, its highest and lowest
 * levels, aquifer's top and base (base null when unknown).
 */
export function crepineConseillee(phase: Phase, sol: number, eau: { haute: number; basse: number }, aquifere: { toit: number; mur: number | null } | null, murNom: string | null): CrepineConseillee | null {
  const prof = (z: number) => Math.round((sol - z) * 10) / 10
  const mur = aquifere?.mur ?? null
  let zHaut: number
  let zBas: number
  let raison: string
  if (phase === 'lnapl') {
    zHaut = Math.min(eau.haute + 0.5, sol - 0.5)
    zBas = eau.basse - 2
    if (mur !== null) zBas = Math.max(zBas, mur)
    raison = `à cheval sur la nappe (battement de ${(Math.round((eau.haute - eau.basse) * 10) / 10).toString().replace('.', ',')} m) : un composé plus léger que l’eau flotte`
  } else {
    zHaut = Math.min(eau.basse - 0.5, aquifere ? aquifere.toit : eau.basse - 0.5, sol - 0.5)
    // A dissolved plume above a dense phase stays at the base; without a known base, 5 m of saturated aquifer.
    zBas = mur ?? eau.basse - 5
    raison =
      phase === 'dnapl'
        ? `jusqu’au mur de l’aquifère${murNom ? ` (${murNom})` : ''} sans le traverser : un composé plus dense que l’eau s’y accumule et son panache s’y tient`
        : 'sur la hauteur saturée de l’aquifère'
  }
  if (!(zHaut - zBas > 0.5)) return null
  return { de: prof(zHaut), a: prof(zBas), profondeur: prof(zBas), raison }
}

/** Highest and lowest head of a well over the monitoring (m NGF): measured, else its measuring point minus the depth to water. */
export function battementDe(base: Base | null, cle: string): { haute: number; basse: number } | null {
  const repere = base?.ouvrages.find((o) => o.cle === cle)?.repere ?? null
  const cs = (base?.niveaux ?? [])
    .filter((n) => n.ouvrage === cle)
    .map((n) => n.charge ?? (repere !== null && n.profondeur !== null ? repere - n.profondeur : null))
    .filter((c): c is number => c !== null)
  return cs.length ? { haute: Math.max(...cs), basse: Math.min(...cs) } : null
}

/** Settings of the page for the hydrogeology of the delineation (kept in the dossier). */
export interface ReglagesHydro {
  /** K as typed (m/s): « 5e-4 », « 5.10-4 », « 0,0005 »; empty: not measured. */
  K: string
  porositeCinematique: number
  porositeTotale: number
  masseVolumique: number
  foc: number
  /** Half-life by compound key (years). */
  demiVies: Record<string, number>
  /** Interpolation stretched along the flow. */
  anisotropie: boolean
  /** Plume kept within the aquifer's extent. */
  limiterAquifere: boolean
}

export const HYDRO_DEFAUT: ReglagesHydro = {
  K: '',
  porositeCinematique: HYPOTHESES_DEFAUT.porositeCinematique,
  porositeTotale: HYPOTHESES_DEFAUT.porositeTotale,
  masseVolumique: HYPOTHESES_DEFAUT.masseVolumique,
  foc: HYPOTHESES_DEFAUT.foc,
  demiVies: {},
  anisotropie: true,
  limiterAquifere: true,
}

/** A hydraulic conductivity as typed: « 5e-4 », « 5.10-4 », « 5×10^-4 », « 0,0005 »; null when not a positive number. */
export function lirePermeabilite(texte: string): number | null {
  const t = texte.trim().replace(/\s/g, '').replace(/−/g, '-')
  if (!t) return null
  const puissance = t.match(/^(\d+(?:[.,]\d+)?)[x×.·*]10\^?(-?\d+)$/)
  const v = puissance ? Number(puissance[1].replace(',', '.')) * 10 ** Number(puissance[2]) : Number(t.replace(',', '.'))
  return Number.isFinite(v) && v > 0 && v < 10 ? v : null
}

/** The transport hypotheses of the settings for a compound. */
export function hypothesesDe(r: ReglagesHydro, compose: string): HypothesesTransport {
  return {
    K: lirePermeabilite(r.K),
    porositeCinematique: r.porositeCinematique,
    porositeTotale: r.porositeTotale,
    masseVolumique: r.masseVolumique,
    foc: r.foc,
    demiVie: r.demiVies[compose] ?? null,
  }
}
