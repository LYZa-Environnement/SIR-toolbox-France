import proj4 from 'proj4'
import type { PageAnalysee } from './analyse'
import {
  affineL93,
  appliquer,
  calerParEtiquettes,
  calerParPoints,
  choisirCadre,
  choisirCrs,
  echelleDe,
  type Affine,
  type Crs,
  type Etiquette,
  type Rect,
} from './calage'
import { decoder } from './glyphes'
import type { Grille } from './reseau'

/** Where a plan page sits on the ground. */
export interface Geo {
  crs: Crs
  /** PDF user space to the plan's own system. */
  m: Affine
  /** PDF user space to Lambert 93. */
  l93: Affine
  /** Map frame, in user space. */
  cadre: Rect
  /** Coordinates written on the plan, drawn on it (read from their
   *  shapes), or points placed by hand. */
  origine: 'etiquettes' | 'dessinees' | 'manuel'
  /** Largest disagreement between the points used and the fit, in metres. */
  residu: number | null
  echelle: number
  grille: Grille | null
}

/** Georeferencing from the plan's grid labels — written ones, or drawn
 *  ones once read (`lues`). */
export function calerAuto(p: PageAnalysee, commune: [number, number] | null, lues?: Etiquette[]): Geo | null {
  const c = calerParEtiquettes(lues ?? p.etiquettes)
  if (!c) return null
  const cadre = choisirCadre(p.rectangles, c.enveloppe, p.boite)
  const centre = appliquer(c.m, (cadre[0] + cadre[2]) / 2, (cadre[1] + cadre[3]) / 2)
  const crs = choisirCrs(p.indiceCrs, centre, commune)
  if (!crs) return null
  return {
    crs,
    m: c.m,
    l93: affineL93(c.m, crs, cadre),
    cadre,
    origine: lues ? 'dessinees' : 'etiquettes',
    residu: c.residu,
    echelle: echelleDe(c.m),
    grille: { m: c.m, valeursE: c.valeursE, valeursN: c.valeursN },
  }
}

/** Map frame of a plan georeferenced by hand: the largest rectangle drawn
 *  inside the sheet border, else the page. */
export function cadreManuel(p: PageAnalysee): Rect {
  const aire = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1])
  const page = aire(p.boite)
  const r = p.rectangles.filter((x) => aire(x) > 0.2 * page && aire(x) < 0.97 * page).sort((a, b) => aire(b) - aire(a))[0]
  return r ?? p.boite
}

export interface PointDeCalage {
  /** PDF user space. */
  x: number
  y: number
  e: number
  n: number
}

/** Georeferencing from points clicked on the plan: one point is enough
 *  when the scale is written on it (the plan is then taken north up),
 *  two give scale and rotation, three or more a full affine fit. */
export function calerManuel(p: PageAnalysee, points: PointDeCalage[], crs: Crs): Geo | null {
  let m: Affine | null = null
  if (points.length === 1 && p.echelle) {
    const a = (p.echelle * 0.0254) / 72
    const [q] = points
    m = [a, 0, q.e - a * q.x, 0, a, q.n - a * q.y]
  } else m = calerParPoints(points)
  if (!m) return null
  const cadre = cadreManuel(p)
  const residu = points.length >= 3 ? Math.max(...points.map((q) => Math.hypot(appliquer(m, q.x, q.y)[0] - q.e, appliquer(m, q.x, q.y)[1] - q.n))) : null
  return { crs, m, l93: affineL93(m, crs, cadre), cadre, origine: 'manuel', residu, echelle: echelleDe(m), grille: null }
}

/** Corners of the frame in Lambert 93, for the plan's outline. */
export function contourL93(g: Geo): [number, number][] {
  const [x0, y0, x1, y1] = g.cadre
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => appliquer(g.l93, x, y))
}

/** Reads the drawn grid labels of one file's plans (see `decoder`), near
 *  the works: `pres` is a Lambert 93 point of the area (the commune, or a
 *  plan already placed). Tried in the system written on the plans, else
 *  in Lambert 93 and the conic zone of the latitude. Returns the labels
 *  read, by page index. */
export function lireDessinees(pages: PageAnalysee[], pres: [number, number]): Map<number, Etiquette[]> {
  const lues = new Map<number, Etiquette[]>()
  const aLire = pages.filter((p) => p.dessinees.length && p.echelle)
  if (!aLire.length) return lues
  const lat = (proj4('EPSG:2154', 'EPSG:4326', pres) as [number, number])[1]
  const zone = Math.min(50, Math.max(42, Math.round(lat)))
  const indice = aLire.find((p) => p.indiceCrs)?.indiceCrs
  const systemes: Crs[] = indice ? [indice] : ['EPSG:2154', `EPSG:39${zone}` as Crs]
  for (const crs of systemes) {
    const approx = (crs === 'EPSG:2154' ? pres : proj4('EPSG:2154', crs, pres)) as [number, number]
    const r = decoder(
      aLire.map((p) => ({ etiquettes: p.dessinees, metresParPoint: (p.echelle! * 0.0254) / 72 })),
      approx,
    )
    if (r) {
      aLire.forEach((p, i) => r[i].length && lues.set(p.index, r[i]))
      break
    }
  }
  return lues
}
