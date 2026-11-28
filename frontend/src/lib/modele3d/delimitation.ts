/**
 * Is the plume delineated by the wells? A compound at a campaign, against
 * its comparison value (the one of Suivi temporel):
 *
 * - closure, well by well: around each well at or above the value, the
 *   plane is split into four quadrants of 90° along the groundwater flow —
 *   downgradient, right and left looking downgradient, upgradient. A side
 *   is closed when its quadrant holds a well below the value: « net » under
 *   half the value (or not quantified with an LQ at most half the value),
 *   « de justesse » between half the value and the value (or an LQ there).
 *   A well not quantified with an LQ above the value says nothing. The
 *   wells of an open side with no other well above the value beyond them
 *   are its front.
 * - edge of the data: along the convex hull of the sampled wells, the
 *   stretches where the interpolated field reaches the value — there the
 *   plume runs out of what the wells see.
 * - probability of exceeding the value at each node, from the kriging of
 *   the log10 of the concentrations, the error taken as Gaussian on the
 *   logarithm (multigaussian reading of the kriging): P = 1 − Φ((log10 v −
 *   m) / σ), m the kriged logarithm, σ its kriging standard deviation
 *   (P. Goovaerts, « Geostatistics for Natural Resources Evaluation », 1997,
 *   chapter 7: probability of exceeding a threshold, risk of
 *   misclassification). The doubtful area is Σ min(P, 1 − P) × cell area:
 *   the area expected to be wrongly classed above or below the value.
 * - new wells: first one beyond the front of each open side, along its
 *   axis, where the model puts the end of the plume (a probability of
 *   exceeding of 25 % at most), else at the end of the interpolated reach,
 *   where the model stops reading; then the node where the classification is most
 *   doubtful, highest min(P, 1 − P), the kriging variance computed again
 *   with each well added — it depends on the positions only, and a well
 *   measuring what is expected leaves the estimate unchanged (sequential
 *   design for a contour: P. Ranjan, D. Bingham, G. Michailidis,
 *   Technometrics 50, 2008; J. Bect et al., Statistics and Computing 22,
 *   2012).
 *
 * The variance of the trend plane is not counted (regression kriging): far
 * from the wells the uncertainty is underestimated, and the field is only
 * read between the wells and within the reach beyond. Pure.
 */

import { facteurUnite } from '../resultats/guides.ts'
import type { Base, Resultat } from '../suivi/modele.ts'
import { phi } from '../suivi/stats.ts'
import { comportement, partSolubilite, type Comportement } from './comportement.ts'
import { fr } from './format.ts'
import {
  aquifereAuForage,
  aquifereDe,
  attenuationAxe,
  declinSource,
  aquifereEnNoeud,
  battementDe,
  crepineConseillee,
  crepineLue,
  HYPOTHESES_DEFAUT,
  longueurStationnaire,
  masqueAquifere,
  transportDe,
  type Aquifere,
  type Attenuation,
  type CrepineConseillee,
  type HypothesesTransport,
  type Transport,
} from './hydrogeologie.ts'
import { dansAnneaux, distancePlusProche, enveloppeConvexe, espacementMedian, transformeur, valeurEn, zoneInterpolee, type Grille, type Plan } from './interpolation.ts'
import { ecartsKrigeage, interpolerDans } from './krigeage.ts'
import { champSurGrille, donneesPanache, nappeCampagne, type Modele, type ValeurPoint } from './modele.ts'

export type Cote = 'aval' | 'droite' | 'gauche' | 'amont'

export const COTES: Cote[] = ['aval', 'droite', 'gauche', 'amont']

/** Angle of each side from the downgradient direction, clockwise: right is to the right looking downgradient. */
const DECALAGE: Record<Cote, number> = { aval: 0, droite: 90, amont: 180, gauche: 270 }

/** How a well below the value closes the plume: clearly, just, or with a reserve the geology or the compound puts on it. */
export type Fermeture = 'nette' | 'juste' | 'reserve'

export interface Temoin {
  cle: string
  nom: string
  /** Distance from the well above the value it closes (m). */
  distance: number
  resultat: Resultat
  fermeture: Fermeture
  /** Why it closes only with a reserve (its screen against the aquifer and the compound). */
  reserve: string | null
}

/** A well's screen checked against the aquifer and the compound: set aside, or kept with a reserve. */
export type Controle = (q: ValeurPoint) => { exclu: string } | { reserve: string } | null

export interface OuvrageDepassant {
  cle: string
  nom: string
  x: number
  y: number
  resultat: Resultat
  /** Result over the comparison value. */
  rapport: number
  /** Nearest well below the value in each quadrant (null: none). */
  temoins: Record<Cote, Temoin | null>
  /** Closure of each side, through the wells beyond when needed (null: open). */
  fermetures: Record<Cote, Fermeture | null>
}

