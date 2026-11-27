/**
 * The dossier open in this tab, shared by every tool of the tab — the
 * React tools and the standalone pages alike, which reach it through the
 * same tab's sessionStorage and IndexedDB. Framework-free: React reads it
 * with useSyncExternalStore, the standalone pages through `dossier.js`.
 */

import type { Site } from '../../types/site'
import {
  autorisation,
  choisirRepertoire,
  creerSousRepertoire,
  ecrire,
  estVide,
  existe,
  lireRecent,
  lireTexte,
  listerRecents,
  messageErreur,
  navigateurCompatible,
  nomsDans,
  oublierRecent,
  retenirRecent,
  type Recent,
  type Repertoire,
} from './acces'
import { ecrireFiche, FICHIER_FICHE, lireFiche, nomDeRepertoire, nomLibre, nouvelleFiche, REPERTOIRE_EXPORTS, REPERTOIRE_SOURCES, type FicheDossier } from './format'

export interface DossierOuvert {
  repertoire: Repertoire
  fiche: FicheDossier
}

export type EtatSession =
  | { etat: 'indisponible' }
  | { etat: 'demarrage' }
  | { etat: 'aucun' }
  /** Known dossier whose permission the browser has forgotten: one click to resume. */
  | { etat: 'a-autoriser'; id: string; nom: string }
  | { etat: 'ouvert'; dossier: DossierOuvert }

const CLE_COURANT = 'sir-toolbox.dossier'
const CLE_AUTEUR = 'sir-toolbox.auteur'

let etat: EtatSession = navigateurCompatible() ? { etat: 'demarrage' } : { etat: 'indisponible' }
const abonnes = new Set<() => void>()

function poser(suite: EtatSession) {
  etat = suite
  for (const f of abonnes) f()
}

