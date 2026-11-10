/**
 * Files in and out of the browser: reading a workbook dropped by the user
 * into sheets of raw cells, and handing a generated file back as a
 * download. Nothing is sent to a server.
 */

import type { Workbook } from 'exceljs'
import type { Cell } from './resultats/parse.ts'

export interface Feuille {
  nom: string
  grille: Cell[][]
}

/** Every sheet of an Excel or CSV file, as rows of raw cell values. */
export async function lireFeuilles(fichier: File, options: { cellDates?: boolean } = {}): Promise<Feuille[]> {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(await fichier.arrayBuffer(), { type: 'array', ...(options.cellDates ? { cellDates: true } : {}) })
  return classeur.SheetNames.map((nom) => ({
    nom,
    grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
  }))
}

/** Saves a blob under the given file name. */
export function telechargerBlob(blob: Blob, nomFichier: string): void {
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
