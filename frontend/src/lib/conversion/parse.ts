/**
 * Reads a laboratory results sheet (gaz du sol / air ambiant on sorbent
 * tubes) into points × layers × parameters, whatever lab produced it.
 *
 * No lab layout is hard-coded: ALS/Wessling, Eurofins and SGS all put the
 * samples in columns and the parameters in rows, but differ in where the
 * names, units and the control layer live. So the layout is inferred:
 *
 * - the unit column is the one whose cells read like a mass per support
 *   ("µg / support", "µg/éch.", "ng/tube"…);
 * - data rows are the rows with such a unit; rows with values but no unit
 *   (extraction date, sorbent batch) are metadata and skipped; rows with
 *   neither are family headings ("COMPOSES AROMATIQUES VOLATILS");
 * - the control layer is announced either by a heading ("… ZONE DE
 *   CONTROLE", Eurofins) or by a sample-name suffix ("PzaB CC", Wessling).
 *
 * Pure: takes a grid of raw cell values, so it runs in the browser and in
 * tests alike.
 */

export type Cell = string | number | boolean | Date | null | undefined
export type Couche = 'CM' | 'CC'

export interface Mesure {
  /** The value exactly as the lab wrote it, for the raw columns. */
  brut: string
  /** Numeric value (the LQ itself when `inferieur`), in the row's unit. */
  valeur: number | null
  inferieur: boolean
}

export interface Parametre {
  cle: string
  famille: string
  nom: string
  unite: string
  /** Factor bringing the row's unit to µg (ng → 0.001, mg → 1000). */
  versMicrogrammes: number
  somme: boolean
}

export interface Point {
  nom: string
  /** Sample names as the lab wrote them, per layer. */
  libelles: Partial<Record<Couche, string>>
}

export interface Lecture {
  points: Point[]
  /** Parameters in lab order, per layer. */
  parametres: Record<Couche, Parametre[]>
  /** valeurs[couche][point.nom][parametre.cle] */
  valeurs: Record<Couche, Record<string, Record<string, Mesure>>>
  coucheControle: boolean
  /** Rows whose unit is not a mass per support (already a concentration…). */
  lignesIgnorees: string[]
  feuille?: string
}

const UNITE_SUPPORT = /^\s*([nµμum]|mc)?g\s*\/\s*(support|supp?\.?|[ée]ch\.?|[ée]chantillon|tube|cartouche|badge|filtre|t[êe]te|m[ée]dia|cassette)\b/i
const EN_TETE_ECHANTILLON = /d[ée]signation|nom d.?[ée]chantillon|sample\s*name|client\s*(id|name)/i
const COLONNE_NON_ECHANTILLON = /^(n°?\s*)?cas\b|unit[ée]?s?\b|considered|comparison|valeur|source|\blq\b|limite|m[ée]thode|norme|incertitude/i
const CONTROLE = /zone\s+de\s+contr[ôo]le|couche\s+de\s+contr[ôo]le|\bzc\b/i
const SUFFIXE_COUCHE = /[\s_-]+(CM|CC|ZM|ZC)$/i
const SANS_VALEUR = /^(-|-\/-|n\.?\s*[ad]\.?|na|nd|n\.?\s*m\.?|\/|—|–)$/i

function texte(c: Cell): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).replace(/\s+/g, ' ').trim()
}

function estUniteSupport(c: Cell): boolean {
  return UNITE_SUPPORT.test(texte(c))
}

function facteurMicrogrammes(unite: string): number {
  const prefixe = unite.trim().charAt(0).toLowerCase()
  if (prefixe === 'n') return 0.001
  if (prefixe === 'm' && !/^mc/i.test(unite.trim())) return 1000
  return 1
}

