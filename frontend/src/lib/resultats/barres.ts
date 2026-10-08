/**
 * Horizontal 100 % stacked bars as a PNG (browser canvas), one bar per
 * sample in the order given — used for the molar composition along a
 * dechlorination chain, PAH ring classes and hydrocarbon carbon ranges.
 */

export interface Serie {
  nom: string
  couleur: string
}

export interface Barre {
  libelle: string
  /** Shares per series name, summing to 1 (or less). */
  parts: Record<string, number>
}

export function dessinerBarres(titre: string, series: Serie[], barres: Barre[]): { image: string; largeur: number; hauteur: number } | null {
  if (typeof document === 'undefined' || !barres.length) return null
  const largeur = 760
  const hauteurBarre = 16
  const pas = 22
  const haut = 52
  const legende = 26
  const hauteur = haut + barres.length * pas + legende + 10
  const echelle = 2
  const canvas = document.createElement('canvas')
  canvas.width = largeur * echelle
  canvas.height = hauteur * echelle
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(echelle, echelle)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, largeur, hauteur)
  ctx.fillStyle = '#1c1c1c'
  ctx.font = 'bold 12px Verdana, sans-serif'
  ctx.fillText(titre, 10, 18)

  // Legend on top, so it stays visible whatever the number of bars.
  ctx.font = '10px Verdana, sans-serif'
  let x = 10
  for (const s of series) {
    ctx.fillStyle = s.couleur
    ctx.fillRect(x, 28, 10, 10)
    ctx.fillStyle = '#1c1c1c'
    ctx.fillText(s.nom, x + 14, 37)
    x += ctx.measureText(s.nom).width + 30
  }

  const gauche = 150
  const droite = largeur - 20
  const w = droite - gauche
  // Axis ticks at 0, 25, 50, 75, 100 %.
  ctx.strokeStyle = '#d0d0d0'
  ctx.fillStyle = '#7a7a7a'
  ctx.font = '9px Verdana, sans-serif'
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const xt = gauche + t * w
    ctx.beginPath()
    ctx.moveTo(xt, haut - 4)
    ctx.lineTo(xt, haut + barres.length * pas)
    ctx.stroke()
    ctx.fillText(`${t * 100} %`, xt - 10, haut + barres.length * pas + 14)
  }

  barres.forEach((b, i) => {
    const y = haut + i * pas
    ctx.fillStyle = '#1c1c1c'
    ctx.font = '10px Verdana, sans-serif'
    let lib = b.libelle
    while (ctx.measureText(lib).width > gauche - 16 && lib.length > 4) lib = lib.slice(0, -2)
    if (lib !== b.libelle) lib = `${lib.trimEnd()}…`
    ctx.fillText(lib, 10, y + 12)
    let xb = gauche
    for (const s of series) {
      const part = b.parts[s.nom] ?? 0
      if (part <= 0) continue
      ctx.fillStyle = s.couleur
      ctx.fillRect(xb, y, part * w, hauteurBarre)
      xb += part * w
    }
  })
  return { image: canvas.toDataURL('image/png'), largeur, hauteur }
}
