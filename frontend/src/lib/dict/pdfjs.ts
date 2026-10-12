import { AnnotationMode, GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import travailleur from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { Affine } from './calage'
import type { Rendu } from './reseau'

// Legacy build: the modern one relies on very recent JavaScript
// (Math.sumPrecise…) that current browsers do not all have yet.
GlobalWorkerOptions.workerSrc = travailleur

/** Files pdf.js loads on demand: standard fonts (the ✔ of receipts is
 *  ZapfDingbats), decoders of JBIG2 / JPEG 2000 images (scanned plans) and
 *  character maps. Vite serves them under hashed names, so pdf.js is
 *  handed a factory rather than a base URL. */
const RESSOURCES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries({
    standardFontDataUrl: import.meta.glob<string>('/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', {
      query: '?url',
      import: 'default',
      eager: true,
    }),
    wasmUrl: import.meta.glob<string>('/node_modules/pdfjs-dist/wasm/{jbig2,openjpeg,qcms_bg}.wasm', { query: '?url', import: 'default', eager: true }),
    cMapUrl: import.meta.glob<string>('/node_modules/pdfjs-dist/cmaps/*.bcmap', { query: '?url', import: 'default', eager: true }),
  }).map(([type, fichiers]) => [type, Object.fromEntries(Object.entries(fichiers).map(([chemin, url]) => [chemin.split('/').pop()!, url]))]),
)

class Ressources {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = RESSOURCES[kind]?.[filename]
    if (!url) throw new Error(`Ressource pdf.js absente : ${filename}`)
    const reponse = await fetch(url)
    if (!reponse.ok) throw new Error(`Ressource pdf.js inaccessible : ${filename}`)
    return new Uint8Array(await reponse.arrayBuffer())
  }
}

export interface PdfOuvert {
  doc: PDFDocumentProxy
  fermer: () => void
}

/** pdf.js takes ownership of the buffer it is given: it gets a copy, the
 *  original bytes stay with the caller. */
export async function ouvrir(octets: Uint8Array): Promise<PdfOuvert> {
  const tache = getDocument({ data: octets.slice(), BinaryDataFactory: Ressources, useWorkerFetch: false })
  return { doc: await tache.promise, fermer: () => void tache.destroy() }
}

async function rendre(doc: PDFDocumentProxy, index: number, echelle: (largeur: number) => number) {
  const page = await doc.getPage(index + 1)
  const base = page.getViewport({ scale: 1 })
  const vue = page.getViewport({ scale: echelle(base.width) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vue.width)
  canvas.height = Math.round(vue.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // Form fields drawn too: a receipt's values are form fields.
  await page.render({ canvas, canvasContext: ctx, viewport: vue, annotationMode: AnnotationMode.ENABLE }).promise
  page.cleanup()
  const t = vue.transform
  // pdf.js matrices are column-wise; ours are row-wise.
  const versPixel: Affine = [t[0], t[2], t[4], t[1], t[3], t[5]]
  return { canvas, ctx, versPixel }
}

export async function vignette(doc: PDFDocumentProxy, index: number, largeurPx = 220): Promise<string> {
  const { canvas } = await rendre(doc, index, (l) => largeurPx / l)
  return canvas.toDataURL('image/jpeg', 0.72)
}

/** Page as pixels, `pixelsParPoint` pixels for each PDF point. */
export async function rendrePage(doc: PDFDocumentProxy, index: number, pixelsParPoint: number): Promise<Rendu> {
  const { canvas, ctx, versPixel } = await rendre(doc, index, () => pixelsParPoint)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  canvas.width = canvas.height = 0
  return { rgba: image.data, largeur: image.width, hauteur: image.height, versPixel }
}

/** Page as an image to point at, for the manual georeferencing. */
export async function imagePage(doc: PDFDocumentProxy, index: number, largeurPx: number): Promise<{ url: string; versPixel: Affine; largeur: number; hauteur: number }> {
  const { canvas, versPixel } = await rendre(doc, index, (l) => largeurPx / l)
  const url = canvas.toDataURL('image/png')
  return { url, versPixel, largeur: canvas.width, hauteur: canvas.height }
}
