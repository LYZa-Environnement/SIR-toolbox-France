import {
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  degrees,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib'
import { CATEGORIES, couleurGroupe, libelleCategorie } from './categories'
import type { GroupeSortie } from './lots'


const ENCRE = rgb(0.05, 0.14, 0.13)
const GRIS = rgb(0.31, 0.38, 0.37)
const FILET = rgb(0.83, 0.86, 0.85)
const BLANC = rgb(1, 1, 1)

function couleur(hex: string): Color {
  const n = parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export interface Raster {
  jpeg: Uint8Array
  /** Displayed size of the original page, in points. */
  largeur: number
  hauteur: number
}

export interface OptionsFusion {
  sommaire: boolean
  titre: string
  /** Lines under the title of the contents page (DICT number, works…). */
  details: string[]
  /** Reminder printed on every band, e.g. the DICT number. */
  reference: string
  /** Renders a page as an image, for files pdf-lib cannot copy
   *  (encrypted or damaged): their plans still make it into the output. */
  rasteriser?: (fichier: number, page: number) => Promise<Raster>
  progression?: (fait: number, total: number) => void
}

interface Polices {
  normale: PDFFont
  grasse: PDFFont
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

/** Shortens a text with an ellipsis until it fits the width. */
function ajuster(police: PDFFont, texte: string, taille: number, largeurMax: number): string {
  let t = ecrivable(police, texte)
  if (police.widthOfTextAtSize(t, taille) <= largeurMax) return t
  while (t.length > 1 && police.widthOfTextAtSize(`${t}…`, taille) > largeurMax) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

interface Bandeau {
  exploitant: string
  categories: string
  dict: string
  numero: string
  couleur: Color
}

/** Adds a band above the plan, by enlarging the page rather than drawing
 *  over it, so nothing of the plan is hidden. Coordinates are written in
 *  the displayed frame (u to the right, v upwards) and mapped back to the
 *  page's own frame, which differs when the page carries a /Rotate. */
function poserBandeau(page: PDFPage, polices: Polices, b: Bandeau) {
  const rot = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270
  const boite = page.getCropBox()
  const tourne = rot === 90 || rot === 270
  const W = tourne ? boite.height : boite.width
  const H = tourne ? boite.width : boite.height
  const B = Math.round(Math.min(72, Math.max(24, Math.min(W, H) * 0.045)))

  let { x: X0, y: Y0, width: Wu, height: Hu } = boite
  if (rot === 0) Hu += B
  else if (rot === 90) {
    X0 -= B
    Wu += B
  } else if (rot === 180) {
    Y0 -= B
    Hu += B
  } else Wu += B
  page.setMediaBox(X0, Y0, Wu, Hu)
  page.setCropBox(X0, Y0, Wu, Hu)
  page.setBleedBox(X0, Y0, Wu, Hu)
  page.setTrimBox(X0, Y0, Wu, Hu)
  page.setArtBox(X0, Y0, Wu, Hu)

  const pt = (u: number, v: number) =>
    rot === 0
      ? { x: X0 + u, y: Y0 + v }
      : rot === 90
        ? { x: X0 + Wu - v, y: Y0 + u }
        : rot === 180
          ? { x: X0 + Wu - u, y: Y0 + Hu - v }
          : { x: X0 + v, y: Y0 + Hu - u }
  const rotate = degrees(rot)

  page.drawRectangle({ ...pt(0, H), width: W, height: B, color: BLANC, rotate })
  page.drawRectangle({ ...pt(0, H), width: B * 0.2, height: B, color: b.couleur, rotate })
  page.drawLine({ start: pt(0, H), end: pt(W, H), thickness: 0.75, color: FILET })

  const t1 = B * 0.36
  const t2 = B * 0.22
  const marge = B * 0.5
  const droite = [ecrivable(polices.grasse, b.numero), ecrivable(polices.normale, b.dict)]
  const largeurDroite = Math.max(polices.grasse.widthOfTextAtSize(droite[0], t2 * 1.1), polices.normale.widthOfTextAtSize(droite[1], t2))
  const place = W - marge * 2 - largeurDroite - B

  const ecrire = (texte: string, u: number, v: number, taille: number, police: PDFFont, color: Color) =>
    page.drawText(texte, { ...pt(u, v), size: taille, font: police, color, rotate })

  ecrire(ajuster(polices.grasse, b.exploitant, t1, place), marge, H + B * 0.48, t1, polices.grasse, ENCRE)
  ecrire(ajuster(polices.normale, b.categories, t2, place), marge, H + B * 0.17, t2, polices.normale, GRIS)
  const aDroite = (texte: string, v: number, taille: number, police: PDFFont, color: Color) =>
    ecrire(texte, W - marge - police.widthOfTextAtSize(texte, taille), v, taille, police, color)
  aDroite(droite[0], H + B * 0.52, t2 * 1.1, polices.grasse, ENCRE)
  aDroite(droite[1], H + B * 0.17, t2, polices.normale, GRIS)
}

const libelleCategories = (codes: string[]) =>
  codes.length
    ? codes.map(libelleCategorie).join(' · ') + (codes.some((c) => CATEGORIES[c]?.sensible) ? ' (réseau sensible)' : '')
    : 'Catégorie de réseau non précisée'

/** Clickable rectangle of the contents page, leading to a page. */
function lien(doc: PDFDocument, page: PDFPage, x: number, y: number, l: number, h: number, cible: PDFRef) {
  const ref = doc.context.register(
    doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + l, y + h], Border: [0, 0, 0], Dest: [cible, 'Fit'] }),
  )
  page.node.addAnnot(ref)
}

interface Signet {
  titre: string
  page: PDFRef
  enfants?: Signet[]
}

/** Document outline (bookmarks): one entry per operator, then per plan. */
function poserSignets(doc: PDFDocument, signets: Signet[]) {
  if (!signets.length) return
  const ctx = doc.context
  const racine = ctx.nextRef()
  const niveau = (liste: Signet[], parent: PDFRef): PDFRef[] => {
    const refs = liste.map(() => ctx.nextRef())
    liste.forEach((s, i) => {
      const dict: Record<string, unknown> = { Title: PDFHexString.fromText(s.titre), Parent: parent, Dest: [s.page, 'Fit'] }
      if (i > 0) dict.Prev = refs[i - 1]
      if (i < refs.length - 1) dict.Next = refs[i + 1]
      if (s.enfants?.length) {
        const enfants = niveau(s.enfants, refs[i])
        dict.First = enfants[0]
        dict.Last = enfants[enfants.length - 1]
        dict.Count = -enfants.length
      }
      ctx.assign(refs[i], ctx.obj(dict as Parameters<typeof ctx.obj>[0]))
    })
    return refs
  }
  const premiers = niveau(signets, racine)
  ctx.assign(racine, ctx.obj({ Type: 'Outlines', First: premiers[0], Last: premiers[premiers.length - 1], Count: premiers.length }))
  doc.catalog.set(PDFName.of('Outlines'), racine)
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
}

const LIGNES_PAR_PAGE = 15
const HAUTEUR_LIGNE = 38

function pagesSommaire(
  doc: PDFDocument,
  polices: Polices,
  groupes: GroupeSortie[],
  options: OptionsFusion,
  premieresPages: (PDFRef | null)[],
  debuts: number[],
  total: number,
): PDFPage[] {
  const nb = Math.max(1, Math.ceil(groupes.length / LIGNES_PAR_PAGE))
  const pages: PDFPage[] = []
  const t = (police: PDFFont, s: string) => ecrivable(police, s)
  for (let n = 0; n < nb; n++) {
    const page = doc.insertPage(n, [595.28, 841.89])
    pages.push(page)
    let y = 790
    page.drawText(t(polices.normale, 'ERM — SIR Toolbox France'), { x: 50, y, size: 8.5, font: polices.normale, color: GRIS })
    y -= 34
    page.drawText(ajuster(polices.grasse, options.titre, 20, 495), { x: 50, y, size: 20, font: polices.grasse, color: ENCRE })
    y -= 20
    for (const d of options.details) {
      page.drawText(ajuster(polices.normale, d, 10.5, 495), { x: 50, y, size: 10.5, font: polices.normale, color: ENCRE })
      y -= 15
    }
    y -= 14
    const entete = (s: string, x: number) => page.drawText(t(polices.grasse, s), { x, y, size: 8.5, font: polices.grasse, color: GRIS })
    entete('EXPLOITANT', 66)
    entete('PLANS', 440)
    entete('PAGES', 490)
    y -= 8
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.75, color: ENCRE })

    groupes.slice(n * LIGNES_PAR_PAGE, (n + 1) * LIGNES_PAR_PAGE).forEach((g, k) => {
      const i = n * LIGNES_PAR_PAGE + k
      const haut = y
      page.drawRectangle({ x: 50, y: haut - 18, width: 8, height: 8, color: couleur(couleurGroupe(i)) })
      page.drawText(ajuster(polices.grasse, g.exploitant, 10.5, 360), { x: 66, y: haut - 17, size: 10.5, font: polices.grasse, color: ENCRE })
      const sous = g.pages.length
        ? libelleCategories(g.categories)
        : g.concerne === false
          ? 'Non concerné — aucun plan'
          : `${libelleCategories(g.categories)} — aucun plan retenu`
      page.drawText(ajuster(polices.normale, sous, 8.5, 360), { x: 66, y: haut - 30, size: 8.5, font: polices.normale, color: GRIS })
      page.drawText(String(g.pages.length), { x: 440, y: haut - 17, size: 10.5, font: polices.normale, color: ENCRE })
      const plage = g.pages.length ? (g.pages.length > 1 ? `${debuts[i]}–${debuts[i] + g.pages.length - 1}` : `${debuts[i]}`) : '—'
      page.drawText(t(polices.normale, plage), { x: 490, y: haut - 17, size: 10.5, font: polices.normale, color: ENCRE })
      const cible = premieresPages[i]
      if (cible) lien(doc, page, 50, haut - HAUTEUR_LIGNE, 495, HAUTEUR_LIGNE, cible)
      y = haut - HAUTEUR_LIGNE
      page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: FILET })
    })

    const note = [
      "Chaque plan porte en bandeau le nom de l'exploitant du réseau, ses catégories et sa position dans le document.",
      'Les plans restent la propriété des exploitants ; se reporter à leurs récépissés pour les recommandations de sécurité.',
    ]
    note.forEach((l, k) =>
      page.drawText(ajuster(polices.normale, l, 8, 495), { x: 50, y: 62 - k * 11, size: 8, font: polices.normale, color: GRIS }),
    )
    page.drawText(`Page ${n + 1} / ${total}`, { x: 495, y: 30, size: 8, font: polices.normale, color: GRIS })
  }
  return pages
}

