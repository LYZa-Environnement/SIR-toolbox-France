/**
 * Geology as ordered formations rather than blocks: the log keywords are
 * grouped into formations stacked from the surface down (fill, silts,
 * alluvium, bedrock…), the contact between two successive formations is
 * read in each borehole and interpolated between them (kriging or inverse
 * distance, with the regional dip as trend), and each formation fills the
 * space between its top and its base. Layers are continuous, thicknesses
 * and volumes can be read, and a formation missing in a borehole thins out
 * to nothing there.
 *
 * Reading the contacts in a borehole: going down, a layer never goes back
 * up the order (once in formation k, a later layer of a formation above k
 * counts as k). The contact between formations i and i + 1 is the top of
 * the first layer of a formation below i. A borehole ending in formation i
 * or above says only that the contact is deeper than its bottom: it is
 * used as a constraint (the surface is pushed below it when the others
 * would put it above).
 *
 * The proposed grouping: one formation per lithology class (main component
 * of the keyword, lithologie.ts), ordered by the median depth of their top;
 * a class always found between two layers of one same class is a lens of
 * it and joins its formation (« argile » within « sable »). The user can
 * regroup, rename, reorder.
 *
 * Pure.
 */

import { CLASSES_LITHO } from './lithologie.ts'
import { interpoler, type Methode, type Validation } from './krigeage.ts'
import type { Grille } from './interpolation.ts'
import type { Forage } from './types.ts'

export interface Formation {
  id: string
  nom: string
  couleur: string
}

export interface ConfigFormations {
  /** Top to bottom. */
  formations: Formation[]
  /** Keyword of the logs (cleMotCle) → formation id. */
  affectation: Record<string, string>
}

/** Key of a log layer for the grouping: its keyword, else its class. */
export const cleMotCle = (l: { cle: string; classe: string }) => l.cle || `classe:${l.classe}`

const mediane = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : Number.NaN
}

export interface MotCle {
  cle: string
  libelle: string
  classe: string
  /** Boreholes where it is met. */
  forages: number
}

/** Distinct keywords of the logs, with their class. */
export function motsCles(forages: Forage[]): MotCle[] {
  const m = new Map<string, MotCle & { vus: Set<string> }>()
  for (const f of forages)
    for (const l of f.lithologie) {
      const k = cleMotCle(l)
      const e = m.get(k) ?? { cle: k, libelle: l.cle || CLASSES_LITHO[l.classe]?.libelle || l.classe, classe: l.classe, forages: 0, vus: new Set<string>() }
      e.vus.add(f.cle)
      e.forages = e.vus.size
      m.set(k, e)
    }
  return [...m.values()].map(({ vus: _vus, ...k }) => k)
}

/** The grouping proposed from the logs: one formation per class, lenses joined to their host. */
export function proposerFormations(forages: Forage[]): ConfigFormations {
  const logs = forages.filter((f) => f.lithologie.length)
  // Lenses: a class always sandwiched between two layers of one same other class.
  const hote = new Map<string, string | null>()
  for (const f of logs) {
    const ls = f.lithologie
    ls.forEach((l, i) => {
      const dessus = ls[i - 1]?.classe
      const dessous = ls[i + 1]?.classe
      const h = dessus && dessus === dessous && dessus !== l.classe ? dessus : null
      if (!hote.has(l.classe)) hote.set(l.classe, h)
      else if (hote.get(l.classe) !== h) hote.set(l.classe, null)
    })
  }
  const racine = (c: string): string => {
    const seen = new Set<string>()
    let x = c
    while (hote.get(x) && !seen.has(x)) {
      seen.add(x)
      x = hote.get(x)!
    }
    return x
  }
  // Order: median depth of the first top of each class in the boreholes.
  const tops = new Map<string, number[]>()
  for (const f of logs) {
    const vu = new Set<string>()
    for (const l of f.lithologie) {
      const c = racine(l.classe)
      if (vu.has(c)) continue
      vu.add(c)
      ;(tops.get(c) ?? tops.set(c, []).get(c)!).push(l.de)
    }
  }
  const classes = [...tops.keys()].sort((a, b) => mediane(tops.get(a)!) - mediane(tops.get(b)!))
  const lentilles = (c: string) => [...hote.keys()].filter((k) => k !== c && racine(k) === c)
  const formations: Formation[] = classes.map((c) => ({
    id: c,
    nom: (CLASSES_LITHO[c]?.libelle ?? c) + (lentilles(c).length ? ` (lentilles : ${lentilles(c).map((k) => (CLASSES_LITHO[k]?.libelle ?? k).toLowerCase()).join(', ')})` : ''),
    couleur: CLASSES_LITHO[c]?.couleur ?? '#cccccc',
  }))
  const affectation: Record<string, string> = {}
  for (const k of motsCles(logs)) affectation[k.cle] = racine(k.classe)
  return { formations, affectation }
}

