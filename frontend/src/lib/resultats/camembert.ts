/**
 * Draws a signature pie chart as a PNG, in the browser (canvas). Used both
 * for the Excel "Signatures" sheet — ExcelJS cannot write native charts, so
 * the pies are inserted as images — and for the preview on the page.
 */

import { preparerParts, type Signature } from './signatures.ts'

export const LARGEUR = 380
export const HAUTEUR = 230

export function dessinerCamembert(signature: Signature, ordre: string[], unite: string, titre?: string): string | null {
  if (typeof document === 'undefined') return null
  const echelle = 2
  const canvas = document.createElement('canvas')
  canvas.width = LARGEUR * echelle
  canvas.height = HAUTEUR * echelle
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(echelle, echelle)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR)

  ctx.fillStyle = '#1c1c1c'
  ctx.font = 'bold 12px Verdana, sans-serif'
  ctx.fillText(titre ?? signature.echantillon, 10, 18)
  ctx.font = '10px Verdana, sans-serif'
  ctx.fillStyle = '#5a5a5a'
  const total = Number(signature.total.toPrecision(3)).toLocaleString('fr-FR')
  ctx.fillText(`Total : ${total} ${unite}`, 10, 33)

  const parts = preparerParts(signature.parts, ordre)
  const cx = 90
  const cy = 135
  const r = 72
  let angle = -Math.PI / 2
  for (const p of parts) {
    const fin = angle + p.part * 2 * Math.PI
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, angle, fin)
    ctx.closePath()
    ctx.fillStyle = p.couleur
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
    angle = fin
  }

  // Legend in compound order, long names shortened to fit.
  ctx.font = '10px Verdana, sans-serif'
  const x0 = 180
  const pas = Math.min(16, (HAUTEUR - 50) / Math.max(parts.length, 1))
  parts.forEach((p, i) => {
    const y = 52 + i * pas
    ctx.fillStyle = p.couleur
    ctx.fillRect(x0, y - 8, 10, 10)
    ctx.fillStyle = '#1c1c1c'
    const pct = `${(p.part * 100).toLocaleString('fr-FR', { maximumFractionDigits: p.part < 0.1 ? 1 : 0 })} %`
    let nom = p.nom
    while (ctx.measureText(`${nom} ${pct}`).width > LARGEUR - x0 - 22 && nom.length > 4) nom = nom.slice(0, -2)
    if (nom !== p.nom) nom = `${nom.trimEnd()}…`
    ctx.fillText(`${nom} ${pct}`, x0 + 15, y + 1)
  })
  return canvas.toDataURL('image/png')
}