/** Builds the merged PDF: an optional contents page, then each operator's
 *  plans, each page carrying the operator's band. */
export async function fusionner(sources: Uint8Array[], groupes: GroupeSortie[], options: OptionsFusion) {
  const sortie = await PDFDocument.create()
  const polices: Polices = {
    normale: await sortie.embedFont(StandardFonts.Helvetica),
    grasse: await sortie.embedFont(StandardFonts.HelveticaBold),
  }
  const totalPlans = groupes.reduce((s, g) => s + g.pages.length, 0)
  const nbSommaire = options.sommaire ? Math.max(1, Math.ceil(groupes.length / LIGNES_PAR_PAGE)) : 0
  const total = nbSommaire + totalPlans

  // Every page needed from a file is copied in one go, so that resources
  // shared between its pages (fonts, images) are copied once.
  const copies = new Map<string, PDFPage>()
  const rasterises: number[] = []
  const parFichier = new Map<number, number[]>()
  for (const g of groupes) for (const p of g.pages) parFichier.set(p.fichier, [...(parFichier.get(p.fichier) ?? []), p.page])
  for (const [fichier, indices] of parFichier) {
    let source: PDFDocument | null = null
    try {
      source = await PDFDocument.load(sources[fichier], { ignoreEncryption: true, updateMetadata: false })
      if (source.isEncrypted) source = null
    } catch {
      source = null
    }
    if (!source) {
      if (!options.rasteriser) throw new Error(`Fichier ${fichier + 1} illisible`)
      rasterises.push(fichier)
      continue
    }
    // Receipt pages keep their filled-in values once the form is gone.
    try {
      source.getForm().flatten({ updateFieldAppearances: false })
    } catch {
      /* a form pdf-lib cannot flatten keeps its widgets */
    }
    const pages = await sortie.copyPages(source, indices)
    indices.forEach((p, k) => copies.set(`${fichier}:${p}`, pages[k]))
  }

  const premieresPages: (PDFRef | null)[] = []
  const debuts: number[] = []
  const signets: Signet[] = []
  let numero = nbSommaire
  let fait = 0
  for (const [i, g] of groupes.entries()) {
    debuts.push(numero + 1)
    const enfants: Signet[] = []
    for (const [j, p] of g.pages.entries()) {
      numero++
      let page = copies.get(`${p.fichier}:${p.page}`)
      if (page) sortie.addPage(page)
      else {
        const r = await options.rasteriser!(p.fichier, p.page)
        const image = await sortie.embedJpg(r.jpeg)
        page = sortie.addPage([r.largeur, r.hauteur])
        page.drawImage(image, { x: 0, y: 0, width: r.largeur, height: r.hauteur })
      }
      poserBandeau(page, polices, {
        exploitant: g.exploitant,
        categories: libelleCategories(g.categories),
        dict: `${options.reference ? `${options.reference} · ` : ''}page ${numero} / ${total}`,
        numero: `Plan ${j + 1} / ${g.pages.length}${p.folio ? ` — folio ${p.folio}` : ''}`,
        couleur: couleur(couleurGroupe(i)),
      })
      enfants.push({ titre: `Plan ${j + 1}${p.folio ? ` — folio ${p.folio}` : ''}`, page: page.ref })
      options.progression?.(++fait, totalPlans)
    }
    premieresPages.push(enfants[0]?.page ?? null)
    if (enfants.length) signets.push({ titre: `${g.exploitant} (${enfants.length})`, page: enfants[0].page, enfants })
  }

  if (options.sommaire) {
    const sommaire = pagesSommaire(sortie, polices, groupes, options, premieresPages, debuts, total)
    signets.unshift({ titre: 'Sommaire', page: sommaire[0].ref })
  }
  poserSignets(sortie, signets)

  sortie.setTitle(options.titre)
  sortie.setCreator('SIR Toolbox France — ERM')
  sortie.setLanguage('fr-FR')
  return { octets: await sortie.save(), rasterises }
}