/** A configuration kept in the dossier, completed for keywords met since (they go to their class's formation, or the nearest). */
export function completerConfig(config: ConfigFormations, forages: Forage[]): ConfigFormations {
  const propose = proposerFormations(forages)
  const ids = new Set(config.formations.map((f) => f.id))
  const affectation = { ...config.affectation }
  for (const [k, id] of Object.entries(propose.affectation)) if (!affectation[k] || !ids.has(affectation[k])) affectation[k] = ids.has(id) ? id : config.formations[config.formations.length - 1]?.id
  return { formations: config.formations, affectation }
}

export interface PointForage {
  cle: string
  nom: string
  x: number
  y: number
  zSol: number
  forage: Forage
}

/** Depth of each contact (between formation i and i + 1) in a borehole; `censure` when the borehole stops above it. */
export function contactsForage(f: Forage, config: ConfigFormations): ({ profondeur: number } | { censure: number })[] {
  const rang = new Map(config.formations.map((x, i) => [x.id, i]))
  const n = config.formations.length
  const contacts: ({ profondeur: number } | { censure: number })[] = []
  let courant = -1
  const premiers = new Array<number | null>(n).fill(null)
  for (const l of f.lithologie) {
    const r = rang.get(config.affectation[cleMotCle(l)] ?? '')
    if (r === undefined) continue
    if (r > courant) {
      // The contacts crossed going from `courant` to `r` all lie at the top of this layer.
      for (let i = Math.max(0, courant); i < r; i++) if (premiers[i] === null) premiers[i] = l.de
      courant = r
    }
  }
  const fond = Math.max(f.profondeur, ...f.lithologie.map((l) => l.a))
  for (let i = 0; i < n - 1; i++) contacts.push(premiers[i] !== null ? { profondeur: premiers[i]! } : { censure: fond })
  return contacts
}

export interface ResultatFormations {
  formations: Formation[]
  /** Top and base of each formation at the nodes of the ground grid (m NGF). */
  toits: Float64Array[]
  murs: Float64Array[]
  /** Kriging standard deviation of the top of each formation (NaN: the ground, or inverse distance). */
  ecarts: Float64Array[]
  /** Cells of the ground grid modelled (inside the site's parcels, or between the boreholes). */
  masque: Uint8Array
  /** Volume of each formation within the mask (m³). */
  volumes: number[]
  /** Cross-validation of each contact (between formation i and i + 1). */
  validations: (Validation | null)[]
  /** Boreholes giving each contact. */
  donnees: number[]
  avertissements: string[]
}

/**
 * The formations between the ground and the base of the model, on the nodes
 * of the ground grid, within the cells where `dedans(x, y)` (the parcels).
 */
