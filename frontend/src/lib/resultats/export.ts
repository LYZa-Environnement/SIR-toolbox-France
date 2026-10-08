/**
 * Writes lab results as an Excel table in the layout of the project
 * reference tables ("Tableau 4 – Résultats gaz du sol"), in two sheets:
 *
 * - « Mis en forme »: the results only, laid out;
 * - « Valeurs guides ERM »: the same with the ERM comparison value and its
 *   source on every row, and the sources listed under the table.
 *
 * Formatting is real conditional formatting, so it follows any value
 * corrected in Excel: italic grey below the quantification limit, plain when
 * there is no guide value or the result is below it, bold on grey above it.
 *
 * Gas and air samples on sorbent tubes get the conversion block: flow,
 * duration and volume rows, then per point the lab's mass and the
 * concentration — as formulas over those cells, results cached.
 */

import type { Borders, Cell as XCell, Fill, Workbook, Worksheet } from 'exceljs'
import { arrondiSignificatif, convertir, decimales, volumeLitres, type Prelevement, type UniteSortie } from './calc.ts'
import type { Couche, Lecture, Mesure, Parametre } from './parse.ts'

export interface Legende {
  titre: string
  sources: { code: string; libelle: string }[]
  reference: string
}

export interface OptionsExport {
  /** "eaux souterraines", "sols", "gaz du sol"… — used in titles. */
  libelleMatrice: string
  conversion: boolean
  titre: string
  sousTitre: string
  laboratoire: string
  /** Gas / air only. */
  unite: UniteSortie
  prelevements: Record<string, Prelevement>
  /** Comparison value per parameter key, in the row's unit — or, with
   *  conversion, in the output unit. */
  guides: Record<string, { valeur: number; source: string } | null>
  /** Header of the comparison column, e.g. "Valeur repère R1". */
  libelleGuide: string
  legende: Legende
}

// Colours of the ERM Office theme, as resolved in the reference table.
const VERT_ENTETE = 'FFCDDCD1' // accent 4 (#82A78D), tint 60 %
const GRIS_CONC = 'FFE6E7E5' // accent 6 (#82887E), tint 80 %
const GRIS_FAMILLE = 'FFF2F2F2'
const GRIS_LQ = 'FF808080'
const GRIS_DEPASSEMENT = 'FFBFBFBF'
const ENCRE = 'FF1C1C1C'
const POLICE = 'Verdana'

const plein = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const fin = { style: 'thin' as const, color: { argb: 'FF808080' } }
const bordure: Partial<Borders> = { top: fin, bottom: fin, left: fin, right: fin }

const LIBELLE_COUCHE: Record<Couche, string> = { CM: 'Couche de mesure', CC: 'Couche de contrôle' }

interface Style {
  gras?: boolean
  italique?: boolean
  taille?: number
  fond?: string
  couleur?: string
  h?: 'left' | 'center' | 'right'
  indent?: number
  fmt?: string
  bord?: boolean
  wrap?: boolean
}

function style(c: XCell, o: Style) {
  c.font = { name: POLICE, size: o.taille ?? 10, bold: o.gras, italic: o.italique, color: { argb: o.couleur ?? ENCRE } }
  if (o.fond) c.fill = plein(o.fond)
  c.alignment = { horizontal: o.h, vertical: 'middle', indent: o.indent, wrapText: o.wrap }
  if (o.fmt) c.numFmt = o.fmt
  if (o.bord !== false) c.border = bordure
}

function ecrire(ws: Worksheet, r: number, c: number, valeur: XCell['value'], o: Style = {}) {
  const cell = ws.getCell(r, c)
  cell.value = valeur
  style(cell, o)
  return cell
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

const lettre = (ws: Worksheet, c: number) => ws.getColumn(c).letter

/** Italic grey below the LQ, over a block of result cells. */
function regleLQ(ws: Worksheet, r1: number, c1: number, r2: number, c2: number) {
  if (r2 < r1 || c2 < c1) return
  const coin = `${lettre(ws, c1)}${r1}`
  ws.addConditionalFormatting({
    ref: `${coin}:${lettre(ws, c2)}${r2}`,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`LEFT(TRIM(${coin}),1)="<"`],
        style: { font: { italic: true, color: { argb: GRIS_LQ } } },
      },
    ],
  })
}

