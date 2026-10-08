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

export interface SerieProfil {
  nom: string
  couleur: string
  /** Depth interval (top, bottom) and value; `lq` when below the LQ. */
  points: { haut: number; bas: number; valeur: number; lq: boolean }[]
}

/**
 * Vertical profile: depth downwards, concentration on a log scale (results
 * span orders of magnitude). A filled marker is a quantified result, a
 * hollow one a result below the LQ drawn at the LQ; the bar through each
 * marker shows the sampled interval. An optional dashed line marks the
 * comparison value.
 */
export function dessinerProfil(
  titre: string,
  series: SerieProfil[],
  unite: string,
  guide?: { valeur: number; libelle: string } | null,
): { image: string; largeur: number; hauteur: number } | null {
  const tous = series.flatMap((s) => s.points)
  if (typeof document === 'undefined' || !tous.length) return null
  const largeur = 560
  const hauteur = 460
  const echelle = 2
  const canvas = document.createElement('canvas')
  canvas.width = largeur * echelle
  canvas.height = hauteur * echelle
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(echelle, echelle)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, largeur, hauteur)

  const g = { gauche: 64, droite: largeur - 24, haut: 70, bas: hauteur - 46 }
  const valeurs = tous.map((p) => p.valeur).filter((v) => v > 0)
  if (guide) valeurs.push(guide.valeur)
  const logMin = Math.floor(Math.log10(Math.min(...valeurs)))
  const logMax = Math.max(logMin + 1, Math.ceil(Math.log10(Math.max(...valeurs))))
  const zMax = Math.max(...tous.map((p) => p.bas)) * 1.05 || 1
  const x = (v: number) => g.gauche + ((Math.log10(Math.max(v, 10 ** logMin)) - logMin) / (logMax - logMin)) * (g.droite - g.gauche)
  const y = (zz: number) => g.haut + (zz / zMax) * (g.bas - g.haut)

  ctx.fillStyle = '#1c1c1c'
  ctx.font = 'bold 12px Verdana, sans-serif'
  ctx.fillText(titre, 10, 18)

  // Legend.
  ctx.font = '10px Verdana, sans-serif'
  let lx = 10
  let ly = 36
  for (const s of series) {
    const w = ctx.measureText(s.nom).width + 34
    if (lx + w > largeur - 10) {
      lx = 10
      ly += 14
    }
    ctx.fillStyle = s.couleur
    ctx.beginPath()
    ctx.arc(lx + 5, ly - 3, 4, 0, 2 * Math.PI)
    ctx.fill()
    ctx.fillStyle = '#1c1c1c'
    ctx.fillText(s.nom, lx + 13, ly + 1)
    lx += w
  }

  // Grid: decades on x, metres on y.
  ctx.strokeStyle = '#e3e3e3'
  ctx.fillStyle = '#6a6a6a'
  ctx.font = '9px Verdana, sans-serif'
  for (let d = logMin; d <= logMax; d++) {
    const xx = x(10 ** d)
    ctx.beginPath()
    ctx.moveTo(xx, g.haut)
    ctx.lineTo(xx, g.bas)
    ctx.stroke()
    const t = 10 ** d >= 1 ? String(10 ** d) : String(Number((10 ** d).toPrecision(1))).replace('.', ',')
    ctx.fillText(t, xx - ctx.measureText(t).width / 2, g.bas + 13)
  }
  const pasZ = zMax > 20 ? 5 : zMax > 8 ? 2 : zMax > 3 ? 1 : 0.5
  for (let zz = 0; zz <= zMax; zz += pasZ) {
    const yy = y(zz)
    ctx.beginPath()
    ctx.moveTo(g.gauche, yy)
    ctx.lineTo(g.droite, yy)
    ctx.stroke()
    const t = String(zz).replace('.', ',')
    ctx.fillText(t, g.gauche - 8 - ctx.measureText(t).width, yy + 3)
  }
  ctx.strokeStyle = '#9a9a9a'
  ctx.strokeRect(g.gauche, g.haut, g.droite - g.gauche, g.bas - g.haut)
  ctx.fillStyle = '#1c1c1c'
  ctx.font = '10px Verdana, sans-serif'
  const tx = `Concentration (${unite}, échelle logarithmique)`
  ctx.fillText(tx, (g.gauche + g.droite) / 2 - ctx.measureText(tx).width / 2, g.bas + 30)
  ctx.save()
  ctx.translate(16, (g.haut + g.bas) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('Profondeur (m)', -36, 0)
  ctx.restore()

  if (guide) {
    const xg = x(guide.valeur)
    ctx.strokeStyle = '#C0392B'
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(xg, g.haut)
    ctx.lineTo(xg, g.bas)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineWidth = 1
    ctx.fillStyle = '#C0392B'
    ctx.font = '9px Verdana, sans-serif'
    const t = guide.libelle
    ctx.fillText(t, Math.min(xg + 4, g.droite - ctx.measureText(t).width - 2), g.haut + 11)
  }

  for (const s of series) {
    const pts = [...s.points].sort((a, b) => a.haut + a.bas - (b.haut + b.bas))
    // Line through all points, quantified or not, for the shape of the profile.
    ctx.strokeStyle = s.couleur
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1.5
    ctx.beginPath()
    pts.forEach((p, i) => {
      const xx = x(p.valeur)
      const yy = y((p.haut + p.bas) / 2)
      if (i) ctx.lineTo(xx, yy)
      else ctx.moveTo(xx, yy)
    })
    ctx.stroke()
    ctx.globalAlpha = 1
    for (const p of pts) {
      const xx = x(p.valeur)
      ctx.strokeStyle = s.couleur
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(xx, y(p.haut))
      ctx.lineTo(xx, y(p.bas))
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(xx, y((p.haut + p.bas) / 2), 4, 0, 2 * Math.PI)
      ctx.fillStyle = p.lq ? '#ffffff' : s.couleur
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
  ctx.fillStyle = '#6a6a6a'
  ctx.font = '9px Verdana, sans-serif'
  ctx.fillText('● quantifié   ○ inférieur à la LQ (placé à la LQ)   | intervalle prélevé', g.gauche, hauteur - 4)
  return { image: canvas.toDataURL('image/png'), largeur, hauteur }
}