export function construireFormations(
  points: PointForage[],
  sol: Grille,
  base: Grille,
  config: ConfigFormations,
  methode: Methode,
  dedans: (x: number, y: number) => boolean,
): ResultatFormations {
  const n = config.formations.length
  const N = sol.nx * sol.ny
  const avertissements: string[] = []
  const contacts = points.map((p) => contactsForage(p.forage, config))
  const limites: Float64Array[] = []
  const ecartsLimites: Float64Array[] = []
  const validations: (Validation | null)[] = []
  const donnees: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const obs = points.flatMap((p, k) => {
      const c = contacts[k][i]
      return 'profondeur' in c ? [{ x: p.x, y: p.y, v: p.zSol - c.profondeur }] : []
    })
    const censures = points.flatMap((p, k) => {
      const c = contacts[k][i]
      return 'censure' in c ? [{ x: p.x, y: p.y, v: p.zSol - c.censure }] : []
    })
    donnees.push(obs.length)
    const g = new Float64Array(N)
    const e = new Float64Array(N).fill(Number.NaN)
    if (!obs.length) {
      // Never reached: below the base.
      g.fill(Number.NEGATIVE_INFINITY)
      limites.push(g)
      ecartsLimites.push(e)
      validations.push(null)
      if (n > 1) avertissements.push(`Contact ${config.formations[i].nom} / ${config.formations[i + 1].nom} atteint par aucun forage : ${config.formations[i + 1].nom} n’est pas modélisée.`)
      continue
    }
    let interp = interpoler(obs, methode)
    // A borehole stopping above the contact: the surface must pass below its bottom.
    const violees = censures.filter((c) => interp.estimer(c.x, c.y).v > c.v - 0.1)
    if (violees.length) interp = { ...interpoler([...obs, ...violees.map((c) => ({ ...c, v: c.v - 0.3 }))], methode), validation: interp.validation }
    validations.push(interp.validation)
    for (let j = 0; j < sol.ny; j++)
      for (let q = 0; q < sol.nx; q++) {
        const r = interp.estimer(sol.x0 + q * sol.dx, sol.y0 + j * sol.dy)
        g[j * sol.nx + q] = r.v
        e[j * sol.nx + q] = r.ecart
      }
    limites.push(g)
    ecartsLimites.push(e)
  }
  // Stacking: each contact below the one above it, everything between the ground and the base.
  const toits: Float64Array[] = []
  const murs: Float64Array[] = []
  for (let i = 0; i < n; i++) {
    toits.push(new Float64Array(N))
    murs.push(new Float64Array(N))
  }
  for (let q = 0; q < N; q++) {
    let haut = sol.valeurs[q]
    const b = base.valeurs[q]
    for (let i = 0; i < n; i++) {
      const bas = i < n - 1 ? Math.max(b, Math.min(haut, limites[i][q])) : b
      toits[i][q] = haut
      murs[i][q] = Math.min(haut, bas)
      haut = murs[i][q]
    }
  }
  // Cells modelled.
  const nxC = sol.nx - 1
  const nyC = sol.ny - 1
  const masque = new Uint8Array(nxC * nyC)
  for (let j = 0; j < nyC; j++) for (let i = 0; i < nxC; i++) masque[j * nxC + i] = dedans(sol.x0 + (i + 0.5) * sol.dx, sol.y0 + (j + 0.5) * sol.dy) ? 1 : 0
  const aire = sol.dx * sol.dy
  const volumes = config.formations.map((_, f) => {
    let v = 0
    for (let j = 0; j < nyC; j++)
      for (let i = 0; i < nxC; i++) {
        if (!masque[j * nxC + i]) continue
        const k = [j * sol.nx + i, j * sol.nx + i + 1, (j + 1) * sol.nx + i, (j + 1) * sol.nx + i + 1]
        v += (k.reduce((s, q) => s + (toits[f][q] - murs[f][q]), 0) / 4) * aire
      }
    return v
  })
  const ecarts = config.formations.map((_, i) => (i === 0 ? new Float64Array(N).fill(Number.NaN) : ecartsLimites[i - 1]))
  return { formations: config.formations, toits, murs, ecarts, masque, volumes, validations, donnees, avertissements }
}

/** Formation at an elevation of a node: index, or -1 above the ground or below the base. */
export function formationA(r: ResultatFormations, noeud: number, z: number): number {
  for (let i = 0; i < r.formations.length; i++) if (z <= r.toits[i][noeud] && z >= r.murs[i][noeud] && r.toits[i][noeud] > r.murs[i][noeud]) return i
  return -1
}