/** Bold on grey above the comparison value held in column `colGuide`. */
function regleDepassement(ws: Worksheet, r1: number, c1: number, r2: number, c2: number, colGuide: number) {
  if (r2 < r1 || c2 < c1) return
  const coin = `${lettre(ws, c1)}${r1}`
  const guide = `$${lettre(ws, colGuide)}${r1}`
  ws.addConditionalFormatting({
    ref: `${coin}:${lettre(ws, c2)}${r2}`,
    rules: [
      {
        type: 'expression',
        priority: 2,
        formulae: [`AND(ISNUMBER(${coin}),ISNUMBER(${guide}),${coin}>${guide})`],
        style: {
          font: { bold: true },
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GRIS_DEPASSEMENT } },
        },
      },
    ],
  })
}

function ecrireGuide(ws: Worksheet, r: number, c: number, g: { valeur: number; source: string } | null | undefined) {
  ecrire(ws, r, c, g ? g.valeur : '-', { h: 'center', fmt: 'General' })
  ecrire(ws, r, c + 1, g ? g.source : '-', { h: 'center' })
}

function ecrireNomParametre(ws: Worksheet, r: number, pa: Parametre, avecUnite = false) {
  const nom = avecUnite && pa.versMicrogrammes !== 1 ? `${pa.nom} (${pa.unite})` : pa.nom
  ecrire(ws, r, 1, nom, { italique: pa.somme, h: pa.somme ? 'right' : 'left', indent: 1 })
}

function ligneFamille(ws: Worksheet, r: number, famille: string, largeur: number) {
  ws.mergeCells(r, 1, r, largeur)
  ecrire(ws, r, 1, famille.toUpperCase(), { gras: true, fond: GRIS_FAMILLE })
}

// ---- Water and soil: one column per sample ---------------------------------