/** "<0,2", "< 0.16", "1 700", "3,6", 1700 → Mesure; "-/-", "n.d." → null. */
export function lireMesure(c: Cell): Mesure | null {
  if (typeof c === 'number') return Number.isFinite(c) ? { brut: String(c), valeur: c, inferieur: false } : null
  const brut = texte(c)
  if (!brut || SANS_VALEUR.test(brut)) return null
  const inferieur = /^</.test(brut)
  const nombre = brut.replace(/^[<>≤]\s*/, '').replace(/\s/g, '').replace(',', '.')
  if (!/^[0-9]*\.?[0-9]+(e[-+]?\d+)?$/i.test(nombre)) return null
  return { brut, valeur: Number(nombre), inferieur }
}

/** "PzaB  CM" → { nom: "PzaB", couche: "CM" } */
function separerCouche(libelle: string): { nom: string; couche: Couche | null } {
  const m = libelle.match(SUFFIXE_COUCHE)
  if (!m) return { nom: libelle, couche: null }
  const code = m[1].toUpperCase()
  return { nom: libelle.slice(0, m.index).trim(), couche: code === 'CC' || code === 'ZC' ? 'CC' : 'CM' }
}

function normaliserFamille(titre: string): string {
  return titre
    .replace(/\(?\s*(zone|couche)\s+de\s+(contr[ôo]le|mesure)\s*\)?/gi, '')
    .replace(/\s*[-–—:]\s*$/, '')
    .trim()
}

export class LectureImpossible extends Error {}

