/**
 * Charts of the monitoring history as SVG text — the same drawing on the
 * page (with clickable points laid over it) and in the exports (PNG in the
 * workbook, PNG and SVG in the archive), so that what is seen is what goes
 * into the report.
 *
 * - chronique: results against time, one or several series (wells of a
 *   compound, or compounds of a well), logarithmic scale when the values
 *   span more than two orders of magnitude; results below the LQ as open
 *   symbols at the LQ; reference value and its 75 % share; Theil-Sen line
 *   and LOWESS smoothing; water level on a second axis; analysis window.
 * - sparkline: the small line of a matrix cell or a well card.
 * - degradation: molar shares of the chloroethenes, campaign by campaign,
 *   with the mean number of chlorine atoms.
 * - plan: wells at their coordinates, coloured by trend.
 * - barres: a plain bar chart (indicators per campaign).
 *
 * Pure (string building); `svgEnPng` needs a browser.
 */

import { CLASSES, type Classe } from './analyse.ts'
import { dateDepuisAnnee } from './stats.ts'

const POLICE = 'Verdana, Arial, Helvetica, sans-serif'
const ENCRE = '#1c1c1c'
const GRIS = '#6b7480'
const GRILLE = '#e3e6e8'
const ROUGE = '#c0392b'
const ORANGE = '#e08e0b'

/** Distinct colours for several series (colour-blind friendly order first). */
export const PALETTE = ['#2f5f9e', '#c0392b', '#1f8a5c', '#e08e0b', '#6b4c9a', '#00a3b4', '#b0306a', '#7a6a1f', '#4a5a6b', '#e15f41', '#2e86de', '#8e44ad']

export const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmt = (x: number) => {
  if (x === 0) return '0'
  const a = Math.abs(x)
  const v = a >= 1000 ? Math.round(x) : Number(x.toPrecision(3))
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
}

const n1 = (x: number) => Math.round(x * 10) / 10

// ---- Scales -------------------------------------------------------------------------------------

interface Echelle {
  min: number
  max: number
  log: boolean
  vers: (v: number) => number
  graduations: { v: number; principale: boolean }[]
}

function echelleY(valeurs: number[], log: boolean, haut: number, bas: number): Echelle {
  const positives = valeurs.filter((v) => v > 0)
  if (log && positives.length) {
    const lmin = Math.floor(Math.log10(Math.min(...positives)) + 1e-9)
    let lmax = Math.ceil(Math.log10(Math.max(...positives)) - 1e-9)
    if (lmax <= lmin) lmax = lmin + 1
    const min = 10 ** lmin
    const max = 10 ** lmax
    const graduations: Echelle['graduations'] = []
    for (let e = lmin; e <= lmax; e++) {
      graduations.push({ v: 10 ** e, principale: true })
      if (e < lmax && lmax - lmin <= 4) for (const m of [2, 5]) graduations.push({ v: m * 10 ** e, principale: false })
    }
    return { min, max, log: true, vers: (v) => bas - ((Math.log10(Math.max(v, min / 10)) - lmin) / (lmax - lmin)) * (bas - haut), graduations }
  }
  const vmax = Math.max(0, ...valeurs)
  const vmin = Math.min(0, ...valeurs)
  const etendue = vmax - vmin || Math.abs(vmax) || 1
  const pasBrut = etendue / 5
  const p10 = 10 ** Math.floor(Math.log10(pasBrut))
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p10).find((p) => p >= pasBrut) ?? 10 * p10
  const min = Math.floor(vmin / pas) * pas
  const max = Math.ceil((vmax * 1.05) / pas) * pas || pas
  const graduations: Echelle['graduations'] = []
  for (let v = min; v <= max + pas / 2; v += pas) graduations.push({ v: Number(v.toPrecision(12)), principale: true })
  return { min, max, log: false, vers: (v) => bas - ((v - min) / (max - min)) * (bas - haut), graduations }
}

/** Linear scale for a second axis (water level), tight around the values. */
function echelleLibre(valeurs: number[], haut: number, bas: number): Echelle {
  let vmin = Math.min(...valeurs)
  let vmax = Math.max(...valeurs)
  if (vmax - vmin < 1e-9) {
    vmin -= 0.5
    vmax += 0.5
  }
  const pasBrut = (vmax - vmin) / 4
  const p10 = 10 ** Math.floor(Math.log10(pasBrut))
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p10).find((p) => p >= pasBrut) ?? 10 * p10
  const min = Math.floor(vmin / pas) * pas
  const max = Math.ceil(vmax / pas) * pas
  const graduations: Echelle['graduations'] = []
  for (let v = min; v <= max + pas / 2; v += pas) graduations.push({ v: Number(v.toPrecision(12)), principale: true })
  return { min, max, log: false, vers: (v) => bas - ((v - min) / (max - min || 1)) * (bas - haut), graduations }
}

