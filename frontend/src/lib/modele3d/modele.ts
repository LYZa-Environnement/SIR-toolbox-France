/**
 * The 3D model of the site, in a local frame: x east, y north (metres from
 * the centre of the boreholes), z elevation (m NGF, or relative to the
 * ground when no elevation is known anywhere).
 *
 * - Points: each borehole and each monitoring well, matched by name
 *   ("PZ 01" = "pz-1"); coordinates from the log, else from the monitoring.
 * - Ground surface: IGN's elevation model when the site is in Lambert 93,
 *   adjusted to the levelled collars (residuals spread by inverse distance);
 *   else the collars' elevations, trend plus residuals.
 * - Geology: blocks (voxels) between the ground and the base of the
 *   boreholes; each block takes the lithology that dominates among the
 *   boreholes around it at the same elevation, weighted by the inverse of
 *   the squared distance, a vertical metre counting as ten horizontal ones
 *   (layers extend sideways far more than they thicken). Only between the
 *   boreholes (their convex hull) and within 1.5 times their median spacing
 *   beyond: the model does not invent the ground far from what was seen.
 * - Water table: at each campaign, the heads of the wells, trend plus
 *   residuals; flow down the least-squares plane, as in Suivi temporel.
 * - Plume: the concentrations of a compound at a campaign, weighted by
 *   inverse distance on their logarithm (concentrations spread over orders
 *   of magnitude), shown on the water table between the wells only.
 * - Soils: the same weighting in three dimensions on the soil results, to
 *   outline the blocks above a threshold and give their volume — an order of
 *   magnitude for a first cubature, not a geostatistical estimate.
 *
 * Pure: the elevation model is fetched beforehand (ign.ts) and handed in.
 */

import type { Base, Ouvrage, Resultat } from '../suivi/modele.ts'
import type { Donnees } from './assemblage.ts'
import {
  distancePlusProche,
  ecoulementDuPlan,
  espacementMedian,
  nouvelleGrille,
  planMoindresCarres,
  remplir,
  surfaceTendance,
  valeurEn,
  zoneInterpolee,
  type Grille,
  type Plan,
  type PointValeur,
} from './interpolation.ts'
import { ORDRE_CLASSES } from './lithologie.ts'
import type { Forage, Intervalle } from './types.ts'

export type OrigineZ = 'forage' | 'mnt' | 'repere' | 'interpole' | 'relatif'

export const LIBELLES_ORIGINE_Z: Record<OrigineZ, string> = {
  forage: 'cote du log, onglet Collars',
  mnt: 'MNT IGN (RGE ALTI)',
  repere: 'cote du repère de l’ouvrage (approchée)',
  interpole: 'interpolée entre les forages voisins',
  relatif: 'sans cote : profondeurs comptées depuis le sol',
}

export interface PointModele {
  cle: string
  nom: string
  /** Local coordinates (m). */
  x: number
  y: number
  /** Coordinates in the source system, when known. */
  xa: number | null
  ya: number | null
  /** Ground elevation used for the point. */
  zSol: number
  origineZ: OrigineZ
  forage: Forage | null
  ouvrage: Ouvrage | null
  /** Coordinates known: the point takes part in the interpolations. */
  place: boolean
  /** Screened interval (from the shallowest top to the deepest base of the screens). */
  crepine: Intervalle | null
}

/** A regular block grid: block (i, j, k) centred at (x0 + (i + ½)dx, y0 + (j + ½)dy, z0 + (k + ½)dz). */
export interface GrilleBlocs {
  x0: number
  y0: number
  z0: number
  dx: number
  dy: number
  dz: number
  nx: number
  ny: number
  nz: number
}

export const indexBloc = (g: GrilleBlocs, i: number, j: number, k: number) => (k * g.ny + j) * g.nx + i

export interface Geologie {
  /** 0: empty; else 1 + index in `classes`. */
  valeurs: Uint8Array
  classes: string[]
  /** Modelled volume of each class (m³). */
  volumes: Record<string, number>
}

/** A georeferenced elevation grid (IGN), in the points' projected system. */
export interface Mnt {
  grille: Grille
}

