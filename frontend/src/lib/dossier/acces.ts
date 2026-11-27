/**
 * The disk, through the browser: Edge and Chrome let a page read and write a
 * folder the user picked (File System Access API). The folder's handle is
 * kept in IndexedDB so that the dossier can be reopened later; the browser
 * asks again for permission when it has forgotten it (one click), unless the
 * user chose "Allow on every visit".
 */

declare global {
  interface FileSystemHandle {
    queryPermission?(descripteur: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission?(descripteur: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  }
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string | FileSystemHandle }): Promise<FileSystemDirectoryHandle>
  }
}

export type Repertoire = FileSystemDirectoryHandle

export function navigateurCompatible(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined'
}

/** Plain-French reason for a failed disk operation. */
export function messageErreur(e: unknown): string {
  const nom = e instanceof DOMException || e instanceof Error ? e.name : ''
  switch (nom) {
    case 'NotAllowedError':
      return "L'accès au dossier a été refusé, par vous ou par la configuration du navigateur sur ce poste."
    case 'SecurityError':
      return "Le navigateur interdit l'accès à ce dossier : dossier système, ou écriture sur le disque bloquée par la configuration du poste (à voir avec le service informatique)."
    case 'NotFoundError':
      return "Le dossier ou le fichier n'existe plus à cet emplacement : déplacé, renommé ou supprimé ?"
    case 'NoModificationAllowedError':
    case 'InvalidStateError':
      return 'Le fichier est verrouillé par un autre programme ou en lecture seule (synchronisation OneDrive en cours ?). Nouvel essai à la prochaine modification.'
    case 'QuotaExceededError':
      return "Le disque est plein : impossible d'enregistrer."
    case 'TypeMismatchError':
      return 'Un fichier porte le nom attendu pour un dossier, ou l’inverse.'
    default:
      return e instanceof Error ? e.message : String(e)
  }
}

const estAbandon = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** The folder picker; null when the user closed it. */
export async function choisirRepertoire(): Promise<Repertoire | null> {
  if (!window.showDirectoryPicker) throw new Error("Ce navigateur ne permet pas d'ouvrir un dossier : utilisez Edge ou Chrome.")
  try {
    // The same id makes the picker reopen where the last dossier was chosen.
    return await window.showDirectoryPicker({ id: 'sir-toolbox-dossiers', mode: 'readwrite', startIn: 'documents' })
  } catch (e) {
    if (estAbandon(e)) return null
    throw e
  }
}

/** Read and write permission on a folder; asking needs a click from the user. */
export async function autorisation(rep: Repertoire, demander: boolean): Promise<PermissionState> {
  const mode = { mode: 'readwrite' as const }
  if (!rep.queryPermission) return 'granted'
  const etat = await rep.queryPermission(mode)
  if (etat === 'granted' || !demander || !rep.requestPermission) return etat
  return rep.requestPermission(mode)
}

// ---- Files ------------------------------------------------------------------------------------

/** Path within the dossier: "sources/rapport.xlsx" → folders, then file name. */
function decouper(chemin: string): { dossiers: string[]; nom: string } {
  const morceaux = chemin.split('/').filter(Boolean)
  return { dossiers: morceaux.slice(0, -1), nom: morceaux[morceaux.length - 1] ?? '' }
}

async function sousRepertoire(rep: Repertoire, dossiers: string[], creer: boolean): Promise<Repertoire | null> {
  let r = rep
  for (const d of dossiers) {
    try {
      r = await r.getDirectoryHandle(d, { create: creer })
    } catch (e) {
      if (!creer && e instanceof DOMException && e.name === 'NotFoundError') return null
      throw e
    }
  }
  return r
}

async function poignee(rep: Repertoire, chemin: string, creer: boolean): Promise<FileSystemFileHandle | null> {
  const { dossiers, nom } = decouper(chemin)
  const r = await sousRepertoire(rep, dossiers, creer)
  if (!r) return null
  try {
    return await r.getFileHandle(nom, { create: creer })
  } catch (e) {
    if (!creer && e instanceof DOMException && e.name === 'NotFoundError') return null
    throw e
  }
}