function tableauSimple(ws: Worksheet, lecture: Lecture, opts: OptionsExport, avecGuides: boolean): number {
  const { points } = lecture
  const parametres = lecture.parametres.CM
  const colPremier = avecGuides ? 5 : 3
  const largeur = colPremier - 1 + points.length
  const r0 = 4

  ws.getColumn(1).width = 40
  ws.getColumn(2).width = 13
  if (avecGuides) {
    ws.getColumn(3).width = 15
    ws.getColumn(4).width = 9
  }
  points.forEach((_, k) => (ws.getColumn(colPremier + k).width = 14))

  ws.getRow(r0).height = 32
  ecrire(ws, r0, 1, 'Composés', { gras: true, taille: 11, fond: VERT_ENTETE, h: 'center' })
  ecrire(ws, r0, 2, 'Unité', { gras: true, fond: VERT_ENTETE, h: 'center' })
  if (avecGuides) {
    ecrire(ws, r0, 3, opts.libelleGuide, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
    ecrire(ws, r0, 4, 'Source', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
  }
  points.forEach((p, k) => ecrire(ws, r0, colPremier + k, p.nom, { gras: true, fond: VERT_ENTETE, h: 'center', wrap: true }))

  let r = r0 + 1
  let famille: string | null = null
  const premiere = r
  for (const pa of parametres) {
    if (pa.famille && pa.famille !== famille) {
      famille = pa.famille
      ligneFamille(ws, r++, famille, largeur)
    }
    ecrireNomParametre(ws, r, pa)
    ecrire(ws, r, 2, pa.unite, { h: 'center' })
    if (avecGuides) ecrireGuide(ws, r, 3, opts.guides[pa.cle])
    points.forEach((p, k) => {
      const m = lecture.valeurs.CM[p.nom]?.[pa.cle]
      ecrire(ws, r, colPremier + k, m ? brutFrancais(m) : '-', { h: 'center' })
    })
    r++
  }
  regleLQ(ws, premiere, colPremier, r - 1, largeur)
  if (avecGuides) regleDepassement(ws, premiere, colPremier, r - 1, largeur, 3)
  return r
}

// ---- Gas and air: conversion blocks ----------------------------------------

function blocConversion(ws: Worksheet, ligne: number, lecture: Lecture, couche: Couche, opts: OptionsExport, avecGuides: boolean): number {
  const { points } = lecture
  const parametres = lecture.parametres[couche]
  const decalage = avecGuides ? 2 : 0
  const col = (k: number, sous: 0 | 1) => 2 + decalage + 2 * k + sous
  const fusion = (r: number, k: number) => ws.mergeCells(r, col(k, 0), r, col(k, 1))
  const rDebit = ligne + 1
  const rDuree = ligne + 2
  const rVolL = ligne + 3
  const rVolM3 = ligne + 4
  const uniteSortie = opts.unite === 'µg/m³' ? 'µg/m3' : 'mg/m3'

  ;['Débit de prélèvement (L/min)', 'Temps de prélèvement (min)', 'Volume prélevé (L)', 'Volume prélevé (m3)'].forEach((t, i) =>
    ecrire(ws, rDebit + i, 1, t, { h: 'right', indent: 1, bord: false }),
  )

  points.forEach((p, k) => {
    const l = lettre(ws, col(k, 0))
    const pr = opts.prelevements[p.nom] ?? { debitDebut: null, debitFin: null, duree: null }
    const vol = volumeLitres(pr)

    fusion(ligne, k)
    ecrire(ws, ligne, col(k, 0), p.nom, { gras: true, fond: VERT_ENTETE, h: 'center' })

    fusion(rDebit, k)
    const debit: XCell['value'] =
      pr.debitDebut !== null && pr.debitFin !== null
        ? { formula: `(${pr.debitDebut}+${pr.debitFin})/2`, result: (pr.debitDebut + pr.debitFin) / 2 }
        : (pr.debitDebut ?? pr.debitFin ?? null)
    ecrire(ws, rDebit, col(k, 0), debit, { h: 'center', fmt: '0.000' })

    fusion(rDuree, k)
    ecrire(ws, rDuree, col(k, 0), pr.duree, { h: 'center', fmt: '0' })

    fusion(rVolL, k)
    ecrire(ws, rVolL, col(k, 0), { formula: `IF(COUNT(${l}${rDebit},${l}${rDuree})<2,"",${l}${rDebit}*${l}${rDuree})`, result: vol ?? '' }, { h: 'center', fmt: '0.0' })

    fusion(rVolM3, k)
    ecrire(ws, rVolM3, col(k, 0), { formula: `IF(${l}${rVolL}="","",${l}${rVolL}/1000)`, result: vol === null ? '' : vol / 1000 }, { h: 'center', fmt: '0.0000' })
  })

  // Column headings.
  const rTitres = ligne + 5
  const rUnites = ligne + 7
  ws.getRow(rTitres).height = 15
  ws.getRow(rTitres + 1).height = 15
  ws.mergeCells(rTitres, 1, rTitres + 1, 1)
  ecrire(ws, rTitres, 1, 'Composés', { gras: true, taille: 11, fond: VERT_ENTETE, h: 'center' })
  ecrire(ws, rUnites, 1, null, { fond: VERT_ENTETE })
  if (avecGuides) {
    ws.mergeCells(rTitres, 2, rTitres + 1, 2)
    ecrire(ws, rTitres, 2, opts.libelleGuide, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
    ws.mergeCells(rTitres, 3, rTitres + 1, 3)
    ecrire(ws, rTitres, 3, 'Source', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
    ecrire(ws, rUnites, 2, uniteSortie, { h: 'center' })
    ecrire(ws, rUnites, 3, null, {})
  }
  const uniteBrute = parametres[0]?.unite.replace(/\s+/g, '') || 'µg/support'
  points.forEach((_, k) => {
    for (const [sous, texte] of [[0, LIBELLE_COUCHE[couche]], [1, 'Concentration']] as const) {
      ws.mergeCells(rTitres, col(k, sous), rTitres + 1, col(k, sous))
      ecrire(ws, rTitres, col(k, sous), texte, { gras: true, taille: sous ? 9 : 10, fond: VERT_ENTETE, h: 'center', wrap: true })
    }
    ecrire(ws, rUnites, col(k, 0), uniteBrute, { h: 'center' })
    ecrire(ws, rUnites, col(k, 1), uniteSortie, { h: 'center', fond: GRIS_CONC })
  })

  let r = rUnites + 1
  const premiere = r
  let famille: string | null = null
  const largeur = 1 + decalage + 2 * points.length
  for (const pa of parametres) {
    if (pa.famille && pa.famille !== famille) {
      famille = pa.famille
      ligneFamille(ws, r++, famille, largeur)
    }
    ecrireNomParametre(ws, r, pa, true)
    if (avecGuides) ecrireGuide(ws, r, 2, opts.guides[pa.cle])
    points.forEach((p, k) => {
      const m = lecture.valeurs[couche][p.nom]?.[pa.cle]
      const lb = lettre(ws, col(k, 0))
      ecrire(ws, r, col(k, 0), m ? brutFrancais(m) : '-', { h: 'center' })

      const conc = convertir(m, pa, volumeLitres(opts.prelevements[p.nom] ?? { debitDebut: null, debitFin: null, duree: null }), opts.unite)
      const facteur = pa.versMicrogrammes / (opts.unite === 'mg/m³' ? 1000 : 1)
      const x = `${lb}${r}`
      const v = `$${lb}$${rVolM3}`
      const masse = `_xlfn.NUMBERVALUE(MID(${x},2,20),",")*${facteur}/${v}`
      ecrire(
        ws,
        r,
        col(k, 1),
        {
          formula:
            `IF(OR(${x}="",${x}="-",N(${v})=0),"-",` +
            `IF(LEFT(${x},1)="<","<"&ROUND(${masse},1-INT(LOG10(${masse}))),${x}*${facteur}/${v}))`,
          result: conc ? (conc.inferieur ? `<${String(arrondiSignificatif(conc.valeur)).replace('.', ',')}` : conc.valeur) : '-',
        },
        { h: 'center', fond: GRIS_CONC, fmt: conc && !conc.inferieur ? formatNombre(conc.valeur) : undefined },
      )
    })
    r++
  }
  regleLQ(ws, premiere, 2 + decalage, r - 1, largeur)
  if (avecGuides) points.forEach((_, k) => regleDepassement(ws, premiere, col(k, 1), r - 1, col(k, 1), 2))
  return r
}

// ---- Legend and sources under the table ------------------------------------

function legende(ws: Worksheet, r: number, opts: OptionsExport, avecGuides: boolean): number {
  const c = 1
  ecrire(ws, r++, c, 'Légende :', { gras: true, bord: false })
  const exemples: [string | number, Style, string][] = [
    ['<0,10', { italique: true, couleur: GRIS_LQ }, 'Concentration inférieure à la limite de quantification du laboratoire'],
    [
      1.7,
      {},
      avecGuides
        ? 'Concentration inférieure à la valeur de comparaison, ou absence de valeur de comparaison'
        : 'Concentration supérieure à la limite de quantification du laboratoire',
    ],
  ]
  if (avecGuides) exemples.push([12, { gras: true, fond: GRIS_DEPASSEMENT }, 'Concentration supérieure à la valeur de comparaison'])
  for (const [valeur, s, texte] of exemples) {
    ecrire(ws, r, c, valeur, { ...s, h: 'right', bord: false })
    ecrire(ws, r, c + 1, texte, { bord: false })
    r++
  }
  r++
  if (opts.conversion) {
    ecrire(
      ws,
      r++,
      c,
      `Concentration (${opts.unite === 'µg/m³' ? 'µg/m3' : 'mg/m3'}) = masse sur le support (µg) / volume prélevé (m3)` +
        (opts.unite === 'mg/m³' ? ' / 1000' : '') +
        ' ; volume prélevé (L) = débit (L/min) × temps de prélèvement (min).',
      { italique: true, taille: 9, bord: false },
    )
  }
  if (opts.laboratoire) ecrire(ws, r++, c, `Analyses réalisées par le laboratoire ${opts.laboratoire}.`, { taille: 9, bord: false })
  if (avecGuides) {
    r++
    ecrire(ws, r++, c, opts.legende.titre, { gras: true, taille: 9, bord: false })
    ecrire(ws, r++, c, 'Sources :', { taille: 9, bord: false })
    for (const s of opts.legende.sources) ecrire(ws, r++, c, `${s.code} ${s.libelle}`, { taille: 9, bord: false })
    ecrire(ws, r++, c, opts.legende.reference, { italique: true, taille: 9, bord: false })
  }
  return r
}

function feuille(wb: Workbook, nom: string, lecture: Lecture, opts: OptionsExport, avecGuides: boolean) {
  const ws = wb.addWorksheet(nom, { views: [{ state: 'frozen', xSplit: 1, ySplit: 0, showGridLines: false }] })
  ecrire(ws, 1, 1, opts.titre, { gras: true, taille: 12, bord: false })
  ecrire(ws, 2, 1, opts.sousTitre, { bord: false })
  ws.getRow(1).height = 18

  let r: number
  if (opts.conversion) {
    ws.getColumn(1).width = 40
    if (avecGuides) {
      ws.getColumn(2).width = 14
      ws.getColumn(3).width = 9
    }
    lecture.points.forEach((_, k) => {
      ws.getColumn(2 + (avecGuides ? 2 : 0) + 2 * k).width = 13
      ws.getColumn(3 + (avecGuides ? 2 : 0) + 2 * k).width = 15
    })
    r = 4
    const couches: Couche[] = lecture.coucheControle ? ['CM', 'CC'] : ['CM']
    for (const couche of couches) {
      if (!lecture.parametres[couche].length) continue
      r = blocConversion(ws, r, lecture, couche, opts, avecGuides) + 2
    }
  } else {
    r = tableauSimple(ws, lecture, opts, avecGuides) + 2
  }
  legende(ws, r, opts, avecGuides)
}

export async function construireClasseur(lecture: Lecture, opts: OptionsExport): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true
  feuille(wb, 'Mis en forme', lecture, opts, false)
  feuille(wb, 'Valeurs guides ERM', lecture, opts, true)
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