export type StatutCote = 'delimite' | 'juste' | 'reserve' | 'ouvert'

export interface BilanCote {
  cote: Cote
  /** Azimuth of the side (° from north, clockwise). */
  azimut: number
  statut: StatutCote
  /** Outermost wells above the value with no well below it beyond them (names). */
  front: string[]
  /** Wells below the value closing the side, nearest first. */
  temoins: Temoin[]
  /** Wells below the value set aside on that side, and why (screened outside the aquifer). */
  ecartes: { nom: string; motif: string }[]
}

export interface SegmentBord {
  x1: number
  y1: number
  x2: number
  y2: number
  /** The interpolated field reaches the value there. */
  depasse: boolean
  /** Side the edge faces (its outward normal). */
  cote: Cote
}

export interface Proposition {
  rang: number
  /**
   * Why there: to close an open side, beyond its front well at `distance`
   * along the side's axis; or where the limit of the plume is most doubtful.
   */
  motif:
    | {
        type: 'fermeture'
        cote: Cote
        front: string
        distance: number
        /**
         * Where the end of the plume is put on that axis: by the transport (a measured K and a
         * half-life), by the model (probability of exceeding 25 % at most), or the end of the
         * interpolated reach.
         */
        limite: 'transport' | 'estimee' | 'portee'
        /** End of the steady plume by the transport beyond the front (m), when computed: too far to place the well there. */
        transport?: number
      }
    | { type: 'incertitude' }
  /** Local coordinates (m). */
  x: number
  y: number
  /** In the model's system (Lambert 93 once converted), when known. */
  xa: number | null
  ya: number | null
  /** Probability of exceeding the value there with the present wells (null: no kriging, or beyond the interpolated reach). */
  probabilite: number | null
  /** Estimated concentration (null beyond the interpolated reach) and its uncertainty factor (×/÷, one kriging standard deviation). */
  concentration: number | null
  facteur: number | null
  /** Nearest sampled well, the distance and azimuth (° from north) from it, and the side of it the location lies on. */
  pres: { nom: string; distance: number; azimut: number; cote: Cote }
  /** Within the site's parcels (null: parcels unknown). */
  surSite: boolean | null
  /** Head and depth to water estimated there at the date shown (null: no water table there). */
  charge: number | null
  profondeurEau: number | null
  /** Doubtful area left once this well and the ones before it are sampled (m²; null without kriging). */
  douteuxApres: number | null
  /** Screen advised for the compound and the aquifer there (null: water table or ground unknown there). */
  crepine: CrepineConseillee | null
}

export type Verdict = 'aucun-depassement' | 'delimite' | 'a-confirmer' | 'non-delimite'

export interface Delimitation {
  reference: number
  /** Downgradient azimuth (°); null: unknown, the quadrants follow the compass from the north. */
  aval: number | null
  /** Sampled wells with coordinates. */
  ouvrages: number
  depassants: OuvrageDepassant[]
  cotes: BilanCote[]
  verdict: Verdict
  bord: SegmentBord[]
  /** Share of the edge of the data where the field reaches the value (0–1). */
  partBord: number
  /** Probability of exceeding the value at the ground grid's nodes (NaN beyond the wells' reach); null without kriging. */
  probabilite: Float64Array | null
  /** Areas where P ≥ 0.5 and P ≥ 0.9, and the doubtful area Σ min(P, 1 − P) × cell (m²). */
  aire50: number | null
  aire90: number | null
  douteux: number | null
  propositions: Proposition[]
  /** Wells not quantified with an LQ above the value: they cannot close the plume. */
  lqHautes: string[]
  /** Variogram fitted on the data (false: the default one, under six wells); null without kriging. */
  variogrammeAjuste: boolean | null
  /** What the BRGM guides say of the compound. */
  comportement: Comportement
  aquifere: Aquifere | null
  transport: Transport
  /** Ratio of the interpolation stretched along the flow (null: isotropic). */
  anisotropie: number | null
  /** Ground grid's nodes of the interpolated zone left out because the aquifer is absent there. */
  horsAquifere: number
  /** Wells at 1 % of the solubility or more (COHV): an organic phase is likely nearby. */
  phasePure: { nom: string; part: number }[]
  /** Attenuation along the flow read in the concentrations (null: not enough wells on the axis, or no fall). */
  attenuation: Attenuation | null
  /** Decline in time of the source well up to the date (null: under four quantified results). */
  declinSource: { nom: string; n: number; demiVie: number | null } | null
  avertissements: string[]
}

