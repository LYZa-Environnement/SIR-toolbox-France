/**
 * The monitoring history as a plain table — one row per result — so that
 * past campaigns (the previous quadrennial review's tables, a consultant's
 * database) can be loaded alongside the lab reports, and so that the
 * consolidated data exported by this tool can be loaded again for the
 * next review.
 *
 * Three tables, found by their headers whatever the sheet names and the
 * column order:
 * - results: Ouvrage | Date | Campagne | Paramètre | N° CAS | Unité |
 *   Résultat | Famille | Laboratoire | Régime ("<0,5" for a result below
 *   the LQ);
 * - wells: Ouvrage | Position (amont, droit, aval) | X | Y | Cote du
 *   repère (m NGF);
 * - water levels: Ouvrage | Date | Profondeur de l'eau (m/repère) | Cote
 *   piézométrique (m NGF).
 *
 * Pure for reading (grids in); the blank template is built with ExcelJS.
 */

import { facteurUnite } from '../resultats/guides.ts'
import { lireMesure, type Cell, type Lecture, type Mesure, type Parametre, type Point } from '../resultats/parse.ts'
import type { Position } from '../resultats/expert/amontAval.ts'
import { jourIso } from '../format.ts'
import { telechargerClasseurExcel } from '../fichiers.ts'
import { dateCampagne, lireDate } from './dates.ts'

export interface LigneHistorique {
  ouvrage: string
  date: string
  campagne: string
  parametre: string
  cas: string
  unite: string
  mesure: Mesure
  famille: string
  regime: 'HE' | 'BE' | null
}

export interface OuvrageHistorique {
  nom: string
  position: Position | null
  x: number | null
  y: number | null
  repere: number | null
}

export interface NiveauHistorique {
  ouvrage: string
  date: string
  profondeur: number | null
  charge: number | null
}

export interface Historique {
  lignes: LigneHistorique[]
  ouvrages: OuvrageHistorique[]
  niveaux: NiveauHistorique[]
  /** Rows left out (no date, no well, unreadable result), counted. */
  ignorees: number
}

