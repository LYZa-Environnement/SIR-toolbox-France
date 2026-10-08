/**
 * Writes the conversion as an Excel table in the layout of the project
 * "Tableau 4 – Résultats gaz du sol": one block per layer (couche de mesure,
 * then couche de contrôle), two columns per point — the lab's raw mass and
 * the concentration — under the flow, duration and volume rows.
 *
 * Volumes and concentrations are written as formulas over the flow and
 * duration cells, with their computed results cached, so the file stays
 * traceable and a corrected flow in Excel carries through.
 */

import type { Workbook, Worksheet, Cell as XCell, Fill, Borders } from 'exceljs'
import { arrondiSignificatif, convertir, decimales, volumeLitres, type Prelevement, type UniteSortie } from './calc.ts'
import type { Couche, Lecture, Mesure, Parametre } from './parse.ts'

export interface OptionsExport {
  titre: string
  sousTitre: string
  unite: UniteSortie
  prelevements: Record<string, Prelevement>
}

// Colours of the ERM Office theme, as resolved in the reference table.
const VERT_ENTETE = 'FFCDDCD1' // accent 4 (#82A78D), tint 60 %
const GRIS_CONC = 'FFE6E7E5' // accent 6 (#82887E), tint 80 %
const GRIS_FAMILLE = 'FFF2F2F2'
const GRIS_LQ = 'FFA6A6A6'
const ENCRE = 'FF1C1C1C'
const POLICE = 'Verdana'

const plein = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const fin = { style: 'thin' as const, color: { argb: 'FF808080' } }
const bordure: Partial<Borders> = { top: fin, bottom: fin, left: fin, right: fin }

const LIBELLE_COUCHE: Record<Couche, string> = { CM: 'Couche de mesure', CC: 'Couche de contrôle' }

function style(c: XCell, opts: { gras?: boolean; italique?: boolean; taille?: number; fond?: string; couleur?: string; h?: 'left' | 'center' | 'right'; indent?: number; fmt?: string; bord?: boolean; wrap?: boolean }) {
  c.font = { name: POLICE, size: opts.taille ?? 10, bold: opts.gras, italic: opts.italique, color: { argb: opts.couleur ?? ENCRE } }
  if (opts.fond) c.fill = plein(opts.fond)
  c.alignment = { horizontal: opts.h, vertical: 'middle', indent: opts.indent, wrapText: opts.wrap }
  if (opts.fmt) c.numFmt = opts.fmt
  if (opts.bord !== false) c.border = bordure
}

/** "<0.16" → "<0,16": the tables are read in French Excel. */
function brutFrancais(m: Mesure): string | number {
  if (!m.inferieur && m.valeur !== null) return m.valeur
  return m.brut.replace(/\s/g, '').replace('.', ',')
}

function formatNombre(x: number): string {
  const d = decimales(x)
  return d ? `0.${'0'.repeat(d)}` : '0'
}