export interface Modele {
  /** Coordinates in Lambert 93: the IGN and BRGM maps can be laid on the ground. */
  georef: boolean
  /** Local origin in the source system. */
  origine: { x: number; y: number }
  emprise: { xmin: number; xmax: number; ymin: number; ymax: number }
  zmin: number
  zmax: number
  /** No elevation anywhere: z counts from the ground (0 at the surface). */
  relatif: boolean
  points: PointModele[]
  sol: Grille
  /** Base of the model (bottom of the boreholes, interpolated). */
  base: Grille
  blocs: GrilleBlocs
  geologie: Geologie | null
  /** Horizontal reach of the interpolations from the boreholes (m). */
  portee: number
  avertissements: string[]
}

export const estLambert93 = (x: number, y: number) => x > 50_000 && x < 1_300_000 && y > 6_000_000 && y < 7_200_000

/** Screened interval of a borehole: from the top of the highest screen to the base of the deepest. */
export function crepineDe(f: Forage | null): Intervalle | null {
  const cs = (f?.equipement ?? []).filter((e) => e.element === 'CREPINE')
  return cs.length ? { de: Math.min(...cs.map((c) => c.de)), a: Math.max(...cs.map((c) => c.a)) } : null
}

/** Lithology class of a borehole at a depth below its collar; the nearest layer and its vertical distance when outside. */
export function lithoA(f: Forage, profondeur: number): { classe: string; ecart: number } | null {
  const ls = f.lithologie
  if (!ls.length) return null
  let meilleur: { classe: string; ecart: number } | null = null
  for (const l of ls) {
    const ecart = profondeur < l.de ? l.de - profondeur : profondeur > l.a ? profondeur - l.a : 0
    if (!meilleur || ecart < meilleur.ecart) meilleur = { classe: l.classe, ecart }
    if (ecart === 0) break
  }
  return meilleur
}

export interface OptionsModele {
  mnt?: Mnt | null
  /** A vertical metre weighs as many horizontal ones in the geology (default 10). */
  anisotropie?: number
  /** Fill every block of the extent, however far from a borehole. */
  etendre?: boolean
}

