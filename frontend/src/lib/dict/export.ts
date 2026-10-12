import type { Color, PDFFont, PDFPage } from 'pdf-lib'
import type { Rect } from './calage'
import { rvb } from './reseau'
import type { Vue } from './synthese'

export type Format = 'A3' | 'A1' | 'A0'

/** Landscape sheets, in millimetres. */
const FORMATS: Record<Format, [number, number]> = { A3: [420, 297], A1: [841, 594], A0: [1189, 841] }
const ECHELLES = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000]

const mm = (v: number) => (v * 72) / 25.4

interface Mise {
  page: [number, number]
  marge: number
  panneau: number
  carte: { x: number; y: number; l: number; h: number }
}

function mise(format: Format): Mise {
  const [W, H] = FORMATS[format]
  const marge = format === 'A3' ? 10 : 15
  const panneau = format === 'A3' ? 92 : format === 'A1' ? 150 : 190
  return { page: [W, H], marge, panneau, carte: { x: marge, y: marge, l: W - 2 * marge - panneau - 6, h: H - 2 * marge } }
}

/** Largest standard scale at which the networks fit the sheet. */
export function echelleImpression(format: Format, etendue: Rect): number {
  const { carte } = mise(format)
  const l = etendue[2] - etendue[0]
  const h = etendue[3] - etendue[1]
  return ECHELLES.find((s) => (l * 1000) / s <= carte.l && (h * 1000) / s <= carte.h) ?? ECHELLES[ECHELLES.length - 1]
}

/** View printed on the sheet: centred on the networks, at the chosen
 *  scale, about 200 dpi but under 16 million pixels (Safari's limit). */
export function vueImpression(format: Format, etendue: Rect, echelle: number): Vue {
  const { carte } = mise(format)
  const l = (carte.l * echelle) / 1000
  const h = (carte.h * echelle) / 1000
  const cx = (etendue[0] + etendue[2]) / 2
  const cy = (etendue[1] + etendue[3]) / 2
  const px = (carte.l / 25.4) * 200
  const py = (carte.h / 25.4) * 200
  const facteur = Math.max(1, Math.sqrt((px * py) / 16e6))
  return { etendue: [cx - l / 2, cy - h / 2, cx + l / 2, cy + h / 2], resolution: l / (px / facteur) }
}

/** Standard fonts only cover WinAnsi: other characters lose their accent,
 *  or become "?". */
function ecrivable(police: PDFFont, texte: string): string {
  const jeu = new Set(police.getCharacterSet())
  return [...texte.replace(/\s+/g, ' ')]
    .map((c) => {
      if (jeu.has(c.codePointAt(0)!)) return c
      const sans = c.normalize('NFD').replace(/\p{M}/gu, '')
      return sans && [...sans].every((s) => jeu.has(s.codePointAt(0)!)) ? sans : '?'
    })
    .join('')
}

/** Splits a text into lines that fit the width. */
function couper(police: PDFFont, texte: string, taille: number, largeur: number): string[] {
  const lignes: string[] = []
  let courante = ''
  for (const mot of ecrivable(police, texte).split(' ')) {
    const essai = courante ? `${courante} ${mot}` : mot
    if (police.widthOfTextAtSize(essai, taille) <= largeur || !courante) courante = essai
    else {
      lignes.push(courante)
      courante = mot
    }
  }
  if (courante) lignes.push(courante)
  return lignes
}

export interface EntreeLegende {
  exploitant: string
  couleur: string
  categories: string
  detail: string
}

export interface PlanUtilise {
  exploitant: string
  fichier: string
  page: number
  folio: string | null
  echelle: number
  systeme: string
  calage: string
}

export interface DonneesExport {
  format: Format
  echelle: number
  vue: Vue
  /** JPEG of the map, covering `vue` exactly. */
  image: Uint8Array
  titre: string
  details: string[]
  legende: EntreeLegende[]
  sources: string[]
  plans: PlanUtilise[]
}

