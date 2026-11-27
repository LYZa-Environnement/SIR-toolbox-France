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

import { ECART_CAMPAGNE, type Base, type Niveau, type Ouvrage, type Resultat } from '../suivi/modele.ts'
import { mannKendall, type MannKendall } from '../suivi/stats.ts'
import { facteurUnite } from '../resultats/guides.ts'
import { ecartJours } from '../suivi/dates.ts'
import type { Donnees } from './assemblage.ts'
import {
  distancePlusProche,
  ecoulementDuPlan,
  espacementMedian,
  nouvelleGrille,
  pasRond,
  planMoindresCarres,
  remplir,
  surfaceTendance,
  valeurEn,
  zoneInterpolee,
  dansAnneaux,
  type Grille,
  type Plan,
  type PointValeur,
} from './interpolation.ts'
import { ORDRE_CLASSES } from './lithologie.ts'
import { detecterSysteme, LIBELLES_SYSTEME, versLambert93, type Systeme } from './coordonnees.ts'
import { completerConfig, construireFormations, proposerFormations, type ConfigFormations, type ResultatFormations } from './formations.ts'
import { interpoler, validationCroisee, type Methode, type Validation, type Variogramme } from './krigeage.ts'
import type { Forage, Intervalle } from './types.ts'

export type OrigineZ = 'forage' | 'dossier' | 'mnt' | 'repere' | 'interpole' | 'relatif' | 'saisie'

export const LIBELLES_ORIGINE_Z: Record<OrigineZ, string> = {
  forage: 'cote du log, onglet Collars',
  dossier: 'points d’investigation du dossier',
  mnt: 'MNT IGN (RGE ALTI)',
  repere: 'cote du repère de l’ouvrage (approchée)',
  interpole: 'interpolée entre les forages voisins',
  relatif: 'sans cote : profondeurs comptées depuis le sol',
  saisie: 'saisie dans le modèle',
}

