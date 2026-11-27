/**
 * One tool's work kept in the open dossier, saved as it changes.
 *
 * - When a dossier opens, the tool's file is read: an empty tool takes it
 *   up; a tool already holding work asks which one to keep.
 * - Each change is saved a moment later (nothing is written when the state
 *   is the same as on disk).
 * - Before writing, the file on disk is checked: if someone else saved it
 *   in the meantime (a colleague through OneDrive), nothing is overwritten
 *   — the user chooses between their version and the colleague's.
 * - Every 20 s and when the tab comes back to the front, the file is
 *   checked for a colleague's newer version.
 *
 * Framework-free: React tools use it through `useSynchroDossier`, the
 * standalone pages through `dossier.js`.
 */

import { dateFichier, ecrire, lireTexte, messageErreur } from './acces'
import { APPLICATION, encoder, FichierIllisible, FORMAT, lireEnveloppe, nomFichierOutil, type Enveloppe, type Trace } from './format'
import { abonner, demarrer, dossierOuvert, rafraichirFiche, signature, tracerOutil } from './session'

export type Statut =
  /** No dossier open. */
  | { etat: 'inactif' }
  | { etat: 'chargement' }
  /** The tool holds work and the dossier holds other work: which one to keep? */
  | { etat: 'choix'; distant: Trace }
  | { etat: 'a-jour'; trace: Trace | null }
  | { etat: 'enregistrement' }
  /** Changed on screen and on disk by someone else: nothing is written until the user chooses. */
  | { etat: 'conflit'; distant: Trace }
  /** A newer version by someone else is on disk; nothing changed here. */
  | { etat: 'distant'; distant: Trace }
  | { etat: 'erreur'; message: string; bloquant: boolean }

export interface EtatSynchro {
  outil: string
  statut: Statut
  /** Someone else changed the tool's file a few minutes ago: they may still be at work. */
  presence: Trace | null
}

export interface OptionsSynchro<T> {
  outil: string
  /** Version of the tool's data; bump it when its shape changes, with `migrer`. */
  version: number
  /** The state to save, as it is now. */
  lire(): T
  /** Puts saved data back on screen. */
  appliquer(donnees: T): void
  /** Nothing on screen worth keeping (a tool just opened). */
  estVide(): boolean
  /** Data saved by an older version of the tool, brought to the current shape. */
  migrer?(donnees: unknown, version: number): T
}

const DELAI_ENREGISTREMENT = 1200
const DELAI_VEILLE = 20_000
const DELAI_NOUVEL_ESSAI = 15_000
/** A colleague's save younger than this is shown as work in progress. */
const PRESENCE_MS = 15 * 60_000

// ---- Tool shown in the banner ------------------------------------------------------------------

let active: SynchroOutil<unknown> | null = null
const abonnesActive = new Set<() => void>()
const annoncer = () => abonnesActive.forEach((f) => f())

export const synchroActive = () => active
export function abonnerActive(f: () => void): () => void {
  abonnesActive.add(f)
  return () => abonnesActive.delete(f)
}

// ---- Synchronisation -------------------------------------------------------------------------

export class SynchroOutil<T> {
  private o: OptionsSynchro<T>
  private etat: EtatSynchro
  private abonnes = new Set<() => void>()
  private attache = false
  private dossierId: string | null = null
  /** Revision and date on disk of the version on screen. */
  private connu: { revision: number; date: number | null } = { revision: 0, date: null }
  /** Encoded data of that version: a save with the same text is skipped. */
  private texteConnu: string | null = null
  /** Last version read from disk that is not on screen (choice, conflict, newer version). */
  private distant: { env: Enveloppe; date: number } | null = null
  /** The file cannot be overwritten safely (newer format, unreadable data). */
  private bloque = false
  private minuteur: ReturnType<typeof setTimeout> | undefined
  private veille: ReturnType<typeof setInterval> | undefined
  private enCours: Promise<void> | null = null
  private relance: { force: boolean } | null = null
  private desabonner: (() => void) | null = null

  constructor(options: OptionsSynchro<T>) {
    this.o = options
    this.etat = { outil: options.outil, statut: { etat: 'inactif' }, presence: null }
  }

  get fichier() {
    return nomFichierOutil(this.o.outil)
  }

  /** Replaces the callbacks (React passes fresh closures on each render). */
  configurer(options: OptionsSynchro<T>) {
    this.o = options
  }

  // ---- Subscription ----

  abonner = (f: () => void): (() => void) => {
    this.abonnes.add(f)
    return () => this.abonnes.delete(f)
  }

  lireEtat = (): EtatSynchro => this.etat

  private poser(statut: Statut, presence = this.etat.presence) {
    this.etat = { outil: this.o.outil, statut, presence }
    this.abonnes.forEach((f) => f())
    if (active === (this as SynchroOutil<unknown>)) annoncer()
  }

  // ---- Life cycle ----