export interface OptionsDelimitation {
  /** Downgradient azimuth (°); null when unknown. */
  aval: number | null
  /** Water table at the date (head on the ground grid's nodes, and the plane of the wells' heads), for the depth to water at the proposed wells. */
  nappe?: { grille: Grille | null; plan: Plan | null } | null
  /** Number of wells to propose (0 to 5, default 3). */
  propositions?: number
  /** Heads of the wells at the date (m NGF), by key: the screens against the water table. */
  charges?: Record<string, number>
  /** Hydraulic gradient at the date. */
  gradient?: number | null
  hypotheses?: HypothesesTransport
  /** Ratio of the anisotropy along the flow (null or 1: isotropic). */
  anisotropie?: number | null
  /** Keep the plume within the aquifer's extent (default true). */
  limiterAquifere?: boolean
}

const azimutDe = (dx: number, dy: number) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360

/** Side of the direction (dx, dy) with respect to the downgradient azimuth: four quadrants of 90°. */
export function coteDe(dx: number, dy: number, aval: number): Cote {
  const r = (azimutDe(dx, dy) - aval + 360) % 360
  return r < 45 || r >= 315 ? 'aval' : r < 135 ? 'droite' : r < 225 ? 'amont' : 'gauche'
}

/** How a result closes the plume against the value (null: it does not — above the value, or an LQ above it). */
export function fermetureDe(r: Resultat, reference: number): Fermeture | null {
  if (!r.inferieur && r.valeur >= reference) return null
  if (r.inferieur && r.valeur > reference) return null
  return r.valeur < reference / 2 || (r.inferieur && r.valeur <= reference / 2) ? 'nette' : 'juste'
}

const RANG_FERMETURE: Record<Fermeture, number> = { nette: 3, juste: 2, reserve: 1 }
const meilleure = (a: Fermeture | null, b: Fermeture | null): Fermeture | null => (!a ? b : !b ? a : RANG_FERMETURE[a] >= RANG_FERMETURE[b] ? a : b)

const AUCUN = (): Record<Cote, null> => ({ aval: null, droite: null, gauche: null, amont: null })

/** Normal probability of exceeding: the threshold (log) against a Gaussian of mean m and deviation s. */
const probabiliteAuDessus = (m: number, s: number, seuil: number) => (s > 1e-9 ? 1 - phi((seuil - m) / s) : m >= seuil ? 1 : 0)

export interface Fermetures {
  depassants: OuvrageDepassant[]
  cotes: BilanCote[]
  /** Wells of the front of each side, the highest ratio first. */
  fronts: Map<Cote, OuvrageDepassant[]>
  /** Wells not quantified with an LQ above the value (names). */
  lqHautes: string[]
}

/**
 * Closure of the plume well by well, from the results of the wells at a
 * campaign (local coordinates): see the head of the file. A quadrant is
 * convex: every well beyond a well of the quadrant, in its own quadrant,
 * lies in the first one too — the witnesses of the wells further on are
 * the well's own.
 */
