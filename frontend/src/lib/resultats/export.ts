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
import {
  controleBlancs,
  controleDoublons,
  controlePercee,
  estControle,
  LIBELLES_TYPE,
  SEUIL_PERCEE,
  type PerceePoint,
  type Qualification,
} from './qualite.ts'
import { statistiques, valeursCompose } from './stats.ts'
import { dessinerCamembert, HAUTEUR, LARGEUR } from './camembert.ts'
import { signatures } from './signatures.ts'
import type { Position } from './expert/amontAval.ts'

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
  /** Gas / air only. */
  unite: UniteSortie
  prelevements: Record<string, Prelevement>
  /** Comparison value per parameter key, in the row's unit — or, with
   *  conversion, in the output unit. */
  guides: Record<string, { valeur: number; source: string } | null>
  /** Header of the comparison column, e.g. "Valeur repère R1". */
  libelleGuide: string
  legende: Legende
  /** Sample types (blanks, duplicates), as confirmed by the user. */
  qualifications: Record<string, Qualification>
  /** Duplicate acceptance, relative percent difference. */
  seuilDoublon: number
  /** Adds the expert sheets (statistics, degradation, PAH, ISDI). */
  expert?: boolean
  /** Groundwater: hydraulic position of each sample, for the upgradient /
   *  downgradient sheet, and the ratio taken as a real difference. */
  positions?: Record<string, Position>
  facteurAmontAval?: number
}

// Colours of the ERM Office theme, as resolved in the reference table.
export const VERT_ENTETE = 'FFCDDCD1' // accent 4 (#82A78D), tint 60 %
const GRIS_CONC = 'FFE6E7E5' // accent 6 (#82887E), tint 80 %
export const GRIS_FAMILLE = 'FFF2F2F2'
export const GRIS_LQ = 'FF808080'
export const GRIS_DEPASSEMENT = 'FFBFBFBF'
const ENCRE = 'FF1C1C1C'
const POLICE = 'Verdana'

const plein = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const fin = { style: 'thin' as const, color: { argb: 'FF808080' } }
const bordure: Partial<Borders> = { top: fin, bottom: fin, left: fin, right: fin }

const LIBELLE_COUCHE: Record<Couche, string> = { CM: 'Couche de mesure', CC: 'Couche de contrôle' }

export interface Style {
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
  souligne?: boolean
}

function style(c: XCell, o: Style) {
  c.font = { name: POLICE, size: o.taille ?? 10, bold: o.gras, italic: o.italique, underline: o.souligne, color: { argb: o.couleur ?? ENCRE } }
  if (o.fond) c.fill = plein(o.fond)
  c.alignment = { horizontal: o.h, vertical: 'middle', indent: o.indent, wrapText: o.wrap }
  if (o.fmt) c.numFmt = o.fmt
  if (o.bord !== false) c.border = bordure
}

export function ecrire(ws: Worksheet, r: number, c: number, valeur: XCell['value'], o: Style = {}) {
  const cell = ws.getCell(r, c)
  cell.value = valeur
  style(cell, o)
  return cell
}

