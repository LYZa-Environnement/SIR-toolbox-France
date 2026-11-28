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

import type { Base, Resultat } from '../suivi/modele.ts'
import { phi } from '../suivi/stats.ts'
import { dansAnneaux, distancePlusProche, enveloppeConvexe, espacementMedian, valeurEn, zoneInterpolee, type Grille, type Plan } from './interpolation.ts'
import { ecartsKrigeage, interpoler } from './krigeage.ts'
import { fr } from './format.ts'
import { champSurGrille, donneesPanache, type Modele, type ValeurPoint } from './modele.ts'

export type Cote = 'aval' | 'droite' | 'gauche' | 'amont'

export const COTES: Cote[] = ['aval', 'droite', 'gauche', 'amont']

/** Angle of each side from the downgradient direction, clockwise: right is to the right looking downgradient. */
const DECALAGE: Record<Cote, number> = { aval: 0, droite: 90, amont: 180, gauche: 270 }

export type Fermeture = 'nette' | 'juste'

export interface Temoin {
  cle: string
  nom: string
  /** Distance from the well above the value it closes (m). */
  distance: number
  resultat: Resultat
  fermeture: Fermeture
}

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

export type StatutCote = 'delimite' | 'juste' | 'ouvert'

export interface BilanCote {
  cote: Cote
  /** Azimuth of the side (° from north, clockwise). */
  azimut: number
  statut: StatutCote
  /** Outermost wells above the value with no well below it beyond them (names). */
  front: string[]
  /** Wells below the value closing the side, nearest first. */
  temoins: Temoin[]
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
        /** Where the model puts the end of the plume on that axis (probability of exceeding 25 % at most), or the end of the interpolated reach. */
        limite: 'estimee' | 'portee'
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
  avertissements: string[]
}

