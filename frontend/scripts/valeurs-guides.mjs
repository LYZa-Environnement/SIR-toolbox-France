// Extrait les valeurs guides ERM des trois classeurs de référence vers
// src/data/valeurs-guides.json, lu par l'onglet « Résultats labo ».
//
// À relancer quand un classeur est mis à jour :
//   node scripts/valeurs-guides.mjs <eaux souterraines.xlsx> <sol.xlsx> <air intérieur R1 R2 R3.xlsx>
//
// Seules les valeurs brutes sont reprises. Pour les eaux souterraines, la
// valeur retenue est recalculée dans l'outil à partir des rangs de la feuille
// « Hierarchisation » : ces rangs sont lus comme des rangs (rang 1 = source
// prioritaire), ce que la formule LET du classeur ne fait pas pour les cas 2
// et 3 (elle les lit comme une liste d'ordre).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const [fichierEau, fichierSol, fichierAir] = process.argv.slice(2)
if (!fichierAir) {
  console.error('Usage : node scripts/valeurs-guides.mjs <eaux souterraines.xlsx> <sol.xlsx> <air.xlsx>')
  process.exit(1)
}

const ouvrir = (f) => XLSX.read(fs.readFileSync(f), { cellDates: true })
const texte = (c) => (c === undefined || c === null ? '' : String(c.v ?? '').replace(/\s+/g, ' ').trim())
const nombre = (c) => {
  if (!c) return null
  if (c.t === 'n') return c.v
  const t = String(c.v ?? '').replace(/\s/g, '').replace(',', '.')
  return /^[0-9]*\.?[0-9]+(e[-+]?\d+)?$/i.test(t) ? Number(t) : null
}
const cellule = (ws, adr) => ws[adr]
const date = (c) => (c && c.v instanceof Date ? c.v.toISOString().slice(0, 10) : texte(c))

// ---- Eaux souterraines -------------------------------------------------
function eaux(f) {
  const wb = ouvrir(f)
  const ws = wb.Sheets['Eaux souterraines']
  const h = wb.Sheets['Hierarchisation']
  const lettres = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const colonnes = ['D', 'E', 'F', 'G', 'H', 'I', 'J']
  const sources = lettres.map((l, i) => ({
    code: `(${l})`,
    libelle: texte(cellule(h, `A${5 + i}`)).replace(/^\([a-g]\)\s*/, ''),
  }))
  const cas = ['B', 'C', 'D'].map((col, i) => ({
    id: i + 1,
    libelle: texte(cellule(h, `${col}4`)).replace(/^CAS \d+ :\s*/i, ''),
    rangs: Object.fromEntries(lettres.map((l, k) => [`(${l})`, nombre(cellule(h, `${col}${5 + k}`))])),
  }))
  const valeurs = []
  const fin = XLSX.utils.decode_range(ws['!ref']).e.r + 1
  for (let r = 5; r <= fin; r++) {
    const nom = texte(cellule(ws, `C${r}`))
    if (!nom) continue
    const parSource = {}
    colonnes.forEach((col, k) => {
      const v = nombre(cellule(ws, `${col}${r}`))
      if (v !== null) parSource[`(${lettres[k]})`] = v
    })
    valeurs.push({ famille: texte(cellule(ws, `A${r}`)), cas: texte(cellule(ws, `B${r}`)), nom, sources: parSource })
  }
  return { miseAJour: date(cellule(ws, 'J2')), unite: 'µg/L', fichier: path.basename(f), sources, cas, valeurs }
}

// ---- Sols ---------------------------------------------------------------
function sols(f) {
  const wb = ouvrir(f)
  const ws = wb.Sheets['Synthèse ']
  const metaux = []
  for (let r = 8; r <= 20; r++) {
    const nom = texte(cellule(ws, `B${r}`))
    if (!nom) continue
    metaux.push({ cas: texte(cellule(ws, `A${r}`)), nom, inra: nombre(cellule(ws, `C${r}`)), seuilVigilance: nombre(cellule(ws, `E${r}`)) })
  }
  const organiques = []
  let famille = ''
  for (let r = 24; r <= 52; r++) {
    const a = texte(cellule(ws, `A${r}`))
    const nom = texte(cellule(ws, `B${r}`))
    if (!nom) {
      if (a && !/^n°/i.test(a)) famille = a
      continue
    }
    const source = texte(cellule(ws, `E${r}`))
    // Seules les valeurs ISDI (c) sont reprises : les valeurs « Retour
    // d'expérience ERM » (d) restent internes et ne sont pas publiées.
    if (!source.startsWith('(c)')) continue
    organiques.push({ famille, cas: texte(cellule(ws, `A${r}`)), nom, source: '(c)', valeur: nombre(cellule(ws, `C${r}`)) })
  }
  const sources = []
  for (let r = 53; r <= 62; r++) {
    const t = texte(cellule(ws, `A${r}`))
    const m = t.match(/^\(([a-c])\)\s*(.*)$/)
    if (m) sources.push({ code: `(${m[1]})`, libelle: m[2] })
  }
  return { miseAJour: '2023-10-20', unite: 'mg/kg MS', fichier: path.basename(f), sources, metaux, organiques }
}

// ---- Air intérieur : valeurs repères R1, R2, R3 -------------------------
function air(f) {
  const wb = ouvrir(f)
  const ws = wb.Sheets['Valeurs R1 R2 R3']
  const valeurs = []
  let famille = ''
  const fin = XLSX.utils.decode_range(ws['!ref']).e.r + 1
  for (let r = 5; r <= fin; r++) {
    const a = texte(cellule(ws, `A${r}`))
    const nom = texte(cellule(ws, `B${r}`))
    if (/^l[ée]gende$/i.test(a)) break
    if (!nom) {
      if (a) famille = a
      continue
    }
    valeurs.push({
      famille,
      cas: /^\d+-\d+-\d$/.test(a) ? a : '',
      nom: nom.replace(/\s*\(\d\)\s*/g, ' ').trim(),
      r1: nombre(cellule(ws, `C${r}`)),
      r2: nombre(cellule(ws, `F${r}`)),
      r3: nombre(cellule(ws, `I${r}`)),
      sourceR1: texte(cellule(ws, `D${r}`)),
      sourceR2: texte(cellule(ws, `G${r}`)),
      sourceR3: texte(cellule(ws, `J${r}`)),
    })
  }
  return { miseAJour: date(cellule(ws, 'C1')), unite: 'mg/m³', fichier: path.basename(f), valeurs }
}

const sortie = { eau: eaux(fichierEau), sol: sols(fichierSol), air: air(fichierAir) }
const cible = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'valeurs-guides.json')
fs.mkdirSync(path.dirname(cible), { recursive: true })
fs.writeFileSync(cible, JSON.stringify(sortie, null, 1) + '\n')
console.log(
  `valeurs-guides.json : eau ${sortie.eau.valeurs.length} composés (MAJ ${sortie.eau.miseAJour}), ` +
    `sol ${sortie.sol.metaux.length} métaux + ${sortie.sol.organiques.length} organiques, ` +
    `air ${sortie.air.valeurs.length} substances (MAJ ${sortie.air.miseAJour})`,
)