export function fermeturesPanache(places: ValeurPoint[], reference: number, aval: number | null, controle: Controle | null = null): Fermetures {
  const axe = aval ?? 0
  const hauts = places.filter((v) => !v.resultat.inferieur && v.resultat.valeur >= reference)
  const lqHautes = places.filter((v) => v.resultat.inferieur && v.resultat.valeur > reference).map((v) => v.nom)
  const distincts = (a: ValeurPoint, b: ValeurPoint) => a.cle !== b.cle && Math.hypot(a.x - b.x, a.y - b.y) > 0.01
  const dans = (w: ValeurPoint, q: ValeurPoint, c: Cote) => distincts(w, q) && coteDe(q.x - w.x, q.y - w.y, axe) === c
  const controles = new Map(places.map((q) => [q.cle, controle ? controle(q) : null]))
  const ecartes = new Map<Cote, Map<string, { nom: string; motif: string }>>(COTES.map((c) => [c, new Map()]))
  const depassants: OuvrageDepassant[] = hauts.map((w) => {
    // The nearest witness of each quadrant (where the plume ends at the latest), and the best closure found there.
    const temoins: Record<Cote, Temoin | null> = AUCUN()
    const fermetures: Record<Cote, Fermeture | null> = AUCUN()
    for (const q of places) {
      if (!distincts(w, q)) continue
      let f = fermetureDe(q.resultat, reference)
      if (!f) continue
      const c = coteDe(q.x - w.x, q.y - w.y, axe)
      const k = controles.get(q.cle) ?? null
      if (k && 'exclu' in k) {
        ecartes.get(c)!.set(q.cle, { nom: q.nom, motif: k.exclu })
        continue
      }
      const reserve = k && 'reserve' in k ? k.reserve : null
      if (reserve) f = 'reserve'
      const d = Math.hypot(q.x - w.x, q.y - w.y)
      if (!temoins[c] || d < temoins[c].distance) temoins[c] = { cle: q.cle, nom: q.nom, distance: d, resultat: q.resultat, fermeture: f, reserve }
      fermetures[c] = meilleure(fermetures[c], f)
    }
    return { cle: w.cle, nom: w.nom, x: w.x, y: w.y, resultat: w.resultat, rapport: w.resultat.valeur / reference, temoins, fermetures }
  })
  const fronts = new Map<Cote, OuvrageDepassant[]>()
  const cotes: BilanCote[] = COTES.map((c) => {
    const ouverts = depassants.filter((w) => w.fermetures[c] === null)
    const statut: StatutCote = ouverts.length
      ? 'ouvert'
      : depassants.some((w) => w.fermetures[c] === 'reserve')
        ? 'reserve'
        : depassants.some((w) => w.fermetures[c] === 'juste')
          ? 'juste'
          : 'delimite'
    // Every well above the value beyond an open one is open too: the front is the open wells with none beyond.
    const devant = ouverts.filter((w) => !hauts.some((x) => dans(w, x, c))).sort((a, b) => b.rapport - a.rapport)
    fronts.set(c, devant)
    const parCle = new Map<string, Temoin>()
    for (const w of depassants) {
      const t = w.temoins[c]
      if (t && (!parCle.has(t.cle) || t.distance < parCle.get(t.cle)!.distance)) parCle.set(t.cle, t)
    }
    return {
      cote: c,
      azimut: (axe + DECALAGE[c]) % 360,
      statut,
      front: devant.map((w) => w.nom),
      temoins: [...parCle.values()].sort((a, b) => a.distance - b.distance),
      ecartes: depassants.length ? [...ecartes.get(c)!.values()] : [],
    }
  })
  return { depassants, cotes, fronts, lqHautes }
}