function graduationsTemps(t0: number, t1: number): { t: number; libelle: string | null }[] {
  const out: { t: number; libelle: string | null }[] = []
  const duree = t1 - t0
  const pasAnnees = duree > 24 ? 5 : duree > 12 ? 2 : 1
  for (let a = Math.ceil(t0 - 1e-9); a <= t1 + 1e-9; a++) {
    out.push({ t: a, libelle: a % pasAnnees === 0 ? String(a) : null })
  }
  if (duree <= 3) {
    // Quarters as minor ticks with month labels on short histories.
    for (let a = Math.floor(t0); a <= t1; a++) {
      for (const [q, mois] of [
        [0.25, 'avr.'],
        [0.5, 'juil.'],
        [0.75, 'oct.'],
      ] as const) {
        const t = a + q
        if (t > t0 && t < t1) out.push({ t, libelle: duree <= 1.5 ? mois : null })
      }
    }
  }
  return out
}

// ---- Time series ---------------------------------------------------------------------------------

export interface PointGraphique {
  t: number
  valeur: number
  inferieur: boolean
  exclu?: boolean
  atypique?: boolean
  regime?: 'HE' | 'BE' | null
  /** Shown in the tooltip. */
  libelle?: string
  /** Handed back on click. */
  id?: string
}

export interface SerieGraphique {
  nom: string
  couleur: string
  points: PointGraphique[]
  /** Theil-Sen line x = ordonnee + pente × t, drawn from t0 to t1. */
  sen?: { pente: number; ordonnee: number; t0: number; t1: number } | null
  lissage?: { t: number; v: number }[] | null
  classe?: Classe
}

export interface OptionsChronique {
  titre?: string
  sousTitre?: string
  unite: string
  largeur?: number
  hauteur?: number
  series: SerieGraphique[]
  reference?: { valeur: number; libelle: string } | null
  /** Share of the reference drawn as a second line (0.75). */
  vigilance?: number | null
  log?: boolean | 'auto'
  /** Analysis window: what lies outside is shaded. */
  fenetre?: [number, number] | null
  afficherSen?: boolean
  afficherLissage?: boolean
  /** Water level on a second axis. */
  niveaux?: { libelle: string; series: { nom: string; couleur: string; points: { t: number; v: number }[] }[] } | null
  ruptures?: { t: number; libelle: string }[]
  tMin?: number
  tMax?: number
  legende?: boolean
  /** Linear axis fitted to the values, without zero (water levels). */
  axeLibre?: boolean
}

export interface Cible {
  x: number
  y: number
  serie: number
  point: number
  id?: string
  texte: string
}

export interface Rendu {
  svg: string
  largeur: number
  hauteur: number
  cibles: Cible[]
}

