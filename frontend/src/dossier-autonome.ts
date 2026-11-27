/**
 * Dossiers for the standalone pages (maillage, logs, données publiques),
 * built to `dossier.js` at the site root and loaded by each page with
 * `<script type="module" src="dossier.js">`. The pages are plain scripts:
 * they reach the dossier through `window.SirDossier`, available once the
 * `sir-dossier:pret` event has fired.
 *
 *   SirDossier.bandeau()                      floating dossier banner
 *   SirDossier.synchroniser({ outil, version, lire, appliquer, estVide })
 *                                             returns { signaler() } to call on each change,
 *                                             etat() and surEtat(f) to follow the loading
 *   SirDossier.site()                         the dossier's site, or null
 *   SirDossier.points()                       the dossier's investigation points (promise, [] if none)
 *   SirDossier.indexerPoints(points)          nom → point, names matched loosely ("PZ01" = "Pz1")
 *   SirDossier.surChangement(f)               f() when a dossier is opened, closed or changed
 */

import { monterBandeau } from './components/dossier/bandeau'
import { indexer, lireEtatPoints, rafraichirPoints, type PointDossier } from './lib/dossier/points'
import { abonner, demarrer, dossierOuvert, siteDuDossier } from './lib/dossier/session'
import { SynchroOutil, type OptionsSynchro } from './lib/dossier/synchro'
import type { Site } from './types/site'

interface Synchro {
  /** To call on each change of the page's state. */
  signaler(): void
  /** 'inactif' (no dossier), 'chargement', 'a-jour', 'choix', 'conflit'… */
  etat(): string
  /** f() on each change of that state; returns what unsubscribes. */
  surEtat(f: () => void): () => void
  /** What is on screen counts as saved (a prefill from the dossier's site). */
  referencer(): void
}

interface SirDossier {
  bandeau(): void
  synchroniser<T>(options: OptionsSynchro<T>): Synchro
  site(): Site | null
  points(): Promise<PointDossier[]>
  indexerPoints(points: PointDossier[]): (nom: string) => PointDossier | null
  /** Identifier of the open dossier, or null. */
  idDossier(): string | null
  surChangement(f: () => void): () => void
  demarrer(): Promise<void>
}

declare global {
  interface Window {
    SirDossier?: SirDossier
  }
}

let bandeauMonte = false

window.SirDossier = {
  bandeau() {
    if (bandeauMonte) return
    bandeauMonte = true
    const conteneur = document.createElement('div')
    document.body.append(conteneur)
    monterBandeau(conteneur, { flottant: true })
  },
  synchroniser<T>(options: OptionsSynchro<T>) {
    const s = new SynchroOutil<T>(options)
    s.attacher()
    return { signaler: () => s.signaler(), etat: () => s.lireEtat().statut.etat, surEtat: s.abonner, referencer: () => s.referencer() }
  },
  site: siteDuDossier,
  async points() {
    await demarrer()
    await rafraichirPoints()
    const e = lireEtatPoints()
    return e.etat === 'pret' ? e.points : []
  },
  indexerPoints: indexer,
  idDossier: () => dossierOuvert()?.fiche.id ?? null,
  surChangement: abonner,
  demarrer,
}

window.dispatchEvent(new Event('sir-dossier:pret'))
