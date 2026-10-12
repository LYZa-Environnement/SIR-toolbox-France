import type { Rect } from './calage'
import { ecart, rvb, type Masque } from './reseau'

type Canevas = HTMLCanvasElement
export type CreerCanevas = (largeur: number, hauteur: number) => Canevas

export interface CoucheSynthese {
  masque: Masque
  couleur: string
  /** Plan colours left out (a commune boundary, a zone…). */
  exclues?: string[]
}

/** Whether each palette entry of a mask is kept, given excluded colours. */
export function couleursGardees(m: Masque, exclues: string[] = []): boolean[] {
  return [false, ...m.palette.map((p) => !exclues.some((e) => ecart(rvb(e), rvb(p.couleur)) < 48))]
}

/** Cadre de lecture: a Lambert 93 extent and a pixel size. */
export interface Vue {
  etendue: Rect
  /** Metres per pixel. */
  resolution: number
}

export const tailleVue = (v: Vue) => ({
  largeur: Math.max(1, Math.round((v.etendue[2] - v.etendue[0]) / v.resolution)),
  hauteur: Math.max(1, Math.round((v.etendue[3] - v.etendue[1]) / v.resolution)),
})

/** Extent of the networks, with a margin, and the pixel size that keeps
 *  the picture under `pixelsMax` (and no finer than 5 cm). */
export function vueDesReseaux(couches: CoucheSynthese[], pixelsMax = 12e6): Vue | null {
  const e = couches.map((c) => c.masque.emprise).filter((r): r is Rect => r !== null)
  if (!e.length) return null
  let [x0, y0, x1, y1] = [Math.min(...e.map((r) => r[0])), Math.min(...e.map((r) => r[1])), Math.max(...e.map((r) => r[2])), Math.max(...e.map((r) => r[3]))]
  const marge = Math.max(15, 0.06 * Math.max(x1 - x0, y1 - y0))
  ;[x0, y0, x1, y1] = [x0 - marge, y0 - marge, x1 + marge, y1 + marge]
  const resolution = Math.max(0.05, Math.sqrt(((x1 - x0) * (y1 - y0)) / pixelsMax))
  return { etendue: [x0, y0, x1, y1], resolution }
}

/** Shrinks a mask by an integer factor keeping the strongest pixel of
 *  each block: a one-pixel line stays a full line instead of fading. */
function reduire(m: Masque, k: number, gardees: boolean[]): { alpha: Uint8Array; largeur: number; hauteur: number } {
  // k may be 1: the copy still drops the excluded colours.
  const w = Math.ceil(m.largeur / k)
  const h = Math.ceil(m.hauteur / k)
  const a = new Uint8Array(w * h)
  for (let y = 0; y < m.hauteur; y++) {
    const ligne = Math.floor(y / k) * w
    for (let x = 0; x < m.largeur; x++) {
      const i = y * m.largeur + x
      if (!gardees[m.classes[i]]) continue
      const v = m.alpha[i]
      const j = ligne + Math.floor(x / k)
      if (v > a[j]) a[j] = v
    }
  }
  return { alpha: a, largeur: w, hauteur: h }
}

/** Widens strokes by one pixel all round, so that thin network lines
 *  stay readable once the view is reduced on screen or on paper. */
function epaissir(r: { alpha: Uint8Array; largeur: number; hauteur: number }) {
  const { largeur: w, hauteur: h, alpha } = r
  const sortie = new Uint8Array(alpha.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < w && alpha[yy * w + xx] > m) m = alpha[yy * w + xx]
        }
      }
      sortie[y * w + x] = m
    }
  }
  return { alpha: sortie, largeur: w, hauteur: h }
}

/** Draws each layer in its colour onto the view. */
export function dessinerReseaux(ctx: CanvasRenderingContext2D, couches: CoucheSynthese[], vue: Vue, creer: CreerCanevas) {
  const [X0, , , Y1] = vue.etendue
  for (const c of couches) {
    const m = c.masque
    if (!m.emprise || !m.largeur) continue
    const k = Math.max(1, Math.floor(vue.resolution / m.resolution))
    const r = epaissir(reduire(m, k, couleursGardees(m, c.exclues)))
    const toile = creer(r.largeur, r.hauteur)
    const cx = toile.getContext('2d')!
    const image = cx.createImageData(r.largeur, r.hauteur)
    const [cr, cg, cb] = rvb(c.couleur)
    for (let i = 0; i < r.alpha.length; i++) {
      const a = r.alpha[i]
      if (!a) continue
      image.data[i * 4] = cr
      image.data[i * 4 + 1] = cg
      image.data[i * 4 + 2] = cb
      // Thin strokes stay legible once reduced: opacity is boosted.
      image.data[i * 4 + 3] = Math.min(255, a * 1.6)
    }
    cx.putImageData(image, 0, 0)
    // Reduced pixel → mask pixel (×k) → Lambert 93 → view pixel.
    const t = m.versL93
    const s = 1 / vue.resolution
    ctx.setTransform(t[0] * k * s, -t[3] * k * s, t[1] * k * s, -t[4] * k * s, (t[2] - X0) * s, (Y1 - t[5]) * s)
    ctx.drawImage(toile, 0, 0)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Greys and lightens the base map, so that coloured networks stand out. */
export function estomper(ctx: CanvasRenderingContext2D, largeur: number, hauteur: number, force = 0.55) {
  const image = ctx.getImageData(0, 0, largeur, hauteur)
  const d = image.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]
    const v = 255 - (255 - g) * force
    d[i] = d[i + 1] = d[i + 2] = v
    d[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

/** Outline of a plan's map frame, in Lambert 93, drawn dashed. */
export function dessinerContours(ctx: CanvasRenderingContext2D, contours: Contour[], vue: Vue) {
  const [X0, , , Y1] = vue.etendue
  const s = 1 / vue.resolution
  ctx.save()
  ctx.lineWidth = 1.5
  ctx.setLineDash([8, 6])
  ctx.globalAlpha = 0.7
  for (const c of contours) {
    ctx.strokeStyle = c.couleur
    ctx.beginPath()
    c.coins.forEach(([x, y], i) => (i ? ctx.lineTo((x - X0) * s, (Y1 - y) * s) : ctx.moveTo((x - X0) * s, (Y1 - y) * s)))
    ctx.closePath()
    ctx.stroke()
  }
  ctx.restore()
}

export interface Contour {
  coins: [number, number][]
  couleur: string
}

/** The synthesis picture: the faded base map (already drawn on `fond`),
 *  the outline of each plan used, then the networks. */
export function composer(vue: Vue, fond: HTMLCanvasElement | null, couches: CoucheSynthese[], contours: Contour[], creer: CreerCanevas): HTMLCanvasElement {
  const { largeur, hauteur } = tailleVue(vue)
  const toile = creer(largeur, hauteur)
  const ctx = toile.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, largeur, hauteur)
  if (fond) ctx.drawImage(fond, 0, 0, largeur, hauteur)
  dessinerContours(ctx, contours, vue)
  dessinerReseaux(ctx, couches, vue, creer)
  return toile
}