export interface OptionsDelimitation {
  /** Downgradient azimuth (°); null when unknown. */
  aval: number | null
  /** Water table at the date (head on the ground grid's nodes, and the plane of the wells' heads), for the depth to water at the proposed wells. */
  nappe?: { grille: Grille | null; plan: Plan | null } | null
  /** Number of wells to propose (0 to 5, default 3). */
  propositions?: number
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

const meilleure = (a: Fermeture | null, b: Fermeture | null): Fermeture | null => (a === 'nette' || b === 'nette' ? 'nette' : (a ?? b))

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
export function fermeturesPanache(places: ValeurPoint[], reference: number, aval: number | null): Fermetures {
  const axe = aval ?? 0
  const hauts = places.filter((v) => !v.resultat.inferieur && v.resultat.valeur >= reference)
  const lqHautes = places.filter((v) => v.resultat.inferieur && v.resultat.valeur > reference).map((v) => v.nom)
  const distincts = (a: ValeurPoint, b: ValeurPoint) => a.cle !== b.cle && Math.hypot(a.x - b.x, a.y - b.y) > 0.01
  const dans = (w: ValeurPoint, q: ValeurPoint, c: Cote) => distincts(w, q) && coteDe(q.x - w.x, q.y - w.y, axe) === c
  const depassants: OuvrageDepassant[] = hauts.map((w) => {
    // The nearest witness of each quadrant (where the plume ends at the latest), and the best closure found there.
    const temoins: Record<Cote, Temoin | null> = AUCUN()
    const fermetures: Record<Cote, Fermeture | null> = AUCUN()
    for (const q of places) {
      if (!distincts(w, q)) continue
      const f = fermetureDe(q.resultat, reference)
      if (!f) continue
      const c = coteDe(q.x - w.x, q.y - w.y, axe)
      const d = Math.hypot(q.x - w.x, q.y - w.y)
      if (!temoins[c] || d < temoins[c].distance) temoins[c] = { cle: q.cle, nom: q.nom, distance: d, resultat: q.resultat, fermeture: f }
      fermetures[c] = meilleure(fermetures[c], f)
    }
    return { cle: w.cle, nom: w.nom, x: w.x, y: w.y, resultat: w.resultat, rapport: w.resultat.valeur / reference, temoins, fermetures }
  })
  const fronts = new Map<Cote, OuvrageDepassant[]>()
  const cotes: BilanCote[] = COTES.map((c) => {
    const ouverts = depassants.filter((w) => w.fermetures[c] === null)
    const statut: StatutCote = ouverts.length ? 'ouvert' : depassants.some((w) => w.fermetures[c] === 'juste') ? 'juste' : 'delimite'
    // Every well above the value beyond an open one is open too: the front is the open wells with none beyond.
    const devant = ouverts.filter((w) => !hauts.some((x) => dans(w, x, c))).sort((a, b) => b.rapport - a.rapport)
    fronts.set(c, devant)
    const parCle = new Map<string, Temoin>()
    for (const w of depassants) {
      const t = w.temoins[c]
      if (t && (!parCle.has(t.cle) || t.distance < parCle.get(t.cle)!.distance)) parCle.set(t.cle, t)
    }
    return { cote: c, azimut: (axe + DECALAGE[c]) % 360, statut, front: devant.map((w) => w.nom), temoins: [...parCle.values()].sort((a, b) => a.distance - b.distance) }
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

  // ---- Closure, well by well ---------------------------------------------------------------
  const { depassants, cotes, fronts, lqHautes } = fermeturesPanache(places, reference, aval)
  if (lqHautes.length)
    avertissements.push(
      `Non quantifié avec une LQ au-dessus de la valeur de comparaison, sans effet sur la délimitation : ${lqHautes.join(', ')}. Une LQ plus basse est à demander au laboratoire.`,
    )

  // ---- Interpolated field ------------------------------------------------------------------
  const interp = pts.length ? interpoler(pts, m.methode, false) : null
  const grille = interp ? champSurGrille(m, pts, interp) : null

  // ---- Edge of the data --------------------------------------------------------------------
  const bord: SegmentBord[] = []
  const enveloppe = places.length >= 3 ? enveloppeConvexe(places) : []
  if (interp && enveloppe.length >= 3) {
    const pas = Math.max(0.5, Math.min(m.sol.dx, m.sol.dy))
    for (let k = 0; k < enveloppe.length; k++) {
      const a = enveloppe[k]
      const b = enveloppe[(k + 1) % enveloppe.length]
      const ex = b.x - a.x
      const ey = b.y - a.y
      // Counter-clockwise hull: the outside is on the right of each edge.
      const cote = coteDe(ey, -ex, axe)
      const n = Math.max(1, Math.ceil(Math.hypot(ex, ey) / pas))
      for (let s = 0; s < n; s++) {
        const x1 = a.x + (ex * s) / n
        const y1 = a.y + (ey * s) / n
        const x2 = a.x + (ex * (s + 1)) / n
        const y2 = a.y + (ey * (s + 1)) / n
        bord.push({ x1, y1, x2, y2, depasse: interp.estimer((x1 + x2) / 2, (y1 + y2) / 2).v >= seuil, cote })
      }
    }
  }
  const longueur = (s: SegmentBord) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
  const perimetre = bord.reduce((t, s) => t + longueur(s), 0)
  const partBord = perimetre > 0 ? bord.filter((s) => s.depasse).reduce((t, s) => t + longueur(s), 0) / perimetre : 0

  // ---- Probability of exceeding ------------------------------------------------------------
  const g = m.sol
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
    const ajouter = (x: number, y: number, motif: Proposition['motif']) => {
      const est = zone(x, y) ? interp.estimer(x, y) : null
      positions.push({ x, y })
      let reste: number | null = null
      const s = krige ? ecartsKrigeage(positions, v!) : null
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
      let c = grilleNappe && dansEmprise ? valeurEn(grilleNappe, x, y) : Number.NaN
      if (!Number.isFinite(c) && planNappe && dansEmprise) c = Math.min(planNappe.a * x + planNappe.b * y + planNappe.c, sol - 0.02)
      const charge = Number.isFinite(c) ? c : null
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
        profondeurEau: charge !== null ? sol - charge : null,
        douteuxApres: reste,
      })
    }

    // 1. Closing wells: beyond the front of each open side, along its axis, where the model puts
    //    the end of the plume (a well likely below the value), else at the end of the reach, where
    //    the model stops reading; not closer than a third of the reach (10 m at least).
    const bout = 0.98 * reach
    const minimum = Math.min(bout, Math.max(10, reach / 3))
    const foulee = Math.max(0.5, Math.min(g.dx, g.dy) / 2)
    for (const s of cotes) {
      if (s.statut !== 'ouvert') continue
      const ux = Math.sin((s.azimut * Math.PI) / 180)
      const uy = Math.cos((s.azimut * Math.PI) / 180)
      for (const w of fronts.get(s.cote)!) {
        if (propositions.length >= nombre) break
        let d = minimum
        let limite: 'estimee' | 'portee' = 'portee'
        for (let t = minimum; t <= bout; t += foulee) {
          d = t
          const est = interp.estimer(w.x + t * ux, w.y + t * uy)
          const p = krige ? probabiliteAuDessus(est.v, est.ecart, seuil) : est.v < seuil - Math.log10(2) ? 0 : 1
          if (p <= 0.25) {
            limite = 'estimee'
            break
          }
        }
        const x = w.x + d * ux
        const y = w.y + d * uy
        // One well for fronts side by side.
        if (propositions.some((p) => Math.hypot(p.x - x, p.y - y) < reach / 2)) continue
        ajouter(x, y, { type: 'fermeture', cote: s.cote, front: w.nom, distance: d, limite })
      }
    }

    // 2. Then where the limit of the plume is most doubtful between and around the wells.
    while (krige && ecarts && grille && propositions.length < nombre) {
      let meilleur = -1
      let critere = 0.02
      for (const q of noeuds) {
        const p = probabiliteAuDessus(grille.champ[q], ecarts[q], seuil)
        const c = Math.min(p, 1 - p)
        if (c <= critere) continue
        const { x, y } = xy(q)
        if (distancePlusProche(positions, x, y) < ecartement) continue
        ;[meilleur, critere] = [q, c]
      }
      if (meilleur < 0) break
      const { x, y } = xy(meilleur)
      ajouter(x, y, { type: 'incertitude' })
    }
  }

  const verdict: Verdict = !depassants.length
    ? 'aucun-depassement'
    : cotes.some((c) => c.statut === 'ouvert')
      ? 'non-delimite'
      : cotes.some((c) => c.statut === 'juste') || partBord > 0
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
    avertissements,
  }
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
  return m.limite === 'estimee'
    ? `Fermer le panache ${cote} au-delà de ${m.front} : fin du panache estimée à ${distance}`
    : `Fermer le panache ${cote} au-delà de ${m.front} : au bout de ce que le modèle lit (${distance}), le panache peut aller plus loin`
}
