/**
 * The text of a deliverable, read in the browser: PDF (pdf.js), Word
 * (.docx, its document XML) or plain text. Page numbers are kept for PDF,
 * so that a check can say where it found what it looked for.
 */

export interface Document {
  nom: string
  /** One entry per page (PDF) or a single one (Word, text). */
  pages: string[]
  /** Pages with almost no text: a scanned PDF needs OCR first. */
  pagesSansTexte: number
}

async function lirePdf(donnees: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pdf = await pdfjs.getDocument({ data: donnees }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const contenu = await (await pdf.getPage(i)).getTextContent()
    let t = ''
    for (const it of contenu.items) {
      if (!('str' in it)) continue
      t += it.str + (it.hasEOL ? '\n' : ' ')
    }
    pages.push(t)
  }
  return pages
}

async function lireDocx(donnees: ArrayBuffer): Promise<string[]> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(donnees)
  const parties = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(n))
  let t = ''
  for (const n of parties.sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b)))) {
    const xml = await zip.file(n)!.async('string')
    t +=
      xml
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'") + '\n'
  }
  return [t]
}

export async function lireDocument(f: File): Promise<Document> {
  const donnees = await f.arrayBuffer()
  let pages: string[]
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') pages = await lirePdf(donnees)
  else if (/\.docx$/i.test(f.name)) pages = await lireDocx(donnees)
  else if (/\.(txt|md)$/i.test(f.name) || f.type.startsWith('text/')) pages = [new TextDecoder().decode(donnees)]
  else throw new Error('Format non pris en charge : déposez un PDF, un document Word (.docx) ou un fichier texte.')
  return { nom: f.name, pages, pagesSansTexte: pages.filter((p) => p.replace(/\s/g, '').length < 40).length }
}

/** Accents and case folded, spaces collapsed: what the checks search in. */
export function plier(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()
}
