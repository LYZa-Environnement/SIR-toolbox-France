/**
 * Extracting an inventory to a spreadsheet.
 *
 * A reader who has found fifteen classified installations around a site is
 * usually building a report, not just reading a page. Retyping the list is
 * where errors get introduced, so the same rows the rubrique shows can be
 * downloaded as they stand.
 *
 * An Excel workbook rather than a CSV: the reference of each record links to
 * its official fiche (Géorisques, BRGM), and a CSV cannot carry a link.
 * ExcelJS is loaded only when the reader asks for the file.
 */

import type { LigneTableau } from '../types/site'

const COLONNES: [string, number][] = [
  ['Référence', 16],
  ['Nom du site', 40],
  ['Activités', 70],
  ['Distance (m)', 12],
  ['Direction', 12],
  ['Fiche en ligne', 18],
]

/** Turns a block title into a usable file name — "Détail des installations
 * classées" becomes "detail-des-installations-classees". */
export function nomFichier(titre: string, suffixe: string): string {
  const base = titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'extraction'}-${suffixe}.xlsx`
}

export async function telechargerTableau(lignes: LigneTableau[], titre: string, nom: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  // Excel caps sheet names at 31 characters: rather than a title cut mid-word.
  const nomOnglet = titre.length <= 31 ? titre.replace(/[\\/?*[\]:]/g, ' ') : 'Extraction'
  const ws = wb.addWorksheet(nomOnglet, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLONNES.map(([header, width]) => ({ header, width }))
  const entete = ws.getRow(1)
  entete.font = { bold: true }
  entete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCDDCD1' } }
  const lien = { color: { argb: 'FF00756A' }, underline: true } as const
  for (const ligne of lignes) {
    const row = ws.addRow([
      ligne.url && ligne.reference ? { text: ligne.reference, hyperlink: ligne.url } : ligne.reference,
      ligne.nom,
      ligne.activites,
      ligne.distanceM === null ? null : Math.round(ligne.distanceM),
      ligne.direction,
      ligne.url ? { text: 'Consulter la fiche', hyperlink: ligne.url } : null,
    ])
    row.alignment = { vertical: 'top', wrapText: true }
    if (ligne.url) {
      if (ligne.reference) row.getCell(1).font = lien
      row.getCell(6).font = lien
    }
  }
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked on the next tick, not immediately: Safari cancels a download whose
  // object URL disappears in the same turn of the event loop.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