function bloc(ws: Worksheet, ligne: number, lecture: Lecture, couche: Couche, opts: OptionsExport): number {
  const { points } = lecture
  const parametres = lecture.parametres[couche]
  const col = (k: number, sous: 0 | 1) => 2 + 2 * k + sous
  const fusion = (r: number, k: number) => ws.mergeCells(r, col(k, 0), r, col(k, 1))
  const rDebit = ligne + 1
  const rDuree = ligne + 2
  const rVolL = ligne + 3
  const rVolM3 = ligne + 4

  const etiquettes = ['Débit de prélèvement (L/min)', 'Temps de prélèvement (min)', 'Volume prélevé (L)', 'Volume prélevé (m3)']
  etiquettes.forEach((t, i) => {
    const c = ws.getCell(rDebit + i, 1)
    c.value = t
    style(c, { h: 'right', indent: 1, bord: false })
  })

  points.forEach((p, k) => {
    const lettre = ws.getColumn(col(k, 0)).letter
    const pr = opts.prelevements[p.nom] ?? { debitDebut: null, debitFin: null, duree: null }
    const vol = volumeLitres(pr)

    fusion(ligne, k)
    style(ws.getCell(ligne, col(k, 0)), { gras: true, fond: VERT_ENTETE, h: 'center' })
    ws.getCell(ligne, col(k, 0)).value = p.nom

    fusion(rDebit, k)
    const cDebit = ws.getCell(rDebit, col(k, 0))
    if (pr.debitDebut !== null && pr.debitFin !== null) {
      cDebit.value = { formula: `(${pr.debitDebut}+${pr.debitFin})/2`, result: (pr.debitDebut + pr.debitFin) / 2 }
    } else {
      cDebit.value = pr.debitDebut ?? pr.debitFin ?? null
    }
    style(cDebit, { h: 'center', fmt: '0.000' })

    fusion(rDuree, k)
    ws.getCell(rDuree, col(k, 0)).value = pr.duree
    style(ws.getCell(rDuree, col(k, 0)), { h: 'center', fmt: '0' })

    fusion(rVolL, k)
    ws.getCell(rVolL, col(k, 0)).value = {
      formula: `IF(COUNT(${lettre}${rDebit},${lettre}${rDuree})<2,"",${lettre}${rDebit}*${lettre}${rDuree})`,
      result: vol ?? '',
    }
    style(ws.getCell(rVolL, col(k, 0)), { h: 'center', fmt: '0.0' })

    fusion(rVolM3, k)
    ws.getCell(rVolM3, col(k, 0)).value = {
      formula: `IF(${lettre}${rVolL}="","",${lettre}${rVolL}/1000)`,
      result: vol === null ? '' : vol / 1000,
    }
    style(ws.getCell(rVolM3, col(k, 0)), { h: 'center', fmt: '0.0000' })
  })

  // Column headings: "Composés" | per point "Couche de …" / "Concentration".
  const rTitres = ligne + 5
  const rUnites = ligne + 7
  ws.getRow(rTitres).height = 15
  ws.getRow(rTitres + 1).height = 15
  ws.mergeCells(rTitres, 1, rTitres + 1, 1)
  ws.getCell(rTitres, 1).value = 'Composés'
  style(ws.getCell(rTitres, 1), { gras: true, taille: 11, fond: VERT_ENTETE, h: 'center' })
  const cUnites = ws.getCell(rUnites, 1)
  style(cUnites, { fond: VERT_ENTETE })
  points.forEach((_, k) => {
    for (const [sous, texte] of [[0, LIBELLE_COUCHE[couche]], [1, 'Concentration']] as const) {
      ws.mergeCells(rTitres, col(k, sous), rTitres + 1, col(k, sous))
      const c = ws.getCell(rTitres, col(k, sous))
      c.value = texte
      style(c, { gras: true, taille: sous ? 9 : 10, fond: VERT_ENTETE, h: 'center', wrap: true })
    }
    const unite = lecture.parametres[couche][0]?.unite.replace(/\s+/g, '') || 'µg/support'
    ws.getCell(rUnites, col(k, 0)).value = unite
    style(ws.getCell(rUnites, col(k, 0)), { h: 'center' })
    ws.getCell(rUnites, col(k, 1)).value = opts.unite === 'µg/m³' ? 'µg/m3' : 'mg/m3'
    style(ws.getCell(rUnites, col(k, 1)), { h: 'center', fond: GRIS_CONC })
  })

  // Families and parameters.
  let r = rUnites + 1
  let famille: string | null = null
  const largeur = 1 + 2 * points.length
  const ecrireParametre = (pa: Parametre) => {
    const nom = ws.getCell(r, 1)
    nom.value = pa.versMicrogrammes === 1 ? pa.nom : `${pa.nom} (${pa.unite})`
    style(nom, { italique: pa.somme, h: pa.somme ? 'right' : 'left', indent: 1 })
    points.forEach((p, k) => {
      const m = lecture.valeurs[couche][p.nom]?.[pa.cle]
      const lettreBrut = ws.getColumn(col(k, 0)).letter
      const cBrut = ws.getCell(r, col(k, 0))
      const cConc = ws.getCell(r, col(k, 1))
      cBrut.value = m ? brutFrancais(m) : '-'
      style(cBrut, { h: 'center', couleur: m?.inferieur ? GRIS_LQ : ENCRE })

      const pr = opts.prelevements[p.nom] ?? { debitDebut: null, debitFin: null, duree: null }
      const conc = convertir(m, pa, volumeLitres(pr), opts.unite)
      const facteur = pa.versMicrogrammes / (opts.unite === 'mg/m³' ? 1000 : 1)
      const x = `${lettreBrut}${r}`
      const v = `$${lettreBrut}$${rVolM3}`
      const masse = `_xlfn.NUMBERVALUE(MID(${x},2,20),",")*${facteur}/${v}`
      cConc.value = {
        formula:
          `IF(OR(${x}="",${x}="-",N(${v})=0),"-",` +
          `IF(LEFT(${x},1)="<","<"&ROUND(${masse},1-INT(LOG10(${masse}))),${x}*${facteur}/${v}))`,
        result: conc ? (conc.inferieur ? `<${String(arrondiSignificatif(conc.valeur)).replace('.', ',')}` : conc.valeur) : '-',
      }
      style(cConc, {
        h: 'center',
        fond: GRIS_CONC,
        couleur: conc?.inferieur ? GRIS_LQ : ENCRE,
        fmt: conc && !conc.inferieur ? formatNombre(conc.valeur) : undefined,
      })
    })
    r++
  }
  for (const pa of parametres) {
    if (pa.famille && pa.famille !== famille) {
      famille = pa.famille
      ws.mergeCells(r, 1, r, largeur)
      const c = ws.getCell(r, 1)
      c.value = famille.toUpperCase()
      style(c, { gras: true, fond: GRIS_FAMILLE })
      r++
    }
    ecrireParametre(pa)
  }
  return r
}

