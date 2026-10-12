import type { PageAnalysee, Recepisse } from './analyse'

export interface FichierAnalyse {
  nom: string
  pages: PageAnalysee[]
}

/** Where a lot's operator name comes from. */
export type Origine =
  | { type: 'recepisse' }
  /** No receipt in the file: tied to another file's receipt, because its
   *  plans are the same pages or the file names share the sender. */
  | { type: 'rattache'; lot: string; motif: 'plans identiques' | 'même envoi' }
  | { type: 'fichier' }

/** One operator's reply: a receipt and the pages that follow it, or a
 *  file of plans sent without one. A file usually holds one lot. */
export interface Lot {
  id: string
  fichier: number
  /** 0-based page indices in the file. */
  pages: number[]
  recepisse: Recepisse | null
  exploitant: string
  origine: Origine
  categories: string[]
}

export const clePage = (fichier: number, page: number) => `${fichier}:${page}`

/** DICT platforms (Sogelink / DICT.fr) name the files
 *  "<affaire>__<Exploitant-avec-tirets>[---<Contact>]_<n° ou PJ_…>.pdf". */
export function lireNomFichier(nom: string): { envoi: string | null; exploitant: string } {
  const base = nom.replace(/\.pdf$/i, '')
  const i = base.indexOf('__')
  if (i < 0) return { envoi: null, exploitant: base.replace(/[_]+/g, ' ').trim() }
  const partie = base.slice(i + 2).split('_')[0]
  return {
    envoi: partie.toLowerCase(),
    exploitant: partie.split('---')[0].replace(/-+/g, ' ').trim() || base,
  }
}

/** Splits each file at its receipts: a merged file of several replies
 *  gives one lot per receipt. */
function decouper(fichiers: FichierAnalyse[]): Omit<Lot, 'exploitant' | 'origine' | 'categories'>[] {
  const lots: Omit<Lot, 'exploitant' | 'origine' | 'categories'>[] = []
  fichiers.forEach((f, fi) => {
    let courant: (typeof lots)[number] | null = null
    let n = 0
    for (const p of f.pages) {
      if (!courant || (p.nature === 'recepisse' && courant.recepisse)) {
        // Named after the file, so that what the user typed for a lot
        // survives adding or removing other files.
        courant = { id: `${f.nom}#${n++}`, fichier: fi, pages: [], recepisse: null }
        lots.push(courant)
      }
      if (p.nature === 'recepisse') courant.recepisse = p.recepisse
      courant.pages.push(p.index)
    }
  })
  return lots
}

/** Pages already present elsewhere, each pointing to the copy kept: the
 *  one that comes with a receipt, else the first one loaded. */
export function trouverDoublons(fichiers: FichierAnalyse[], lots: Pick<Lot, 'fichier' | 'pages' | 'recepisse'>[]) {
  const vus = new Map<string, { fichier: number; page: number }>()
  const doublons = new Map<string, { fichier: number; page: number }>()
  const ordre = [...lots.filter((l) => l.recepisse), ...lots.filter((l) => !l.recepisse)]
  for (const lot of ordre) {
    for (const p of lot.pages) {
      const e = fichiers[lot.fichier].pages[p].empreinte
      if (!e) continue
      const original = vus.get(e)
      if (original) doublons.set(clePage(lot.fichier, p), original)
      else vus.set(e, { fichier: lot.fichier, page: p })
    }
  }
  return doublons
}

export function construireLots(fichiers: FichierAnalyse[]): { lots: Lot[]; doublons: Map<string, { fichier: number; page: number }> } {
  const bruts = decouper(fichiers)
  const doublons = trouverDoublons(fichiers, bruts)
  const lotDe = (fichier: number, page: number) => bruts.find((l) => l.fichier === fichier && l.pages.includes(page))
  const categoriesDesPlans = (l: (typeof bruts)[number]) =>
    l.pages.map((p) => fichiers[l.fichier].pages[p].categorie).filter((c): c is string => !!c)

  const lots: Lot[] = bruts.map((l) => {
    const nom = lireNomFichier(fichiers[l.fichier].nom)
    const avecRecepisse = l.recepisse?.exploitant
    return {
      ...l,
      exploitant: avecRecepisse ?? nom.exploitant,
      origine: avecRecepisse ? { type: 'recepisse' } : { type: 'fichier' },
      categories: [...new Set([...(l.recepisse?.categories ?? []), ...categoriesDesPlans(l)])],
    }
  })

  for (const lot of lots) {
    if (lot.origine.type !== 'fichier') continue
    let source: Lot | undefined
    let motif: 'plans identiques' | 'même envoi' = 'plans identiques'
    for (const p of lot.pages) {
      const d = doublons.get(clePage(lot.fichier, p))
      const l = d && lotDe(d.fichier, d.page)
      source = l ? lots.find((x) => x.id === l.id && x.origine.type === 'recepisse') : undefined
      if (source) break
    }
    if (!source) {
      const envoi = lireNomFichier(fichiers[lot.fichier].nom).envoi
      source = envoi
        ? lots.find((x) => x.origine.type === 'recepisse' && lireNomFichier(fichiers[x.fichier].nom).envoi === envoi)
        : undefined
      motif = 'même envoi'
    }
    if (source) {
      lot.exploitant = source.exploitant
      lot.origine = { type: 'rattache', lot: source.id, motif }
      lot.categories = [...new Set([...source.categories, ...lot.categories])]
    }
  }
  return { lots, doublons }
}

/** Case- and accent-blind key, so that two spellings of one operator end
 *  up in the same group. */
export const cleExploitant = (nom: string) =>
  nom
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