export function construireModele(d: Donnees, o: OptionsModele = {}): Modele {
  const avertissements: string[] = []
  const anisotropie = o.anisotropie ?? 10

  // ---- Points: boreholes and wells matched by name --------------------------------------------
  const ouvrages = (d.base?.ouvrages ?? []).filter((w) => !w.exclu)
  const cles = new Set([...d.forages.map((f) => f.cle), ...ouvrages.map((w) => w.cle)])
  const bruts = [...cles].map((cle) => {
    const forage = d.forages.find((f) => f.cle === cle) ?? null
    const ouvrage = ouvrages.find((w) => w.cle === cle) ?? null
    const xa = forage?.x ?? ouvrage?.x ?? null
    const ya = forage?.y ?? ouvrage?.y ?? null
    return { cle, nom: forage?.nom ?? ouvrage?.nom ?? cle, forage, ouvrage, xa, ya }
  })
  const places = bruts.filter((p) => p.xa !== null && p.ya !== null)
  const georef = places.length > 0 && places.every((p) => estLambert93(p.xa!, p.ya!))
  const ox = places.length ? (Math.min(...places.map((p) => p.xa!)) + Math.max(...places.map((p) => p.xa!))) / 2 : 0
  const oy = places.length ? (Math.min(...places.map((p) => p.ya!)) + Math.max(...places.map((p) => p.ya!))) / 2 : 0
  const locaux = places.map((p) => ({ x: p.xa! - ox, y: p.ya! - oy }))
  let xmin = locaux.length ? Math.min(...locaux.map((p) => p.x)) : -25
  let xmax = locaux.length ? Math.max(...locaux.map((p) => p.x)) : 25
  let ymin = locaux.length ? Math.min(...locaux.map((p) => p.y)) : -25
  let ymax = locaux.length ? Math.max(...locaux.map((p) => p.y)) : 25
  const etendue = Math.max(xmax - xmin, ymax - ymin, 20)
  const marge = Math.max(8, 0.15 * etendue)
  xmin -= marge
  xmax += marge
  ymin -= marge
  ymax += marge
  const sansPlace = bruts.filter((p) => p.xa === null || p.ya === null)
  if (sansPlace.length)
    avertissements.push(
      `Sans coordonnées, placé${sansPlace.length > 1 ? 's' : ''} hors modèle, au sud : ${sansPlace.map((p) => p.nom).join(', ')}. Renseignez l’onglet Collars du classeur des logs ou l’onglet Ouvrages du suivi.`,
    )
  // Wells without coordinates lined up south of the extent, out of the interpolations.
  const pasRangee = Math.max(4, (xmax - xmin) / Math.max(sansPlace.length + 1, 6))

  // ---- Ground elevation ------------------------------------------------------------------------
  const mnt = georef ? (o.mnt ?? null) : null
  const zMnt = (x: number, y: number) => (mnt ? valeurEn(mnt.grille, x + ox, y + oy) : Number.NaN)
  const cotes: (PointValeur & { cle: string })[] = []
  for (const p of bruts) {
    if (p.xa === null || p.ya === null) continue
    const z = p.forage?.z ?? null
    if (z !== null) cotes.push({ cle: p.cle, x: p.xa - ox, y: p.ya - oy, v: z })
  }
  // A well with a measuring point elevation and no log: the ground is about there (the tube stands a little above it).
  const reperes: PointValeur[] = []
  for (const p of bruts) if (p.xa !== null && p.ya !== null && p.forage?.z == null && p.ouvrage?.repere != null) reperes.push({ x: p.xa - ox, y: p.ya - oy, v: p.ouvrage.repere })
  const relatif = !cotes.length && !reperes.length && !mnt
  if (relatif) avertissements.push('Aucune cote NGF (onglet Collars, cote du repère des ouvrages) et pas de MNT : le modèle est dessiné en profondeur, le sol à 0.')

  let surface: (x: number, y: number) => number
  if (mnt) {
    const residus = cotes.map((c) => ({ x: c.x, y: c.y, v: c.v - zMnt(c.x, c.y) })).filter((r) => Number.isFinite(r.v))
    // A shift common to every collar (another vertical datum, a levelling from an arbitrary
    // benchmark) moves the whole relief; what is left is spread around each collar.
    const tries = residus.map((r) => r.v).sort((a, b) => a - b)
    const decalage = tries.length ? (tries.length % 2 ? tries[(tries.length - 1) / 2] : (tries[tries.length / 2 - 1] + tries[tries.length / 2]) / 2) : 0
    if (Math.abs(decalage) > 1)
      avertissements.push(
        `Les cotes des forages sont ${decalage > 0 ? 'au-dessus' : 'au-dessous'} du MNT IGN de ${Math.abs(decalage).toFixed(1).replace('.', ',')} m en moyenne : vérifier le nivellement (repère, système de cotes). Le relief IGN est recalé sur les forages.`,
      )
    const ecarts = residus.filter((r) => Math.abs(r.v - decalage) > 2)
    if (ecarts.length)
      avertissements.push(`Cote du log éloignée de plus de 2 m du relief IGN recalé : ${ecarts.length} forage${ecarts.length > 1 ? 's' : ''}. Le sol du modèle passe par les cotes des forages.`)
    const corr = residus.length ? surfaceTendanceResidus(residus.map((r) => ({ ...r, v: r.v - decalage }))) : () => 0
    surface = (x, y) => zMnt(x, y) + decalage + corr(x, y)
  } else if (cotes.length || reperes.length) {
    surface = surfaceTendance(cotes.length >= 2 || !reperes.length ? cotes : [...cotes, ...reperes])
  } else surface = () => 0

  const nGrand = 41
  const nxs = xmax - xmin >= ymax - ymin ? nGrand : Math.max(11, Math.round((nGrand * (xmax - xmin)) / (ymax - ymin)))
  const nys = ymax - ymin > xmax - xmin ? nGrand : Math.max(11, Math.round((nGrand * (ymax - ymin)) / (xmax - xmin)))
  const sol = remplir(nouvelleGrille(xmin, ymin, xmax, ymax, nxs, nys), surface)

  const points: PointModele[] = bruts.map((p) => {
    const place = p.xa !== null && p.ya !== null
    const x = place ? p.xa! - ox : xmin + pasRangee * (sansPlace.indexOf(p) + 1)
    const y = place ? p.ya! - oy : ymin - marge * 0.6
    let zSol: number
    let origineZ: OrigineZ
    if (p.forage?.z != null) [zSol, origineZ] = [p.forage.z, 'forage']
    else if (relatif) [zSol, origineZ] = [0, 'relatif']
    else if (place && mnt && Number.isFinite(zMnt(x, y))) [zSol, origineZ] = [surface(x, y), 'mnt']
    else if (p.ouvrage?.repere != null) [zSol, origineZ] = [p.ouvrage.repere, 'repere']
    else [zSol, origineZ] = [place ? surface(x, y) : valeurMoyenne(sol), 'interpole']
    return { cle: p.cle, nom: p.nom, x, y, xa: p.xa, ya: p.ya, zSol, origineZ, forage: p.forage, ouvrage: p.ouvrage, place, crepine: crepineDe(p.forage) }
  })

  // ---- Base of the model -----------------------------------------------------------------------
  const fonds = points.filter((p) => p.place && p.forage && p.forage.profondeur > 0).map((p) => ({ x: p.x, y: p.y, v: p.zSol - p.forage!.profondeur }))
  const profMax = Math.max(5, ...points.map((p) => p.forage?.profondeur ?? 0))
  const base = remplir(nouvelleGrille(xmin, ymin, xmax, ymax, nxs, nys), (x, y) => {
    const s = valeurEn(sol, x, y)
    const b = fonds.length ? idwSimple(fonds, x, y) : s - profMax
    return Math.min(b, s - 0.5)
  })

  // ---- Vertical extent -------------------------------------------------------------------------
  const zs = [...sol.valeurs, ...base.valeurs, ...points.map((p) => p.zSol), ...points.map((p) => p.zSol - (p.forage?.profondeur ?? 0))]
  for (const n of d.base?.niveaux ?? []) if (n.charge !== null) zs.push(n.charge)
  const zmax = Math.max(...zs)
  const zmin = Math.min(...zs)

  // ---- Blocks ----------------------------------------------------------------------------------
  const cote = Math.max(xmax - xmin, ymax - ymin) / 40
  const nx = Math.max(4, Math.round((xmax - xmin) / cote))
  const ny = Math.max(4, Math.round((ymax - ymin) / cote))
  const hauteur = Math.max(1, zmax - zmin)
  const nz = Math.min(80, Math.max(12, Math.ceil(hauteur / 0.25)))
  const blocs: GrilleBlocs = { x0: xmin, y0: ymin, z0: zmin, dx: (xmax - xmin) / nx, dy: (ymax - ymin) / ny, dz: hauteur / nz, nx, ny, nz }

  const espacement = espacementMedian(points.filter((p) => p.place))
  const portee = Math.max(12, 1.5 * espacement)

  // ---- Geology ---------------------------------------------------------------------------------
  const logs = points.filter((p) => p.place && p.forage && p.forage.lithologie.length)
  let geologie: Geologie | null = null
  if (logs.length) {
    const classes = ORDRE_CLASSES.filter((c) => logs.some((p) => p.forage!.lithologie.some((l) => l.classe === c)))
    const rang = new Map(classes.map((c, i) => [c, i]))
    const valeurs = new Uint8Array(nx * ny * nz)
    const poids = new Float64Array(classes.length)
    const volumes: Record<string, number> = {}
    const vBloc = blocs.dx * blocs.dy * blocs.dz
    const dedans = zoneInterpolee(logs, portee)
    for (let j = 0; j < ny; j++) {
      const y = ymin + (j + 0.5) * blocs.dy
      for (let i = 0; i < nx; i++) {
        const x = xmin + (i + 0.5) * blocs.dx
        const proches = logs.map((p) => ({ p, d2: (p.x - x) ** 2 + (p.y - y) ** 2 }))
        if (!o.etendre && !dedans(x, y)) continue
        const s = valeurEn(sol, x, y)
        const b = valeurEn(base, x, y)
        for (let k = 0; k < nz; k++) {
          const z = zmin + (k + 0.5) * blocs.dz
          if (z > s || z < b) continue
          poids.fill(0)
          for (const { p, d2 } of proches) {
            const l = lithoA(p.forage!, p.zSol - z)
            if (!l) continue
            poids[rang.get(l.classe)!] += 1 / (d2 + (anisotropie * l.ecart) ** 2 + 0.01)
          }
          let m = 0
          for (let c = 1; c < poids.length; c++) if (poids[c] > poids[m]) m = c
          if (poids[m] > 0) {
            valeurs[indexBloc(blocs, i, j, k)] = m + 1
            volumes[classes[m]] = (volumes[classes[m]] ?? 0) + vBloc
          }
        }
      }
    }
    geologie = { valeurs, classes, volumes }
  } else if (d.forages.length) avertissements.push('Aucune lithologie dans les logs : pas de modèle géologique.')

  return { georef, origine: { x: ox, y: oy }, emprise: { xmin, xmax, ymin, ymax }, zmin, zmax, relatif, points, sol, base, blocs, geologie, portee, avertissements }
}

