/**
 * Draws a signature pie chart as a PNG, in the browser (canvas). Used both
 * for the Excel "Signatures" sheet — ExcelJS cannot write native charts, so
 * the pies are inserted as images — and for the preview on the page.
 *
 * The pies of one family share a scale: the area is proportional to the
 * sample's total (the cartographic convention for proportional symbols),
 * the largest total of the family drawn at the full size, so that pies of
 * several wells can be set side by side, or on a map, and compared.
 * Compounds are named by their usual short form (PCE, cis-DCE, BaP…).
 */

import { acronyme } from './acronymes.ts'
import { preparerParts, type Signature } from './signatures.ts'
import { nombreFr } from '../format.ts'

export const LARGEUR = 380
export const HAUTEUR = 230
/** Radius of the largest total of a family (px). */
export const RAYON_MAX = 72
/** Below this, a pie would not show: drawn at this radius, and said so. */
const RAYON_MIN = 3

/** Radius for a total: the area proportional to it on the family's scale. */
export function rayonPour(total: number, totalMax: number): number {
  if (!(totalMax > 0)) return RAYON_MAX
  return Math.max(RAYON_MIN, RAYON_MAX * Math.sqrt(Math.max(0, total) / totalMax))
}

const tropPetit = (total: number, totalMax: number) => RAYON_MAX * Math.sqrt(Math.max(0, total) / totalMax) < RAYON_MIN

const fr = (x: number) => nombreFr(x, 3)

function tracer(ctx: CanvasRenderingContext2D, signature: Signature, ordre: string[], cx: number, cy: number, r: number) {
  let angle = -Math.PI / 2
  for (const p of preparerParts(signature.parts, ordre)) {
    const fin = angle + p.part * 2 * Math.PI
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, angle, fin)
    ctx.closePath()
    ctx.fillStyle = p.couleur
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.min(1.5, r / 10)
    ctx.stroke()
    angle = fin
  }
}

function toile(largeur: number, hauteur: number, fond: boolean, echelle = 2) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(largeur * echelle)
  canvas.height = Math.ceil(hauteur * echelle)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(echelle, echelle)
  if (fond) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, largeur, hauteur)
  }
  return { canvas, ctx }
}

/**
 * A pie with its title, total and legend. With `totalMax`, the diameter is
 * proportional to the total on that scale; without it, full size (the pie
 * of all samples together).
 */
export function dessinerCamembert(signature: Signature, ordre: string[], unite: string, titre?: string, totalMax?: number): string | null {
  const t = toile(LARGEUR, HAUTEUR, true)
  if (!t) return null
  const { canvas, ctx } = t

  ctx.fillStyle = '#1c1c1c'
  ctx.font = 'bold 12px Verdana, sans-serif'
  ctx.fillText(titre ?? signature.echantillon, 10, 18)
  ctx.font = '10px Verdana, sans-serif'
  ctx.fillStyle = '#5a5a5a'
  ctx.fillText(`Total : ${fr(signature.total)} ${unite}`, 10, 33)
  const r = totalMax === undefined ? RAYON_MAX : rayonPour(signature.total, totalMax)
  if (totalMax !== undefined) {
    ctx.font = '8.5px Verdana, sans-serif'
    ctx.fillText(tropPetit(signature.total, totalMax) ? 'Agrandi (total trop faible pour l’échelle)' : 'Surface proportionnelle au total', 10, 45)
  }
  tracer(ctx, signature, ordre, 90, 135, r)

  // Legend in compound order, long names shortened to fit.
  const parts = preparerParts(signature.parts, ordre)
  ctx.font = '10px Verdana, sans-serif'
  const x0 = 180
  const pas = Math.min(16, (HAUTEUR - 50) / Math.max(parts.length, 1))
  parts.forEach((p, i) => {
    const y = 52 + i * pas
    ctx.fillStyle = p.couleur
    ctx.fillRect(x0, y - 8, 10, 10)
    ctx.fillStyle = '#1c1c1c'
    const pct = `${(p.part * 100).toLocaleString('fr-FR', { maximumFractionDigits: p.part < 0.1 ? 1 : 0 })} %`
    let nom = acronyme(p.nom)
    const complet = nom
    while (ctx.measureText(`${nom} ${pct}`).width > LARGEUR - x0 - 22 && nom.length > 4) nom = nom.slice(0, -2)
    if (nom !== complet) nom = `${nom.trimEnd()}…`
    ctx.fillText(`${nom} ${pct}`, x0 + 15, y + 1)
  })
  return canvas.toDataURL('image/png')
}

/** The pie alone, on a transparent background, at the family's scale: to
 *  place on a map. `facteur` enlarges every pie alike (the scale holds);
 *  the image is drawn pixel for pixel, its width the diameter plus 2 px. */
export function dessinerPastille(signature: Signature, ordre: string[], totalMax: number, facteur = 1): string | null {
  const r = rayonPour(signature.total, totalMax) * facteur
  const cote = 2 * r + 2
  const t = toile(cote, cote, false, 1)
  if (!t) return null
  tracer(t.ctx, signature, ordre, cote / 2, cote / 2, r)
  return t.canvas.toDataURL('image/png')
}

/** Round values under the largest total, for the scale legend. */
function reperes(totalMax: number): number[] {
  const p = 10 ** Math.floor(Math.log10(totalMax))
  const candidats = [1, 2, 5].flatMap((m) => [m * p, (m * p) / 10]).filter((v) => v < totalMax * 0.95)
  return [totalMax, ...[...new Set(candidats)].sort((a, b) => b - a).filter((v, i, a) => i === 0 || a[i - 1] / v >= 2)].slice(0, 3)
}

/** Scale legend: nested circles for round totals, as on a map legend. */
export function dessinerEchelle(totalMax: number, unite: string, titre: string, facteur = 1): string | null {
  const t = toile(LARGEUR, HAUTEUR, true)
  if (!t) return null
  const { canvas, ctx } = t
  ctx.fillStyle = '#1c1c1c'
  ctx.font = 'bold 12px Verdana, sans-serif'
  ctx.fillText(titre, 10, 18)
  ctx.font = '10px Verdana, sans-serif'
  ctx.fillStyle = '#5a5a5a'
  ctx.fillText('Surface des camemberts proportionnelle au total', 10, 33)
  const base = 210
  const cx = 95
  for (const v of reperes(totalMax)) {
    const r = rayonPour(v, totalMax) * facteur
    ctx.beginPath()
    ctx.arc(cx, base - r, r, 0, 2 * Math.PI)
    ctx.strokeStyle = '#5a5a5a'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx, base - 2 * r)
    ctx.lineTo(cx + RAYON_MAX * facteur + 30, base - 2 * r)
    ctx.setLineDash([2, 2])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#1c1c1c'
    ctx.fillText(`${fr(v)} ${unite}`, cx + RAYON_MAX * facteur + 34, base - 2 * r + 3)
  }
  return canvas.toDataURL('image/png')
}