export async function construireClasseur(lecture: Lecture, opts: OptionsExport): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true
  const ws = wb.addWorksheet('Résultats', { views: [{ state: 'frozen', xSplit: 1, ySplit: 0, showGridLines: false }] })
  ws.getColumn(1).width = 40
  lecture.points.forEach((_, k) => {
    ws.getColumn(2 + 2 * k).width = 13
    ws.getColumn(3 + 2 * k).width = 15
  })

  ws.getCell(1, 1).value = opts.titre
  style(ws.getCell(1, 1), { gras: true, taille: 12, bord: false })
  ws.getCell(2, 1).value = opts.sousTitre
  style(ws.getCell(2, 1), { bord: false })
  ws.getRow(1).height = 18

  let r = 4
  const couches: Couche[] = lecture.coucheControle ? ['CM', 'CC'] : ['CM']
  for (const couche of couches) {
    if (!lecture.parametres[couche].length) continue
    r = bloc(ws, r, lecture, couche, opts) + 2
  }

  // Legend and method, as in the reference table.
  ws.getCell(r, 2).value = 'Légende :'
  style(ws.getCell(r, 2), { bord: false })
  ws.getCell(r + 1, 2).value = '<0,10'
  style(ws.getCell(r + 1, 2), { h: 'center', couleur: GRIS_LQ, bord: false })
  ws.getCell(r + 1, 3).value = 'Concentration inférieure à la limite de quantification du laboratoire'
  style(ws.getCell(r + 1, 3), { bord: false })
  ws.getCell(r + 2, 2).value = 1.7
  style(ws.getCell(r + 2, 2), { h: 'center', bord: false })
  ws.getCell(r + 2, 3).value = 'Concentration supérieure à la limite de quantification du laboratoire'
  style(ws.getCell(r + 2, 3), { bord: false })
  ws.getCell(r + 4, 2).value =
    `Concentration (${opts.unite === 'µg/m³' ? 'µg/m3' : 'mg/m3'}) = masse sur le support (µg) / volume prélevé (m3)` +
    (opts.unite === 'mg/m³' ? ' / 1000' : '') +
    ' ; volume prélevé (L) = débit (L/min) × temps de prélèvement (min).'
  style(ws.getCell(r + 4, 2), { italique: true, taille: 9, bord: false })
  return wb
}

export async function telechargerClasseur(lecture: Lecture, opts: OptionsExport, nomFichier: string) {
  const wb = await construireClasseur(lecture, opts)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