function valeurMoyenne(g: Grille): number {
  let s = 0
  for (const v of g.valeurs) s += v
  return s / g.valeurs.length
}

function idwSimple(points: PointValeur[], x: number, y: number): number {
  let sw = 0
  let sv = 0
  for (const p of points) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d2 < 1e-4) return p.v
    sw += 1 / d2
    sv += p.v / d2
  }
  return sv / sw
}

/** Residuals spread by inverse distance, fading to zero far from the points (a collar corrects its surroundings, not the whole map). */
function surfaceTendanceResidus(residus: PointValeur[]): (x: number, y: number) => number {
  const echelle = Math.max(15, espacementMedian(residus))
  return (x, y) => {
    let sw = 0
    let sv = 0
    for (const r of residus) {
      const d2 = (r.x - x) ** 2 + (r.y - y) ** 2
      if (d2 < 1e-4) return r.v
      const w = 1 / d2
      sw += w
      sv += w * r.v
    }
    // The weight of the residuals fades beyond the spacing of the collars.
    const dmin = distancePlusProche(residus, x, y)
    const attenuation = 1 / (1 + (dmin / echelle) ** 2)
    return sw > 0 ? (sv / sw) * attenuation : 0
  }
}

// ---- Water table ------------------------------------------------------------------------------