export interface PointModele {
  cle: string
  nom: string
  /** Local coordinates (m). */
  x: number
  y: number
  /** Coordinates in the model's system (Lambert 93 once converted), when known. */
  xa: number | null
  ya: number | null
  /** Coordinates as given by the source, before conversion. */
  source: { x: number; y: number } | null
  /** Coordinates or elevation entered in the tool. */
  saisi: boolean
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

/** A georeferenced elevation grid (IGN), in Lambert 93. */
export interface Mnt {
  grille: Grille
}

export type Representation = 'formations' | 'blocs'

export interface Modele {
  /** Coordinates in Lambert 93: the IGN and BRGM maps can be laid on the ground. */
  georef: boolean
  /** System the coordinates were given in (converted to Lambert 93 unless local). */
  systeme: Systeme
  /** Latitude and longitude were given the wrong way round. */
  systemeInverse: boolean
  /** Local origin in the model's system. */
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
  /** Site's parcels in local coordinates: the geology and the soil volumes stay within. */
  parcelles: [number, number][][] | null
  /** Geology beyond the boreholes' surroundings (no parcels). */
  etendre: boolean
  representation: Representation
  methode: Methode
  geologie: Geologie | null
  formations: ResultatFormations | null
  /** Grouping used for the formations (proposed or kept in the dossier). */
  configFormations: ConfigFormations | null
  /** Horizontal reach of the interpolations from the boreholes (m). */
  portee: number
  avertissements: string[]
}

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

/**
 * Where the geology and the soil volumes are modelled: within the site's
 * parcels when the dossier gives them; else between the boreholes (convex
 * hull) and within the reach beyond; everywhere with « étendre ».
 */
export function predicatEmprise(m: Pick<Modele, 'parcelles' | 'etendre' | 'points' | 'portee'>): (x: number, y: number) => boolean {
  if (m.parcelles) {
    const anneaux = m.parcelles
    return (x, y) => dansAnneaux(anneaux, x, y)
  }
  if (m.etendre) return () => true
  const logs = m.points.filter((p) => p.place && p.forage && (p.forage.lithologie.length || p.forage.echantillons.length))
  return logs.length ? zoneInterpolee(logs, m.portee) : () => true
}

export interface SaisiePoint {
  x?: number | null
  y?: number | null
  z?: number | null
}

export interface OptionsModele {
  mnt?: Mnt | null
  /** A vertical metre weighs as many horizontal ones in the geology blocks (default 10). */
  anisotropie?: number
  /** Fill every block of the extent, however far from a borehole (no parcels). */
  etendre?: boolean
  /** System of the coordinates; detected when 'auto'. */
  systeme?: Systeme | 'auto'
  /** Coordinates (in the model's system: Lambert 93 once georeferenced) and ground elevations entered in the tool, by point key. */
  saisies?: Record<string, SaisiePoint>
  /** Site's parcels (Lambert 93 rings): the model covers them, the geology stays within. */
  parcelles?: [number, number][][] | null
  methode?: Methode
  representation?: Representation
  /** Grouping of the keywords into formations; proposed from the logs when absent. */
  formations?: ConfigFormations | null
  /** Points, extent and surfaces only (to know where to fetch the relief): no geology. */
  sansGeologie?: boolean
}

export function construireModele(d: Donnees, o: OptionsModele = {}): Modele {
  const avertissements: string[] = []
  const anisotropie = o.anisotropie ?? 10
  const methode: Methode = o.methode ?? 'krigeage'
  const representation: Representation = o.representation ?? 'formations'

  // ---- Points: boreholes and wells matched by name --------------------------------------------
  const ouvrages = (d.base?.ouvrages ?? []).filter((w) => !w.exclu)
  const cles = new Set([...d.forages.map((f) => f.cle), ...ouvrages.map((w) => w.cle)])
  // Investigation points of the dossier (Lambert 93): what the logs and the monitoring do not give.
  const duDossier = new Map((d.pointsDossier ?? []).map((p) => [p.cle, p]))
  const initiaux = [...cles].map((cle) => {
    const forage = d.forages.find((f) => f.cle === cle) ?? null
    const ouvrage = ouvrages.find((w) => w.cle === cle) ?? null
    const dossier = duDossier.get(cle) ?? null
    // Suivi temporel gives the wells the dossier's coordinates when none has its own: Lambert 93, not the files' system.
    const ouvrageDuDossier = !!dossier && ouvrage?.x === dossier.x93 && ouvrage?.y === dossier.y93
    const x = forage?.x ?? (ouvrageDuDossier ? null : ouvrage?.x) ?? null
    const y = forage?.y ?? (ouvrageDuDossier ? null : ouvrage?.y) ?? null
    return { cle, nom: forage?.nom ?? ouvrage?.nom ?? cle, forage, ouvrage, dossier, source: x !== null && y !== null ? { x, y } : null }
  })

  // ---- Coordinate system: everything to Lambert 93 when it can be -----------------------------
  const detecte = detecterSysteme(initiaux.flatMap((p) => (p.source ? [p.source] : [])))
  const choisi = o.systeme && o.systeme !== 'auto' ? o.systeme : null
  const auto = choisi === null
  // No coordinates in the files: the dossier's points place the model in Lambert 93.
  const systeme: Systeme = choisi ? choisi : !initiaux.some((p) => p.source) && initiaux.some((p) => p.dossier) ? 'l93' : detecte.systeme
  const inverse = auto && detecte.inverse
  // The dossier's points complete georeferenced coordinates only: a local grid has no link to Lambert 93.
  const avecDossier = systeme !== 'local'
  if (!avecDossier && initiaux.some((p) => !p.source && p.dossier))
    avertissements.push('Coordonnées des fichiers en repère local : celles des points d’investigation du dossier (Lambert 93) ne sont pas reprises.')
  if (systeme !== 'l93' && systeme !== 'local')
    avertissements.push(`Coordonnées en ${LIBELLES_SYSTEME[systeme]}${inverse ? ' (latitude et longitude inversées)' : ''} converties en Lambert 93.`)
  const convertir = (c: { x: number; y: number }): [number, number] | null => {
    const [x, y] = inverse ? [c.y, c.x] : [c.x, c.y]
    return systeme === 'local' ? [x, y] : versLambert93(systeme, x, y)
  }
  const bruts = initiaux.map((p) => {
    const c = p.source ? convertir(p.source) : null
    const s = o.saisies?.[p.cle]
    const pd = avecDossier ? p.dossier : null
    const xa = s?.x ?? c?.[0] ?? pd?.x93 ?? null
    const ya = s?.y ?? c?.[1] ?? pd?.y93 ?? null
    const zSaisi = s?.z ?? null
    return { ...p, xa, ya, zSaisi, zDossier: p.dossier?.altitude ?? null, xyDossier: !c && !!pd && (s?.x == null || s?.y == null), saisi: !!s && (s.x != null || s.y != null || s.z != null) }
  })
  const reprises = bruts.filter((p) => p.xyDossier).length
  if (reprises) avertissements.push(`Coordonnées de ${reprises} point${reprises > 1 ? 's' : ''} reprises des points d’investigation du dossier (Lambert 93).`)
  const georef = systeme !== 'local' && bruts.some((p) => p.xa !== null)

  const places = bruts.filter((p) => p.xa !== null && p.ya !== null)
  const ox = places.length ? (Math.min(...places.map((p) => p.xa!)) + Math.max(...places.map((p) => p.xa!))) / 2 : 0
  const oy = places.length ? (Math.min(...places.map((p) => p.ya!)) + Math.max(...places.map((p) => p.ya!))) / 2 : 0

  // Parcels of the site, in local coordinates; kept when they hold at least one borehole.
  const anneaux = o.parcelles !== undefined ? o.parcelles : d.parcelles
  let parcelles = georef && anneaux?.length ? anneaux.map((a) => a.map(([x, y]) => [x - ox, y - oy] as [number, number])) : null
  if (parcelles && !places.some((p) => dansAnneaux(parcelles!, p.xa! - ox, p.ya! - oy))) {
    avertissements.push('Aucun forage dans les parcelles du site : la géologie est modélisée entre les forages.')
    parcelles = null
  }
  const locaux = [...places.map((p) => ({ x: p.xa! - ox, y: p.ya! - oy })), ...(parcelles ?? []).flat().map(([x, y]) => ({ x, y }))]
  let xmin = locaux.length ? Math.min(...locaux.map((p) => p.x)) : -25
  let xmax = locaux.length ? Math.max(...locaux.map((p) => p.x)) : 25
  let ymin = locaux.length ? Math.min(...locaux.map((p) => p.y)) : -25
  let ymax = locaux.length ? Math.max(...locaux.map((p) => p.y)) : 25
  const etendue = Math.max(xmax - xmin, ymax - ymin, 20)
  const marge = Math.max(8, 0.12 * etendue)
  xmin -= marge
  xmax += marge
  ymin -= marge
  ymax += marge
  const sansPlace = bruts.filter((p) => p.xa === null || p.ya === null)
  if (sansPlace.length)
    avertissements.push(
      `Sans coordonnées, placé${sansPlace.length > 1 ? 's' : ''} hors modèle, au sud : ${sansPlace.map((p) => p.nom).join(', ')}. Saisissez-les dans le tableau des points, chargez-les dans Points d’investigation, ou renseignez l’onglet Collars des logs ou l’onglet Ouvrages du suivi.`,
    )
  // Wells without coordinates lined up south of the extent, out of the interpolations.
  const pasRangee = Math.max(4, (xmax - xmin) / Math.max(sansPlace.length + 1, 6))

  // ---- Ground elevation ------------------------------------------------------------------------
  const mnt = georef ? (o.mnt ?? null) : null
  const zMnt = (x: number, y: number) => (mnt ? valeurEn(mnt.grille, x + ox, y + oy) : Number.NaN)
  const zDonne = (p: (typeof bruts)[number]) => p.zSaisi ?? p.forage?.z ?? p.zDossier
  const cotes: (PointValeur & { cle: string })[] = []
  for (const p of bruts) {
    if (p.xa === null || p.ya === null) continue
    const z = zDonne(p)
    if (z !== null) cotes.push({ cle: p.cle, x: p.xa - ox, y: p.ya - oy, v: z })
  }
  // A well with a measuring point elevation and no log: the ground is about there (the tube stands a little above it).
  const reperes: PointValeur[] = []
  for (const p of bruts) if (p.xa !== null && p.ya !== null && zDonne(p) === null && p.ouvrage?.repere != null) reperes.push({ x: p.xa - ox, y: p.ya - oy, v: p.ouvrage.repere })
  const relatif = !cotes.length && !reperes.length && !mnt
  if (relatif) avertissements.push('Aucune cote NGF (onglet Collars, cote du repère des ouvrages, saisie) et pas de MNT : le modèle est dessiné en profondeur, le sol à 0.')

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

  const nGrand = 61
  const nxs = xmax - xmin >= ymax - ymin ? nGrand : Math.max(15, Math.round((nGrand * (xmax - xmin)) / (ymax - ymin)))
  const nys = ymax - ymin > xmax - xmin ? nGrand : Math.max(15, Math.round((nGrand * (ymax - ymin)) / (xmax - xmin)))
  const sol = remplir(nouvelleGrille(xmin, ymin, xmax, ymax, nxs, nys), surface)

  const points: PointModele[] = bruts.map((p) => {
    const place = p.xa !== null && p.ya !== null
    const x = place ? p.xa! - ox : xmin + pasRangee * (sansPlace.indexOf(p) + 1)
    const y = place ? p.ya! - oy : ymin - marge * 0.6
    let zSol: number
    let origineZ: OrigineZ
    if (p.zSaisi !== null) [zSol, origineZ] = [p.zSaisi, 'saisie']
    else if (p.forage?.z != null) [zSol, origineZ] = [p.forage.z, 'forage']
    else if (p.zDossier !== null) [zSol, origineZ] = [p.zDossier, 'dossier']
    else if (relatif) [zSol, origineZ] = [0, 'relatif']
    else if (place && mnt && Number.isFinite(zMnt(x, y))) [zSol, origineZ] = [surface(x, y), 'mnt']
    else if (p.ouvrage?.repere != null) [zSol, origineZ] = [p.ouvrage.repere, 'repere']
    else [zSol, origineZ] = [place ? surface(x, y) : valeurMoyenne(sol), 'interpole']
    return { cle: p.cle, nom: p.nom, x, y, xa: p.xa, ya: p.ya, source: p.source, saisi: p.saisi, zSol, origineZ, forage: p.forage, ouvrage: p.ouvrage, place, crepine: crepineDe(p.forage) }
  })

  // ---- Base of the model -----------------------------------------------------------------------
  // The base of the model follows the deepest boreholes: a shallow soil boring says nothing of
  // what lies below it, and would pull the base up between the piezometers.
  const fores = points.filter((p) => p.place && p.forage && p.forage.profondeur > 0)
  const profondeurMax = Math.max(0, ...fores.map((p) => p.forage!.profondeur))
  const fonds = fores.filter((p) => p.forage!.profondeur >= 0.6 * profondeurMax).map((p) => ({ x: p.x, y: p.y, v: p.zSol - p.forage!.profondeur }))
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
  const cote = Math.max(xmax - xmin, ymax - ymin) / 48
  const nx = Math.max(4, Math.round((xmax - xmin) / cote))
  const ny = Math.max(4, Math.round((ymax - ymin) / cote))
  const hauteur = Math.max(1, zmax - zmin)
  const nz = Math.min(80, Math.max(12, Math.ceil(hauteur / 0.25)))
  const blocs: GrilleBlocs = { x0: xmin, y0: ymin, z0: zmin, dx: (xmax - xmin) / nx, dy: (ymax - ymin) / ny, dz: hauteur / nz, nx, ny, nz }

  const espacement = espacementMedian(points.filter((p) => p.place))
  const portee = Math.max(12, 1.5 * espacement)
  const dedans = predicatEmprise({ parcelles, etendre: !!o.etendre, points, portee })

  // ---- Geology ---------------------------------------------------------------------------------
  const logs = points.filter((p) => p.place && p.forage && p.forage.lithologie.length)
  let geologie: Geologie | null = null
  let formations: ResultatFormations | null = null
  let configFormations: ConfigFormations | null = null
  if (o.sansGeologie) {
    // Nothing more: the extent and the surfaces are what was asked.
  } else if (logs.length && representation === 'blocs') {
    const classes = ORDRE_CLASSES.filter((c) => logs.some((p) => p.forage!.lithologie.some((l) => l.classe === c)))
    const rang = new Map(classes.map((c, i) => [c, i]))
    const valeurs = new Uint8Array(nx * ny * nz)
    const poids = new Float64Array(classes.length)
    const volumes: Record<string, number> = {}
    const vBloc = blocs.dx * blocs.dy * blocs.dz
    for (let j = 0; j < ny; j++) {
      const y = ymin + (j + 0.5) * blocs.dy
      for (let i = 0; i < nx; i++) {
        const x = xmin + (i + 0.5) * blocs.dx
        if (!dedans(x, y)) continue
        const proches = logs.map((p) => ({ p, d2: (p.x - x) ** 2 + (p.y - y) ** 2 }))
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
  } else if (logs.length) {
    configFormations = o.formations?.formations.length ? completerConfig(o.formations, logs.map((p) => p.forage!)) : proposerFormations(logs.map((p) => p.forage!))
    formations = construireFormations(
      logs.map((p) => ({ cle: p.cle, nom: p.nom, x: p.x, y: p.y, zSol: p.zSol, forage: p.forage! })),
      sol,
      base,
      configFormations,
      methode,
      dedans,
    )
    avertissements.push(...formations.avertissements)
  } else if (d.forages.length) avertissements.push('Aucune lithologie dans les logs : pas de modèle géologique.')

  return {
    georef,
    systeme,
    systemeInverse: inverse,
    origine: { x: ox, y: oy },
    emprise: { xmin, xmax, ymin, ymax },
    zmin,
    zmax,
    relatif,
    points,
    sol,
    base,
    blocs,
    parcelles,
    etendre: !!o.etendre,
    representation,
    methode,
    geologie,
    formations,
    configFormations,
    portee,
    avertissements,
  }
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
  /** Kriging standard deviation of the head at the nodes (m; NaN with inverse distance). */
  incertitude: Float64Array | null
  plan: Plan | null
  ecoulement: { azimut: number; gradient: number } | null
  /** Each well's head estimated from the others. */
  validation: Validation | null
  variogramme: Variogramme | null
  methode: Methode
  /** Fixed heads added along watercourses. */
  limites: number
}

/** A grid shaped as the ground's. */
const grilleComme = (g: Grille): Grille => nouvelleGrille(g.x0, g.y0, g.x0 + (g.nx - 1) * g.dx, g.y0 + (g.ny - 1) * g.dy, g.nx, g.ny)

/**
 * Fixed heads along the watercourses crossing the model: points every 15 m
 * or so, at the ground of the model there (the relief IGN gives the water
 * surface of a river, roughly) minus `revanche`. A watercourse as a
 * boundary of the water table: an approximation, to be checked against a
 * gauged level.
 */
export function limitesCoursDEau(m: Modele, lignes: [number, number][][], revanche = 0.5): PointValeur[] {
  const e = m.emprise
  const out: PointValeur[] = []
  for (const l of lignes)
    for (let i = 0; i < l.length - 1; i++) {
      const [x1, y1] = l[i]
      const [x2, y2] = l[i + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 15))
      for (let k = 0; k < n; k++) {
        const x = x1 + ((x2 - x1) * k) / n
        const y = y1 + ((y2 - y1) * k) / n
        if (x >= e.xmin && x <= e.xmax && y >= e.ymin && y <= e.ymax) out.push({ x, y, v: valeurEn(m.sol, x, y) - revanche })
      }
    }
  return out
}

function nappeDe(m: Modele, charges: Charge[], limites: PointValeur[] = []): Nappe {
  const places = charges.filter((c) => m.points.find((p) => p.cle === c.cle)?.place)
  const vide = { charges, grille: null, incertitude: null, plan: null, ecoulement: null, validation: null, variogramme: null, methode: m.methode, limites: 0 }
  if (!places.length) return vide
  const pts = places.map((c) => ({ x: c.x, y: c.y, v: c.charge }))
  const interp = interpoler([...pts, ...limites], m.methode, false)
  const dedans = zoneInterpolee([...pts, ...limites], Math.max(m.portee, 20))
  const g = grilleComme(m.sol)
  const incertitude = new Float64Array(g.nx * g.ny).fill(Number.NaN)
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.dx
      const y = g.y0 + j * g.dy
      if (!dedans(x, y)) {
        g.valeurs[j * g.nx + i] = Number.NaN
        continue
      }
      const e = interp.estimer(x, y)
      g.valeurs[j * g.nx + i] = Math.min(e.v, valeurEn(m.sol, x, y) - 0.02)
      incertitude[j * g.nx + i] = e.ecart
    }
  // Flow from the wells alone, as Suivi temporel reads it.
  const plan = planMoindresCarres(pts)
  return {
    charges,
    grille: g,
    incertitude,
    plan,
    ecoulement: plan && pts.length >= 3 ? ecoulementDuPlan(plan) : null,
    validation: validationCroisee(pts, m.methode),
    variogramme: interp.variogramme,
    methode: interp.methode,
    limites: limites.length,
  }
}

/** Head of a well from a level: measured, else measuring point − depth, else ground − depth. */
function chargeDe(m: Modele, p: PointModele, charge: number | null, profondeur: number | null): { charge: number; origine: OrigineCharge } | null {
  if (charge !== null && !m.relatif) return { charge, origine: 'cote' }
  if (profondeur === null) return null
  if (p.ouvrage?.repere != null && !m.relatif) return { charge: p.ouvrage.repere - profondeur, origine: 'repere' }
  return { charge: p.zSol - profondeur, origine: 'sol' }
}

/** The water table from levels (one per well: the first met). */
export function nappeNiveaux(m: Modele, niveaux: Niveau[], limites: PointValeur[] = []): Nappe {
  const charges: Charge[] = []
  for (const p of m.points) {
    const n = niveaux.find((x) => x.ouvrage === p.cle && (x.charge !== null || x.profondeur !== null))
    if (!n) continue
    const c = chargeDe(m, p, n.charge, n.profondeur)
    if (c) charges.push({ cle: p.cle, nom: p.nom, x: p.x, y: p.y, ...c, profondeur: n.profondeur, date: n.date })
  }
  return nappeDe(m, charges, limites)
}

/** The water table at a campaign of the monitoring. */
export function nappeCampagne(m: Modele, base: Base, campagne: string, limites: PointValeur[] = []): Nappe {
  return nappeNiveaux(
    m,
    base.niveaux.filter((x) => x.campagne === campagne),
    limites,
  )
}

export interface Tournee {
  id: string
  debut: string
  fin: string
  niveaux: Niveau[]
}

/**
 * Water levels attached to no campaign of analyses (sampling sheets alone,
 * a gauging round, a sheet more than a month from any lab report), grouped
 * as campaigns are: levels within 20 days of one another make one round.
 * The latest level of each well in a round is kept.
 */
export function relevesSansCampagne(base: Base): Tournee[] {
  const libres = base.niveaux.filter((n) => !n.campagne && n.date && (n.charge !== null || n.profondeur !== null)).sort((a, b) => a.date.localeCompare(b.date))
  const tournees: Niveau[][] = []
  for (const n of libres) {
    const t = tournees[tournees.length - 1]
    if (t && ecartJours(t[0].date, n.date) <= ECART_CAMPAGNE) t.push(n)
    else tournees.push([n])
  }
  return tournees.map((t) => ({
    id: `releve:${t[0].date}`,
    debut: t[0].date,
    fin: t[t.length - 1].date,
    niveaux: [...t].reverse(),
  }))
}

/** The water table from the levels met while drilling (Water Level sheet of the logs). */
export function nappeForation(m: Modele, limites: PointValeur[] = []): Nappe {
  const charges: Charge[] = []
  for (const p of m.points) {
    const prof = p.forage?.niveauEau ?? null
    if (prof === null) continue
    charges.push({ cle: p.cle, nom: p.nom, x: p.x, y: p.y, charge: p.zSol - prof, profondeur: prof, origine: 'foration', date: p.forage?.date ?? '' })
  }
  return nappeDe(m, charges, limites)
}

/**
 * Contour lines of a grid (marching squares): for each level, the segments
 * (x1, y1, x2, y2) where the interpolated surface crosses it. Cells with an
 * undefined corner are skipped; a saddle is split by the cell's mean.
 */
export function isolignes(g: Grille, niveaux: number[]): { niveau: number; segments: [number, number, number, number][] }[] {
  const out = niveaux.map((niveau) => ({ niveau, segments: [] as [number, number, number, number][] }))
  const v = (i: number, j: number) => g.valeurs[j * g.nx + i]
  for (let j = 0; j < g.ny - 1; j++)
    for (let i = 0; i < g.nx - 1; i++) {
      const c = [v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)]
      if (c.some((x) => !Number.isFinite(x))) continue
      const xs = [g.x0 + i * g.dx, g.x0 + (i + 1) * g.dx, g.x0 + (i + 1) * g.dx, g.x0 + i * g.dx]
      const ys = [g.y0 + j * g.dy, g.y0 + j * g.dy, g.y0 + (j + 1) * g.dy, g.y0 + (j + 1) * g.dy]
      for (const o of out) {
        const n = o.niveau
        // Crossing on each edge (k → k + 1).
        const pts: [number, number][] = []
        for (let k = 0; k < 4; k++) {
          const a = c[k]
          const b = c[(k + 1) % 4]
          if ((a < n) !== (b < n)) {
            const t = (n - a) / (b - a)
            pts.push([xs[k] + t * (xs[(k + 1) % 4] - xs[k]), ys[k] + t * (ys[(k + 1) % 4] - ys[k])])
          }
        }
        if (pts.length === 2) o.segments.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]])
        else if (pts.length === 4) {
          // Saddle: pair the crossings according to the centre.
          const centre = (c[0] + c[1] + c[2] + c[3]) / 4
          const [p0, p1, p2, p3] = pts
          if ((centre < n) === (c[0] < n)) {
            o.segments.push([p0[0], p0[1], p1[0], p1[1]], [p2[0], p2[1], p3[0], p3[1]])
          } else o.segments.push([p0[0], p0[1], p3[0], p3[1]], [p1[0], p1[1], p2[0], p2[1]])
        }
      }
    }
  return out.filter((o) => o.segments.length)
}