  attacher() {
    if (this.attache) return
    this.attache = true
    this.dossierId = null
    this.desabonner = abonner(() => this.suivreSession())
    window.addEventListener('focus', this.surRetour)
    document.addEventListener('visibilitychange', this.surRetour)
    window.addEventListener('beforeunload', this.avantDepart)
    this.veille = setInterval(() => void this.verifierDistant(), DELAI_VEILLE)
    active = this as SynchroOutil<unknown>
    annoncer()
    void demarrer().then(() => this.suivreSession())
  }

  detacher() {
    if (!this.attache) return
    // A change still waiting is written now, the dossier is still open.
    if (this.minuteur) void this.enregistrer()
    this.attache = false
    this.desabonner?.()
    window.removeEventListener('focus', this.surRetour)
    document.removeEventListener('visibilitychange', this.surRetour)
    window.removeEventListener('beforeunload', this.avantDepart)
    clearInterval(this.veille)
    if (active === (this as SynchroOutil<unknown>)) {
      active = null
      annoncer()
    }
  }

  private surRetour = () => {
    if (document.visibilityState !== 'visible') return
    void rafraichirFiche()
    void this.verifierDistant()
  }

  /** Leaving with a change not yet written: the browser asks for confirmation. */
  private avantDepart = (e: BeforeUnloadEvent) => {
    if (!this.dossierId || this.bloque || this.etat.statut.etat === 'inactif') return
    const enAttente = !!this.minuteur || !!this.enCours || this.etat.statut.etat === 'conflit'
    if (enAttente && encoder(this.o.lire()) !== this.texteConnu) {
      void this.enregistrer()
      e.preventDefault()
    }
  }

  private suivreSession() {
    if (!this.attache) return
    const d = dossierOuvert()
    const id = d?.fiche.id ?? null
    if (id === this.dossierId) return
    this.dossierId = id
    clearTimeout(this.minuteur)
    this.minuteur = undefined
    this.connu = { revision: 0, date: null }
    this.texteConnu = null
    this.distant = null
    this.bloque = false
    if (!d) this.poser({ etat: 'inactif' }, null)
    else void this.charger(id!)
  }

  // ---- Reading ----

  private donneesDe(env: Enveloppe): T {
    if (env.version > this.o.version)
      throw new FichierIllisible(`${this.fichier} a été écrit par une version plus récente de l'outil : rechargez la page (Ctrl + F5) pour obtenir la dernière version.`)
    return env.version < this.o.version && this.o.migrer ? this.o.migrer(env.donnees, env.version) : (env.donnees as T)
  }

  private presenceDe(t: Trace): Trace | null {
    return t.par && t.par !== signature() && Date.now() - new Date(t.le).getTime() < PRESENCE_MS ? t : null
  }

  private async charger(id: string) {
    const d = dossierOuvert()
    if (!d) return
    this.poser({ etat: 'chargement' }, null)
    try {
      const lu = await lireTexte(d.repertoire, this.fichier)
      if (this.dossierId !== id) return
      if (!lu) {
        // The tool is new to this dossier: what is on screen goes into it.
        // An empty tool writes nothing until something is done in it.
        if (this.o.estVide()) {
          this.texteConnu = encoder(this.o.lire())
          this.poser({ etat: 'a-jour', trace: null })
        } else await this.enregistrer(true)
        return
      }
      const env = lireEnveloppe(lu.texte, this.o.outil, this.fichier)
      const donnees = this.donneesDe(env)
      const presence = this.presenceDe(env.modifie)
      if (this.o.estVide()) this.appliquer(env, lu.date, donnees, presence)
      else if (encoder(this.o.lire()) === encoder(donnees)) this.retenir(env, lu.date, donnees, presence)
      else {
        this.distant = { env, date: lu.date }
        this.poser({ etat: 'choix', distant: env.modifie }, presence)
      }
    } catch (e) {
      if (this.dossierId !== id) return
      this.bloque = e instanceof FichierIllisible
      this.poser({ etat: 'erreur', message: messageErreur(e), bloquant: this.bloque })
    }
  }

  private retenir(env: Enveloppe, date: number, donnees: T, presence: Trace | null) {
    this.connu = { revision: env.revision, date }
    this.texteConnu = encoder(donnees)
    this.distant = null
    this.poser({ etat: 'a-jour', trace: env.modifie.le ? env.modifie : null }, presence)
  }

  private appliquer(env: Enveloppe, date: number, donnees: T, presence: Trace | null) {
    try {
      this.o.appliquer(donnees)
    } catch (e) {
      // Never overwrite a file the tool could not read back.
      this.bloque = true
      this.poser({ etat: 'erreur', message: `${this.fichier} n'a pas pu être relu : ${messageErreur(e)}`, bloquant: true })
      return
    }
    this.retenir(env, date, donnees, presence)
  }