export type OrigineCharge = 'cote' | 'repere' | 'sol' | 'foration'

export const LIBELLES_ORIGINE_CHARGE: Record<OrigineCharge, string> = {
  cote: 'cote piézométrique mesurée',
  repere: 'cote du repère − profondeur de l’eau',
  sol: 'cote du sol − profondeur de l’eau (approchée)',
  foration: 'niveau d’eau relevé à la foration',
}

export interface Charge {
  cle: string
  nom: string
  x: number
  y: number
  charge: number
  profondeur: number | null
  origine: OrigineCharge
  date: string
}

export interface Nappe {
  charges: Charge[]
  /** Head on the ground grid's nodes (NaN beyond the reach of the wells), capped to the ground. */
  grille: Grille | null
  plan: Plan | null
  ecoulement: { azimut: number; gradient: number } | null
}

function nappeDe(m: Modele, charges: Charge[]): Nappe {
  const places = charges.filter((c) => m.points.find((p) => p.cle === c.cle)?.place)
  if (!places.length) return { charges, grille: null, plan: null, ecoulement: null }
  const pts = places.map((c) => ({ x: c.x, y: c.y, v: c.charge }))
  const f = surfaceTendance(pts)
  const dedans = zoneInterpolee(pts, Math.max(m.portee, 20))
  const g = nouvelleGrille(m.sol.x0, m.sol.y0, m.sol.x0 + (m.sol.nx - 1) * m.sol.dx, m.sol.y0 + (m.sol.ny - 1) * m.sol.dy, m.sol.nx, m.sol.ny)
  remplir(g, (x, y) => (dedans(x, y) ? Math.min(f(x, y), valeurEn(m.sol, x, y) - 0.02) : Number.NaN))
  const plan = planMoindresCarres(pts)
  return { charges, grille: g, plan, ecoulement: plan && pts.length >= 3 ? ecoulementDuPlan(plan) : null }
}

/** Head of a well from a level: measured, else measuring point − depth, else ground − depth. */
function chargeDe(m: Modele, p: PointModele, charge: number | null, profondeur: number | null): { charge: number; origine: OrigineCharge } | null {
  if (charge !== null && !m.relatif) return { charge, origine: 'cote' }
  if (profondeur === null) return null
  if (p.ouvrage?.repere != null && !m.relatif) return { charge: p.ouvrage.repere - profondeur, origine: 'repere' }
  return { charge: p.zSol - profondeur, origine: 'sol' }
}