export interface Lu {
  texte: string
  /** Last modification on disk, ms. */
  date: number
}

/** A file's text, or null when it does not exist. */
export async function lireTexte(rep: Repertoire, chemin: string): Promise<Lu | null> {
  const p = await poignee(rep, chemin, false)
  if (!p) return null
  const f = await p.getFile()
  return { texte: await f.text(), date: f.lastModified }
}

/** Last modification of a file (ms), or null when it does not exist. */
export async function dateFichier(rep: Repertoire, chemin: string): Promise<number | null> {
  const p = await poignee(rep, chemin, false)
  return p ? (await p.getFile()).lastModified : null
}

export async function existe(rep: Repertoire, chemin: string): Promise<{ taille: number } | null> {
  const p = await poignee(rep, chemin, false)
  return p ? { taille: (await p.getFile()).size } : null
}

/** Writes a file (and its folders), returning its new modification date. */
export async function ecrire(rep: Repertoire, chemin: string, contenu: string | Blob): Promise<number> {
  const p = (await poignee(rep, chemin, true))!
  const flux = await p.createWritable()
  try {
    await flux.write(contenu)
    await flux.close()
  } catch (e) {
    await flux.abort().catch(() => undefined)
    throw e
  }
  return (await p.getFile()).lastModified
}

export async function estVide(rep: Repertoire): Promise<boolean> {
  for await (const nom of rep.keys()) {
    // Left by Windows and macOS in any folder.
    if (nom !== 'desktop.ini' && nom !== '.DS_Store' && nom !== 'Thumbs.db') return false
  }
  return true
}

export async function nomsDans(rep: Repertoire, dossier: string): Promise<Set<string>> {
  const r = await sousRepertoire(rep, dossier.split('/').filter(Boolean), false)
  const noms = new Set<string>()
  if (r) for await (const nom of r.keys()) noms.add(nom.toLowerCase())
  return noms
}

export async function creerSousRepertoire(rep: Repertoire, nom: string): Promise<Repertoire> {
  return rep.getDirectoryHandle(nom, { create: true })
}

// ---- Recent dossiers (IndexedDB) --------------------------------------------------------------

export interface Recent {
  id: string
  nom: string
  affaire: string
  repertoire: Repertoire
  /** Last opened, ISO. */
  ouvert: string
}

const BASE = 'sir-toolbox-dossiers'
const TABLE = 'recents'

function base(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const req = indexedDB.open(BASE, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE, { keyPath: 'id' })
    req.onsuccess = () => resoudre(req.result)
    req.onerror = () => rejeter(req.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, action: (t: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await base()
  try {
    return await new Promise<T>((resoudre, rejeter) => {
      const req = action(db.transaction(TABLE, mode).objectStore(TABLE))
      req.onsuccess = () => resoudre(req.result)
      req.onerror = () => rejeter(req.error)
    })
  } finally {
    db.close()
  }
}

export async function listerRecents(): Promise<Recent[]> {
  const tous = await transaction<Recent[]>('readonly', (t) => t.getAll())
  return tous.sort((a, b) => b.ouvert.localeCompare(a.ouvert))
}

export const lireRecent = (id: string) => transaction<Recent | undefined>('readonly', (t) => t.get(id))

export async function retenirRecent(r: Recent): Promise<void> {
  // The same folder opened under another id (card rewritten by hand, copy of
  // a dossier) replaces its former entry instead of showing twice.
  for (const autre of await listerRecents()) {
    if (autre.id !== r.id && (await autre.repertoire.isSameEntry(r.repertoire).catch(() => false))) await oublierRecent(autre.id)
  }
  await transaction('readwrite', (t) => t.put(r))
}

export const oublierRecent = (id: string) => transaction('readwrite', (t) => t.delete(id))