/** Grid spacing giving ticks some 40 mm apart or more. */
function pasGrille(echelle: number): number {
  return [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((g) => (g * 1000) / echelle >= 40) ?? 10000
}

type PdfLib = typeof import('pdf-lib')

function cadreCarte(lib: PdfLib, page: PDFPage, d: DonneesExport, m: Mise, polices: { n: PDFFont; g: PDFFont }) {
  const ENCRE = lib.rgb(0.05, 0.14, 0.13)
  const GRIS = lib.rgb(0.31, 0.38, 0.37)
  const c = { x: mm(m.carte.x), y: mm(m.carte.y), l: mm(m.carte.l), h: mm(m.carte.h) }
  page.drawRectangle({ x: c.x, y: c.y, width: c.l, height: c.h, borderColor: ENCRE, borderWidth: 0.8 })
  // Lambert 93 ticks and values along the frame.
  const [x0, y0, x1, y1] = d.vue.etendue
  const g = pasGrille(d.echelle)
  const t = 6.5
  for (let e = Math.ceil(x0 / g) * g; e < x1; e += g) {
    const x = c.x + ((e - x0) / (x1 - x0)) * c.l
    for (const [ya, yb] of [
      [c.y, c.y + 5],
      [c.y + c.h, c.y + c.h - 5],
    ])
      page.drawLine({ start: { x, y: ya }, end: { x, y: yb }, thickness: 0.6, color: ENCRE })
    const s = e.toLocaleString('fr-FR').replace(/ | /g, ' ')
    const w = polices.n.widthOfTextAtSize(s, t)
    page.drawText(s, { x: x - w / 2, y: c.y + c.h + 2, size: t, font: polices.n, color: GRIS })
  }
  for (let n = Math.ceil(y0 / g) * g; n < y1; n += g) {
    const y = c.y + ((n - y0) / (y1 - y0)) * c.h
    for (const [xa, xb] of [
      [c.x, c.x + 5],
      [c.x + c.l, c.x + c.l - 5],
    ])
      page.drawLine({ start: { x: xa, y }, end: { x: xb, y }, thickness: 0.6, color: ENCRE })
    const s = n.toLocaleString('fr-FR').replace(/ | /g, ' ')
    const w = polices.n.widthOfTextAtSize(s, t)
    page.drawText(s, { x: c.x - 2, y: y - w / 2, size: t, font: polices.n, color: GRIS, rotate: lib.degrees(90) })
  }
}

/** The synthesis sheet, then the list of plans used. */
export async function exporterPdf(d: DonneesExport): Promise<Uint8Array> {
  const lib = await import('pdf-lib')
  const { PDFDocument, StandardFonts, rgb } = lib
  const ENCRE = rgb(0.05, 0.14, 0.13)
  const GRIS = rgb(0.31, 0.38, 0.37)
  const FILET = rgb(0.83, 0.86, 0.85)
  const couleur = (hex: string): Color => {
    const [r, g, b] = rvb(hex)
    return rgb(r / 255, g / 255, b / 255)
  }
  const doc = await PDFDocument.create()
  const polices = { n: await doc.embedFont(StandardFonts.Helvetica), g: await doc.embedFont(StandardFonts.HelveticaBold) }
  const m = mise(d.format)
  const page = doc.addPage([mm(m.page[0]), mm(m.page[1])])
  const image = await doc.embedJpg(d.image)
  page.drawImage(image, { x: mm(m.carte.x), y: mm(m.carte.y), width: mm(m.carte.l), height: mm(m.carte.h) })
  cadreCarte(lib, page, d, m, polices)

  // Side panel: title, legend, scale, north, sources.
  const k = d.format === 'A3' ? 1 : d.format === 'A1' ? 1.35 : 1.6
  const px = mm(m.page[0] - m.marge - m.panneau)
  const pl = mm(m.panneau)
  let y = mm(m.page[1] - m.marge) - 14 * k
  const ecrire = (texte: string, taille: number, police: PDFFont, color: Color = ENCRE, retrait = 0) => {
    for (const l of couper(police, texte, taille * k, pl - retrait)) {
      page.drawText(l, { x: px + retrait, y, size: taille * k, font: police, color })
      y -= taille * k * 1.3
    }
  }
  ecrire('Synthèse des réseaux', 9, polices.n, GRIS)
  ecrire(d.titre, 15, polices.g)
  y -= 3 * k
  for (const l of d.details) ecrire(l, 8.5, polices.n)
  y -= 8 * k
  page.drawLine({ start: { x: px, y: y + 6 * k }, end: { x: px + pl, y: y + 6 * k }, thickness: 0.6, color: FILET })
  ecrire('EXPLOITANTS', 7.5, polices.g, GRIS)
  y -= 2 * k
  for (const e of d.legende) {
    page.drawRectangle({ x: px, y: y + 1.5 * k, width: 16 * k, height: 3.2 * k, color: couleur(e.couleur) })
    ecrire(e.exploitant, 8.5, polices.g, ENCRE, 22 * k)
    ecrire(e.categories, 7, polices.n, GRIS, 22 * k)
    ecrire(e.detail, 7, polices.n, GRIS, 22 * k)
    y -= 4 * k
  }

  // Scale bar and north arrow at the bottom of the panel.
  let yb = mm(m.marge) + 70 * k
  const longueur = [10, 20, 25, 50, 100, 200, 250, 500, 1000].reverse().find((v) => (v * 1000) / d.echelle <= m.panneau * 0.55) ?? 10
  const lb = mm((longueur * 1000) / d.echelle)
  page.drawText(ecrivable(polices.g, `Échelle 1:${d.echelle.toLocaleString('fr-FR').replace(/ | /g, ' ')} (format ${d.format})`), {
    x: px,
    y: yb + 14 * k,
    size: 8 * k,
    font: polices.g,
    color: ENCRE,
  })
  for (let i = 0; i < 4; i++) {
    page.drawRectangle({ x: px + (lb / 4) * i, y: yb, width: lb / 4, height: 3 * k, color: i % 2 ? rgb(1, 1, 1) : ENCRE, borderColor: ENCRE, borderWidth: 0.5 })
  }
  page.drawText('0', { x: px - 1.5, y: yb - 9 * k, size: 6.5 * k, font: polices.n, color: GRIS })
  page.drawText(`${longueur} m`, { x: px + lb - 6 * k, y: yb - 9 * k, size: 6.5 * k, font: polices.n, color: GRIS })
  const nx = px + pl - 12 * k
  page.drawSvgPath(`M 0 0 L ${6 * k} ${-18 * k} L ${12 * k} 0 L ${6 * k} ${-5 * k} Z`, { x: nx - 6 * k, y: yb + 18 * k, color: ENCRE })
  page.drawText('N', { x: nx - 3 * k, y: yb + 21 * k, size: 9 * k, font: polices.g, color: ENCRE })

  yb -= 22 * k
  y = yb
  for (const s of d.sources) ecrire(s, 6.5, polices.n, GRIS)

  // Second page: the plans behind the synthesis.
  const p2 = doc.addPage([mm(297), mm(210)])
  let y2 = mm(210 - 15)
  const ligne = (cols: string[], police: PDFFont, taille: number) => {
    const xs = [15, 68, 140, 152, 167, 183, 208]
    cols.forEach((t, i) => {
      const max = mm((xs[i + 1] ?? 285) - xs[i] - 2)
      let s = ecrivable(police, t)
      while (s.length > 1 && police.widthOfTextAtSize(s, taille) > max) s = s.slice(0, -2) + '…'
      p2.drawText(s, { x: mm(xs[i]), y: y2, size: taille, font: police, color: ENCRE })
    })
    y2 -= taille * 1.6
  }
  p2.drawText('Plans des exploitants utilisés pour la synthèse', { x: mm(15), y: y2, size: 13, font: polices.g, color: ENCRE })
  y2 -= 22
  ligne(['Exploitant', 'Fichier', 'Page', 'Folio', 'Échelle', 'Système', 'Calage'], polices.g, 7.5)
  for (const p of d.plans) {
    if (y2 < mm(15)) break
    ligne([p.exploitant, p.fichier, String(p.page), p.folio ?? '—', `1:${p.echelle}`, p.systeme, p.calage], polices.n, 7.5)
  }

  doc.setTitle(`Synthèse des réseaux — ${d.titre}`)
  doc.setCreator('SIR Toolbox France — ERM')
  doc.setLanguage('fr-FR')
  return doc.save()
}

/** World file (.pgw) of a PNG covering the view: pixel size and the
 *  Lambert 93 centre of the top-left pixel. */
export function fichierMonde(vue: Vue): string {
  const r = vue.resolution
  return [r, 0, 0, -r, vue.etendue[0] + r / 2, vue.etendue[3] - r / 2].map((v) => v.toFixed(4)).join('\n') + '\n'
}