export function abonner(f: () => void): () => void {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

export const lireEtat = (): EtatSession => etat

export function dossierOuvert(): DossierOuvert | null {
  return etat.etat === 'ouvert' ? etat.dossier : null
}

// ---- Author -----------------------------------------------------------------------------------

/** Name or initials of whoever works on this computer, written on every save. */
export function auteur(): string {
  try {
    return localStorage.getItem(CLE_AUTEUR) ?? ''
  } catch {
    return ''
  }
}

export function definirAuteur(nom: string) {
  try {
    localStorage.setItem(CLE_AUTEUR, nom.trim())
  } catch {
    /* asked again next time */
  }
  poser({ ...etat })
}

export const signature = () => auteur() || 'Poste sans nom'

// ---- Current dossier of the tab -----------------------------------------------------------------

function memoriserCourant(id: string | null) {
  try {
    if (id) sessionStorage.setItem(CLE_COURANT, id)
    else sessionStorage.removeItem(CLE_COURANT)
  } catch {
    /* the dossier stays open until the page is left */
  }
}

function courantMemorise(): string | null {
  try {
    return sessionStorage.getItem(CLE_COURANT)
  } catch {
    return null
  }
}

let demarrage: Promise<void> | null = null

/** Resumes the tab's dossier, if any — without a click when the browser still allows it. */
export function demarrer(): Promise<void> {
  if (etat.etat === 'indisponible') return Promise.resolve()
  demarrage ??= (async () => {
    const id = courantMemorise()
    const recent = id ? await lireRecent(id).catch(() => undefined) : undefined
    if (!recent) {
      poser({ etat: 'aucun' })
      return
    }
    try {
      if ((await autorisation(recent.repertoire, false)) === 'granted') {
        await charger(recent.repertoire)
        return
      }
    } catch {
      /* asked below */
    }
    poser({ etat: 'a-autoriser', id: recent.id, nom: recent.nom })
  })()
  return demarrage
}

async function charger(repertoire: Repertoire): Promise<DossierOuvert> {
  const lu = await lireTexte(repertoire, FICHIER_FICHE)
  if (!lu) throw new Error(`« ${repertoire.name} » n'est pas (ou plus) un dossier SIR Toolbox : dossier.json est introuvable.`)
  const fiche = lireFiche(lu.texte, repertoire.name)
  const dossier = { repertoire, fiche }
  memoriserCourant(fiche.id)
  await retenirRecent({ id: fiche.id, nom: fiche.nom, affaire: fiche.affaire, repertoire, ouvert: new Date().toISOString() })
  poser({ etat: 'ouvert', dossier })
  return dossier
}

/** After a click: asks the browser for the dossier it has forgotten. */
export async function autoriser(): Promise<void> {
  if (etat.etat !== 'a-autoriser') return
  await ouvrirRecent(etat.id)
}

export async function ouvrirRecent(id: string): Promise<void> {
  const recent = await lireRecent(id)
  if (!recent) throw new Error("Ce dossier n'est plus dans la liste des dossiers récents.")
  if ((await autorisation(recent.repertoire, true)) !== 'granted') throw new Error("L'accès au dossier n'a pas été autorisé.")
  try {
    await charger(recent.repertoire)
  } catch (e) {
    throw new Error(`« ${recent.nom} » : ${messageErreur(e)}`, { cause: e })
  }
}

/** Opens a folder known to be a dossier (already allowed by the picker). */
export async function ouvrirRepertoire(repertoire: Repertoire): Promise<void> {
  await charger(repertoire)
}

export type ResultatOuverture = { etat: 'ouvert' } | { etat: 'annule' } | { etat: 'pas-un-dossier'; repertoire: Repertoire }

/** "Open a dossier…": the picker, then the card of the chosen folder. */
export async function ouvrirAutre(): Promise<ResultatOuverture> {
  const repertoire = await choisirRepertoire()
  if (!repertoire) return { etat: 'annule' }
  if (!(await existe(repertoire, FICHIER_FICHE))) return { etat: 'pas-un-dossier', repertoire }
  await charger(repertoire)
  return { etat: 'ouvert' }
}

/** Makes an existing folder (with or without files) a dossier. */
export async function initialiser(repertoire: Repertoire, nom: string, affaire: string): Promise<void> {
  const fiche = nouvelleFiche(nom || repertoire.name, affaire, signature())
  await ecrire(repertoire, FICHIER_FICHE, ecrireFiche(fiche))
  await charger(repertoire)
}

export type ResultatCreation = { etat: 'ouvert'; emplacement: string } | { etat: 'annule' } | { etat: 'deja-un-dossier'; repertoire: Repertoire }

/**
 * "New dossier": the user picks where. An empty folder (made in the picker
 * for the occasion) becomes the dossier; any other folder receives a new
 * sub-folder named after the dossier.
 */
export async function creer(nom: string, affaire: string): Promise<ResultatCreation> {
  const parent = await choisirRepertoire()
  if (!parent) return { etat: 'annule' }
  if (await existe(parent, FICHIER_FICHE)) return { etat: 'deja-un-dossier', repertoire: parent }
  let repertoire = parent
  if (!(await estVide(parent))) {
    const base = nomDeRepertoire([affaire, nom].filter((x) => x.trim()).join(' ')) || 'Dossier SIR'
    const noms = await nomsDans(parent, '')
    repertoire = await creerSousRepertoire(parent, nomLibre(base, (n) => noms.has(n.toLowerCase())))
  }
  await initialiser(repertoire, nom, affaire)
  return { etat: 'ouvert', emplacement: repertoire === parent ? parent.name : `${parent.name} › ${repertoire.name}` }
}

export function fermer() {
  memoriserCourant(null)
  poser({ etat: 'aucun' })
}

export { listerRecents, oublierRecent, type Recent }

// ---- Card -------------------------------------------------------------------------------------

let fileFiche: Promise<unknown> = Promise.resolve()

/**
 * Changes dossier.json. The card on disk is read again first: a colleague
 * may have changed it since (another tool's trace, the site), and those
 * changes are kept. Changes are queued, never written at the same time.
 */
export function modifierFiche(modif: (f: FicheDossier) => FicheDossier | null): Promise<FicheDossier | null> {
  const suite = fileFiche.then(async () => {
    const d = dossierOuvert()
    if (!d) return null
    const lu = await lireTexte(d.repertoire, FICHIER_FICHE)
    const actuelle = lu ? lireFiche(lu.texte, d.repertoire.name) : d.fiche
    const nouvelle = modif(actuelle)
    if (!nouvelle) {
      if (lu) majFicheLocale(d, actuelle)
      return actuelle
    }
    const datee = { ...nouvelle, modifie: { le: new Date().toISOString(), par: signature() } }
    await ecrire(d.repertoire, FICHIER_FICHE, ecrireFiche(datee))
    majFicheLocale(d, datee)
    return datee
  })
  fileFiche = suite.catch(() => undefined)
  return suite
}

function majFicheLocale(d: DossierOuvert, fiche: FicheDossier) {
  if (dossierOuvert() !== d) return
  poser({ etat: 'ouvert', dossier: { ...d, fiche } })
}

/** Re-reads the card (when coming back to the tab), to show a colleague's changes. */
export async function rafraichirFiche(): Promise<void> {
  const d = dossierOuvert()
  if (!d) return
  const lu = await lireTexte(d.repertoire, FICHIER_FICHE).catch(() => null)
  if (!lu) return
  const fiche = lireFiche(lu.texte, d.repertoire.name)
  if (JSON.stringify(fiche) !== JSON.stringify(d.fiche)) majFicheLocale(d, fiche)
}

export function enregistrerSite(site: Site | null): Promise<FicheDossier | null> {
  return modifierFiche((f) => (JSON.stringify(f.site) === JSON.stringify(site) ? null : { ...f, site }))
}

export const siteDuDossier = (): Site | null => dossierOuvert()?.fiche.site ?? null

/** Records on the card that a tool was changed (at most every few minutes per person). */
export function tracerOutil(outil: string): Promise<unknown> {
  const par = signature()
  return modifierFiche((f) => {
    const t = f.outils[outil]
    if (t && t.par === par && Date.now() - new Date(t.le).getTime() < 5 * 60_000) return null
    return { ...f, outils: { ...f.outils, [outil]: { le: new Date().toISOString(), par } } }
  })
}

// ---- Sources and exports ------------------------------------------------------------------------

/**
 * Copies a file dropped in a tool into sources/. The same file dropped twice
 * (same name, same size) is copied once; another file of the same name is
 * kept beside it, numbered.
 */
export async function copierSource(fichier: File): Promise<void> {
  const d = dossierOuvert()
  if (!d) return
  const noms = await nomsDans(d.repertoire, REPERTOIRE_SOURCES)
  const deja = await existe(d.repertoire, `${REPERTOIRE_SOURCES}/${fichier.name}`)
  if (deja && deja.taille === fichier.size) return
  const nom = nomLibre(fichier.name, (n) => noms.has(n.toLowerCase()))
  await ecrire(d.repertoire, `${REPERTOIRE_SOURCES}/${nom}`, fichier)
}

export async function copierSources(fichiers: File[]): Promise<void> {
  for (const f of fichiers) await copierSource(f).catch(() => undefined)
}

let depotsSuivis = false

/**
 * Every file the user hands to a tool — chosen in a file dialog or dropped
 * on the page — is copied into sources/ while a dossier is open. Listened
 * to once for the whole page, ahead of the tools' own handlers.
 */
export function suivreDepots() {
  if (depotsSuivis || typeof document === 'undefined') return
  depotsSuivis = true
  document.addEventListener(
    'change',
    (e) => {
      const cible = e.target
      if (dossierOuvert() && cible instanceof HTMLInputElement && cible.type === 'file' && cible.files?.length) void copierSources([...cible.files])
    },
    true,
  )
  document.addEventListener(
    'drop',
    (e) => {
      const fichiers = e.dataTransfer?.files
      if (dossierOuvert() && fichiers?.length) void copierSources([...fichiers])
    },
    true,
  )
}

/**
 * Keeps a copy of a produced file in exports/ (the download itself still
 * happens). The same export made again replaces the former one.
 */
export async function copierExport(contenu: Blob, nomFichier: string): Promise<void> {
  const d = dossierOuvert()
  if (!d) return
  await ecrire(d.repertoire, `${REPERTOIRE_EXPORTS}/${nomFichier.replace(/[\\/:*?"<>|]/g, '-')}`, contenu)
}