export function delimiterPanache(m: Modele, base: Base, compose: string, campagne: string, reference: number, o: OptionsDelimitation): Delimitation {
  const avertissements: string[] = []
  const { places, pts } = donneesPanache(m, base, compose, campagne)
  const aval = o.aval
  const axe = aval ?? 0
  const seuil = Math.log10(reference)
  if (aval === null) avertissements.push('Sens d’écoulement inconnu (trois niveaux d’eau au moins à une même date) : les quadrants sont orientés sur le nord (« aval » = vers le nord).')

  // ---- The compound and the aquifer ----------------------------------------------------------
  const c = base.composes.find((x) => x.cle === compose)
  const comp = comportement({ cas: c?.cas ?? '', nom: c?.nom ?? '', famille: c?.famille ?? '' })
  const aquifere = aquifereDe(m, base)
  const idsAquifere = new Set(aquifere?.unites.map((u) => u.id) ?? [])
  const point = (cle: string) => m.points.find((p) => p.cle === cle) ?? null
  const hyp = o.hypotheses ?? HYPOTHESES_DEFAUT
  const transport = transportDe(aquifere, hyp, o.gradient ?? null, comp)

  // ---- Closure, well by well ---------------------------------------------------------------
  // A well screened outside the aquifer says nothing of it; for a dense compound its screen must
  // reach the aquifer's base, for a light one straddle the water table (RP-74064-FR, § 4.3, § 6.3).
  const controle: Controle = (q) => {
    const p = point(q.cle)
    const cr = p ? crepineLue(m, p) : null
    if (!p || !cr) return null
    if (aquifere?.origine === 'crepines' && cr.unites.size && ![...cr.unites.keys()].some((u) => idsAquifere.has(u)))
      return { exclu: `crépiné hors de l’aquifère (${[...cr.unites.keys()].map((u) => m.configFormations?.formations.find((f) => f.id === u)?.nom ?? u).join(', ')})` }
    if (comp.phase === 'dnapl' && aquifere?.mur) {
      const a = aquifereAuForage(m, aquifere, p)
      if (a?.mur != null && a.mur - cr.a > 1) return { reserve: `crépine arrêtée ${fr(Math.round((a.mur - cr.a) * 10) / 10)} m au-dessus du mur de l’aquifère : un composé plus dense que l’eau peut passer dessous` }
      if (a && a.mur === null && (p.forage?.profondeur ?? 0) - cr.a < 0.5) return { reserve: 'forage arrêté dans l’aquifère : sa base, où se tient un composé plus dense que l’eau, n’est pas atteinte' }
    }
    const h = o.charges?.[q.cle]
    if (comp.phase === 'lnapl' && h !== undefined && cr.zHaut < h - 0.3)
      return { reserve: `crépine entièrement sous la nappe (sommet ${fr(Math.round((h - cr.zHaut) * 10) / 10)} m sous le niveau d’eau) : un composé plus léger que l’eau passe au-dessus` }
    return null
  }
  const { depassants, cotes, fronts, lqHautes } = fermeturesPanache(places, reference, aval, controle)
  if (lqHautes.length)
    avertissements.push(
      `Non quantifié avec une LQ au-dessus de la valeur de comparaison, sans effet sur la délimitation : ${lqHautes.join(', ')}. Une LQ plus basse est à demander au laboratoire.`,
    )
  if (aquifere && aquifere.crepines && aquifere.dansAquifere < aquifere.crepines)
    avertissements.push(`${aquifere.crepines - aquifere.dansAquifere} ouvrage(s) analysé(s) crépiné(s) hors de l’aquifère retenu : ils ne délimitent pas son panache.`)

  // An organic phase nearby (COHV at 1 % of their solubility or more: RP-74064-FR, § 10.6.5).
  const versMicrogrammes = c ? (facteurUnite(c.unite, 'µg/l') ?? 1) : 1
  const phasePure = depassants.flatMap((w) => {
    const part = partSolubilite(w.resultat.valeur * versMicrogrammes, comp)
    return part !== null && part >= 0.01 ? [{ nom: w.nom, part }] : []
  })

  // ---- Interpolated field: stretched along the flow, within the aquifer ---------------------------
  const anisotropie = o.anisotropie && o.anisotropie !== 1 && aval !== null ? o.anisotropie : null
  const transformer = anisotropie ? transformeur({ azimut: aval!, rapport: anisotropie }) : null
  const interp = pts.length ? interpolerDans(pts, m.methode, false, transformer) : null
  const garder = o.limiterAquifere === false ? null : masqueAquifere(m, aquifere)
  const grille = interp ? champSurGrille(m, pts, interp, garder) : null
  const g = m.sol
  let horsAquifere = 0
  if (garder && pts.length) {
    const zoneChamp = zoneInterpolee(pts, Math.max(m.portee, 20))
    for (let q = 0; q < garder.length; q++) if (!garder[q] && zoneChamp(g.x0 + (q % g.nx) * g.dx, g.y0 + Math.floor(q / g.nx) * g.dy)) horsAquifere++
  }
  const noeud = (x: number, y: number) => {
    const i = Math.min(g.nx - 1, Math.max(0, Math.round((x - g.x0) / g.dx)))
    const j = Math.min(g.ny - 1, Math.max(0, Math.round((y - g.y0) / g.dy)))
    return j * g.nx + i
  }
  const dansAquifere = (x: number, y: number) => !garder || garder[noeud(x, y)] === 1

  // ---- Edge of the data --------------------------------------------------------------------
  const bord: SegmentBord[] = []
  const enveloppe = places.length >= 3 ? enveloppeConvexe(places) : []
  if (interp && enveloppe.length >= 3) {
    const pas = Math.max(0.5, Math.min(g.dx, g.dy))
    for (let k = 0; k < enveloppe.length; k++) {
      const a = enveloppe[k]
      const b = enveloppe[(k + 1) % enveloppe.length]
      const ex = b.x - a.x
      const ey = b.y - a.y
      // Counter-clockwise hull: the outside is on the right of each edge.
      const cote = coteDe(ey, -ex, axe)
      const n = Math.max(1, Math.ceil(Math.hypot(ex, ey) / pas))
      for (let t = 0; t < n; t++) {
        const x1 = a.x + (ex * t) / n
        const y1 = a.y + (ey * t) / n
        const x2 = a.x + (ex * (t + 1)) / n
        const y2 = a.y + (ey * (t + 1)) / n
        const [xm, ym] = [(x1 + x2) / 2, (y1 + y2) / 2]
        bord.push({ x1, y1, x2, y2, depasse: dansAquifere(xm, ym) && interp.estimer(xm, ym).v >= seuil, cote })
      }
    }
  }
  const longueur = (t: SegmentBord) => Math.hypot(t.x2 - t.x1, t.y2 - t.y1)
  const perimetre = bord.reduce((t, x) => t + longueur(x), 0)
  const partBord = perimetre > 0 ? bord.filter((x) => x.depasse).reduce((t, x) => t + longueur(x), 0) / perimetre : 0

  // ---- Probability of exceeding ------------------------------------------------------------
  const cellule = g.dx * g.dy
  let probabilite: Float64Array | null = null
  let aire50: number | null = null
  let aire90: number | null = null
  let douteux: number | null = null
  const v = interp?.methode === 'krigeage' ? interp.variogramme : null
  const variogrammeAjuste = v ? v.ajuste : null
  if (!v) {
    if (pts.length) avertissements.push(m.methode === 'krigeage' ? 'Moins de trois ouvrages analysés : pas de krigeage, pas de probabilité de dépassement.' : 'Probabilité de dépassement et emplacements proposés : choisir le krigeage (onglet Coupe et vue).')
  } else if (pts.length < 4 || !(v.palier - v.pepite > 1e-6)) {
    avertissements.push('Trop peu d’ouvrages, ou des résultats que la tendance explique entièrement : la probabilité de dépassement n’est pas calculée.')
  } else if (grille) {
    if (!v.ajuste) avertissements.push('Variogramme par défaut (moins de six ouvrages analysés) : probabilités et emplacements indicatifs.')
    probabilite = new Float64Array(grille.champ.length).fill(Number.NaN)
    aire50 = 0
    aire90 = 0
    douteux = 0
    for (let q = 0; q < probabilite.length; q++) {
      if (!Number.isFinite(grille.champ[q])) continue
      const p = probabiliteAuDessus(grille.champ[q], grille.incertitude[q], seuil)
      probabilite[q] = p
      if (p >= 0.5) aire50 += cellule
      if (p >= 0.9) aire90 += cellule
      douteux += Math.min(p, 1 - p) * cellule
    }
  }

  // ---- Wells to propose --------------------------------------------------------------------
  const propositions: Proposition[] = []
  const nombre = Math.max(0, Math.min(5, Math.round(o.propositions ?? 3)))
  if (interp && nombre) {
    const positions = pts.map((p) => ({ x: p.x, y: p.y }))
    const espacement = espacementMedian(places)
    // Not on top of a well, nor of a well proposed before (a nugget keeps some doubt right beside a datum).
    const ecartement = Math.max(5, 0.5 * espacement)
    const reach = Math.max(m.portee, 20)
    const zone = zoneInterpolee(pts, reach)
    const grilleNappe = o.nappe?.grille && o.nappe.grille.nx === g.nx && o.nappe.grille.ny === g.ny ? o.nappe.grille : null
    const planNappe = o.nappe?.plan ?? null
    const e = m.emprise
    const krige = !!(probabilite && grille && v)
    const ecarts = grille ? Float64Array.from(grille.incertitude) : null
    const noeuds: number[] = []
    if (grille) for (let q = 0; q < grille.champ.length; q++) if (Number.isFinite(grille.champ[q])) noeuds.push(q)
    const xy = (q: number) => ({ x: g.x0 + (q % g.nx) * g.dx, y: g.y0 + Math.floor(q / g.nx) * g.dy })
    // The kriging variance with wells added, in the frame of the (anisotropic) interpolation.
    const ecartsAvec = (ps: { x: number; y: number }[]) => {
      const s = ecartsKrigeage(transformer ? ps.map((p) => ({ x: transformer(p.x, p.y)[0], y: transformer(p.x, p.y)[1] })) : ps, v!)
      return s ? (x: number, y: number) => (transformer ? s(...transformer(x, y)) : s(x, y)) : null
    }
    const ajouter = (x: number, y: number, motif: Proposition['motif']) => {
      const est = zone(x, y) && dansAquifere(x, y) ? interp.estimer(x, y) : null
      positions.push({ x, y })
      let reste: number | null = null
      const s = krige ? ecartsAvec(positions) : null
      if (s && ecarts && grille) {
        reste = 0
        for (const q of noeuds) {
          const n = xy(q)
          ecarts[q] = s(n.x, n.y)
          const p = probabiliteAuDessus(grille.champ[q], ecarts[q], seuil)
          reste += Math.min(p, 1 - p) * cellule
        }
      }
      const proche = places.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a))
      const dansEmprise = x >= e.xmin && x <= e.xmax && y >= e.ymin && y <= e.ymax
      const sol = dansEmprise ? valeurEn(m.sol, x, y) : Number.NaN
      // The kriged water table, else the plane of the wells' heads (at the edge of the reach), under the ground.
      let h = grilleNappe && dansEmprise ? valeurEn(grilleNappe, x, y) : Number.NaN
      if (!Number.isFinite(h) && planNappe && dansEmprise) h = Math.min(planNappe.a * x + planNappe.b * y + planNappe.c, sol - 0.02)
      const charge = Number.isFinite(h) ? h : null
      // Swing of the water there: the nearest well's highest and lowest heads around its head at the date.
      let crepine: CrepineConseillee | null = null
      if (charge !== null && Number.isFinite(sol)) {
        const bat = battementDe(base, proche.cle)
        const hp = o.charges?.[proche.cle]
        const eau = bat && hp !== undefined ? { haute: charge + (bat.haute - hp), basse: charge + (bat.basse - hp), date: charge } : { haute: charge + 0.5, basse: charge - 0.5, date: charge }
        const geo = aquifere ? aquifereEnNoeud(m, aquifere, noeud(x, y)) : null
        crepine = crepineConseillee(comp.phase, sol, eau, geo, aquifere?.mur?.nom ?? null)
      }
      propositions.push({
        rang: propositions.length + 1,
        motif,
        x,
        y,
        xa: m.georef || m.origine.x ? x + m.origine.x : null,
        ya: m.georef || m.origine.y ? y + m.origine.y : null,
        probabilite: est && krige ? probabiliteAuDessus(est.v, est.ecart, seuil) : null,
        concentration: est ? 10 ** est.v : null,
        facteur: est && krige && Number.isFinite(est.ecart) ? 10 ** est.ecart : null,
        pres: { nom: proche.nom, distance: Math.hypot(x - proche.x, y - proche.y), azimut: azimutDe(x - proche.x, y - proche.y), cote: coteDe(x - proche.x, y - proche.y, axe) },
        surSite: m.parcelles ? dansAnneaux(m.parcelles, x, y) : null,
        charge,
        profondeurEau: charge !== null && Number.isFinite(sol) ? sol - charge : null,
        douteuxApres: reste,
        crepine,
      })
    }

    // 1. Closing wells, beyond the front of each open side along its axis. Downgradient, with a
    //    measured K and a half-life, where the steady plume falls to the value; else where the
    //    model puts the end of the plume (a well likely below the value), else at the end of the
    //    reach, where the model stops reading; never closer than a third of the reach (10 m).
    const bout = 0.98 * reach
    const minimum = Math.min(bout, Math.max(10, reach / 3))
    const foulee = Math.max(0.5, Math.min(g.dx, g.dy) / 2)
    const vitesse = transport.mesure && transport.vitessePolluant ? transport.vitessePolluant[0] : null
    for (const cote of cotes) {
      if (cote.statut !== 'ouvert') continue
      const ux = Math.sin((cote.azimut * Math.PI) / 180)
      const uy = Math.cos((cote.azimut * Math.PI) / 180)
      for (const w of fronts.get(cote.cote)!) {
        if (propositions.length >= nombre) break
        let d = minimum
        let limite: 'transport' | 'estimee' | 'portee' = 'portee'
        // The steady plume by the transport: placed there when within a few reaches, else only told.
        const lt = cote.cote === 'aval' && aval !== null && vitesse !== null && hyp.demiVie ? longueurStationnaire(vitesse, hyp.demiVie, w.rapport) : null
        if (lt !== null && lt <= 5 * reach) {
          d = Math.max(minimum, lt)
          limite = 'transport'
        } else
          for (let t = minimum; t <= bout; t += foulee) {
            d = t
            const est = interp.estimer(w.x + t * ux, w.y + t * uy)
            const p = krige ? probabiliteAuDessus(est.v, est.ecart, seuil) : est.v < seuil - Math.log10(2) ? 0 : 1
            if (p <= 0.25 || !dansAquifere(w.x + t * ux, w.y + t * uy)) {
              limite = 'estimee'
              break
            }
          }
        const x = w.x + d * ux
        const y = w.y + d * uy
        // One well for fronts side by side.
        if (propositions.some((p) => Math.hypot(p.x - x, p.y - y) < reach / 2)) continue
        ajouter(x, y, { type: 'fermeture', cote: cote.cote, front: w.nom, distance: d, limite, ...(lt !== null && limite !== 'transport' ? { transport: lt } : {}) })
      }
    }

    // 2. Then where the limit of the plume is most doubtful between and around the wells.
    while (krige && ecarts && grille && propositions.length < nombre) {
      let meilleur = -1
      let critere = 0.02
      for (const q of noeuds) {
        const p = probabiliteAuDessus(grille.champ[q], ecarts[q], seuil)
        const k = Math.min(p, 1 - p)
        if (k <= critere) continue
        const { x, y } = xy(q)
        if (distancePlusProche(positions, x, y) < ecartement) continue
        ;[meilleur, critere] = [q, k]
      }
      if (meilleur < 0) break
      const { x, y } = xy(meilleur)
      ajouter(x, y, { type: 'incertitude' })
    }
  }

  // ---- Attenuation read in the data ---------------------------------------------------------------
  const attenuation =
    aval !== null
      ? attenuationAxe(
          places.map((p) => ({ nom: p.nom, x: p.x, y: p.y, valeur: p.resultat.valeur, inferieur: p.resultat.inferieur })),
          aval,
          reference,
          transport.vitessePolluant,
        )
      : null
  const quantifies = places.filter((p) => !p.resultat.inferieur)
  const source = quantifies.length ? quantifies.reduce((a, b) => (b.resultat.valeur > a.resultat.valeur ? b : a)) : null
  const tCampagne = base.campagnes.find((x) => x.id === campagne)?.t ?? Number.POSITIVE_INFINITY
  const declin = source ? declinSource(base, source.cle, compose, tCampagne) : null

  const verdict: Verdict = !depassants.length
    ? 'aucun-depassement'
    : cotes.some((x) => x.statut === 'ouvert')
      ? 'non-delimite'
      : cotes.some((x) => x.statut === 'juste' || x.statut === 'reserve') || partBord > 0
        ? 'a-confirmer'
        : 'delimite'
  if (depassants.length && verdict !== 'non-delimite' && partBord > 0)
    avertissements.push('Le champ interpolé atteint la valeur de comparaison sur la limite des ouvrages : la délimitation repose sur des ouvrages placés de côté, à confirmer.')

  return {
    reference,
    aval,
    ouvrages: places.length,
    depassants,
    cotes,
    verdict,
    bord,
    partBord,
    probabilite,
    aire50,
    aire90,
    douteux,
    propositions,
    lqHautes,
    variogrammeAjuste,
    comportement: comp,
    aquifere,
    transport,
    anisotropie,
    horsAquifere,
    phasePure,
    attenuation,
    declinSource: declin && source ? { nom: source.nom, ...declin } : null,
    avertissements,
  }
}

