/**
 * Files in and out of the browser: reading a workbook dropped by the user
 * into sheets of raw cells, and handing a generated file back as a
 * download (copied into the open dossier, if any). Nothing is sent to a
 * server.
 */

import type { Workbook } from 'exceljs'
import { copierExport } from './dossier/session.ts'
import type { Cell } from './resultats/parse.ts'

export interface Feuille {
  nom: string
  grille: Cell[][]
}

/**
 * Text of a CSV: UTF-8 when the bytes are valid UTF-8, else Windows-1252
 * (the encoding of a CSV saved by a French Excel).
 */
export function decoderTexte(octets: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(octets)
  }
}

/** Every sheet of an Excel or CSV file, as rows of raw cell values. */
export async function lireFeuilles(fichier: File, options: { cellDates?: boolean } = {}): Promise<Feuille[]> {
  const XLSX = await import('xlsx')
  const octets = await fichier.arrayBuffer()
  // A CSV is decoded here: read as bytes, SheetJS takes UTF-8 for Latin-1
  // ("Naphtalène" → "NaphtalÃ¨ne"). A French CSV (";" separator) keeps its
  // cells as text: SheetJS would read the decimal comma as a thousands
  // separator ("0,4" → 4); the readers of the tools convert "0,4" themselves.
  if (/\.(csv|txt)$/i.test(fichier.name) || /^text\//.test(fichier.type)) {
    const texte = decoderTexte(octets)
    const premiere = texte.split(/\r?\n/, 1)[0] ?? ''
    const pointVirgule = (premiere.match(/;/g) ?? []).length > (premiere.match(/,/g) ?? []).length
    const classeur = XLSX.read(texte, { type: 'string', ...(pointVirgule ? { FS: ';', raw: true } : {}), ...(options.cellDates && !pointVirgule ? { cellDates: true } : {}) })
    return classeur.SheetNames.map((nom) => ({
      nom,
      grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
    }))
  }
  const classeur = XLSX.read(octets, { type: 'array', ...(options.cellDates ? { cellDates: true } : {}) })
  return classeur.SheetNames.map((nom) => ({
    nom,
    grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
  }))
}

/**
 * Saves a blob under the given file name. With a dossier open, a copy also
 * goes to its exports/ folder.
 */
export function telechargerBlob(blob: Blob, nomFichier: string): void {
  void copierExport(blob, nomFichier).catch(() => undefined)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked a moment later, not immediately: Safari cancels a download whose
  // object URL disappears in the same turn of the event loop.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Writes an ExcelJS workbook and saves it as .xlsx. */
export async function telechargerClasseurExcel(wb: Workbook, nomFichier: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  telechargerBlob(new Blob([buffer], { type: TYPE_XLSX }), nomFichier)
}