export function lireGrille(grille: Cell[][], feuille?: string): Lecture {
  const largeur = Math.max(0, ...grille.map((r) => r.length))

  // 1. The unit column: the one holding the most "mass per support" cells.
  let colUnite = -1
  let meilleur = 0
  for (let j = 0; j < largeur; j++) {
    let n = 0
    for (const r of grille) if (estUniteSupport(r[j])) n++
    if (n > meilleur) {
      meilleur = n
      colUnite = j
    }
  }
  if (colUnite < 0 || meilleur < 1) {
    throw new LectureImpossible("Aucune unité de type « µg/support » ou « µg/éch. » n'a été trouvée dans ce fichier.")
  }

  const lignesDonnees = grille.map((r, i) => (estUniteSupport(r[colUnite]) ? i : -1)).filter((i) => i >= 0)
  const premiere = lignesDonnees[0]

  // 2. Parameter names: the leftmost column with text on the data rows.
  let colNom = 0
  for (let j = 0; j < colUnite; j++) {
    if (lignesDonnees.filter((i) => texte(grille[i][j]) && !lireMesure(grille[i][j])).length >= lignesDonnees.length / 2) {
      colNom = j
      break
    }
  }

  // 3. Sample columns: right of the unit column, with values on data rows.
  const candidates: number[] = []
  for (let j = colUnite + 1; j < largeur; j++) {
    if (lignesDonnees.some((i) => lireMesure(grille[i][j]))) candidates.push(j)
  }

  // 4. The sample-name row: above the first data row. A row labelled
  // "Désignation…" wins; otherwise the nearest row whose names are all
  // present and distinct ("Rapporté" repeated on every column is not one).
  let ligneNoms = -1
  for (let i = premiere - 1; i >= 0 && ligneNoms < 0; i--) {
    if (EN_TETE_ECHANTILLON.test(texte(grille[i][colNom]))) {
      if (candidates.filter((j) => texte(grille[i][j])).length >= candidates.length / 2) ligneNoms = i
    }
  }
  for (let i = premiere - 1; i >= 0 && ligneNoms < 0; i--) {
    const noms = candidates.map((j) => texte(grille[i][j])).filter(Boolean)
    if (noms.length >= candidates.length / 2 && new Set(noms).size === noms.length && noms.some((n) => !lireMesure(n))) ligneNoms = i
  }
  if (ligneNoms < 0) throw new LectureImpossible("La ligne portant les noms d'échantillons n'a pas été reconnue.")

  const colonnes = candidates.filter((j) => {
    const entete = texte(grille[ligneNoms][j])
    return entete && !COLONNE_NON_ECHANTILLON.test(entete)
  })
  if (!colonnes.length) throw new LectureImpossible("Aucune colonne d'échantillon n'a été reconnue.")

  // 5. Points and layers from the sample names.
  const points: Point[] = []
  const parColonne = new Map<number, { point: Point; couche: Couche | null }>()
  for (const j of colonnes) {
    const libelle = texte(grille[ligneNoms][j])
    const { nom, couche } = separerCouche(libelle)
    // "PzaB CM" and "PzaB CC" are the two layers of one tube, hence one
    // point; any other repeated name is a distinct sample and gets a number.
    let point = couche ? points.find((p) => p.nom === nom && !p.libelles[couche]) : undefined
    if (!point) {
      let unique = nom
      for (let k = 2; points.some((p) => p.nom === unique); k++) unique = `${nom} (${k})`
      point = { nom: unique, libelles: {} }
      points.push(point)
    }
    point.libelles[couche ?? 'CM'] = libelle
    parColonne.set(j, { point, couche })
  }

  // 6. Walk the rows: headings set the family and the layer.
  const parametres: Record<Couche, Parametre[]> = { CM: [], CC: [] }
  const valeurs: Record<Couche, Record<string, Record<string, Mesure>>> = { CM: {}, CC: {} }
  const lignesIgnorees: string[] = []
  let famille = ''
  let coucheSection: Couche = 'CM'
  for (let i = ligneNoms + 1; i < grille.length; i++) {
    const r = grille[i]
    const nom = texte(r[colNom])
    const unite = texte(r[colUnite])
    const aDesValeurs = colonnes.some((j) => lireMesure(r[j]))
    if (!nom) continue
    // A heading has nothing under the samples; "Type de support / N° de lot"
    // has text there and is metadata, not a family.
    if (!unite && !colonnes.some((j) => texte(r[j]))) {
      // Every heading resets the layer: Eurofins repeats each family once
      // for the measuring zone, then once more "… ZONE DE CONTROLE".
      famille = normaliserFamille(nom) || famille
      coucheSection = CONTROLE.test(nom) ? 'CC' : 'CM'
      continue
    }
    if (!estUniteSupport(unite)) {
      if (unite && aDesValeurs) lignesIgnorees.push(`${nom} (${unite})`)
      continue
    }
    const cle = `${famille}|${nom}`.toLowerCase()
    const parametre: Parametre = {
      cle,
      famille,
      nom,
      unite,
      versMicrogrammes: facteurMicrogrammes(unite),
      somme: /^(somme|total|∑)|totaux?\b|\btotal\b|\(c5-c16\)/i.test(nom),
    }
    for (const j of colonnes) {
      const mesure = lireMesure(r[j])
      const { point, couche } = parColonne.get(j)!
      const c: Couche = couche ?? coucheSection
      if (!parametres[c].some((p) => p.cle === cle)) parametres[c].push(parametre)
      if (!mesure) continue
      ;(valeurs[c][point.nom] ??= {})[cle] = mesure
    }
  }

  if (!parametres.CM.length && !parametres.CC.length) throw new LectureImpossible('Aucun résultat exploitable dans ce fichier.')
  return {
    points,
    parametres,
    valeurs,
    coucheControle: parametres.CC.length > 0,
    lignesIgnorees,
    feuille,
  }
}

/** Picks, among a workbook's sheets, the one that reads best. */
export function lireClasseur(feuilles: { nom: string; grille: Cell[][] }[]): Lecture {
  let meilleure: Lecture | null = null
  let erreur: Error | null = null
  for (const f of feuilles) {
    try {
      const lecture = lireGrille(f.grille, f.nom)
      const score = (l: Lecture) => l.points.length * (l.parametres.CM.length + l.parametres.CC.length)
      if (!meilleure || score(lecture) > score(meilleure)) meilleure = lecture
    } catch (e) {
      erreur ??= e as Error
    }
  }
  if (!meilleure) throw erreur ?? new LectureImpossible('Fichier vide.')
  return meilleure
}