/** Round levels across the range of a grid (about eight). */
export function niveauxIsolignes(g: Grille): number[] {
  const v = [...g.valeurs].filter((x) => Number.isFinite(x))
  if (!v.length) return []
  const min = Math.min(...v)
  const max = Math.max(...v)
  if (!(max > min)) return []
  const pas = pasRond((max - min) / 8)
  const out: number[] = []
  for (let n = Math.ceil(min / pas) * pas; n <= max; n += pas) out.push(Number(n.toFixed(6)))
  return out
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
  /** Kriging standard deviation of the field (in log10 units unless `lineaire`). */
  incertitude: Float64Array | null
  lineaire: boolean
  validation: Validation | null
}

/** Value used to interpolate: the result, half the LQ when not quantified. */
const valeurInterpolee = (valeur: number, inferieur: boolean) => Math.log10(Math.max(1e-9, inferieur ? valeur / 2 : valeur))

/**
 * A compound at a campaign: its result at each well, and the field between
 * them. Field readings (pH, redox…) are weighted on their values
 * (`lineaire`), concentrations on their logarithm.
 */
export function panache(m: Modele, base: Base, compose: string, campagne: string, lineaire = false, avecValidation = true): Panache {
  const valeurs: ValeurPoint[] = []
  for (const r of base.resultats) {
    if (r.compose !== compose || r.campagne !== campagne || r.exclu) continue
    const p = m.points.find((x) => x.cle === r.ouvrage)
    if (p) valeurs.push({ cle: p.cle, nom: p.nom, x: p.x, y: p.y, resultat: r })
  }
  const places = valeurs.filter((v) => m.points.find((p) => p.cle === v.cle)?.place)
  if (!places.length) return { valeurs, champ: null, incertitude: null, lineaire, validation: null }
  const pts = places.map((v) => ({ x: v.x, y: v.y, v: lineaire ? v.resultat.valeur : valeurInterpolee(v.resultat.valeur, v.resultat.inferieur) }))
  const interp = interpoler(pts, m.methode, avecValidation)
  const dedans = zoneInterpolee(pts, Math.max(m.portee, 20))
  const g = m.sol
  const champ = new Float64Array(g.nx * g.ny).fill(Number.NaN)
  const incertitude = new Float64Array(g.nx * g.ny).fill(Number.NaN)
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.dx
      const y = g.y0 + j * g.dy
      if (!dedans(x, y)) continue
      const e = interp.estimer(x, y)
      champ[j * g.nx + i] = e.v
      incertitude[j * g.nx + i] = e.ecart
    }
  return { valeurs, champ, incertitude, lineaire, validation: interp.validation }
}