const dateFr = (t: number) => {
  const iso = dateDepuisAnnee(t)
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** Mark of a result: filled when quantified, open below the LQ; diamond for low water. */
function symbole(x: number, y: number, couleur: string, p: PointGraphique, r = 3.6): string {
  const remplissage = p.exclu ? '#ffffff' : p.inferieur ? '#ffffff' : couleur
  const trait = p.exclu ? '#9aa1a8' : couleur
  let s: string
  if (p.regime === 'BE') {
    const d = r * 1.3
    s = `<path d="M${n1(x)} ${n1(y - d)}L${n1(x + d)} ${n1(y)}L${n1(x)} ${n1(y + d)}L${n1(x - d)} ${n1(y)}Z" fill="${remplissage}" stroke="${trait}" stroke-width="1.4"/>`
  } else s = `<circle cx="${n1(x)}" cy="${n1(y)}" r="${r}" fill="${remplissage}" stroke="${trait}" stroke-width="1.4"/>`
  if (p.exclu) s += `<path d="M${n1(x - 4)} ${n1(y - 4)}L${n1(x + 4)} ${n1(y + 4)}M${n1(x + 4)} ${n1(y - 4)}L${n1(x - 4)} ${n1(y + 4)}" stroke="#9aa1a8" stroke-width="1.3"/>`
  if (p.atypique && !p.exclu) s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${r + 3.5}" fill="none" stroke="${ROUGE}" stroke-width="1.2" stroke-dasharray="2 1.5"/>`
  return s
}

export function chronique(o: OptionsChronique): Rendu {
  const L = o.largeur ?? 820
  const H = o.hauteur ?? 380
  const tous = o.series.flatMap((s) => s.points)
  const avecNiveaux = !!o.niveaux && o.niveaux.series.some((s) => s.points.length)
  const legendeLignes = o.legende === false ? 0 : Math.ceil((o.series.length + 2 + (avecNiveaux ? o.niveaux!.series.length : 0)) / 5)
  const gauche = 66
  const droite = avecNiveaux ? 62 : 22
  const haut = o.titre ? (o.sousTitre ? 52 : 38) : 14
  const bas = H - 40 - legendeLignes * 17
  const x0 = gauche
  const x1 = L - droite

  const ts = [...tous.map((p) => p.t), ...(avecNiveaux ? o.niveaux!.series.flatMap((s) => s.points.map((p) => p.t)) : [])]
  let tMin = o.tMin ?? (ts.length ? Math.min(...ts) : 2020)
  let tMax = o.tMax ?? (ts.length ? Math.max(...ts) : 2021)
  if (tMax - tMin < 0.5) {
    tMin -= 0.25
    tMax += 0.25
  }
  const marge = (tMax - tMin) * 0.04
  tMin -= marge
  tMax += marge
  const X = (t: number) => x0 + ((t - tMin) / (tMax - tMin)) * (x1 - x0)

  const valeurs = tous.filter((p) => !p.exclu).map((p) => p.valeur)
  const ref = o.reference?.valeur ?? null
  const max = Math.max(0, ...valeurs)
  const refDansEchelle = ref !== null && ref > 0 && (max === 0 || ref <= max * 4)
  const positives = valeurs.filter((v) => v > 0)
  const etendue = [...positives, ...(ref !== null && ref > 0 ? [ref] : [])]
  const log =
    o.log === true
      ? positives.length > 0
      : o.log === false || o.axeLibre
        ? false
        : positives.length > 1 && positives.length === valeurs.length && Math.max(...etendue) / Math.min(...etendue) > 30
  const pourEchelle = [...valeurs, ...(refDansEchelle ? [ref!] : [])]
  if (!pourEchelle.length) pourEchelle.push(1)
  const ey = o.axeLibre ? echelleLibre(pourEchelle, haut, bas) : echelleY(pourEchelle, log, haut, bas)
  const Y = ey.vers

  const parties: string[] = []
  parties.push(`<rect x="0" y="0" width="${L}" height="${H}" fill="#ffffff"/>`)
  if (o.titre) parties.push(`<text x="${gauche - 56}" y="20" font-size="13" font-weight="bold" fill="${ENCRE}">${echapper(o.titre)}</text>`)
  if (o.sousTitre) parties.push(`<text x="${gauche - 56}" y="37" font-size="10.5" fill="${GRIS}">${echapper(o.sousTitre)}</text>`)

  // Window shading.
  if (o.fenetre) {
    const [a, b] = o.fenetre
    if (a > tMin) parties.push(`<rect x="${n1(x0)}" y="${haut}" width="${n1(Math.max(0, X(a) - x0))}" height="${n1(bas - haut)}" fill="#f1f3f4"/>`)
    if (b < tMax) parties.push(`<rect x="${n1(X(b))}" y="${haut}" width="${n1(Math.max(0, x1 - X(b)))}" height="${n1(bas - haut)}" fill="#f1f3f4"/>`)
    if (a > tMin + (tMax - tMin) * 0.08) parties.push(`<text x="${n1(x0 + 4)}" y="${haut + 11}" font-size="9" fill="#9aa1a8">hors période analysée</text>`)
  }

  // Grid and axes.
  for (const g of ey.graduations) {
    const y = Y(g.v)
    if (y < haut - 0.5 || y > bas + 0.5) continue
    parties.push(`<line x1="${x0}" x2="${x1}" y1="${n1(y)}" y2="${n1(y)}" stroke="${GRILLE}" stroke-width="${g.principale ? 1 : 0.6}"${g.principale ? '' : ' stroke-dasharray="2 3"'}/>`)
    if (g.principale || ey.graduations.length < 12)
      parties.push(`<text x="${x0 - 6}" y="${n1(y + 3.5)}" font-size="10" fill="${GRIS}" text-anchor="end">${fmt(g.v)}</text>`)
  }
  const gt = graduationsTemps(tMin, tMax)
  for (const g of gt) {
    const x = X(g.t)
    if (x < x0 - 0.5 || x > x1 + 0.5) continue
    parties.push(`<line x1="${n1(x)}" x2="${n1(x)}" y1="${haut}" y2="${bas}" stroke="${GRILLE}" stroke-width="${Number.isInteger(g.t) ? 1 : 0.5}"${Number.isInteger(g.t) ? '' : ' stroke-dasharray="2 3"'}/>`)
    if (g.libelle) parties.push(`<text x="${n1(x)}" y="${bas + 15}" font-size="10" fill="${GRIS}" text-anchor="middle">${g.libelle}</text>`)
  }
  parties.push(`<line x1="${x0}" x2="${x1}" y1="${bas}" y2="${bas}" stroke="#9aa1a8"/>`)
  parties.push(`<line x1="${x0}" x2="${x0}" y1="${haut}" y2="${bas}" stroke="#9aa1a8"/>`)
  parties.push(
    `<text transform="translate(${gauche - 50} ${n1((haut + bas) / 2)}) rotate(-90)" font-size="10.5" fill="${ENCRE}" text-anchor="middle">${echapper(o.unite)}${log ? ' (échelle log.)' : ''}</text>`,
  )

  // Water level (second axis).
  if (avecNiveaux) {
    const vs = o.niveaux!.series.flatMap((s) => s.points.map((p) => p.v))
    const en = echelleLibre(vs, haut + 6, bas - 6)
    for (const g of en.graduations) {
      const y = en.vers(g.v)
      if (y < haut - 0.5 || y > bas + 0.5) continue
      parties.push(`<text x="${x1 + 6}" y="${n1(y + 3.5)}" font-size="9.5" fill="#5f7d95">${fmt(g.v)}</text>`)
    }
    parties.push(`<line x1="${x1}" x2="${x1}" y1="${haut}" y2="${bas}" stroke="#9aa1a8"/>`)
    parties.push(
      `<text transform="translate(${L - 10} ${n1((haut + bas) / 2)}) rotate(90)" font-size="10" fill="#5f7d95" text-anchor="middle">${echapper(o.niveaux!.libelle)}</text>`,
    )
    for (const s of o.niveaux!.series) {
      if (!s.points.length) continue
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${n1(X(p.t))} ${n1(en.vers(p.v))}`).join('')
      parties.push(`<path d="${d}" fill="none" stroke="${s.couleur}" stroke-width="1.2" stroke-dasharray="4 2" opacity="0.85"/>`)
      for (const p of s.points) parties.push(`<rect x="${n1(X(p.t) - 2)}" y="${n1(en.vers(p.v) - 2)}" width="4" height="4" fill="${s.couleur}" opacity="0.85"/>`)
    }
  }

  // Reference value and its share.
  if (ref !== null && ref > 0) {
    if (refDansEchelle && Y(ref) >= haut - 0.5) {
      const y = Y(ref)
      parties.push(`<line x1="${x0}" x2="${x1}" y1="${n1(y)}" y2="${n1(y)}" stroke="${ROUGE}" stroke-width="1.5" stroke-dasharray="7 4"/>`)
      parties.push(`<text x="${x1 - 4}" y="${n1(y - 4)}" font-size="9.5" fill="${ROUGE}" text-anchor="end">${echapper(o.reference!.libelle)}</text>`)
      const v = o.vigilance
      if (v && ref * v >= ey.min && Y(ref * v) <= bas) {
        const yv = Y(ref * v)
        parties.push(`<line x1="${x0}" x2="${x1}" y1="${n1(yv)}" y2="${n1(yv)}" stroke="${ORANGE}" stroke-width="1" stroke-dasharray="2 3"/>`)
        parties.push(`<text x="${x1 - 4}" y="${n1(yv + 11)}" font-size="9" fill="${ORANGE}" text-anchor="end">${Math.round(v * 100)} % de la valeur de référence</text>`)
      }
    } else if (ref > ey.max) {
      parties.push(`<text x="${x1 - 4}" y="${haut + 11}" font-size="9.5" fill="${ROUGE}" text-anchor="end">↑ ${echapper(o.reference!.libelle)} (hors échelle)</text>`)
    }
  }

  // Change points.
  for (const r of o.ruptures ?? []) {
    const x = X(r.t)
    parties.push(`<line x1="${n1(x)}" x2="${n1(x)}" y1="${haut}" y2="${bas}" stroke="#6b4c9a" stroke-width="1.2" stroke-dasharray="5 3"/>`)
    parties.push(`<text x="${n1(x + 3)}" y="${haut + 22}" font-size="9" fill="#6b4c9a">${echapper(r.libelle)}</text>`)
  }

  // Series: smoothing, Sen line, connecting line, marks.
  const cibles: Cible[] = []
  o.series.forEach((s, si) => {
    if (o.afficherLissage && s.lissage && s.lissage.length > 2) {
      const d = s.lissage.filter((p) => !log || p.v > 0).map((p, i) => `${i ? 'L' : 'M'}${n1(X(p.t))} ${n1(Math.max(haut, Math.min(bas, Y(p.v))))}`).join('')
      parties.push(`<path d="${d}" fill="none" stroke="${s.couleur}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.18"/>`)
    }
    if (o.afficherSen && s.sen) {
      const pts: string[] = []
      const k = 40
      for (let i = 0; i <= k; i++) {
        const t = s.sen.t0 + ((s.sen.t1 - s.sen.t0) * i) / k
        const v = s.sen.ordonnee + s.sen.pente * t
        if (log && v <= 0) continue
        const y = Y(v)
        if (y < haut - 1 || y > bas + 1) continue
        pts.push(`${pts.length ? 'L' : 'M'}${n1(X(t))} ${n1(y)}`)
      }
      if (pts.length > 1) parties.push(`<path d="${pts.join('')}" fill="none" stroke="${s.couleur}" stroke-width="1.6" stroke-dasharray="9 3 2 3" opacity="0.95"/>`)
    }
    const visibles = s.points.filter((p) => !p.exclu)
    for (let i = 1; i < visibles.length; i++) {
      const a = visibles[i - 1]
      const b = visibles[i]
      const tirets = a.inferieur || b.inferieur ? ' stroke-dasharray="3 3"' : ''
      parties.push(`<line x1="${n1(X(a.t))}" y1="${n1(Y(a.valeur))}" x2="${n1(X(b.t))}" y2="${n1(Y(b.valeur))}" stroke="${s.couleur}" stroke-width="1.4" opacity="0.8"${tirets}/>`)
    }
    s.points.forEach((p, pi) => {
      const x = X(p.t)
      const y = Y(p.valeur)
      parties.push(symbole(x, y, s.couleur, p))
      cibles.push({
        x,
        y,
        serie: si,
        point: pi,
        id: p.id,
        texte: `${s.nom} — ${dateFr(p.t)}${p.regime ? ` (${p.regime})` : ''} : ${p.libelle ?? `${p.inferieur ? '<' : ''}${fmt(p.valeur)}`} ${o.unite}${p.exclu ? ' — écarté' : p.atypique ? ' — atypique' : ''}`,
      })
    })
  })

  // Legend.
  if (o.legende !== false) {
    const items: string[] = []
    const ly0 = H - 14 - (legendeLignes - 1) * 17
    let lx = gauche - 50
    let ly = ly0
    const place = (largeur: number) => {
      if (lx + largeur > L - 10) {
        lx = gauche - 50
        ly += 17
      }
      const x = lx
      lx += largeur
      return x
    }
    for (const s of o.series) {
      const lib = s.classe ? `${s.nom} ${CLASSES[s.classe].symbole}` : s.nom
      const w = 26 + lib.length * 6.2
      const x = place(w)
      items.push(`<line x1="${x}" x2="${x + 16}" y1="${ly - 3.5}" y2="${ly - 3.5}" stroke="${s.couleur}" stroke-width="1.6"/><circle cx="${x + 8}" cy="${ly - 3.5}" r="3.4" fill="${s.couleur}"/>`)
      items.push(`<text x="${x + 21}" y="${ly}" font-size="10" fill="${ENCRE}">${echapper(lib)}</text>`)
    }
    if (avecNiveaux) {
      for (const s of o.niveaux!.series) {
        const lib = s.nom
        const x = place(26 + lib.length * 6.2)
        items.push(`<line x1="${x}" x2="${x + 16}" y1="${ly - 3.5}" y2="${ly - 3.5}" stroke="${s.couleur}" stroke-width="1.2" stroke-dasharray="4 2"/>`)
        items.push(`<text x="${x + 21}" y="${ly}" font-size="10" fill="#5f7d95">${echapper(lib)}</text>`)
      }
    }
    {
      const lib = 'symbole vide : < LQ (placé à la LQ)'
      const x = place(26 + lib.length * 5.6)
      items.push(`<circle cx="${x + 8}" cy="${ly - 3.5}" r="3.4" fill="#fff" stroke="${GRIS}" stroke-width="1.3"/><text x="${x + 21}" y="${ly}" font-size="9.5" fill="${GRIS}">${echapper(lib)}</text>`)
    }
    if (tous.some((p) => p.regime === 'BE')) {
      const lib = '● hautes eaux  ◆ basses eaux'
      const x = place(20 + lib.length * 5.6)
      items.push(`<text x="${x}" y="${ly}" font-size="9.5" fill="${GRIS}">${echapper(lib)}</text>`)
    }
    if (o.afficherSen && o.series.some((s) => s.sen)) {
      const lib = 'pente de Sen'
      const x = place(26 + lib.length * 5.8)
      items.push(`<line x1="${x}" x2="${x + 18}" y1="${ly - 3.5}" y2="${ly - 3.5}" stroke="${GRIS}" stroke-width="1.5" stroke-dasharray="9 3 2 3"/><text x="${x + 22}" y="${ly}" font-size="9.5" fill="${GRIS}">${echapper(lib)}</text>`)
    }
    parties.push(...items)
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" font-family="${POLICE}">${parties.join('')}</svg>`
  return { svg, largeur: L, hauteur: H, cibles }
}

// ---- Sparkline -----------------------------------------------------------------------------------

export function sparkline(
  points: PointGraphique[],
  o: { largeur?: number; hauteur?: number; couleur?: string; reference?: number | null; tMin?: number; tMax?: number } = {},
): string {
  const L = o.largeur ?? 120
  const H = o.hauteur ?? 30
  const vis = points.filter((p) => !p.exclu)
  if (!vis.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}"></svg>`
  const tMin = o.tMin ?? Math.min(...vis.map((p) => p.t))
  const tMax = o.tMax ?? Math.max(...vis.map((p) => p.t))
  const X = (t: number) => 3 + ((t - tMin) / (tMax - tMin || 1)) * (L - 6)
  const vals = vis.map((p) => p.valeur)
  const pos = vals.filter((v) => v > 0)
  const log = pos.length === vals.length && pos.length > 1 && Math.max(...pos) / Math.min(...pos) > 30
  const tr = (v: number) => (log ? Math.log10(v) : v)
  const ref = o.reference && o.reference > 0 ? o.reference : null
  const domaine = [...vals, ...(ref && ref <= Math.max(...vals) * 3 ? [ref] : [])].map(tr)
  let lo = Math.min(...domaine)
  let hi = Math.max(...domaine)
  if (!log) lo = Math.min(0, lo)
  if (hi - lo < 1e-12) {
    hi += 1
    lo -= log ? 1 : 0
  }
  const Y = (v: number) => H - 3 - ((tr(v) - lo) / (hi - lo)) * (H - 6)
  const c = o.couleur ?? '#2f5f9e'
  const parties: string[] = []
  if (ref && ref <= Math.max(...vals) * 3) parties.push(`<line x1="0" x2="${L}" y1="${n1(Y(ref))}" y2="${n1(Y(ref))}" stroke="${ROUGE}" stroke-width="0.8" stroke-dasharray="3 2"/>`)
  parties.push(`<path d="${vis.map((p, i) => `${i ? 'L' : 'M'}${n1(X(p.t))} ${n1(Y(p.valeur))}`).join('')}" fill="none" stroke="${c}" stroke-width="1.3"/>`)
  for (const p of vis) parties.push(`<circle cx="${n1(X(p.t))}" cy="${n1(Y(p.valeur))}" r="1.7" fill="${p.inferieur ? '#fff' : c}" stroke="${c}" stroke-width="0.9"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">${parties.join('')}</svg>`
}

// ---- Dechlorination ---------------------------------------------------------------------------------

export function degradationSvg(o: {
  titre: string
  especes: { code: string; couleur: string; chlores: number }[]
  campagnes: { libelle: string; moles: number[]; total: number; chlores: number | null }[]
  chloresMax: number
  largeur?: number
  hauteur?: number
}): string {
  const L = o.largeur ?? 820
  const H = o.hauteur ?? 340
  const gauche = 56
  const droite = 58
  const haut = 40
  const bas = H - 78
  const n = o.campagnes.length
  const pas = (L - gauche - droite) / Math.max(1, n)
  const larg = Math.min(46, pas * 0.7)
  const Y = (f: number) => bas - f * (bas - haut)
  const parties: string[] = [`<rect width="${L}" height="${H}" fill="#fff"/>`]
  parties.push(`<text x="10" y="22" font-size="13" font-weight="bold" fill="${ENCRE}">${echapper(o.titre)}</text>`)
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    parties.push(`<line x1="${gauche}" x2="${L - droite}" y1="${n1(Y(f))}" y2="${n1(Y(f))}" stroke="${GRILLE}"/>`)
    parties.push(`<text x="${gauche - 6}" y="${n1(Y(f) + 3.5)}" font-size="10" fill="${GRIS}" text-anchor="end">${Math.round(f * 100)} %</text>`)
  }
  parties.push(`<text transform="translate(14 ${n1((haut + bas) / 2)}) rotate(-90)" font-size="10.5" text-anchor="middle" fill="${ENCRE}">part molaire</text>`)
  const YC = (c: number) => bas - (c / o.chloresMax) * (bas - haut)
  for (let c = 0; c <= o.chloresMax; c++) parties.push(`<text x="${L - droite + 6}" y="${n1(YC(c) + 3.5)}" font-size="9.5" fill="#6b4c9a">${c}</text>`)
  parties.push(`<text transform="translate(${L - 12} ${n1((haut + bas) / 2)}) rotate(90)" font-size="10" text-anchor="middle" fill="#6b4c9a">nombre moyen d'atomes de Cl</text>`)
  const ligne: string[] = []
  o.campagnes.forEach((c, i) => {
    const xc = gauche + pas * (i + 0.5)
    let cumul = 0
    if (c.total > 0) {
      c.moles.forEach((m, k) => {
        if (m <= 0) return
        const f = m / c.total
        parties.push(`<rect x="${n1(xc - larg / 2)}" y="${n1(Y(cumul + f))}" width="${n1(larg)}" height="${n1(Y(cumul) - Y(cumul + f))}" fill="${o.especes[k].couleur}"/>`)
        cumul += f
      })
    } else parties.push(`<text x="${n1(xc)}" y="${n1(bas - 6)}" font-size="9" fill="${GRIS}" text-anchor="middle">n.q.</text>`)
    if (c.chlores !== null) ligne.push(`${ligne.length ? 'L' : 'M'}${n1(xc)} ${n1(YC(c.chlores))}`)
    parties.push(`<text transform="translate(${n1(xc + 3)} ${bas + 8}) rotate(45)" font-size="9.5" fill="${GRIS}">${echapper(c.libelle)}</text>`)
  })
  if (ligne.length > 1) parties.push(`<path d="${ligne.join('')}" fill="none" stroke="#6b4c9a" stroke-width="2"/>`)
  o.campagnes.forEach((c, i) => {
    if (c.chlores !== null) parties.push(`<circle cx="${n1(gauche + pas * (i + 0.5))}" cy="${n1(YC(c.chlores))}" r="3" fill="#fff" stroke="#6b4c9a" stroke-width="1.6"/>`)
  })
  let lx = gauche
  o.especes.forEach((e) => {
    parties.push(`<rect x="${lx}" y="${H - 16}" width="10" height="10" fill="${e.couleur}"/><text x="${lx + 14}" y="${H - 7}" font-size="10" fill="${ENCRE}">${echapper(e.code)}</text>`)
    lx += 30 + e.code.length * 6.5
  })
  parties.push(`<line x1="${lx}" x2="${lx + 16}" y1="${H - 11}" y2="${H - 11}" stroke="#6b4c9a" stroke-width="2"/><text x="${lx + 20}" y="${H - 7}" font-size="10" fill="#6b4c9a">Cl moyen</text>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" font-family="${POLICE}">${parties.join('')}</svg>`
}

// ---- Plan -------------------------------------------------------------------------------------------

export interface PointPlan {
  nom: string
  x: number
  y: number
  classe: Classe | null
  /** Last result over the reference value. */
  ratio: number | null
  libelle: string
  position: string
}

export function planSvg(o: { titre: string; points: PointPlan[]; largeur?: number; hauteur?: number }): { svg: string; cibles: { x: number; y: number; nom: string }[] } {
  const L = o.largeur ?? 620
  const H = o.hauteur ?? 460
  const marge = 56
  const xs = o.points.map((p) => p.x)
  const ys = o.points.map((p) => p.y)
  const dx = Math.max(...xs) - Math.min(...xs) || 1
  const dy = Math.max(...ys) - Math.min(...ys) || 1
  const echelle = Math.min((L - 2 * marge) / dx, (H - 2 * marge - 40) / dy)
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  const X = (x: number) => L / 2 + (x - cx) * echelle
  const Y = (y: number) => (H + 20) / 2 - (y - cy) * echelle
  const parties: string[] = [`<rect width="${L}" height="${H}" fill="#fff"/>`, `<text x="10" y="22" font-size="13" font-weight="bold" fill="${ENCRE}">${echapper(o.titre)}</text>`]
  // North arrow and scale bar.
  parties.push(`<path d="M${L - 30} 64 L${L - 24} 48 L${L - 18} 64 L${L - 24} 60 Z" fill="${ENCRE}"/><text x="${L - 24}" y="44" font-size="10" text-anchor="middle" fill="${ENCRE}">N</text>`)
  const dist = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((d) => d * echelle >= 60) ?? 5000
  parties.push(
    `<line x1="20" x2="${n1(20 + dist * echelle)}" y1="${H - 18}" y2="${H - 18}" stroke="${ENCRE}" stroke-width="2"/><text x="20" y="${H - 24}" font-size="9.5" fill="${ENCRE}">${dist} m (si coordonnées en mètres)</text>`,
  )
  const cibles: { x: number; y: number; nom: string }[] = []
  for (const p of o.points) {
    const x = X(p.x)
    const y = Y(p.y)
    const k = p.classe ? CLASSES[p.classe] : null
    const r = p.ratio !== null && p.ratio > 0 ? Math.max(8, Math.min(22, 8 + Math.log10(1 + p.ratio) * 8)) : 8
    parties.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${k ? k.fond : '#f4f5f6'}" stroke="${k ? k.couleur : '#a6adb4'}" stroke-width="${p.ratio !== null && p.ratio > 1 ? 3 : 1.6}"/>`)
    if (k) parties.push(`<text x="${n1(x)}" y="${n1(y + 4)}" font-size="11" text-anchor="middle" fill="${k.couleur}">${k.symbole}</text>`)
    parties.push(`<text x="${n1(x + r + 4)}" y="${n1(y - 2)}" font-size="11" font-weight="bold" fill="${ENCRE}">${echapper(p.nom)}</text>`)
    parties.push(`<text x="${n1(x + r + 4)}" y="${n1(y + 11)}" font-size="9.5" fill="${GRIS}">${echapper(p.libelle)}</text>`)
    cibles.push({ x, y, nom: p.nom })
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" font-family="${POLICE}">${parties.join('')}</svg>`, cibles }
}

// ---- Bars ---------------------------------------------------------------------------------------------

export function barresSvg(o: { titre: string; unite: string; categories: string[]; series: { nom: string; couleur: string; valeurs: number[] }[]; largeur?: number; hauteur?: number }): string {
  const L = o.largeur ?? 820
  const H = o.hauteur ?? 300
  const gauche = 56
  const haut = 40
  const bas = H - 74
  const n = o.categories.length
  const pas = (L - gauche - 20) / Math.max(1, n)
  const larg = Math.min(30, (pas * 0.75) / o.series.length)
  const max = Math.max(1, ...o.series.flatMap((s) => s.valeurs))
  const ey = echelleY([max], false, haut, bas)
  const parties: string[] = [`<rect width="${L}" height="${H}" fill="#fff"/>`, `<text x="10" y="22" font-size="13" font-weight="bold" fill="${ENCRE}">${echapper(o.titre)}</text>`]
  for (const g of ey.graduations) {
    const y = ey.vers(g.v)
    parties.push(`<line x1="${gauche}" x2="${L - 20}" y1="${n1(y)}" y2="${n1(y)}" stroke="${GRILLE}"/><text x="${gauche - 6}" y="${n1(y + 3.5)}" font-size="10" fill="${GRIS}" text-anchor="end">${fmt(g.v)}</text>`)
  }
  parties.push(`<text transform="translate(14 ${n1((haut + bas) / 2)}) rotate(-90)" font-size="10.5" text-anchor="middle" fill="${ENCRE}">${echapper(o.unite)}</text>`)
  o.categories.forEach((c, i) => {
    const xc = gauche + pas * (i + 0.5)
    o.series.forEach((s, k) => {
      const v = s.valeurs[i] ?? 0
      const x = xc - (larg * o.series.length) / 2 + k * larg
      parties.push(`<rect x="${n1(x)}" y="${n1(ey.vers(v))}" width="${n1(larg - 1)}" height="${n1(bas - ey.vers(v))}" fill="${s.couleur}"/>`)
    })
    parties.push(`<text transform="translate(${n1(xc + 3)} ${bas + 8}) rotate(45)" font-size="9.5" fill="${GRIS}">${echapper(c)}</text>`)
  })
  let lx = gauche
  for (const s of o.series) {
    parties.push(`<rect x="${lx}" y="${H - 16}" width="10" height="10" fill="${s.couleur}"/><text x="${lx + 14}" y="${H - 7}" font-size="10" fill="${ENCRE}">${echapper(s.nom)}</text>`)
    lx += 30 + s.nom.length * 6.2
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" font-family="${POLICE}">${parties.join('')}</svg>`
}

// ---- PNG ------------------------------------------------------------------------------------------------

/** An SVG drawn into a canvas, as a PNG data URL (browser only). */
export async function svgEnPng(svg: string, largeur: number, hauteur: number, echelle = 2): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.decoding = 'sync'
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok()
      img.onerror = () => ko(new Error('Image SVG illisible'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(largeur * echelle)
    canvas.height = Math.round(hauteur * echelle)
    const ctx = canvas.getContext('2d')!
    ctx.scale(echelle, echelle)
    ctx.drawImage(img, 0, 0, largeur, hauteur)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
