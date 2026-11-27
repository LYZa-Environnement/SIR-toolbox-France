/**
 * Points from a table: an EQuIS EDD (Locations sheet), an ArcGIS Field Maps
 * or Survey123 export, a surveyor's spreadsheet or the simplest CSV
 * "Nom;X;Y". The header row is found wherever it is, columns are recognised
 * by their names, and rows starting with "#" (EQuIS comment rows: data
 * types, French labels) are skipped.
 */

import type { Cell } from '../resultats/parse'
import { familleDe } from './familles'
import { systemeDepuisLibelle } from './systemes'
import type { PointLu, Valeur } from './types'

export const normaliser = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^#\s*/, '')
    .replace(/[\s_.-]+/g, ' ')
    .trim()

type Role = 'nom' | 'x' | 'y' | 'lon' | 'lat' | 'altitude' | 'repere' | 'profondeur' | 'type' | 'description' | 'date' | 'systeme'

/**
 * Header patterns, most specific first. Applied to the normalised header:
 * lower case, no accents, "_" "-" "." as spaces, leading "#" removed.
 */
const MOTIFS: Record<Role, RegExp[]> = {
  nom: [
    /^sys loc code$/,
    /^(nom|name)( (du |de l )?(point|ouvrage|sondage|piezometre|station|forage|prelevement))?$/,
    /^nom (ouvrage|point|sondage|piezometre|station)/,
    /^(loc name|point|ouvrage|identifiant|id|code|station|libelle|label|reference|ref|sondage|piezometre|forage|point name|station name|location|location id)$/,
    /^(nom|name)\b/,
  ],
  x: [/^(x|x coord|xcoord|coord x|coordonnee x|coordonnees x|point x|shape@x|easting|est|e|xl93|x l93|x lambert.*|x cc\d\d|x rgf.*|x \(m\)|x m)$/, /^x( |$)/, /^coord(onnees?)? x\b/],
  y: [/^(y|y coord|ycoord|coord y|coordonnee y|coordonnees y|point y|shape@y|northing|nord|n|yl93|y l93|y lambert.*|y cc\d\d|y rgf.*|y \(m\)|y m)$/, /^y( |$)/, /^coord(onnees?)? y\b/],
  lon: [/^(lon|long|longitude|lng|longitude wgs ?84|lon wgs ?84|x wgs ?84|longitude \(.*\))$/, /^longitude\b/],
  lat: [/^(lat|latitude|latitude wgs ?84|lat wgs ?84|y wgs ?84|latitude \(.*\))$/, /^latitude\b/],
  altitude: [/^(surf elev|z|altitude|alt|altitude tn|cote tn|cote sol|cote du sol|z tn|z ngf|elevation|elev|ground elevation|cote ngf|altitude \(m.*\)|z \(m.*\))$/, /^(altitude|cote (tn|sol|terrain))\b/],
  repere: [/^(top casing elev|toc|cote tete|cote tete( de)? (tube|ouvrage)|cote repere|cote du repere|haut du tube|cote haut du tube|cote margelle|repere ngf|cote tubage)$/, /^cote .*(tete|repere|tube)/],
  profondeur: [/^(total depth|depth of well|profondeur|prof|depth|profondeur totale|prof totale|profondeur \(m\)|prof \(m\)|profondeur forage|profondeur de l ouvrage)$/, /^profondeur\b/],
  type: [/^(loc type|type|type ouvrage|type point|type de point|type d ouvrage|nature|categorie|famille|typologie|type de prelevement)$/, /^type\b/],
  description: [/^(loc desc|description|desc|localisation|emplacement|commentaire|commentaires|remarque|remarques|observation|observations|lieu|situation)$/],
  date: [/^(date|start date|date percage|date realisation|date de realisation|date forage|date de forage|date pose|date installation)$/, /^date (de )?(realisation|forage|percage|pose)/],
  systeme: [/^(coord type code|systeme|systeme de coordonnees|systeme coordonnees|epsg|crs|srid|srs|projection|coord type|systeme geodesique)$/],
}

/** Columns not worth keeping: GIS bookkeeping, EQuIS technical fields. */
const IGNOREES = /^(objectid|globalid|fid|oid|shape|shape length|shape area|creationdate|creator|editdate|editor|identifier|elev unit|units|depth unit|datum unit|x coord|y coord|euid|ebatch)$/

export interface Colonnes {
  ligneEntete: number
  noms: string[]
  role: Partial<Record<Role, number>>
}

function trouverColonnes(entete: Cell[]): Partial<Record<Role, number>> {
  const noms = entete.map(normaliser)
  const role: Partial<Record<Role, number>> = {}
  const pris = new Set<number>()
  // Most specific pattern first, across all roles, so that "x_cc49" is X
  // before "x" variants are tried and a column is never used twice.
  for (let niveau = 0; niveau < 5; niveau++) {
    for (const r of Object.keys(MOTIFS) as Role[]) {
      if (role[r] !== undefined) continue
      const motif = MOTIFS[r][niveau]
      if (!motif) continue
      const i = noms.findIndex((n, j) => n && !pris.has(j) && motif.test(n))
      if (i >= 0) {
        role[r] = i
        pris.add(i)
      }
    }
  }
  return role
}

