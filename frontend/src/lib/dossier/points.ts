/**
 * The investigation points of a dossier, shared by every tool, like the site.
 *
 * They are loaded once, in "Points d'investigation" (pages/Localisations.tsx),
 * whose file `points.json` holds the files read and, under `points`, the
 * resolved list: one point per name, placed in longitude/latitude and
 * Lambert 93. The other tools only read that list — no projection library
 * needed — and match their own names to it with `cleOuvrage`.
 */

import { lireTexte } from './acces'
import { lireEnveloppe, type Trace } from './format'
import { abonner as abonnerSession, dossierOuvert } from './session'

export const OUTIL_POINTS = 'points'
export const FICHIER_POINTS = `${OUTIL_POINTS}.json`

export interface PointDossier {
  nom: string
  /** Kind: piezometre, sondage, gaz-sol, sous-dalle, air, traitement, eau-surface, autre. */
  famille: string
  /** Type as written in the file loaded. */
  type: string
  description: string
  lon: number
  lat: number
  x93: number
  y93: number
  /** Ground level, m NGF. */
  altitude?: number
  /** Top of casing or measuring point, m NGF. */
  repere?: number
  /** Depth of the borehole or well, m. */
  profondeur?: number
  source: string
}

/**
 * Key for matching a point's name across tools and files written by
 * different hands: "PZ 01", "pz-1" and "Pz1" are one. The same reading as
 * `cleOuvrage` of resultats/campagnes.ts (Résultats labo, Suivi temporel),
 * kept here so that the standalone pages do not load the lab code.
 */
export function cleOuvrage(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s_.\-/]+/g, '')
    .replace(/(\D)0+(\d)/g, '$1$2')
}

/** The point of a name, found as written or as `cleOuvrage` reads it. */
export function indexer(points: PointDossier[]): (nom: string) => PointDossier | null {
  const parCle = new Map<string, PointDossier>()
  for (const p of points) if (!parCle.has(cleOuvrage(p.nom))) parCle.set(cleOuvrage(p.nom), p)
  return (nom) => parCle.get(cleOuvrage(nom)) ?? null
}

const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** The resolved points of the tool's data, checked one by one (a hand-edited file loses only its bad rows). */
export function extrairePoints(donnees: unknown): PointDossier[] {
  const liste = (donnees as { points?: unknown } | null)?.points
  if (!Array.isArray(liste)) return []
  const out: PointDossier[] = []
  for (const brut of liste) {
    const p = brut as Record<string, unknown>
    if (!p || typeof p.nom !== 'string' || [p.lon, p.lat, p.x93, p.y93].some((v) => nombre(v) === undefined)) continue
    const point: PointDossier = {
      nom: p.nom,
      famille: typeof p.famille === 'string' ? p.famille : 'autre',
      type: typeof p.type === 'string' ? p.type : '',
      description: typeof p.description === 'string' ? p.description : '',
      lon: p.lon as number,
      lat: p.lat as number,
      x93: p.x93 as number,
      y93: p.y93 as number,
      source: typeof p.source === 'string' ? p.source : '',
    }
    for (const k of ['altitude', 'repere', 'profondeur'] as const) {
      const v = nombre(p[k])
      if (v !== undefined) point[k] = v
    }
    out.push(point)
  }
  return out
}

/** Centre of the points (longitude, latitude), to frame a map or a search. */
export function centrePoints(points: PointDossier[]): { lat: number; lon: number } | null {
  if (!points.length) return null
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 }
}

// ---- The points of the open dossier, for this tab ----------------------------------------------

export type EtatPoints =
  | { etat: 'sans-dossier' }
  | { etat: 'chargement' }
  | { etat: 'pret'; points: PointDossier[]; modifie: Trace | null; erreur?: string }

let etat: EtatPoints = { etat: 'sans-dossier' }
/** Dossier the state belongs to, and when the points page last published (ms). */
let idEtat: string | null = null
let publie = 0
const abonnes = new Set<() => void>()

function poser(suite: EtatPoints, id: string | null) {
  etat = suite
  idEtat = id
  for (const f of abonnes) f()
}

export const lireEtatPoints = (): EtatPoints => etat
export function abonnerPoints(f: () => void): () => void {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

let lecture: Promise<void> | null = null

/**
 * Reads points.json of the open dossier (a colleague's points arrive this
 * way). A list published in this tab since the file was written is kept:
 * the points page saves a moment after a change.
 */
export function rafraichirPoints(): Promise<void> {
  lecture ??= (async () => {
    const d = dossierOuvert()
    if (!d) {
      poser({ etat: 'sans-dossier' }, null)
      return
    }
    const id = d.fiche.id
    if (idEtat !== id) poser({ etat: 'chargement' }, id)
    try {
      const lu = await lireTexte(d.repertoire, FICHIER_POINTS)
      if (dossierOuvert()?.fiche.id !== id) return
      if (!lu) {
        if (!(idEtat === id && publie)) poser({ etat: 'pret', points: [], modifie: null }, id)
        return
      }
      if (idEtat === id && publie > lu.date) return
      const e = lireEnveloppe(lu.texte, OUTIL_POINTS, FICHIER_POINTS)
      poser({ etat: 'pret', points: extrairePoints(e.donnees), modifie: e.modifie }, id)
    } catch (err) {
      poser({ etat: 'pret', points: [], modifie: null, erreur: err instanceof Error ? err.message : String(err) }, id)
    }
  })().finally(() => {
    lecture = null
  })
  return lecture
}

/** Called by the points page with the points on its screen, so that the other tools see them at once. */
export function publierPoints(points: PointDossier[]): void {
  const d = dossierOuvert()
  if (!d) return
  publie = Date.now()
  poser({ etat: 'pret', points, modifie: etat.etat === 'pret' && idEtat === d.fiche.id ? etat.modifie : null }, d.fiche.id)
}

/** Follows the dossier: another dossier opened, or closed, reloads the points. */
let suivi = false
export function suivrePoints(): void {
  if (suivi) return
  suivi = true
  abonnerSession(() => {
    const id = dossierOuvert()?.fiche.id ?? null
    if (id !== idEtat) {
      publie = 0
      void rafraichirPoints()
    }
  })
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void rafraichirPoints()
    })
  }
  void rafraichirPoints()
}