/** The water table at a campaign of the monitoring. */
export function nappeCampagne(m: Modele, base: Base, campagne: string): Nappe {
  const charges: Charge[] = []
  for (const p of m.points) {
    const n = base.niveaux.find((x) => x.ouvrage === p.cle && x.campagne === campagne)
    if (!n) continue
    const c = chargeDe(m, p, n.charge, n.profondeur)
    if (c) charges.push({ cle: p.cle, nom: p.nom, x: p.x, y: p.y, ...c, profondeur: n.profondeur, date: n.date })
  }
  return nappeDe(m, charges)
}

/** The water table from the levels met while drilling (Water Level sheet of the logs). */
export function nappeForation(m: Modele): Nappe {
  const charges: Charge[] = []
  for (const p of m.points) {
    const prof = p.forage?.niveauEau ?? null
    if (prof === null) continue
    charges.push({ cle: p.cle, nom: p.nom, x: p.x, y: p.y, charge: p.zSol - prof, profondeur: prof, origine: 'foration', date: p.forage?.date ?? '' })
  }
  return nappeDe(m, charges)
}

// ---- Concentrations ---------------------------------------------------------------------------

/** Classes of a concentration against the comparison value (or none). */
export type ClasseConcentration = 'nq' | 'faible' | 'proche' | 'depasse' | 'fort'

export const CLASSES_CONCENTRATION: Record<ClasseConcentration, { libelle: string; couleur: string }> = {
  nq: { libelle: 'Non quantifié (< LQ)', couleur: '#8f9c9a' },
  faible: { libelle: '< ½ valeur de référence', couleur: '#2f8f5b' },
  proche: { libelle: '½ à 1 × la valeur', couleur: '#d9a521' },
  depasse: { libelle: '1 à 10 × la valeur', couleur: '#e0662f' },
  fort: { libelle: '> 10 × la valeur', couleur: '#b3261e' },
}

export function classeConcentration(valeur: number | null, inferieur: boolean, reference: number | null): ClasseConcentration | null {
  if (inferieur) return 'nq'
  if (valeur === null || reference === null || !(reference > 0)) return null
  const r = valeur / reference
  return r < 0.5 ? 'faible' : r < 1 ? 'proche' : r <= 10 ? 'depasse' : 'fort'
}

/** Sequential scale (no comparison value): position 0–1 of a value on the log range of the data. */
export function positionLog(valeur: number, min: number, max: number): number {
  if (!(min > 0) || !(max > min)) return 0.5
  return Math.min(1, Math.max(0, (Math.log10(Math.max(valeur, min)) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))))
}

export interface ValeurPoint {
  cle: string
  nom: string
  x: number
  y: number
  resultat: Resultat
}

export interface Panache {
  valeurs: ValeurPoint[]
  /** log10 of the concentration (the value itself when `lineaire`) on the ground grid's nodes, NaN beyond the reach of the sampled wells. */
  champ: Float64Array | null
  lineaire: boolean
}

/** Value used to interpolate: the result, half the LQ when not quantified. */
const valeurInterpolee = (valeur: number, inferieur: boolean) => Math.log10(Math.max(1e-9, inferieur ? valeur / 2 : valeur))

/**
 * A compound at a campaign: its result at each well, and the field between
 * them. Field readings (pH, redox…) are weighted on their values
 * (`lineaire`), concentrations on their logarithm.
 */
export function panache(m: Modele, base: Base, compose: string, campagne: string, lineaire = false): Panache {
  const valeurs: ValeurPoint[] = []
  for (const r of base.resultats) {
    if (r.compose !== compose || r.campagne !== campagne || r.exclu) continue
    const p = m.points.find((x) => x.cle === r.ouvrage)
    if (p) valeurs.push({ cle: p.cle, nom: p.nom, x: p.x, y: p.y, resultat: r })
  }
  const places = valeurs.filter((v) => m.points.find((p) => p.cle === v.cle)?.place)
  if (!places.length) return { valeurs, champ: null, lineaire }
  const pts = places.map((v) => ({ x: v.x, y: v.y, v: lineaire ? v.resultat.valeur : valeurInterpolee(v.resultat.valeur, v.resultat.inferieur) }))
  const dedans = zoneInterpolee(pts, Math.max(m.portee, 20))
  const g = m.sol
  const champ = new Float64Array(g.nx * g.ny)
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.dx
      const y = g.y0 + j * g.dy
      champ[j * g.nx + i] = dedans(x, y) ? idwSimple(pts, x, y) : Number.NaN
    }
  return { valeurs, champ, lineaire }
}