/** "<0.16" → "<0,16": the tables are read in French Excel. */
export function brutFrancais(m: Mesure): string | number {
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

/** Underlined (on top of the LQ italic grey) when the quantification limit
 *  itself is above the comparison value: "<20" against 1 concludes nothing. */
function regleLQSuperieure(ws: Worksheet, r1: number, c1: number, r2: number, c2: number, colGuide: number) {
  if (r2 < r1 || c2 < c1) return
  const coin = `${lettre(ws, c1)}${r1}`
  const guide = `$${lettre(ws, colGuide)}${r1}`
  ws.addConditionalFormatting({
    ref: `${coin}:${lettre(ws, c2)}${r2}`,
    rules: [
      {
        type: 'expression',
        priority: 3,
        formulae: [`AND(LEFT(TRIM(${coin}),1)="<",ISNUMBER(${guide}),IFERROR(_xlfn.NUMBERVALUE(MID(TRIM(${coin}),2,20),",")>${guide},FALSE))`],
        style: { font: { underline: true, italic: true, color: { argb: GRIS_LQ } } },
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

export function ligneFamille(ws: Worksheet, r: number, famille: string, largeur: number) {
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
  if (avecGuides) {
    regleDepassement(ws, premiere, colPremier, r - 1, largeur, 3)
    regleLQSuperieure(ws, premiere, colPremier, r - 1, largeur, 3)
  }
  return r
}

// ---- Gas and air: conversion blocks ----------------------------------------

function blocConversion(
  ws: Worksheet,
  ligne: number,
  lecture: Lecture,
  couche: Couche,
  opts: OptionsExport,
  avecGuides: boolean,
  percees: PerceePoint[],
): number {
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
      const percee = couche === 'CM' ? percees.find((x) => x.point === p.nom)?.composes.find((c) => c.parametre.cle === pa.cle) : undefined
      if (percee?.percee) {
        const minimum = concentrationMinimale(percee.masseTotale, p.nom, opts)
        ws.getCell(r, col(k, 1)).note =
          `Percée : couche de contrôle ${percee.ratio === null ? 'quantifiée sans masse sur la couche de mesure' : `= ${percee.ratio.toFixed(0)} % de la couche de mesure`} ` +
          `(> ${SEUIL_PERCEE} %, NF X 43-267). Résultat non conclusif${minimum ? ` : ${minimum}` : ''}.`
      }
    })
    r++
  }
  regleLQ(ws, premiere, 2 + decalage, r - 1, largeur)
  if (avecGuides) {
    points.forEach((_, k) => {
      regleDepassement(ws, premiere, col(k, 1), r - 1, col(k, 1), 2)
      regleLQSuperieure(ws, premiere, col(k, 1), r - 1, col(k, 1), 2)
    })
  }
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
  if (avecGuides) {
    exemples.push([12, { gras: true, fond: GRIS_DEPASSEMENT }, 'Concentration supérieure à la valeur de comparaison'])
    exemples.push(['<20', { italique: true, couleur: GRIS_LQ, souligne: true }, 'Limite de quantification supérieure à la valeur de comparaison : comparaison non concluante'])
  }
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
      r = blocConversion(ws, r, lecture, couche, opts, avecGuides, controlePercee(lecture)) + 2
    }
  } else {
    r = tableauSimple(ws, lecture, opts, avecGuides) + 2
  }
  legende(ws, r, opts, avecGuides)
}

/** "≥ X µg/m3" from the mass on both layers, for a tube that broke through. */
function concentrationMinimale(masseTotale: number | null, point: string, opts: OptionsExport): string | null {
  const vol = volumeLitres(opts.prelevements[point] ?? { debitDebut: null, debitFin: null, duree: null })
  if (!vol || masseTotale === null) return null
  const x = masseTotale / (vol / 1000) / (opts.unite === 'mg/m³' ? 1000 : 1)
  return `≥ ${String(arrondiSignificatif(x)).replace('.', ',')} ${opts.unite === 'µg/m³' ? 'µg/m3' : 'mg/m3'}`
}

// ---- Per-compound analysis ----------------------------------------------------

const COLONNES_ANALYSE: [string, number][] = [
  ['Composé', 34],
  ['Unité', 11],
  ['Nb analysés', 9],
  ['Nb de dépassements de la LQ', 12],
  ['Fréquence de dépassement de la LQ (%)', 15],
  ['LQ min', 9],
  ['LQ max', 9],
  ['Minimum', 10],
  ['Maximum', 10],
  ['Échantillon du maximum', 16],
  ['Moyenne', 10],
  ['Médiane', 10],
  ['Écart-type', 10],
  ['Percentile 90', 10],
  ['Valeur de comparaison', 13],
  ['Source', 8],
  ['Nb dépassements de la valeur de comparaison', 15],
  ['Fréquence de dépassement de la valeur de comparaison (%)', 15],
  ['Maximum / valeur de comparaison', 15],
  ['Nb LQ > valeur de comparaison', 13],
  ['Échantillons en dépassement', 40],
]

function feuilleAnalyse(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const ws = wb.addWorksheet('Analyse par composé', { views: [{ state: 'frozen', xSplit: 1, ySplit: 5, showGridLines: false }] })
  const echantillons = lecture.points.filter((p) => !estControle(opts.qualifications[p.nom])).map((p) => p.nom)
  const exclus = lecture.points.filter((p) => estControle(opts.qualifications[p.nom])).map((p) => p.nom)
  ecrire(ws, 1, 1, `${opts.titre} — analyse par composé`, { gras: true, taille: 12, bord: false })
  ecrire(
    ws,
    2,
    1,
    `${echantillons.length} échantillon${echantillons.length > 1 ? 's' : ''} pris en compte` +
      (exclus.length ? ` ; échantillons de contrôle qualité exclus : ${exclus.join(', ')}` : '') +
      (opts.conversion ? ` ; concentrations de la couche de mesure en ${opts.unite === 'µg/m³' ? 'µg/m3' : 'mg/m3'}` : ''),
    { taille: 9, bord: false },
  )
  ecrire(
    ws,
    3,
    1,
    'Dépassement de la LQ : résultat quantifié. Minimum, maximum, moyenne, médiane, écart-type et percentile 90 : sur les seuls résultats supérieurs à la LQ.',
    { italique: true, taille: 9, bord: false },
  )
  const r0 = 5
  ws.getRow(r0).height = 45
  COLONNES_ANALYSE.forEach(([titre, largeur], j) => {
    ws.getColumn(j + 1).width = largeur
    ecrire(ws, r0, j + 1, titre, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  })
  let r = r0 + 1
  let famille: string | null = null
  const conversion = opts.conversion ? { prelevements: opts.prelevements, unite: opts.unite } : null
  const nombre = (x: number | null) => (x === null ? '-' : Number(x.toPrecision(4)))
  for (const pa of lecture.parametres.CM) {
    if (pa.famille && pa.famille !== famille) {
      famille = pa.famille
      ligneFamille(ws, r++, famille, COLONNES_ANALYSE.length)
    }
    const g = opts.guides[pa.cle]
    const s = statistiques(valeursCompose(lecture, pa, echantillons, conversion), g?.valeur ?? null)
    const valeurs: (string | number)[] = [
      pa.nom,
      opts.conversion ? (opts.unite === 'µg/m³' ? 'µg/m3' : 'mg/m3') : pa.unite,
      s.analyses,
      s.quantifies,
      nombre(s.frequence),
      nombre(s.lqMin),
      nombre(s.lqMax),
      nombre(s.min),
      nombre(s.max),
      s.echantillonMax ?? '-',
      nombre(s.moyenne),
      nombre(s.mediane),
      nombre(s.ecartType),
      nombre(s.p90),
      g ? g.valeur : '-',
      g ? g.source : '-',
      g ? s.depassements : '-',
      nombre(s.frequenceDepassement),
      nombre(s.ratioMaxGuide),
      g ? s.lqSuperieures : '-',
      s.echantillonsDepassement.join(', ') || '-',
    ]
    const derniere = valeurs.length - 1
    valeurs.forEach((v, j) => {
      const depasse = COLONNES_ANALYSE[j][0] === 'Nb dépassements de la valeur de comparaison' && typeof v === 'number' && v > 0
      ecrire(ws, r, j + 1, v, {
        h: j === 0 || j === derniere ? 'left' : 'center',
        indent: j === 0 ? 1 : undefined,
        italique: j === 0 && pa.somme,
        wrap: j === derniere,
        gras: depasse,
        fond: depasse ? GRIS_DEPASSEMENT : undefined,
      })
    })
    r++
  }
}

// ---- Signatures of the organic families -------------------------------------

/** Column index (1-based, fractional) at a given pixel offset from column A. */
function colonneAuPixel(ws: Worksheet, px: number): number {
  let x = 0
  for (let c = 1; c < 200; c++) {
    const largeur = (ws.getColumn(c).width ?? 9) * 7 + 5
    if (x + largeur > px) return c - 1 + (px - x) / largeur
    x += largeur
  }
  return 0
}

function feuilleSignatures(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const echantillons = lecture.points.filter((p) => !estControle(opts.qualifications[p.nom])).map((p) => p.nom)
  const familles = signatures(lecture, echantillons)
  const ws = wb.addWorksheet('Signatures', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 26
  for (let c = 2; c <= 40; c++) ws.getColumn(c).width = 12
  ecrire(ws, 1, 1, `${opts.titre} — signatures des composés organiques`, { gras: true, taille: 12, bord: false })
  ecrire(
    ws,
    2,
    1,
    'Part de chaque composé quantifié dans le total de sa famille, par échantillon (hors échantillons de contrôle qualité). Les totaux et sommes du laboratoire sont exclus ; les résultats <LQ comptent pour zéro. Sur les graphiques, les composés de moins de 3 % sont regroupés. Les échantillons sont ordonnés par similarité de composition : classification hiérarchique (lien moyen) sur la distance de Bray-Curtis entre profils, 0 pour deux profils identiques, 1 pour deux profils sans composé commun.',
    { italique: true, taille: 9, bord: false },
  )
  if (!familles.length) {
    ecrire(ws, 4, 1, 'Aucune famille de composés organiques avec au moins deux composés et un résultat quantifié.', { bord: false })
    return
  }
  let r = 4
  for (const f of familles) {
    const ordre = f.composes.map((c) => c.nom)
    const largeur = f.composes.length + 2
    ws.mergeCells(r, 1, r, largeur)
    ecrire(ws, r++, 1, f.famille.toUpperCase(), { gras: true, fond: GRIS_FAMILLE })
    ws.getRow(r).height = 42
    ecrire(ws, r, 1, 'Échantillon', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
    f.composes.forEach((c, j) => ecrire(ws, r, j + 2, c.nom, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true }))
    ecrire(ws, r, largeur, `Total (${f.unite})`, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
    r++
    for (const s of [...f.echantillons, f.ensemble]) {
      const ensemble = s === f.ensemble
      ecrire(ws, r, 1, s.echantillon, { gras: ensemble, italique: ensemble })
      f.composes.forEach((c, j) => {
        const part = s.parts.find((p) => p.nom === c.nom)
        ecrire(ws, r, j + 2, part ? part.valeur / s.total : '-', { h: 'center', fmt: part ? '0.0%' : undefined, gras: ensemble })
      })
      ecrire(ws, r, largeur, Number(s.total.toPrecision(4)), { h: 'center', gras: ensemble })
      r++
    }
    r++

    // Pies: all samples together first, then one per sample, three per row.
    const pies = [f.ensemble, ...f.echantillons]
    const lignes = Math.ceil(HAUTEUR / 20) + 1
    let dessinees = 0
    pies.forEach((s, k) => {
      const image = dessinerCamembert(s, ordre, f.unite, s === f.ensemble ? `${f.famille} — ensemble des échantillons` : s.echantillon)
      if (!image) return
      const id = wb.addImage({ base64: image, extension: 'png' })
      const ligne = r + Math.floor(k / 3) * lignes
      ws.addImage(id, { tl: { col: colonneAuPixel(ws, (k % 3) * (LARGEUR + 12)), row: ligne - 1 }, ext: { width: LARGEUR, height: HAUTEUR } })
      dessinees++
    })
    r += dessinees ? Math.ceil(pies.length / 3) * lignes + 1 : 0
    r++
  }
}

// ---- Quality control -----------------------------------------------------------

function feuilleQualite(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const ws = wb.addWorksheet('Contrôle qualité', { views: [{ showGridLines: false }] })
  ;[30, 32, 14, 14, 14, 18, 44].forEach((w, j) => (ws.getColumn(j + 1).width = w))
  ecrire(ws, 1, 1, `${opts.titre} — contrôle qualité`, { gras: true, taille: 12, bord: false })
  let r = 3
  const titre = (t: string) => {
    ecrire(ws, r++, 1, t, { gras: true, taille: 11, bord: false })
  }
  const entetes = (cols: string[]) => {
    cols.forEach((c, j) => ecrire(ws, r, j + 1, c, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true }))
    r++
  }
  const ligne = (vals: (string | number)[], alerte = false) => {
    vals.forEach((v, j) =>
      ecrire(ws, r, j + 1, v, { h: j < 2 ? 'left' : 'center', gras: alerte && j >= 2, fond: alerte ? GRIS_DEPASSEMENT : undefined, wrap: j === 6 }),
    )
    r++
  }
  const note = (t: string) => {
    ecrire(ws, r++, 1, t, { italique: true, taille: 9, bord: false })
  }

  // Sample types.
  titre('Échantillons de contrôle qualité')
  const controles = lecture.points.filter((p) => estControle(opts.qualifications[p.nom]))
  if (!controles.length) note('Aucun échantillon de contrôle qualité (blanc, doublon) identifié.')
  else {
    entetes(['Échantillon', 'Type', 'Doublon de'])
    for (const p of controles) {
      const q = opts.qualifications[p.nom]
      ligne([p.nom, LIBELLES_TYPE[q.type], q.type === 'doublon' ? (q.de ?? 'non renseigné') : '-'])
    }
  }
  r++

  // Blanks.
  titre('Blancs de terrain et de transport')
  const blancs = controleBlancs(lecture, opts.qualifications)
  if (!blancs.length) note('Aucun blanc identifié dans ce fichier.')
  else {
    entetes(['Blanc', 'Composé quantifié', 'Résultat', 'Unité'])
    for (const b of blancs) {
      const nom = `${b.blanc} (${LIBELLES_TYPE[b.type].toLowerCase()})`
      if (!b.composes.length) ligne([nom, 'Aucun composé quantifié', '-', '-'])
      for (const c of b.composes) ligne([nom, c.parametre.nom, brutFrancais(c.mesure), c.parametre.unite], true)
    }
  }
  note(
    'Un composé quantifié dans un blanc signale une possible contamination lors du prélèvement (blanc de terrain) ou du transport (blanc de transport) : les résultats des échantillons pour ce composé sont à interpréter en conséquence. Au moins un blanc de terrain par type de support et par jour, et un blanc de transport par type de support et par glacière (guide BRGM/INERIS 2016, § 6.4.4).',
  )
  r++

  // Duplicates.
  titre(`Doublons — écart relatif (seuil retenu : ${opts.seuilDoublon} %)`)
  const doublons = controleDoublons(lecture, opts.qualifications, opts.seuilDoublon)
  const sansParent = controles.filter((p) => opts.qualifications[p.nom].type === 'doublon' && !opts.qualifications[p.nom].de)
  if (!doublons.length && !sansParent.length) note('Aucun doublon identifié dans ce fichier.')
  for (const d of doublons) {
    entetes(['Doublon', 'Composé', d.original, d.doublon, 'Écart relatif (%)', 'Conformité'])
    const comparables = d.ecarts.filter((e) => e.ecart !== null)
    if (!comparables.length) ligne([`${d.doublon} / ${d.original}`, 'Aucun composé quantifié dans les deux échantillons', '-', '-', '-', '-'])
    for (const e of comparables) {
      ligne(
        [`${d.doublon} / ${d.original}`, e.parametre.nom, brutFrancais(e.original!), brutFrancais(e.doublon!), Number(e.ecart!.toFixed(1)), e.conforme ? 'Conforme' : 'Écart > seuil'],
        !e.conforme,
      )
    }
    const isoles = d.ecarts.filter((e) => e.ecart === null && ((e.original && !e.original.inferieur) || (e.doublon && !e.doublon.inferieur)))
    if (isoles.length) {
      note(`Quantifié dans un seul des deux échantillons : ${isoles.map((e) => `${e.parametre.nom} (${e.original?.brut ?? '-'} / ${e.doublon?.brut ?? '-'})`).join(' ; ')}.`)
    }
    r++
  }
  for (const p of sansParent) note(`${p.nom} : doublon dont l'échantillon d'origine n'a pas été renseigné.`)
  note(
    "Écart relatif = |a − b| / ((a + b) / 2) × 100, calculé lorsque le composé est quantifié dans les deux échantillons. Il n'existe pas de seuil réglementaire français ; les valeurs d'usage sont de 30 % pour les eaux et 50 % pour les sols. L'écart est moins significatif à proximité de la limite de quantification.",
  )
  r++

  // Breakthrough.
  if (opts.conversion) {
    titre(`Percée des tubes — couche de contrôle / couche de mesure (seuil : ${SEUIL_PERCEE} %)`)
    const percees = controlePercee(lecture)
    if (!percees.length) note('Pas de couche de contrôle dans ce fichier : la percée ne peut pas être vérifiée.')
    if (percees.length) entetes(['Point', 'Composé', 'Couche de mesure (µg)', 'Couche de contrôle (µg)', 'Contrôle / mesure (%)', 'Résultat retenu', 'Conclusion'])
    for (const pt of percees) {
      const alertes = pt.composes.filter((c) => c.percee)
      const ratioSomme = pt.sommeCM > 0 ? (pt.sommeCC / pt.sommeCM) * 100 : null
      for (const c of alertes) {
        ligne(
          [
            pt.point,
            c.parametre.nom,
            c.cm ? brutFrancais(c.cm) : '-',
            c.cc ? brutFrancais(c.cc) : '-',
            c.ratio === null ? '-' : Number(c.ratio.toFixed(1)),
            concentrationMinimale(c.masseTotale, pt.point, opts) ?? '-',
            'Percée : prélèvement non conclusif pour ce composé',
          ],
          true,
        )
      }
      ligne(
        [
          pt.point,
          'Somme des composés quantifiés',
          Number(pt.sommeCM.toPrecision(4)),
          Number(pt.sommeCC.toPrecision(4)),
          ratioSomme === null ? '-' : Number(ratioSomme.toFixed(1)),
          '-',
          pt.perceeGlobale ? 'Percée : prélèvement non conclusif pour tous les composés' : 'Conforme',
        ],
        pt.perceeGlobale,
      )
    }
    r++
    note(
      "Critère : le prélèvement est valide lorsque la masse sur la couche de contrôle est inférieure à 5 % de celle de la couche de mesure, pour chaque composé et pour la somme des composés détectés. Au-delà, le prélèvement est non conclusif (pour le composé, ou pour l'ensemble si la somme dépasse) ; un résultat « ≥ X » calculé sur la somme des masses des deux couches peut être retenu (norme NF X 43-267 ; guide BRGM/INERIS 2016, § 7.5 b).",
    )
  }
  r++
  note(
    'Référence : Guide pratique pour la caractérisation des gaz du sol et de l’air intérieur en lien avec une pollution des sols et/ou des eaux souterraines, BRGM RP-65870-FR / INERIS-DRC-16-156183-01401A, 2016.',
  )
}

export async function construireClasseur(lecture: Lecture, opts: OptionsExport): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true
  feuille(wb, 'Mis en forme', lecture, opts, false)
  feuille(wb, 'Valeurs guides ERM', lecture, opts, true)
  feuilleAnalyse(wb, lecture, opts)
  feuilleQualite(wb, lecture, opts)
  if (opts.expert) {
    // Signatures are part of the expert reading only.
    feuilleSignatures(wb, lecture, opts)
    const { ajouterFeuillesExpert } = await import('./expert/feuilles.ts')
    ajouterFeuillesExpert(wb, lecture, opts)
  }
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