export interface EtatPanache {
  campagne: string
  date: string
  /** Wells sampled. */
  n: number
  /** Area where the interpolated concentration reaches the reference (m²). */
  aire: number | null
  /** Dissolved mass in the interpolated zone (kg): Σ C × n_e × b × cell area. */
  masse: number
  cmax: number | null
}

export interface Evolution {
  etats: EtatPanache[]
  /** Mann-Kendall on the area and on the mass (4 campaigns at least). */
  tendanceAire: MannKendall | null
  tendanceMasse: MannKendall | null
}

/**
 * The plume of a compound campaign after campaign: area above the
 * reference, dissolved mass, highest concentration. The mass takes the
 * concentration of each cell over a saturated thickness `epaisseur` (m)
 * with an effective porosity `porosite` — an order of magnitude to follow
 * a trend, not an inventory (the vertical distribution is not known from
 * screened wells). Concentrations in µg/l (or mg/l, converted).
 */
export function evolutionPanache(m: Modele, base: Base, compose: string, reference: number | null, porosite = 0.2, epaisseur = 5): Evolution {
  const c = base.composes.find((x) => x.cle === compose)
  const versMicrogrammesParLitre = c ? (facteurUnite(c.unite, 'µg/l') ?? 1) : 1
  const g = m.sol
  const aireCellule = g.dx * g.dy
  const etats: EtatPanache[] = []
  for (const camp of base.campagnes) {
    const p = panache(m, base, compose, camp.id, false, false)
    if (!p.champ || !p.valeurs.length) continue
    let aire = 0
    let masse = 0
    for (let q = 0; q < p.champ.length; q++) {
      const l = p.champ[q]
      if (!Number.isFinite(l)) continue
      const v = 10 ** l
      if (reference !== null && v >= reference) aire += aireCellule
      // µg/l → kg/m³ of water: × 1e-6.
      masse += v * versMicrogrammesParLitre * 1e-6 * porosite * epaisseur * aireCellule
    }
    const q = p.valeurs.filter((v) => !v.resultat.inferieur)
    etats.push({ campagne: camp.id, date: camp.date, n: p.valeurs.length, aire: reference !== null ? aire : null, masse, cmax: q.length ? Math.max(...q.map((v) => v.resultat.valeur)) : null })
  }
  return {
    etats,
    tendanceAire: reference !== null && etats.length >= 4 ? mannKendall(etats.map((e) => e.aire!)) : null,
    tendanceMasse: etats.length >= 4 ? mannKendall(etats.map((e) => e.masse)) : null,
  }
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
 * one of them, and within a metre of a sampled interval vertically, and
 * within the site's parcels when known: a sample speaks for its
 * surroundings, not for the whole site.
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
  const dedans = predicatEmprise(m)
  let n = 0
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + (j + 0.5) * g.dy
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + (i + 0.5) * g.dx
      if (!dedans(x, y)) continue
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