/** Results of a well for a compound, oldest first (for its chronicle). */
export function chronique(base: Base, ouvrage: string, compose: string): Resultat[] {
  return base.resultats.filter((r) => r.ouvrage === ouvrage && r.compose === compose && !r.exclu).sort((a, b) => a.t - b.t)
}

// ---- Soils ------------------------------------------------------------------------------------

export interface PointSol {
  cle: string
  forage: string
  echantillon: string
  x: number
  y: number
  /** Mid-depth elevation. */
  z: number
  de: number
  a: number
  date: string
  valeur: number | null
  inferieur: boolean
  brut: string
}

/** Soil results of a parameter placed at the mid-depth of their samples. */
export function pointsSol(m: Modele, parametre: string): PointSol[] {
  const r: PointSol[] = []
  for (const p of m.points) {
    if (!p.forage) continue
    for (const e of p.forage.echantillons) {
      const v = e.resultats[parametre]
      if (!v) continue
      r.push({ cle: p.cle, forage: p.nom, echantillon: e.id, x: p.x, y: p.y, z: p.zSol - (e.de + e.a) / 2, de: e.de, a: e.a, date: e.date, valeur: v.valeur, inferieur: v.inferieur, brut: v.brut })
    }
  }
  return r
}

export interface Enveloppe {
  /** 1 for a block at or above the threshold. */
  valeurs: Uint8Array
  /** Volume of those blocks (m³). */
  volume: number
  blocs: number
  /** Samples at or above the threshold. */
  depassements: number
}

/**
 * Blocks whose interpolated soil concentration reaches the threshold:
 * inverse-distance weighting in three dimensions on the logarithm of the
 * results (half the LQ when not quantified), a vertical metre weighing
 * `anisotropie` horizontal ones. A block is estimated only within the ground,
 * within three quarters of the median spacing of the sampled boreholes from
 * one of them, and within a metre of a sampled interval vertically: a
 * sample speaks for its surroundings, not for the whole site.
 */
export function enveloppeSols(m: Modele, parametre: string, seuil: number, anisotropie = 5): Enveloppe {
  const g = m.blocs
  const valeurs = new Uint8Array(g.nx * g.ny * g.nz)
  const pts = pointsSol(m, parametre)
    .filter((p) => p.valeur !== null && m.points.find((q) => q.cle === p.cle)?.place)
    .map((p) => ({ ...p, l: valeurInterpolee(p.valeur!, p.inferieur), haut: p.z + (p.a - p.de) / 2 + 1, bas: p.z - (p.a - p.de) / 2 - 1 }))
  const depassements = pts.filter((p) => !p.inferieur && p.valeur! >= seuil).length
  if (!pts.length || !(seuil > 0) || !depassements) return { valeurs, volume: 0, blocs: 0, depassements }
  const ls = Math.log10(seuil)
  const sondages = [...new Map(pts.map((p) => [p.cle, { x: p.x, y: p.y }])).values()]
  const portee = Math.max(5, 0.75 * (espacementMedian(sondages) || m.portee))
  let n = 0
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + (j + 0.5) * g.dy
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + (i + 0.5) * g.dx
      const dh2 = pts.map((p) => (p.x - x) ** 2 + (p.y - y) ** 2)
      if (Math.sqrt(Math.min(...dh2)) > portee) continue
      const s = valeurEn(m.sol, x, y)
      const b = valeurEn(m.base, x, y)
      for (let k = 0; k < g.nz; k++) {
        const z = g.z0 + (k + 0.5) * g.dz
        if (z > s || z < b) continue
        let sw = 0
        let sv = 0
        let couvert = false
        for (let q = 0; q < pts.length; q++) {
          if (z <= pts[q].haut && z >= pts[q].bas && dh2[q] <= portee * portee) couvert = true
          const w = 1 / (dh2[q] + (anisotropie * Math.abs(pts[q].z - z)) ** 2 + 0.01)
          sw += w
          sv += w * pts[q].l
        }
        if (couvert && sv / sw >= ls) {
          valeurs[indexBloc(g, i, j, k)] = 1
          n++
        }
      }
    }
  }
  return { valeurs, volume: n * g.dx * g.dy * g.dz, blocs: n, depassements }
}
