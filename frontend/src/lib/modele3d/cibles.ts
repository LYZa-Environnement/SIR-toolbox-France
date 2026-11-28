/**
 * What lies around the site, for the conceptual model: the buildings (IGN
 * BD TOPO®, `BDTOPO_V3:batiment`: footprint, height, use and dwellings —
 * classed in usages.ts), the watercourses
 * (`BDTOPO_V3:troncon_hydrographique`) — both through API Carto's
 * wfs-geoportail module, as the Site Setting does — and the groundwater
 * abstractions declared to the BNPE (Hub'Eau, prélèvements en eau). All in
 * the model's local frame (Lambert 93 minus its origin).
 */

import { bboxToPolygon, fromLambert93, toLambert93, type Bbox } from '../geo.ts'
import { fetchPrelevements } from '../hubeau.ts'
import { requete } from '../reseau.ts'
import type { Modele } from './modele.ts'
import { classerBatiment, type Classement } from './usages.ts'

const WFS = 'https://apicarto.ign.fr/api/wfs-geoportail/search'

export interface Batiment extends Classement {
  anneau: [number, number][]
  /** Height (m), when BD TOPO gives it. */
  hauteur: number | null
  /** Main and secondary use as written (« Résidentiel, Commercial et services »), or « Indifférencié ». */
  usage: string
  /** BD TOPO `nature` (« Indifférenciée », « Industriel, agricole ou commercial »…), or null. */
  nature: string | null
  /** Dwellings and storeys (Fichiers fonciers), when given. */
  logements: number | null
  etages: number | null
}

const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const entier = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/** A building from the properties of a BD TOPO feature. */
export function lireBatiment(anneau: [number, number][], p: Record<string, unknown>): Batiment {
  const usage1 = texte(p.usage_1)
  const usage2 = texte(p.usage_2)
  const nature = texte(p.nature)
  const logements = entier(p.nombre_de_logements)
  const h = typeof p.hauteur === 'number' ? p.hauteur : Number(p.hauteur)
  return {
    anneau,
    hauteur: Number.isFinite(h) && h > 0 ? h : null,
    usage: [usage1, usage2].filter(Boolean).join(', ') || 'Indifférencié',
    nature,
    logements,
    etages: entier(p.nombre_d_etages),
    ...classerBatiment({ usage1, usage2, nature, logements }),
  }
}

export interface CoursDEau {
  nom: string | null
  lignes: [number, number][][]
}

export interface Prelevement {
  nom: string
  usage: string
  x: number
  y: number
  distanceM: number
}

export interface Cibles {
  batiments: Batiment[]
  coursDEau: CoursDEau[]
  prelevements: Prelevement[]
  /** Sources that could not be read. */
  erreurs: string[]
}

type Position = [number, number]

function bboxLocale(m: Modele, marge: number): Bbox {
  const e = m.emprise
  const [o1, s1] = fromLambert93(e.xmin - marge + m.origine.x, e.ymin - marge + m.origine.y)
  const [e1, n1] = fromLambert93(e.xmax + marge + m.origine.x, e.ymax + marge + m.origine.y)
  return { south: s1, west: o1, north: n1, east: e1 }
}

const versLocal = (m: Modele, [lon, lat]: Position): [number, number] => {
  const [x, y] = toLambert93(lat, lon)
  return [x - m.origine.x, y - m.origine.y]
}

async function chercher(source: string, bbox: Bbox, limite: number): Promise<{ geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }[]> {
  const url = new URL(WFS)
  url.searchParams.set('source', source)
  url.searchParams.set('geom', JSON.stringify(bboxToPolygon(bbox)))
  url.searchParams.set('_limit', String(limite))
  const r = await requete(url)
  if (!r.ok) throw new Error(`erreur ${r.status}`)
  return ((await r.json()) as { features?: never[] }).features ?? []
}

/** Buildings, watercourses and abstractions around a georeferenced model. */
export async function chargerCibles(m: Modele): Promise<Cibles> {
  const erreurs: string[] = []
  const [batiments, coursDEau, prelevements] = await Promise.all([
    chercher('BDTOPO_V3:batiment', bboxLocale(m, 30), 500)
      .then((fs) =>
        fs.flatMap((f): Batiment[] => {
          const g = f.geometry
          const p = f.properties ?? {}
          const polys = g?.type === 'Polygon' ? [g.coordinates as number[][][]] : g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : []
          return polys.map((poly) =>
            lireBatiment(
              poly[0].map((c) => versLocal(m, [c[0], c[1]])),
              p,
            ),
          )
        }),
      )
      .catch((e) => {
        erreurs.push(`Bâtiments (BD TOPO) : ${(e as Error).message}`)
        return [] as Batiment[]
      }),
    chercher('BDTOPO_V3:troncon_hydrographique', bboxLocale(m, 1000), 300)
      .then((fs) =>
        fs.flatMap((f): CoursDEau[] => {
          const g = f.geometry
          const lignes: number[][][] = g?.type === 'LineString' ? [g.coordinates as number[][]] : g?.type === 'MultiLineString' ? (g.coordinates as number[][][]) : []
          const nom = f.properties?.toponyme
          return lignes.length ? [{ nom: typeof nom === 'string' && nom.trim() ? nom.trim() : null, lignes: lignes.map((l) => l.map((c) => versLocal(m, [c[0], c[1]]))) }] : []
        }),
      )
      .catch((e) => {
        erreurs.push(`Cours d’eau (BD TOPO) : ${(e as Error).message}`)
        return [] as CoursDEau[]
      }),
    (async () => {
      const [lon, lat] = fromLambert93(m.origine.x, m.origine.y)
      const ps = await fetchPrelevements(lat, lon, 2000)
      if (ps === null) throw new Error('service injoignable')
      return ps.map((p): Prelevement => {
        const [x, y] = versLocal(m, [p.lon, p.lat])
        return { nom: p.nom ?? 'Ouvrage sans nom', usage: p.usage ?? 'usage non précisé', x, y, distanceM: p.distanceM }
      })
    })().catch((e) => {
      erreurs.push(`Prélèvements déclarés (BNPE) : ${(e as Error).message}`)
      return [] as Prelevement[]
    }),
  ])
  return { batiments, coursDEau, prelevements, erreurs }
}
