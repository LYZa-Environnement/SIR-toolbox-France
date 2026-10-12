import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { crsIndique, lireEtiquette, type Crs, type Etiquette, type Rect } from './calage'
import { estCategorie } from './categories'
import { etiquettesDessinees, type EtiquetteDessinee } from './glyphes'
import { lireTraces, rectangles } from './vecteurs'

/** What the operator's receipt (récépissé de DT/DICT) tells about the reply. */
export interface Recepisse {
  exploitant: string | null
  contact: string | null
  categories: string[]
  /** N° de consultation du téléservice (guichet unique). */
  consultation: string | null
  commune: string | null
  adresse: string | null
  /** false when the operator ticked "réseaux non concernés". */
  concerne: boolean | null
}

export type Nature = 'recepisse' | 'plan' | 'document'

export interface PageAnalysee {
  /** 0-based index in its file. */
  index: number
  /** Displayed size in points, rotation applied. */
  largeur: number
  hauteur: number
  nature: Nature
  /** Hash of the page text and size, to spot the same plan sent twice;
   *  null for receipts (blank forms look alike once their fields are set
   *  aside) and for pages with too little text to tell (scans). */
  empreinte: string | null
  folio: string | null
  /** Network category printed in the plan's title block. */
  categorie: string | null
  recepisse: Recepisse | null
  /** Grid coordinates printed on a plan, to georeference it. */
  etiquettes: Etiquette[]
  /** Coordinate system written on the plan. */
  indiceCrs: Crs | null
  /** Index sheet of the folios, not a network plan. */
  assemblage: boolean
  /** Page box in PDF user space. */
  boite: Rect
  /** Large rectangles drawn on a plan: candidates for the map frame. */
  rectangles: Rect[]
  /** Grid labels drawn as strokes, to be read across the operator's pages. */
  dessinees: EtiquetteDessinee[]
  /** Scale written on the plan ("Echelle : 1 / 500"), as 500. */
  echelle: number | null
}

const A4 = 595 * 842

const RECEPISSE = /R[ée]c[ée]piss[ée] de (DT|DICT)/i
const RECEPISSE_BLOC = /Destinataire|Coordonn[ée]es de l.exploitant|Raison sociale/i
const DOCUMENT =
  /Madame,? Monsieur|Objet\s*:|Cordialement|Cat[ée]gories des r[ée]seaux|Dispositions g[ée]n[ée]rales|fichiers transmis|Recommandations|Code de l.environnement/i
const PLAN =
  /[ÉE]chelle\s*:?\s*1\s*[:/]|\bFolio\b|L[ée]gende|Plan d.assemblage|Carroyage|Lambert|RGF\s?93|Classe de pr[ée]cision|Type r[ée]seau|EPSG|Nivellement|IGN\s?69/i

/** Words of three letters or more: coordinates and network labels on a
 *  plan are mostly numbers and codes, a letter is mostly words. */
const nombreDeMots = (texte: string) => (texte.match(/\p{L}{3,}/gu) ?? []).length

export function natureDePage(texte: string, largeur: number, hauteur: number, champsRecepisse: boolean): Nature {
  if (champsRecepisse || (RECEPISSE.test(texte) && RECEPISSE_BLOC.test(texte))) return 'recepisse'
  const redige = DOCUMENT.test(texte) && nombreDeMots(texte) > 120
  if (redige) return 'document'
  if (PLAN.test(texte)) return 'plan'
  if (largeur * hauteur > 1.3 * A4 || largeur > hauteur * 1.05) return 'plan'
  // Next to nothing to read: a scanned or purely graphic sheet.
  if (nombreDeMots(texte) < 15) return 'plan'
  return 'document'
}

interface Item {
  str: string
  x: number
  y: number
}

/** Text items gathered into lines, top to bottom, left to right. */
export function lignes(items: Item[]): string[] {
  const tries = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const groupes: Item[][] = []
  for (const it of tries) {
    const g = groupes[groupes.length - 1]
    if (g && Math.abs(g[0].y - it.y) < 2.5) g.push(it)
    else groupes.push([it])
  }
  return groupes.map((g) =>
    g
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str.trim())
      .join(' '),
  )
}