  /** A colleague's newer version, checked every 20 s and when coming back to the tab. */
  private async verifierDistant() {
    const d = dossierOuvert()
    const e = this.etat.statut.etat
    if (!d || d.fiche.id !== this.dossierId || this.bloque || (e !== 'a-jour' && e !== 'distant') || this.minuteur || this.enCours) return
    try {
      const date = await dateFichier(d.repertoire, this.fichier)
      if (date === null || date === this.connu.date || date === this.distant?.date) return
      const lu = await lireTexte(d.repertoire, this.fichier)
      if (!lu) return
      const env = lireEnveloppe(lu.texte, this.o.outil, this.fichier)
      if (env.revision === this.connu.revision) {
        // Touched by the synchronisation, same content.
        this.connu.date = lu.date
        return
      }
      this.distant = { env, date: lu.date }
      this.poser({ etat: 'distant', distant: env.modifie }, this.presenceDe(env.modifie))
    } catch {
      /* checked again later */
    }
  }

  // ---- Writing ----

  /** The state changed on screen: saved a moment later. */
  signaler() {
    const e = this.etat.statut.etat
    if (!this.dossierId || this.bloque || e === 'inactif' || e === 'chargement' || e === 'choix' || e === 'conflit') return
    clearTimeout(this.minuteur)
    this.minuteur = setTimeout(() => void this.enregistrer(), DELAI_ENREGISTREMENT)
  }

  /** Writes now. `force`: even over a colleague's version, even when nothing changed. */
  enregistrer(force = false): Promise<void> {
    clearTimeout(this.minuteur)
    this.minuteur = undefined
    if (this.enCours) {
      this.relance = { force: force || !!this.relance?.force }
      return this.enCours
    }
    const id = this.dossierId
    this.enCours = this.ecrire(id, force).finally(() => {
      this.enCours = null
      const r = this.relance
      this.relance = null
      if (r) void this.enregistrer(r.force)
    })
    return this.enCours
  }

  private async ecrire(id: string | null, force: boolean) {
    const d = dossierOuvert()
    const e = this.etat.statut.etat
    if (!d || !id || d.fiche.id !== id || this.bloque) return
    if (!force && (e === 'choix' || e === 'conflit' || e === 'chargement' || e === 'inactif')) return
    const donnees = this.o.lire()
    const texte = encoder(donnees)
    // Never a file for a tool with nothing in it.
    if (!force && this.connu.date === null && this.o.estVide()) return
    if (!force && texte === this.texteConnu) {
      if (e === 'erreur') this.poser({ etat: 'a-jour', trace: null })
      return
    }
    const avant = this.etat.statut
    this.poser({ etat: 'enregistrement' })
    try {
      if (!force) {
        const date = await dateFichier(d.repertoire, this.fichier)
        if (date !== null && date !== this.connu.date) {
          const lu = await lireTexte(d.repertoire, this.fichier)
          const env = lu ? lireEnveloppe(lu.texte, this.o.outil, this.fichier) : null
          if (lu && env && env.revision !== this.connu.revision) {
            this.distant = { env, date: lu.date }
            this.poser({ etat: 'conflit', distant: env.modifie }, this.presenceDe(env.modifie))
            return
          }
        }
      }
      const revision = Math.max(this.connu.revision, this.distant?.env.revision ?? 0) + 1
      const modifie = { le: new Date().toISOString(), par: signature() }
      // The data are encoded once: the envelope is written around their text.
      const tete = encoder({ application: APPLICATION, format: FORMAT, outil: this.o.outil, version: this.o.version, revision, modifie })
      const date = await ecrire(d.repertoire, this.fichier, `${tete.slice(0, -1)},"donnees":${texte}}`)
      if (this.dossierId !== id) return
      this.connu = { revision, date }
      this.texteConnu = texte
      this.distant = null
      this.poser({ etat: 'a-jour', trace: modifie }, null)
      void tracerOutil(this.o.outil).catch(() => undefined)
    } catch (err) {
      if (this.dossierId !== id) return
      this.poser({ etat: 'erreur', message: messageErreur(err), bloquant: false })
      // Tried again on the next change, or in a moment.
      if (avant.etat !== 'erreur') this.minuteur = setTimeout(() => void this.enregistrer(), DELAI_NOUVEL_ESSAI)
    }
  }

  // ---- User choices ----

  /** Takes the dossier's version (choice on opening, conflict, colleague's newer version). */
  async reprendreDossier() {
    const d = dossierOuvert()
    if (!d) return
    clearTimeout(this.minuteur)
    this.minuteur = undefined
    try {
      const lu = await lireTexte(d.repertoire, this.fichier)
      if (!lu) {
        this.poser({ etat: 'a-jour', trace: null })
        return
      }
      const env = lireEnveloppe(lu.texte, this.o.outil, this.fichier)
      this.appliquer(env, lu.date, this.donneesDe(env), this.presenceDe(env.modifie))
    } catch (e) {
      this.poser({ etat: 'erreur', message: messageErreur(e), bloquant: e instanceof FichierIllisible })
    }
  }

  /**
   * What is on screen now counts as saved: a tool that prefilled itself from
   * the dossier (the site's parcels) writes nothing until the user acts.
   */
  referencer() {
    if (this.etat.statut.etat === 'a-jour' && this.connu.date === null) this.texteConnu = encoder(this.o.lire())
  }

  /** Keeps what is on screen, written over the dossier's version. */
  garderEcran() {
    if (this.bloque) return Promise.resolve()
    return this.enregistrer(true)
  }
}