/** The header row: the first of the first 30 rows with both coordinate columns. */
export function trouverEntete(grille: Cell[][]): Colonnes | null {
  for (let i = 0; i < Math.min(grille.length, 30); i++) {
    const ligne = grille[i] ?? []
    if (ligne.filter((c) => typeof c === 'string' && c.trim()).length < 2) continue
    const role = trouverColonnes(ligne)
    if ((role.x !== undefined && role.y !== undefined) || (role.lon !== undefined && role.lat !== undefined)) {
      return { ligneEntete: i, noms: ligne.map((c) => String(c ?? '').trim()), role }
    }
  }
  return null
}

/** "48°51'24.2\"N", "2° 21' 07\" E", "48 51 24,2 N" → decimal degrees. */
function degresMinutesSecondes(s: string): number | null {
  const m = s
    .trim()
    .toUpperCase()
    .match(/^([NSEWO])?\s*(-?\d+(?:[.,]\d+)?)\s*[°D:\s]\s*(?:(\d+(?:[.,]\d+)?)\s*['′M:\s]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″]|''|S(?![A-Z]))?\s*)?([NSEWO])?$/)
  if (!m) return null
  const n = (t?: string) => (t ? Number(t.replace(',', '.')) : 0)
  let v = Math.abs(n(m[2])) + n(m[3]) / 60 + n(m[4]) / 3600
  const h = m[1] ?? m[5]
  if (m[2].startsWith('-') || h === 'S' || h === 'W' || h === 'O') v = -v
  return v
}

/** A number written in a French or English way: "1 657 990,951", "1657990.951", "-0,5". */
export function nombre(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  if (typeof c !== 'string') return null
  const t = c.replace(/[\s\u00a0\u202f]/g, '')
  if (!t) return null
  let u = t
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(u)) u = u.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(u)) u = u.replace(/,/g, '')
  else u = u.replace(',', '.')
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(u)) return Number(u)
  return null
}

/** A coordinate: a number, or degrees-minutes-seconds. */
export function coordonnee(c: Cell): number | null {
  const n = nombre(c)
  if (n !== null) return n
  return typeof c === 'string' && /[°'"′″NSEWO]/i.test(c) ? degresMinutesSecondes(c) : null
}

const texte = (c: Cell) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString() : String(c).trim())

function jour(c: Cell): string | undefined {
  if (c instanceof Date) return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`
  // Excel serial day (1900 system), as SheetJS gives it without cellDates.
  if (typeof c === 'number' && c > 20000 && c < 80000) return new Date(Math.round((c - 25569) * 86400000)).toISOString().slice(0, 10)
  if (typeof c === 'string') {
    const fr = c.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`
    const iso = c.trim().match(/^\d{4}-\d{2}-\d{2}/)
    if (iso) return iso[0]
  }
  return undefined
}

export interface ResultatTableau {
  points: PointLu[]
  colonnes: Colonnes
  /** Names of the coordinate columns, for the reader and the guess of the system. */
  colonnesXY: [string, string]
  /** Longitude/latitude columns rather than X/Y. */
  geographique: boolean
  /** System written on most rows (EQuIS coord_type_code, "Système" column). */
  declare: string | null
  remarques: string[]
}