const propre = (s: string | null | undefined): string | null => {
  const t = (s ?? '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim()
  return t && /[\p{L}\d]/u.test(t) ? t : null
}

function chercher(lignesTexte: string[], motif: RegExp): string | null {
  for (const l of lignesTexte) {
    const m = l.match(motif)
    if (m) {
      // Stop at the next label of the form when two columns share a line.
      const v = propre(m[1].split(/\s{2,}|\s(?=[A-ZÉ][\p{L}' /]{2,30}\s?:)/u)[0])
      if (v) return v
    }
  }
  return null
}

/** Receipt fields, from the form fields of the Cerfa 14435 when the PDF
 *  keeps them, otherwise from its printed text. */
export function lireRecepisse(champs: Record<string, unknown>, lignesTexte: string[]): Recepisse {
  const champ = (nom: string): string | null => {
    const v = champs[nom]
    return propre(Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : null)
  }
  const coche = (nom: string) => (nom in champs ? champs[nom] !== 'Off' && champs[nom] !== '' && champs[nom] != null : null)

  const categories = new Set<string>()
  for (const n of ['CategorieReseau1', 'CategorieReseau2', 'CategorieReseau3']) {
    const c = champ(n)
    if (c && estCategorie(c)) categories.add(c)
  }
  if (!categories.size) {
    const l = lignesTexte.find((t) => /de\s+cat[ée]gorie\s*:/i.test(t))
    const apres = l?.split(/cat[ée]gorie\s*:/i)[1] ?? ''
    for (const c of apres.match(/\b[A-Z]{2}\b/g) ?? []) if (estCategorie(c)) categories.add(c)
  }

  return {
    exploitant: champ('RaisonSocialeExploitant') ?? chercher(lignesTexte, /Raison\s+sociale\s*:\s*(.+)$/i),
    contact: champ('ContactExploitant') ?? chercher(lignesTexte, /Personne [àa] contacter\s*:\s*(.+)$/i),
    categories: [...categories],
    consultation:
      champ('NoGU') ?? chercher(lignesTexte, /consultation du t[ée]l[ée]service\s*:\s*([0-9]{6,}[A-Z]?)/i),
    commune: champ('CommuneTravaux') ?? chercher(lignesTexte, /Commune principale des travaux\s*:\s*(.+)$/i),
    adresse: champ('AdresseTravaux') ?? chercher(lignesTexte, /Adresse des travaux pr[ée]vus\s*:\s*(.+)$/i),
    concerne: coche('Concerne') ? true : coche('PasConcerne') ? false : null,
  }
}

/** 53-bit string hash (cyrb53), enough to tell pages apart. */
function empreinteDe(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

function categorieDuPlan(texte: string): string | null {
  const m = texte.match(/Type\s+(?:de\s+)?r[ée]seau\s*:\s*(?:([A-Z]{2})\b|[^()]{0,60}\(([A-Z]{2})\))/i)
  const c = m ? (m[1] ?? m[2]).toUpperCase() : null
  return c && estCategorie(c) ? c : null
}

async function analyserPage(page: PDFPageProxy): Promise<PageAnalysee> {
  const vue = page.getViewport({ scale: 1 })
  const contenu = await page.getTextContent()
  const items: Item[] = []
  const etiquettes: Etiquette[] = []
  for (const i of contenu.items) {
    if (!('str' in i)) continue
    items.push({ str: i.str, x: i.transform[4], y: i.transform[5] })
    const lue = lireEtiquette(i.str)
    if (lue) {
      // Centre of the label, whatever its direction: labels are centred
      // on their grid line.
      const [a, b, c, d, e, f] = i.transform
      const nb = Math.hypot(a, b) || 1
      const nh = Math.hypot(c, d) || 1
      const x = e + (a / nb) * (i.width / 2) + (c / nh) * i.height * 0.35
      const y = f + (b / nb) * (i.width / 2) + (d / nh) * i.height * 0.35
      etiquettes.push({ ...lue, x, y })
    }
  }
  const texte = items
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  const champs: Record<string, unknown> = {}
  for (const a of await page.getAnnotations()) {
    if (a.subtype === 'Widget' && a.fieldName) champs[a.fieldName] = a.fieldValue
  }
  const champsRecepisse = 'RaisonSocialeExploitant' in champs || 'NoGU' in champs
  const nature = natureDePage(texte, vue.width, vue.height, champsRecepisse)
  const plan = nature === 'plan'
  const traces = plan ? await lireTraces(page) : []
  const folio = texte.match(/\bFolio\b\s*(?:n°\s*)?:?\s*([A-Z]?\d[\w.-]*)/i)?.[1] ?? null

  return {
    index: page.pageNumber - 1,
    largeur: vue.width,
    hauteur: vue.height,
    nature,
    empreinte: nature !== 'recepisse' && texte.length >= 40 ? empreinteDe(`${Math.round(vue.width)}x${Math.round(vue.height)}|${texte}`) : null,
    folio,
    categorie: categorieDuPlan(texte),
    recepisse: nature === 'recepisse' ? lireRecepisse(champs, lignes(items)) : null,
    etiquettes: plan ? etiquettes : [],
    indiceCrs: crsIndique(texte),
    assemblage: /Plan d.assemblage|Tableau d.assemblage|assemblage des folios/i.test(texte),
    boite: page.view as Rect,
    rectangles: rectangles(traces),
    dessinees: plan && !etiquettes.length ? etiquettesDessinees(traces) : [],
    echelle: Number(texte.match(/[ÉE]chelle\s*:?\s*1\s*[:/]\s*(\d{1,3}(?:[ \u00a0]\d{3})+|\d+)\b/i)?.[1].replace(/\s/g, '')) || null,
  }
}

export async function analyserDocument(doc: PDFDocumentProxy, progression?: (fait: number) => void): Promise<PageAnalysee[]> {
  const pages: PageAnalysee[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    pages.push(await analyserPage(page))
    page.cleanup()
    progression?.(n)
  }
  return pages
}
