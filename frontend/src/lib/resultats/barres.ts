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

export interface LigneComparaison {
  libelle: string
  /** Per series name: value (in the common unit) and whether below the LQ. */
  valeurs: Record<string, { valeur: number; lq: boolean } | null>
  guide: number | null
}

/**
 * One row per parameter, one marker per group (upgradient, on site,
 * downgradient) on a common log axis; a grey line joins the extreme markers
 * so the gap reads at a glance. Hollow marker: below the LQ, drawn at the
 * LQ; black tick: comparison value.
 */
export function dessinerComparaison(
  titre: string,
  series: Serie[],
  lignes: LigneComparaison[],
  unite: string,
): { image: string; largeur: number; hauteur: number } | null {
  const tous = lignes.flatMap((l) => [...Object.values(l.valeurs).flatMap((v) => (v && v.valeur > 0 ? [v.valeur] : [])), ...(l.guide ? [l.guide] : [])])
  if (typeof document === 'undefined' || !tous.length) return null
  const largeur = 760
  const pas = 20
  const haut = 52
  const hauteur = haut + lignes.length * pas + 44
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

  ctx.font = '10px Verdana, sans-serif'
  let x = 10
  for (const s of series) {
    ctx.fillStyle = s.couleur
    ctx.beginPath()
    ctx.arc(x + 5, 33, 4.5, 0, 2 * Math.PI)
    ctx.fill()
    ctx.fillStyle = '#1c1c1c'
    ctx.fillText(s.nom, x + 14, 37)
    x += ctx.measureText(s.nom).width + 32
  }
  ctx.fillRect(x, 28, 1.5, 11)
  ctx.fillText('valeur de comparaison', x + 6, 37)

  const gauche = 190
  const droite = largeur - 20
  const logMin = Math.floor(Math.log10(Math.min(...tous)))
  const logMax = Math.max(logMin + 1, Math.ceil(Math.log10(Math.max(...tous))))
  const px = (v: number) => gauche + ((Math.log10(Math.max(v, 10 ** logMin)) - logMin) / (logMax - logMin)) * (droite - gauche)
  const bas = haut + lignes.length * pas

  ctx.strokeStyle = '#e3e3e3'
  ctx.fillStyle = '#6a6a6a'
  ctx.font = '9px Verdana, sans-serif'
  for (let d = logMin; d <= logMax; d++) {
    const xx = px(10 ** d)
    ctx.beginPath()
    ctx.moveTo(xx, haut - 4)
    ctx.lineTo(xx, bas)
    ctx.stroke()
    const t = 10 ** d >= 1 ? String(10 ** d) : String(Number((10 ** d).toPrecision(1))).replace('.', ',')
    ctx.fillText(t, xx - ctx.measureText(t).width / 2, bas + 13)
  }
  ctx.fillStyle = '#1c1c1c'
  ctx.font = '10px Verdana, sans-serif'
  const tx = `Concentration maximale (${unite}, échelle logarithmique)`
  ctx.fillText(tx, (gauche + droite) / 2 - ctx.measureText(tx).width / 2, bas + 30)

  lignes.forEach((l, i) => {
    const y = haut + i * pas + pas / 2
    if (i % 2) {
      ctx.fillStyle = '#f6f8f8'
      ctx.fillRect(gauche, y - pas / 2, droite - gauche, pas)
    }
    ctx.fillStyle = '#1c1c1c'
    ctx.font = '10px Verdana, sans-serif'
    let lib = l.libelle
    while (ctx.measureText(lib).width > gauche - 16 && lib.length > 4) lib = lib.slice(0, -2)
    if (lib !== l.libelle) lib = `${lib.trimEnd()}…`
    ctx.fillText(lib, 10, y + 4)
    const xs = series.flatMap((s) => (l.valeurs[s.nom] ? [px(l.valeurs[s.nom]!.valeur)] : []))
    if (xs.length > 1) {
      ctx.strokeStyle = '#b0b0b0'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(Math.min(...xs), y)
      ctx.lineTo(Math.max(...xs), y)
      ctx.stroke()
    }
    if (l.guide) {
      ctx.fillStyle = '#1c1c1c'
      ctx.fillRect(px(l.guide) - 0.75, y - 7, 1.5, 14)
    }
    for (const s of series) {
      const v = l.valeurs[s.nom]
      if (!v) continue
      ctx.beginPath()
      ctx.arc(px(v.valeur), y, 4.5, 0, 2 * Math.PI)
      ctx.fillStyle = v.lq ? '#ffffff' : s.couleur
      ctx.fill()
      ctx.strokeStyle = s.couleur
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  })
  ctx.fillStyle = '#6a6a6a'
  ctx.font = '9px Verdana, sans-serif'
  ctx.fillText('● quantifié   ○ inférieur à la LQ (placé à la LQ)', gauche, hauteur - 4)
  return { image: canvas.toDataURL('image/png'), largeur, hauteur }
}