/** Points of a sheet, or null when it has no coordinate columns. */
export function lireTableau(grille: Cell[][]): ResultatTableau | null {
  const colonnes = trouverEntete(grille)
  if (!colonnes) return null
  const { role, noms, ligneEntete } = colonnes
  const geographique = role.x === undefined || role.y === undefined
  const ix = geographique ? role.lon! : role.x!
  const iy = geographique ? role.lat! : role.y!
  const utilisees = new Set(Object.values(role))
  const remarques: string[] = []
  const points: PointLu[] = []
  const declares = new Map<string, number>()
  let commentaires = 0
  let sansNom = 0

  for (let i = ligneEntete + 1; i < grille.length; i++) {
    const ligne = grille[i] ?? []
    if (!ligne.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) continue
    if (typeof ligne[0] === 'string' && ligne[0].trim().startsWith('#')) {
      commentaires++
      continue
    }
    const x = coordonnee(ligne[ix])
    const y = coordonnee(ligne[iy])
    let nom = role.nom !== undefined ? texte(ligne[role.nom]) : ''
    if (!nom) {
      if (x === null || y === null) continue
      sansNom++
      nom = `Point ${points.length + 1}`
    }
    const typeOrigine = role.type !== undefined ? texte(ligne[role.type]) : ''
    const attributs: Record<string, Valeur> = {}
    noms.forEach((n, j) => {
      if (utilisees.has(j) || !n || IGNOREES.test(normaliser(n))) return
      const v = ligne[j]
      if (v === null || v === undefined || v === '') return
      attributs[n.replace(/^#\s*/, '')] = typeof v === 'number' ? v : texte(v)
    })
    const libelleSysteme = role.systeme !== undefined ? texte(ligne[role.systeme]) : ''
    if (libelleSysteme) declares.set(libelleSysteme, (declares.get(libelleSysteme) ?? 0) + 1)
    const p: PointLu = {
      nom,
      typeOrigine,
      famille: familleDe(typeOrigine, nom),
      description: role.description !== undefined ? texte(ligne[role.description]) : '',
      x,
      y,
      attributs,
    }
    const systeme = systemeDepuisLibelle(libelleSysteme)
    if (systeme) p.systeme = systeme
    const alt = role.altitude !== undefined ? nombre(ligne[role.altitude]) : null
    if (alt !== null) p.altitude = alt
    const rep = role.repere !== undefined ? nombre(ligne[role.repere]) : null
    if (rep !== null) p.repere = rep
    const prof = role.profondeur !== undefined ? nombre(ligne[role.profondeur]) : null
    if (prof !== null) p.profondeur = prof
    const d = role.date !== undefined ? jour(ligne[role.date]) : undefined
    if (d) p.date = d
    points.push(p)
  }

  const nbSans = points.filter((p) => p.x === null || p.y === null).length
  if (commentaires) remarques.push(`${commentaires} ligne${commentaires > 1 ? 's' : ''} de commentaire (« # ») ignorée${commentaires > 1 ? 's' : ''}.`)
  if (nbSans) remarques.push(`${nbSans} point${nbSans > 1 ? 's' : ''} sans coordonnées.`)
  if (sansNom) remarques.push(`${sansNom} ligne${sansNom > 1 ? 's' : ''} sans nom, numérotée${sansNom > 1 ? 's' : ''} « Point n ».`)
  if (role.nom === undefined) remarques.push('Aucune colonne de nom reconnue : points numérotés.')
  const declare = [...declares.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { points, colonnes, colonnesXY: [noms[ix], noms[iy]], geographique, declare, remarques }
}

// ---- EQuIS GeologyEDD ----------------------------------------------------------

/** An EQuIS EDD workbook: a "Locations" sheet keyed by sys_loc_code. */
export function estEquis(feuilles: { nom: string; grille: Cell[][] }[]): boolean {
  const loc = feuilles.find((f) => /^locations?$/i.test(f.nom))
  return !!loc && (loc.grille[0] ?? []).some((c) => /sys_loc_code/i.test(String(c ?? '')))
}

/** Rows of an EDD sheet as objects keyed by the header (sys_loc_code first), comment rows skipped. */
function lignesEdd(grille: Cell[][]): Record<string, Cell>[] {
  const i = grille.findIndex((l) => (l ?? []).some((c) => /sys_loc_code/i.test(String(c ?? ''))))
  if (i < 0) return []
  const entete = (grille[i] ?? []).map((c) => normaliser(c).replace(/ /g, '_'))
  const out: Record<string, Cell>[] = []
  for (const l of grille.slice(i + 1)) {
    if (!l || l[0] === null || l[0] === undefined || String(l[0]).trim() === '' || String(l[0]).trim().startsWith('#')) continue
    out.push(Object.fromEntries(entete.map((k, j) => [k, l[j]])))
  }
  return out
}

/**
 * Wells (top of casing, depth of the well) and WellDatum (latest measuring
 * point) of an EDD, added to the points of its Locations sheet.
 */
export function enrichirEquis(points: PointLu[], feuilles: { nom: string; grille: Cell[][] }[]): number {
  const parNom = new Map(points.map((p) => [p.nom, p]))
  let n = 0
  const wells = feuilles.find((f) => /^wells$/i.test(f.nom))
  for (const l of wells ? lignesEdd(wells.grille) : []) {
    const p = parNom.get(texte(l.sys_loc_code))
    if (!p) continue
    const toc = nombre(l.top_casing_elev)
    const prof = nombre(l.depth_of_well)
    if (toc !== null) p.repere = toc
    if (prof !== null && p.profondeur === undefined) p.profondeur = prof
    if (toc !== null || prof !== null) n++
  }
  const datum = feuilles.find((f) => /^welldatum$/i.test(f.nom))
  const derniers = new Map<string, { date: string; valeur: number }>()
  for (const l of datum ? lignesEdd(datum.grille) : []) {
    const nom = texte(l.sys_loc_code)
    const v = nombre(l.datum_value)
    if (!parNom.has(nom) || v === null) continue
    const d = jour(l.start_date) ?? ''
    const avant = derniers.get(nom)
    if (!avant || d >= avant.date) derniers.set(nom, { date: d, valeur: v })
  }
  for (const [nom, { valeur }] of derniers) {
    const p = parNom.get(nom)!
    if (p.repere === undefined) n++
    p.repere = valeur
  }
  return n
}
