/**
 * Public maps laid on the model, when its coordinates are in Lambert 93:
 * - the ground's relief from IGN's altimetry service over RGE ALTI® (one
 *   request for a 14 × 14 grid: the service takes up to about 200 points);
 * - images for the ground: IGN orthophotos and Plan IGN (Géoplateforme WMS,
 *   which allows its images to be used in a WebGL scene), and the BRGM
 *   1/50 000 geological map (BD Scan-Géol-50, the layer shown by Données
 *   environnementales publiques).
 */

import { fromLambert93 } from '../geo.ts'
import { requete } from '../reseau.ts'
import { nouvelleGrille, type Grille } from './interpolation.ts'

const ALTI_URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json'
const COTE = 14

/** Elevation grid over a Lambert 93 box; null when the service gives too little. */
export async function chargerMnt(xmin: number, ymin: number, xmax: number, ymax: number): Promise<Grille | null> {
  const g = nouvelleGrille(xmin, ymin, xmax, ymax, COTE, COTE)
  const lats: string[] = []
  const lons: string[] = []
  for (let j = 0; j < COTE; j++)
    for (let i = 0; i < COTE; i++) {
      const [lon, lat] = fromLambert93(xmin + i * g.dx, ymin + j * g.dy)
      lons.push(lon.toFixed(7))
      lats.push(lat.toFixed(7))
    }
  const url = new URL(ALTI_URL)
  url.searchParams.set('lon', lons.join('|'))
  url.searchParams.set('lat', lats.join('|'))
  url.searchParams.set('resource', 'ign_rge_alti_wld')
  url.searchParams.set('delimiter', '|')
  url.searchParams.set('indent', 'false')
  url.searchParams.set('measures', 'false')
  const r = await requete(url)
  if (!r.ok) throw new Error(`service d'altimétrie IGN : erreur ${r.status}`)
  const json = (await r.json()) as { elevations?: { z?: number }[] }
  const zs = (json.elevations ?? []).map((e) => (typeof e.z === 'number' && e.z > -1000 && e.z < 9000 ? e.z : Number.NaN))
  if (zs.length !== COTE * COTE) return null
  const valides = zs.filter((z) => Number.isFinite(z))
  if (valides.length < (COTE * COTE) / 2) return null
  // Holes in the model (-99999) filled with the mean, rather than a cliff.
  const moyenne = valides.reduce((a, b) => a + b, 0) / valides.length
  zs.forEach((z, i) => (g.valeurs[i] = Number.isFinite(z) ? z : moyenne))
  return g
}

export type FondSol = 'aucun' | 'ortho' | 'plan' | 'geologie'

export const FONDS: Record<FondSol, { libelle: string; source: string }> = {
  aucun: { libelle: 'Teinte du relief', source: '' },
  ortho: { libelle: 'Photographie aérienne', source: 'IGN, BD ORTHO®' },
  plan: { libelle: 'Plan IGN', source: 'IGN, Plan IGN' },
  geologie: { libelle: 'Carte géologique 1/50 000', source: 'BRGM, BD Scan-Géol-50' },
}

/** GetMap URL of a ground image over a Lambert 93 box, `largeur` pixels wide. */
export function urlFond(fond: Exclude<FondSol, 'aucun'>, xmin: number, ymin: number, xmax: number, ymax: number, largeur = 1024): string {
  const hauteur = Math.max(64, Math.round((largeur * (ymax - ymin)) / (xmax - xmin)))
  const commun = `SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&STYLES=&CRS=EPSG:2154&BBOX=${xmin.toFixed(1)},${ymin.toFixed(1)},${xmax.toFixed(1)},${ymax.toFixed(1)}&WIDTH=${largeur}&HEIGHT=${Math.min(2048, hauteur)}`
  if (fond === 'geologie') return `https://geoservices.brgm.fr/geologie?${commun}&LAYERS=SCAN_D_GEOL50&FORMAT=image/png`
  const couche = fond === 'ortho' ? 'ORTHOIMAGERY.ORTHOPHOTOS' : 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'
  return `https://data.geopf.fr/wms-r?${commun}&LAYERS=${couche}&FORMAT=image/jpeg`
}
