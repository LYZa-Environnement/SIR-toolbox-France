import { calerParPoints, versMercator } from './calage'
import type { Vue } from './synthese'

export type Fond = 'plan' | 'ortho' | 'cadastre' | 'aucun'

export const FONDS: { id: Fond; libelle: string }[] = [
  { id: 'plan', libelle: 'Plan IGN et cadastre' },
  { id: 'ortho', libelle: 'Photo aérienne et cadastre' },
  { id: 'cadastre', libelle: 'Cadastre seul' },
  { id: 'aucun', libelle: 'Aucun fond' },
]

interface Couche {
  nom: string
  format: string
  style: string
}

const CADASTRE: Couche = { nom: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS', format: 'image/png', style: 'PCI vecteur' }
const COUCHES: Record<Fond, Couche[]> = {
  plan: [{ nom: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', format: 'image/png', style: 'normal' }, CADASTRE],
  ortho: [{ nom: 'ORTHOIMAGERY.ORTHOPHOTOS', format: 'image/jpeg', style: 'normal' }, CADASTRE],
  cadastre: [CADASTRE],
  aucun: [],
}

export const SOURCES_FONDS: Record<Fond, string> = {
  plan: 'Fond : Plan IGN et Parcellaire Express (PCI) — © IGN, Géoplateforme',
  ortho: 'Fond : BD ORTHO® et Parcellaire Express (PCI) — © IGN, Géoplateforme',
  cadastre: 'Fond : Parcellaire Express (PCI) — © IGN, Géoplateforme',
  aucun: '',
}

/** Web Mercator half-circumference, and the deepest zoom served. */
const R = 20037508.342789244
const ZOOM_MAX = 19
const TUILE = 256

/** A tile, or null when there is none (sea, outside the cover) or it
 *  still fails after the retries: some servers behind the Géoplateforme
 *  answer "layer unknown" to a fair share of requests. */
async function tuile(c: Couche, z: number, x: number, y: number, signal?: AbortSignal): Promise<ImageBitmap | 'absente' | null> {
  const url =
    `https://data.geopf.fr/wmts?LAYER=${c.nom}&EXCEPTIONS=text/xml&FORMAT=${c.format}&SERVICE=WMTS&VERSION=1.0.0` +
    `&REQUEST=GetTile&STYLE=${encodeURIComponent(c.style)}&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`
  for (let essai = 0; essai < 12; essai++) {
    try {
      const r = await fetch(url, { signal })
      if (r.status === 404) return 'absente'
      if (r.ok && r.headers.get('content-type')?.startsWith('image/')) return await createImageBitmap(await r.blob())
    } catch (e) {
      if (signal?.aborted) throw e
    }
    await new Promise((ok) => setTimeout(ok, 150 * (essai + 1)))
  }
  return null
}

/** Runs the jobs a few at a time. */
async function parLots<T>(travaux: (() => Promise<T>)[], n = 8): Promise<void> {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, travaux.length) }, async () => {
      while (i < travaux.length) await travaux[i++]()
    }),
  )
}

/** Draws the base map of a Lambert 93 view from the Web Mercator tiles of
 *  the Géoplateforme: the tiles are assembled, then laid on the view by an
 *  affine map fitted on its corners — over a few hundred metres the two
 *  conformal projections differ by a rotation and a scale, to the
 *  millimetre. */
export async function dessinerFond(ctx: CanvasRenderingContext2D, fond: Fond, vue: Vue, signal?: AbortSignal): Promise<{ manquantes: number }> {
  const largeur = Math.max(1, Math.round((vue.etendue[2] - vue.etendue[0]) / vue.resolution))
  const hauteur = Math.max(1, Math.round((vue.etendue[3] - vue.etendue[1]) / vue.resolution))
  const [x0, y0, x1, y1] = vue.etendue
  const coinsVue: [number, number, number, number][] = [
    [0, 0, x0, y1],
    [largeur, 0, x1, y1],
    [0, hauteur, x0, y0],
    [largeur, hauteur, x1, y0],
  ]
  const merc = coinsVue.map(([u, v, e, n]) => ({ u, v, m: versMercator(e, n) }))
  const mx0 = Math.min(...merc.map((c) => c.m[0]))
  const mx1 = Math.max(...merc.map((c) => c.m[0]))
  const my0 = Math.min(...merc.map((c) => c.m[1]))
  const my1 = Math.max(...merc.map((c) => c.m[1]))
  // Zoom whose pixel is closest to the view's, on the ground.
  const echelleMerc = (mx1 - mx0) / (x1 - x0)
  const z = Math.max(0, Math.min(ZOOM_MAX, Math.round(Math.log2((2 * R) / TUILE / (vue.resolution * echelleMerc)))))
  const n = 2 ** z
  const tx = (mx: number) => ((mx + R) / (2 * R)) * n
  const ty = (my: number) => ((R - my) / (2 * R)) * n
  const c0 = Math.floor(tx(mx0))
  const c1 = Math.floor(tx(mx1))
  const r0 = Math.floor(ty(my1))
  const r1 = Math.floor(ty(my0))

  const mosaique = document.createElement('canvas')
  mosaique.width = (c1 - c0 + 1) * TUILE
  mosaique.height = (r1 - r0 + 1) * TUILE
  const mctx = mosaique.getContext('2d')!
  // Mosaic pixel ↔ view pixel, through Mercator.
  const passage = calerParPoints(merc.map((c) => ({ x: (tx(c.m[0]) - c0) * TUILE, y: (ty(c.m[1]) - r0) * TUILE, e: c.u, n: c.v })))
  let manquantes = 0
  if (!passage) return { manquantes }
  for (const couche of COUCHES[fond]) {
    mctx.clearRect(0, 0, mosaique.width, mosaique.height)
    const travaux: (() => Promise<void>)[] = []
    for (let x = c0; x <= c1; x++) {
      for (let y = r0; y <= r1; y++) {
        travaux.push(async () => {
          const image = await tuile(couche, z, x, y, signal)
          if (image === null) manquantes++
          else if (image !== 'absente') mctx.drawImage(image, (x - c0) * TUILE, (y - r0) * TUILE)
        })
      }
    }
    await parLots(travaux)
    ctx.save()
    ctx.imageSmoothingQuality = 'high'
    ctx.setTransform(passage[0], passage[3], passage[1], passage[4], passage[2], passage[5])
    ctx.drawImage(mosaique, 0, 0)
    ctx.restore()
  }
  mosaique.width = mosaique.height = 0
  return { manquantes }
}