/** The verdict of each campaign where the compound was analysed, each with its own flow and water levels. */
export function delimitationsParCampagne(
  m: Modele,
  base: Base,
  compose: string,
  reference: number,
  o: Omit<OptionsDelimitation, 'nappe' | 'charges' | 'gradient' | 'propositions'>,
): { campagne: string; verdict: Verdict; ouverts: Cote[] }[] {
  const analysees = new Set(base.resultats.filter((r) => r.compose === compose && !r.exclu).map((r) => r.campagne))
  return base.campagnes
    .filter((c) => analysees.has(c.id))
    .map((c) => {
      const n = nappeCampagne(m, base, c.id)
      const r = delimiterPanache(m, base, compose, c.id, reference, {
        ...o,
        aval: n.ecoulement?.azimut ?? o.aval,
        gradient: n.ecoulement?.gradient ?? null,
        charges: Object.fromEntries(n.charges.map((x) => [x.cle, x.charge])),
        propositions: 0,
      })
      return { campagne: c.id, verdict: r.verdict, ouverts: r.cotes.filter((x) => x.statut === 'ouvert').map((x) => x.cote) }
    })
}

// ---- Wording ------------------------------------------------------------------------------

const ROSE = ['le nord', 'le nord-est', 'l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest']
/** « vers le sud-est » from an azimuth. */
export const versDirection = (azimut: number) => ROSE[Math.round(azimut / 45) % 8]