const texte = (c: Cell) => (c === null || c === undefined ? '' : c instanceof Date ? jourIso(c) : String(c).replace(/\s+/g, ' ').trim())
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const COLONNES = {
  ouvrage: /^(ouvrage|point( de prelevement)?|piezometre|station|well|forage|pz|nom de l.ouvrage)\b/,
  date: /^date\b/,
  campagne: /^campagne\b/,
  parametre: /^(parametre|compose|substance|analyte|element|determinand)\b/,
  cas: /\bcas\b/,
  unite: /^unite|^unit\b/,
  resultat: /^(resultat|valeur|concentration|result)\b/,
  famille: /^famille|^family\b/,
  regime: /^regime\b/,
  position: /^position\b/,
  x: /^x\b|^x \(|^coordonnee x|^longitude|^est\b/,
  y: /^y\b|^y \(|^coordonnee y|^latitude|^nord\b/,
  repere: /cote (du |de )?repere|altitude (du |de )?repere|cote du sommet|tete de tube/,
  profondeur: /profondeur|niveau (statique|d.eau|de l.eau)|^niveau\b/,
  charge: /cote piezo|niveau piezo|charge|cote (de )?l.eau|m ngf/,
} as const

type Colonne = keyof typeof COLONNES

/** The header row of a table holding the columns asked, and the column of each known heading. */
function enTete(grille: Cell[][], requis: Colonne[]): { ligne: number; cols: Partial<Record<Colonne, number>> } | null {
  for (let i = 0; i < Math.min(grille.length, 15); i++) {
    const cols: Partial<Record<Colonne, number>> = {}
    grille[i].forEach((c, j) => {
      const t = sansAccent(texte(c))
      if (!t) return
      for (const [k, re] of Object.entries(COLONNES) as [Colonne, RegExp][]) {
        // "Cote piézométrique (m NGF)" is a level, not a position; "Profondeur" is checked before "charge".
        if (cols[k] === undefined && re.test(t)) {
          if (k === 'profondeur' && COLONNES.charge.test(t)) continue
          cols[k] = j
          break
        }
      }
    })
    if (requis.every((k) => cols[k] !== undefined)) return { ligne: i, cols }
  }
  return null
}

const nombre = (c: Cell): number | null => {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  const t = texte(c).replace(/\s/g, '').replace(',', '.')
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : null
}

function lirePosition(t: string): Position | null {
  const s = sansAccent(t)
  if (/amont|upgradient|upstream/.test(s)) return 'amont'
  if (/aval|downgradient|downstream/.test(s)) return 'aval'
  if (/droit|site|source|centre/.test(s)) return 'droit'
  return s ? 'autre' : null
}

function lireRegime(t: string): 'HE' | 'BE' | null {
  const s = sansAccent(t)
  if (/^he$|hautes?\s*eaux|high/.test(s)) return 'HE'
  if (/^be$|basses?\s*eaux|low/.test(s)) return 'BE'
  return null
}

/** The history tables of a workbook, or null when it holds none. */
export function lireHistorique(feuilles: { nom: string; grille: Cell[][] }[]): Historique | null {
  const lignes: LigneHistorique[] = []
  const ouvrages: OuvrageHistorique[] = []
  const niveaux: NiveauHistorique[] = []
  let ignorees = 0
  let trouve = false
  // An export of this tool: only its data sheets ("Données …") are read back,
  // not the analysis sheets that also have a "Ouvrage" column.
  const export_ = feuilles.some((f) => /^donn[ée]es consolid[ée]es$/i.test(f.nom))
  for (const f of export_ ? feuilles.filter((x) => /^donn[ée]es/i.test(x.nom)) : feuilles) {
    const res = enTete(f.grille, ['ouvrage', 'date', 'parametre', 'resultat'])
    if (res) {
      trouve = true
      const c = res.cols
      for (const r of f.grille.slice(res.ligne + 1)) {
        const ouvrage = texte(r[c.ouvrage!])
        const date = lireDate(r[c.date!])
        const parametre = texte(r[c.parametre!])
        const mesure = lireMesure(r[c.resultat!])
        if (!ouvrage && !parametre) continue
        if (!ouvrage || !date || !parametre || !mesure) {
          ignorees++
          continue
        }
        lignes.push({
          ouvrage,
          date,
          campagne: c.campagne !== undefined ? texte(r[c.campagne]) : '',
          parametre,
          cas: c.cas !== undefined ? texte(r[c.cas]) : '',
          unite: c.unite !== undefined ? texte(r[c.unite]) : '',
          mesure,
          famille: c.famille !== undefined ? texte(r[c.famille]) : '',
          regime: c.regime !== undefined ? lireRegime(texte(r[c.regime])) : null,
        })
      }
      continue
    }
    const niv = enTete(f.grille, ['ouvrage', 'date'])
    if (niv && (niv.cols.profondeur !== undefined || niv.cols.charge !== undefined)) {
      trouve = true
      const c = niv.cols
      for (const r of f.grille.slice(niv.ligne + 1)) {
        const ouvrage = texte(r[c.ouvrage!])
        const date = lireDate(r[c.date!])
        const profondeur = c.profondeur !== undefined ? nombre(r[c.profondeur]) : null
        const charge = c.charge !== undefined ? nombre(r[c.charge]) : null
        if (!ouvrage || !date || (profondeur === null && charge === null)) continue
        niveaux.push({ ouvrage, date, profondeur, charge })
      }
      continue
    }
    const ouv = enTete(f.grille, ['ouvrage'])
    if (ouv && (ouv.cols.position !== undefined || ouv.cols.x !== undefined || ouv.cols.repere !== undefined) && ouv.cols.date === undefined) {
      trouve = true
      const c = ouv.cols
      for (const r of f.grille.slice(ouv.ligne + 1)) {
        const nom = texte(r[c.ouvrage!])
        if (!nom) continue
        ouvrages.push({
          nom,
          position: c.position !== undefined ? lirePosition(texte(r[c.position])) : null,
          x: c.x !== undefined ? nombre(r[c.x]) : null,
          y: c.y !== undefined ? nombre(r[c.y]) : null,
          repere: c.repere !== undefined ? nombre(r[c.repere]) : null,
        })
      }
    }
  }
  return trouve ? { lignes, ouvrages, niveaux, ignorees } : null
}

const versMicrogrammes = (unite: string) => {
  const f = facteurUnite(unite, 'µg/l')
  return f ?? 1
}

export interface LotHistorique {
  /** Label of the campaign (its "Campagne" cell, else the date). */
  libelle: string
  date: string
  regime: 'HE' | 'BE' | null
  lecture: Lecture
}

/**
 * The results grouped into campaigns — by the "Campagne" column when it is
 * filled, else by date — each as a lab reading (wells as samples), so that
 * they go through the same processing as the lab reports.
 */
export function lotsHistorique(h: Historique): LotHistorique[] {
  const groupes = new Map<string, LigneHistorique[]>()
  for (const l of h.lignes) {
    const k = l.campagne || l.date
    if (!groupes.has(k)) groupes.set(k, [])
    groupes.get(k)!.push(l)
  }
  const lots: LotHistorique[] = []
  for (const [k, ls] of groupes) {
    const points: Point[] = []
    const vus = new Set<string>()
    const parametres: Parametre[] = []
    const parCle = new Map<string, Parametre>()
    const valeurs: Lecture['valeurs'] = { CM: {}, CC: {} }
    for (const l of ls) {
      if (!vus.has(l.ouvrage)) {
        vus.add(l.ouvrage)
        points.push({ nom: l.ouvrage, libelles: { CM: l.ouvrage } })
      }
      const cle = `${l.famille}|${l.cas || l.parametre}|${l.unite}`.toLowerCase()
      if (!parCle.has(cle)) {
        const p: Parametre = {
          cle,
          famille: l.famille,
          nom: l.parametre,
          cas: l.cas,
          unite: l.unite,
          versMicrogrammes: versMicrogrammes(l.unite),
          somme: /^(somme|total|σ|∑)|\bsomme\b|\(calcul[ée]e\)/i.test(l.parametre),
        }
        parCle.set(cle, p)
        parametres.push(p)
      }
      ;(valeurs.CM[l.ouvrage] ??= {})[cle] = l.mesure
    }
    const regimes = new Set(ls.map((l) => l.regime).filter(Boolean))
    lots.push({
      libelle: k,
      date: dateCampagne(ls.map((l) => l.date)),
      regime: regimes.size === 1 ? ([...regimes][0] as 'HE' | 'BE') : null,
      lecture: {
        points,
        parametres: { CM: parametres, CC: [] },
        valeurs,
        coucheControle: false,
        lignesIgnorees: [],
        unites: [...new Set(parametres.map((p) => p.unite))],
        mode: 'tout',
        feuille: 'Historique',
      },
    })
  }
  return lots.sort((a, b) => a.date.localeCompare(b.date))
}

// ---- Blank template ------------------------------------------------------------------------

export const COLONNES_RESULTATS = ['Ouvrage', 'Date', 'Campagne', 'Régime', 'Famille', 'Paramètre', 'N° CAS', 'Unité', 'Résultat', 'Laboratoire / source']
export const COLONNES_OUVRAGES = ['Ouvrage', 'Position (amont / droit / aval)', 'X', 'Y', 'Cote du repère (m NGF)', 'Remarque']
export const COLONNES_NIVEAUX = ['Ouvrage', 'Date', "Profondeur de l'eau (m/repère)", 'Cote piézométrique (m NGF)']

/** The blank history workbook to fill in, with two example rows per table. */
export async function telechargerModele() {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const entete = (ws: import('exceljs').Worksheet, cols: string[], largeurs: number[]) => {
    ws.addRow(cols)
    ws.getRow(1).eachCell((c) => {
      c.font = { name: 'Verdana', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00756A' } }
      c.alignment = { vertical: 'middle', wrapText: true }
    })
    ws.getRow(1).height = 30
    largeurs.forEach((l, i) => (ws.getColumn(i + 1).width = l))
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const r = wb.addWorksheet('Résultats')
  entete(r, COLONNES_RESULTATS, [12, 12, 14, 10, 18, 34, 12, 9, 11, 22])
  r.addRow(['PZ1', new Date(Date.UTC(2021, 2, 15)), 'HE 2021', 'HE', 'COHV', 'Tétrachloroéthylène', '127-18-4', 'µg/l', 12.5, 'Laboratoire X'])
  r.addRow(['PZ1', new Date(Date.UTC(2021, 2, 15)), 'HE 2021', 'HE', 'COHV', 'Chlorure de vinyle', '75-01-4', 'µg/l', '<0,5', 'Laboratoire X'])
  r.getColumn(2).numFmt = 'dd/mm/yyyy'
  const o = wb.addWorksheet('Ouvrages')
  entete(o, COLONNES_OUVRAGES, [12, 22, 12, 12, 16, 30])
  o.addRow(['PZ1', 'amont', 652300, 6862100, 45.32, 'Coordonnées en Lambert 93 (ou tout autre système, le même pour tous)'])
  const n = wb.addWorksheet('Niveaux')
  entete(n, COLONNES_NIVEAUX, [12, 12, 22, 22])
  n.addRow(['PZ1', new Date(Date.UTC(2021, 2, 15)), 4.12, 41.2])
  n.getColumn(2).numFmt = 'dd/mm/yyyy'
  const notice = wb.addWorksheet('Notice')
  notice.getColumn(1).width = 120
  for (const t of [
    'Modèle de saisie de l’historique de surveillance — SIR Toolbox, outil « Suivi temporel ».',
    '',
    'Onglet « Résultats » : une ligne par résultat. Ouvrage, Date (jj/mm/aaaa), Paramètre et Résultat sont obligatoires.',
    'Un résultat inférieur à la limite de quantification s’écrit « <LQ », par exemple « <0,5 ».',
    'La colonne Campagne regroupe les résultats d’une même campagne (sinon ils sont regroupés par date).',
    'Le N° CAS, quand il est connu, permet de rapprocher les composés d’un laboratoire à l’autre.',
    'Onglet « Ouvrages » (facultatif) : position hydraulique, coordonnées (pour le plan des ouvrages) et cote du repère.',
    'Onglet « Niveaux » (facultatif) : profondeur de l’eau et/ou cote piézométrique à chaque campagne.',
    '',
    'L’onglet « Données consolidées » de l’export Excel de l’outil a la même structure : il peut être rechargé tel quel pour le bilan suivant.',
  ])
    notice.addRow([t])
  await telechargerClasseurExcel(wb, 'Modele historique surveillance.xlsx')
}
