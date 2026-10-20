/**
 * Grouped bars as a PNG (browser canvas): one group per well, one bar per
 * campaign in chronological order — the evolution of a compound, or of a
 * family sum, from one campaign to the next. Results below the LQ are drawn
 * as an empty bar up to the LQ; the comparison value as a dashed line. A
 * logarithmic scale is used when the values span more than two orders of
 * magnitude.
 */

export interface SerieEvolution {
  nom: string
  couleur: string
}

export type Point = { valeur: number; inferieur: boolean } | null

const fr = (x: number) => {
  const v = Number(x.toPrecision(3))
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
}

export function dessinerEvolution(
  titre: string,
  unite: string,
  ouvrages: string[],
  series: SerieEvolution[],
  /** valeurs[série][ouvrage] */
  valeurs: Point[][],
  guide: number | null,
): { image: string; largeur: number; hauteur: number } | null {
  const positifs = valeurs.flat().flatMap((p) => (p && p.valeur > 0 ? [p.valeur] : []))
  if (typeof document === 'undefined' || !positifs.length || !ouvrages.length) return null
  const largeur = 760
  const inclines = ouvrages.length > 10 || ouvrages.some((o) => o.length > 9)
  const bas = inclines ? 78 : 40
  const haut = 58
  const hauteurTrace = 210
  const hauteur = haut + hauteurTrace + bas
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

  // Legend on top.
  ctx.font = '10px Verdana, sans-serif'
  let x = 10
  for (const s of series) {
    ctx.fillStyle = s.couleur
    ctx.fillRect(x, 28, 10, 10)
    ctx.fillStyle = '#1c1c1c'
    ctx.fillText(s.nom, x + 14, 37)
    x += ctx.measureText(s.nom).width + 28
  }
  if (guide !== null) {
    ctx.strokeStyle = '#C0392B'
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(x, 33)
    ctx.lineTo(x + 18, 33)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#1c1c1c'
    ctx.fillText(`Valeur de comparaison (${fr(guide)})`, x + 22, 37)
  }

  const gauche = 64
  const droite = largeur - 14
  const y0 = haut + hauteurTrace
  const tous = guide ? [...positifs, guide] : positifs
  const vmax = Math.max(...tous)
  const vmin = Math.min(...tous)
  const log = vmax / vmin > 100
  const lmin = Math.floor(Math.log10(vmin))
  const lmax = Math.ceil(Math.log10(vmax))
  const ymax = log ? 0 : (() => {
    const p = 10 ** Math.floor(Math.log10(vmax))
    return Math.ceil((vmax * 1.08) / p) * p
  })()
  const y = (v: number) =>
    log ? y0 - ((Math.log10(Math.max(v, 10 ** lmin)) - lmin) / Math.max(1, lmax - lmin)) * hauteurTrace : y0 - (v / ymax) * hauteurTrace

  // Grid and axis values.
  ctx.font = '9px Verdana, sans-serif'
  ctx.strokeStyle = '#e3e3e3'
  ctx.fillStyle = '#7a7a7a'
  const graduations = log ? Array.from({ length: lmax - lmin + 1 }, (_, i) => 10 ** (lmin + i)) : [0, 0.25, 0.5, 0.75, 1].map((t) => t * ymax)
  for (const g of graduations) {
    const yg = y(g)
    ctx.beginPath()
    ctx.moveTo(gauche, yg)
    ctx.lineTo(droite, yg)
    ctx.stroke()
    const t = fr(g)
    ctx.fillText(t, gauche - 6 - ctx.measureText(t).width, yg + 3)
  }
  ctx.save()
  ctx.translate(14, haut + hauteurTrace / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = '#4a4a4a'
  const u = log ? `${unite} (échelle log.)` : unite
  ctx.fillText(u, -ctx.measureText(u).width / 2, 0)
  ctx.restore()

  // Bars.
  const groupe = (droite - gauche) / ouvrages.length
  const barre = Math.min(26, (groupe * 0.8) / series.length)
  ouvrages.forEach((o, j) => {
    const cx = gauche + groupe * (j + 0.5)
    const debut = cx - (barre * series.length) / 2
    series.forEach((s, k) => {
      const p = valeurs[k]?.[j]
      if (!p) return
      const xb = debut + k * barre
      const yb = y(p.valeur)
      if (p.inferieur) {
        ctx.strokeStyle = s.couleur
        ctx.setLineDash([2, 2])
        ctx.strokeRect(xb + 1, yb, barre - 2, y0 - yb)
        ctx.setLineDash([])
        ctx.fillStyle = '#9a9a9a'
        ctx.font = '8px Verdana, sans-serif'
        ctx.fillText('<LQ', xb + barre / 2 - ctx.measureText('<LQ').width / 2, yb - 3)
      } else {
        ctx.fillStyle = s.couleur
        ctx.fillRect(xb + 1, yb, barre - 2, y0 - yb)
      }
    })
    // Well name.
    ctx.fillStyle = '#1c1c1c'
    ctx.font = '9px Verdana, sans-serif'
    if (inclines) {
      ctx.save()
      ctx.translate(cx, y0 + 10)
      ctx.rotate(-Math.PI / 4)
      ctx.fillText(o, -ctx.measureText(o).width, 3)
      ctx.restore()
    } else ctx.fillText(o, cx - ctx.measureText(o).width / 2, y0 + 16)
  })
  ctx.strokeStyle = '#7a7a7a'
  ctx.beginPath()
  ctx.moveTo(gauche, y0)
  ctx.lineTo(droite, y0)
  ctx.stroke()
  if (guide !== null && guide > 0) {
    ctx.strokeStyle = '#C0392B'
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(gauche, y(guide))
    ctx.lineTo(droite, y(guide))
    ctx.stroke()
    ctx.setLineDash([])
  }
  return { image: canvas.toDataURL('image/png'), largeur, hauteur }
}

/** Colours of the campaigns: blues for high water, oranges for low water,
 *  greens when the regime is not given — darker for the later ones. */
export function couleursCampagnes(regimes: ('HE' | 'BE' | null)[]): string[] {
  const teintes = { HE: ['#9DC3E6', '#2E75B6', '#1F4E79'], BE: ['#F5C66B', '#E69F00', '#A35F00'], aucun: ['#9BD3C2', '#00A37E', '#00756A'] }
  const vus = { HE: 0, BE: 0, aucun: 0 }
  const totaux = { HE: 0, BE: 0, aucun: 0 }
  for (const r of regimes) totaux[r ?? 'aucun']++
  return regimes.map((r) => {
    const k = r ?? 'aucun'
    const n = totaux[k]
    const i = vus[k]++
    // One campaign of a kind: the middle tone; several: light to dark.
    return teintes[k][n === 1 ? 1 : Math.min(2, Math.round((i * 2) / Math.max(1, n - 1)))]
  })
}