/** A side, with the compass direction it points to: « vers l’aval (le sud) », or « vers le sud » when the flow is unknown. */
export function libelleCote(c: Cote, azimut: number, sens: boolean): string {
  const vers = versDirection(azimut)
  if (!sens) return `vers ${vers}`
  return { aval: `vers l’aval (${vers})`, amont: `vers l’amont (${vers})`, droite: `côté droit (${vers})`, gauche: `côté gauche (${vers})` }[c]
}

/** Why a well is proposed there, in a sentence. */
export function motifProposition(p: Proposition, d: Delimitation): string {
  const m = p.motif
  if (m.type === 'incertitude') return 'Limite du panache la plus incertaine entre les ouvrages'
  const c = d.cotes.find((x) => x.cote === m.cote)
  const cote = c ? libelleCote(c.cote, c.azimut, d.aval !== null) : ''
  const distance = `${fr(Math.round(m.distance))} m`
  const v = d.transport.vitessePolluant?.[0]
  if (m.limite === 'transport')
    return `Fermer le panache ${cote} au-delà de ${m.front} : fin du panache estimée par le transport à ${distance} (polluant à ${fr(Math.round(v ?? 0))} m/an, demi-vie ${fr(d.transport.demiVie)} an${(d.transport.demiVie ?? 0) >= 2 ? 's' : ''})`
  const loin = m.transport !== undefined ? ` ; le transport situe la fin du panache à environ ${m.transport >= 1000 ? `${fr(Math.round(m.transport / 100) / 10)} km` : `${fr(Math.round(m.transport))} m`}, au-delà du site` : ''
  return m.limite === 'estimee'
    ? `Fermer le panache ${cote} au-delà de ${m.front} : fin du panache estimée à ${distance}${loin}`
    : `Fermer le panache ${cote} au-delà de ${m.front} : au bout de ce que le modèle lit (${distance}), le panache peut aller plus loin${loin}`
}
