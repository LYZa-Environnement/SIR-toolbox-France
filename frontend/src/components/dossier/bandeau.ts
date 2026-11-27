/**
 * The "Dossier" banner at the top of every page: which dossier is open,
 * where the current tool's work stands (saved, being saved, colleague's
 * version…), and a menu to open, create or close a dossier.
 *
 * Plain DOM, so that the same banner serves the React tools and the
 * standalone pages (maillage, logs, données publiques).
 */

import { ilYa, quand, type Trace } from '../../lib/dossier/format'
import { messageErreur, type Repertoire } from '../../lib/dossier/acces'
import {
  abonner,
  auteur,
  autoriser,
  creer,
  definirAuteur,
  demarrer,
  fermer,
  initialiser,
  lireEtat,
  listerRecents,
  oublierRecent,
  ouvrirAutre,
  ouvrirRecent,
  ouvrirRepertoire,
  signature,
  suivreDepots,
  type Recent,
} from '../../lib/dossier/session'
import { abonnerActive, synchroActive, type EtatSynchro } from '../../lib/dossier/synchro'
import { titreOutil } from '../../lib/dossier/outils'
import { STYLE_BANDEAU } from './style'

type Enfant = Node | string | null | false | undefined

function h(tag: string, attrs: Record<string, unknown> = {}, ...enfants: Enfant[]): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else if (k === 'class') el.className = String(v)
    else if (k in el && k !== 'list') (el as unknown as Record<string, unknown>)[k] = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const e of enfants) if (e !== null && e !== undefined && e !== false) el.append(e)
  return el
}

const qui = (t: Trace) => (t.par && t.par !== signature() ? t.par : 'vous')

function injecterStyle() {
  if (document.getElementById('sird-style')) return
  document.head.append(h('style', { id: 'sird-style' }, STYLE_BANDEAU))
}

/** Text and actions for the current tool's state. */
function blocSynchro(s: EtatSynchro | null): HTMLElement | null {
  const synchro = synchroActive()
  if (!s || !synchro) return null
  const st = s.statut
  const bouton = (texte: string, action: () => unknown, principal = false) =>
    h('button', { type: 'button', class: `sird-btn${principal ? ' sird-btn--plein' : ''}`, onclick: () => void action() }, texte)
  const outil = titreOutil(s.outil)
  let contenu: Enfant[] = []
  let ton = ''
  switch (st.etat) {
    case 'inactif':
      return null
    case 'chargement':
      contenu = [`${outil} : lecture du dossier…`]
      break
    case 'a-jour':
      contenu = [
        st.trace
          ? st.trace.par === signature()
            ? `${outil} : enregistré ${quand(st.trace.le)}`
            : `${outil} : modifié par ${st.trace.par} ${quand(st.trace.le)}`
          : `${outil} : enregistré dans le dossier à chaque modification`,
      ]
      ton = 'ok'
      break
    case 'enregistrement':
      contenu = [`${outil} : enregistrement…`]
      break
    case 'choix':
      ton = 'attention'
      contenu = [
        h('span', {}, `Le dossier contient déjà un travail sur ${outil} (enregistré par ${qui(st.distant)} ${quand(st.distant.le)}), différent de l'écran.`),
        bouton('Reprendre celui du dossier', () => synchro.reprendreDossier(), true),
        bouton("Garder l'écran", () => synchro.garderEcran()),
      ]
      break
    case 'conflit':
      ton = 'alerte'
      contenu = [
        h('span', {}, `${st.distant.par || 'Quelqu’un'} a enregistré une autre version de ${outil} ${quand(st.distant.le)} pendant que vous travailliez. Rien n'est écrasé tant que vous n'avez pas choisi.`),
        bouton('Prendre sa version', () => synchro.reprendreDossier()),
        bouton('Garder la mienne', () => synchro.garderEcran(), true),
      ]
      break
    case 'distant':
      ton = 'attention'
      contenu = [
        h('span', {}, `Version plus récente de ${outil} enregistrée par ${qui(st.distant)} ${quand(st.distant.le)}.`),
        bouton('Afficher', () => synchro.reprendreDossier(), true),
      ]
      break
    case 'erreur':
      ton = 'alerte'
      contenu = [h('span', {}, `${outil} : ${st.message}`), !st.bloquant && bouton('Réessayer', () => synchro.enregistrer(true))]
      break
  }
  return h(
    'div',
    { class: `sird-synchro${ton ? ` sird-synchro--${ton}` : ''}`, role: 'status' },
    ...contenu,
    s.presence && st.etat !== 'conflit'
      ? h('span', { class: 'sird-presence' }, `${s.presence.par} a modifié cet outil ${ilYa(s.presence.le)} : si vous y travaillez en même temps, vos enregistrements se croiseront.`)
      : null,
  )
}

interface EtatMenu {
  ouvert: boolean
  nom: string
  affaire: string
  auteur: string
  message: { texte: string; erreur: boolean } | null
  aInitialiser: Repertoire | null
  recents: Recent[]
  occupe: boolean
}

/** Mounts the banner in `conteneur`; returns what unmounts it. */
export function monterBandeau(conteneur: HTMLElement, options: { flottant?: boolean } = {}): () => void {
  injecterStyle()
  const racine = h('div', { class: options.flottant ? 'sird sird--flottant' : 'sird' })
  conteneur.append(racine)
  const menu: EtatMenu = { ouvert: false, nom: '', affaire: '', auteur: auteur(), message: null, aInitialiser: null, recents: [], occupe: false }

  const chargerRecents = async () => {
    menu.recents = await listerRecents().catch(() => [])
    rendre()
  }

  async function agir(action: () => Promise<string | null | void>) {
    if (menu.auteur.trim() && menu.auteur.trim() !== auteur()) definirAuteur(menu.auteur)
    menu.occupe = true
    menu.message = null
    rendre()
    try {
      const texte = await action()
      if (texte) menu.message = { texte, erreur: false }
      // A dossier just opened: the menu has done its job.
      else if (lireEtat().etat === 'ouvert' && !menu.aInitialiser) menu.ouvert = false
    } catch (e) {
      menu.message = { texte: messageErreur(e), erreur: true }
    } finally {
      menu.occupe = false
      await chargerRecents()
    }
  }

  const fermerMenu = () => {
    menu.ouvert = false
    menu.message = null
    menu.aInitialiser = null
    rendre()
  }

  function basculerMenu() {
    menu.ouvert = !menu.ouvert
    if (menu.ouvert && !menu.auteur.trim()) menu.auteur = auteur()
    if (menu.ouvert) void chargerRecents()
    else fermerMenu()
    rendre()
  }

  // Closing the menu with Escape or a click elsewhere.
  const surTouche = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && menu.ouvert) fermerMenu()
  }
  const surClic = (e: MouseEvent) => {
    if (menu.ouvert && !racine.contains(e.target as Node)) fermerMenu()
  }
  document.addEventListener('keydown', surTouche)
  document.addEventListener('mousedown', surClic)

  /** Buttons that need a name (and a dossier name) follow the typing, without a redraw. */
  function majDisponibilite() {
    const ok = { auteur: !!(auteur() || menu.auteur.trim()), nom: !!(menu.nom.trim() || menu.affaire.trim()) }
    for (const b of racine.querySelectorAll<HTMLButtonElement>('[data-requiert]')) {
      b.disabled = menu.occupe || (b.dataset.requiert ?? '').split(' ').some((r) => !ok[r as keyof typeof ok])
    }
    racine.querySelector('.sird-aide--attention')?.toggleAttribute('hidden', ok.auteur)
  }

  function champ(libelle: string, cle: 'nom' | 'affaire' | 'auteur', attrs: Record<string, unknown> = {}) {
    return h(
      'label',
      { class: 'sird-champ' },
      libelle,
      h('input', {
        type: 'text',
        value: menu[cle],
        'data-champ': cle,
        oninput: (e: Event) => {
          menu[cle] = (e.target as HTMLInputElement).value
          majDisponibilite()
        },
        ...attrs,
      }),
    )
  }

  function panneau(): HTMLElement {
    const s = lireEtat()
    const sansAuteur = !auteur() && !menu.auteur.trim()
    const contenu: Enfant[] = []
    if (s.etat === 'ouvert') {
      const f = s.dossier.fiche
      contenu.push(
        h(
          'section',
          { class: 'sird-section' },
          h('p', { class: 'sird-titre' }, 'Dossier ouvert'),
          h('p', { class: 'sird-gros' }, f.nom, f.affaire ? h('span', { class: 'sird-discret' }, ` · ${f.affaire}`) : null),
          h('p', { class: 'sird-discret' }, `Dossier « ${s.dossier.repertoire.name} » sur le disque${f.site ? ` · site : ${f.site.label}` : ''}`),
          h(
            'p',
            { class: 'sird-actions' },
            h('a', { class: 'sird-btn', href: `${import.meta.env.BASE_URL}#/` }, 'Voir le dossier (accueil)'),
            h(
              'button',
              {
                type: 'button',
                class: 'sird-btn',
                onclick: () => {
                  fermer()
                  fermerMenu()
                },
              },
              'Fermer le dossier',
            ),
          ),
        ),
      )
    }
    contenu.push(
      h(
        'section',
        { class: 'sird-section' },
        champ('Votre nom ou vos initiales', 'auteur', { placeholder: 'ex. M. Durand', autocomplete: 'name' }),
        h('p', { class: 'sird-aide' }, 'Inscrit à chaque enregistrement, pour que vos collègues sachent qui a modifié quoi.'),
      ),
    )
    contenu.push(
      h(
        'section',
        { class: 'sird-section' },
        h('p', { class: 'sird-titre' }, 'Nouveau dossier'),
        h('div', { class: 'sird-ligne' }, champ("N° d'affaire", 'affaire', { placeholder: '0712345' }), champ('Nom', 'nom', { placeholder: 'Usine X — Lyon' })),
        h(
          'button',
          {
            type: 'button',
            class: 'sird-btn sird-btn--plein',
            'data-requiert': 'auteur nom',
            disabled: menu.occupe || sansAuteur || (!menu.nom.trim() && !menu.affaire.trim()),
            onclick: () =>
              agir(async () => {
                const r = await creer(menu.nom.trim(), menu.affaire.trim())
                if (r.etat === 'annule') return null
                if (r.etat === 'deja-un-dossier') {
                  await ouvrirRepertoire(r.repertoire)
                  return null
                }
                menu.nom = ''
                menu.affaire = ''
                return null
              }),
          },
          "Choisir l'emplacement…",
        ),
        h(
          'p',
          { class: 'sird-aide' },
          'Choisissez le dossier qui range vos études, par exemple « OneDrive - ERM › Études » : le dossier y est créé (un dossier vide choisi est utilisé tel quel). Le navigateur refuse Documents, Bureau et Téléchargements eux-mêmes : choisissez un de leurs sous-dossiers.',
        ),
      ),
    )
    const recents = menu.recents.filter((r) => s.etat !== 'ouvert' || r.id !== s.dossier.fiche.id)
    contenu.push(
      h(
        'section',
        { class: 'sird-section' },
        h('p', { class: 'sird-titre' }, 'Ouvrir'),
        h(
          'button',
          {
            type: 'button',
            class: 'sird-btn sird-btn--plein',
            'data-requiert': 'auteur',
            disabled: menu.occupe || sansAuteur,
            onclick: () =>
              agir(async () => {
                const r = await ouvrirAutre()
                if (r.etat === 'pas-un-dossier') {
                  menu.aInitialiser = r.repertoire
                  return null
                }
                return null
              }),
          },
          'Ouvrir un dossier…',
        ),
        menu.aInitialiser
          ? h(
              'div',
              { class: 'sird-question' },
              h('p', {}, `« ${menu.aInitialiser.name} » n'est pas encore un dossier SIR Toolbox (pas de dossier.json). En faire un dossier ? Ses fichiers restent en place.`),
              h(
                'button',
                {
                  type: 'button',
                  class: 'sird-btn sird-btn--plein',
                  onclick: () =>
                    agir(async () => {
                      const rep = menu.aInitialiser!
                      menu.aInitialiser = null
                      await initialiser(rep, menu.nom.trim() || rep.name, menu.affaire.trim())
                      return `« ${rep.name} » est maintenant un dossier.`
                    }),
                },
                'En faire un dossier',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'sird-btn',
                  onclick: () => {
                    menu.aInitialiser = null
                    rendre()
                  },
                },
                'Annuler',
              ),
            )
          : null,
        recents.length
          ? h(
              'ul',
              { class: 'sird-recents' },
              ...recents.map((r) =>
                h(
                  'li',
                  {},
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'sird-recent',
                      'data-requiert': 'auteur',
                      disabled: menu.occupe || sansAuteur,
                      title: `Ouvrir « ${r.repertoire.name} »`,
                      onclick: () => agir(() => ouvrirRecent(r.id).then(() => null)),
                    },
                    h('strong', {}, r.nom),
                    r.affaire ? ` · ${r.affaire}` : '',
                    h('span', { class: 'sird-discret' }, ` — ouvert ${quand(r.ouvert)}`),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'sird-oublier',
                      title: 'Retirer de la liste (le dossier reste sur le disque)',
                      'aria-label': `Retirer ${r.nom} de la liste`,
                      onclick: () => agir(() => oublierRecent(r.id).then(() => null)),
                    },
                    '×',
                  ),
                ),
              ),
            )
          : h('p', { class: 'sird-aide' }, s.etat === 'ouvert' ? 'Aucun autre dossier ouvert récemment sur ce poste.' : 'Les dossiers ouverts sur ce poste apparaîtront ici.'),
        sansAuteur ? h('p', { class: 'sird-aide sird-aide--attention' }, 'Indiquez votre nom ou vos initiales pour ouvrir ou créer un dossier.') : null,
      ),
    )
    if (menu.message) contenu.push(h('p', { class: `sird-message${menu.message.erreur ? ' sird-message--erreur' : ''}`, role: 'alert' }, menu.message.texte))
    return h('div', { class: 'sird-menu', role: 'dialog', 'aria-label': 'Dossiers' }, ...contenu)
  }

  function barre(): HTMLElement {
    const s = lireEtat()
    let gauche: Enfant[]
    let droite: Enfant[] = []
    const menuBouton = (texte: string) =>
      h('button', { type: 'button', class: 'sird-btn', 'aria-expanded': String(menu.ouvert), onclick: basculerMenu }, texte, ' ', menu.ouvert ? '▴' : '▾')
    switch (s.etat) {
      case 'indisponible':
        gauche = [h('span', { class: 'sird-discret' }, 'Dossiers : disponibles dans Edge ou Chrome uniquement.')]
        break
      case 'demarrage':
        gauche = [h('span', { class: 'sird-discret' }, 'Dossier…')]
        break
      case 'aucun':
        gauche = [h('span', { class: 'sird-etiquette' }, 'Dossier'), h('span', { class: 'sird-discret' }, 'aucun dossier ouvert : le travail n’est pas enregistré')]
        droite = [menuBouton('Ouvrir ou créer')]
        break
      case 'a-autoriser':
        gauche = [h('span', { class: 'sird-etiquette' }, 'Dossier'), h('strong', {}, s.nom), h('span', { class: 'sird-discret' }, 'le navigateur demande votre accord pour y accéder à nouveau')]
        droite = [
          h(
            'button',
            {
              type: 'button',
              class: 'sird-btn sird-btn--plein',
              onclick: () =>
                void autoriser().catch((e: unknown) => {
                  menu.ouvert = true
                  menu.message = { texte: messageErreur(e), erreur: true }
                  void chargerRecents()
                }),
            },
            'Reprendre le dossier',
          ),
          menuBouton('Autre'),
        ]
        break
      case 'ouvert': {
        const f = s.dossier.fiche
        gauche = [h('span', { class: 'sird-etiquette' }, 'Dossier'), h('strong', {}, f.nom), f.affaire ? h('span', { class: 'sird-discret' }, f.affaire) : null]
        droite = [menuBouton('Dossier')]
        break
      }
    }
    return h(
      'div',
      { class: 'sird-barre' },
      h('div', { class: 'sird-gauche' }, ...gauche),
      s.etat === 'ouvert' ? blocSynchro(synchroActive()?.lireEtat() ?? null) : null,
      h('div', { class: 'sird-droite' }, ...droite),
    )
  }

  function rendre() {
    // Typing in the menu survives a redraw: focus and caret are put back.
    const actif = document.activeElement as HTMLInputElement | null
    const cle = racine.contains(actif) ? actif?.dataset.champ : undefined
    const curseur = cle ? [actif!.selectionStart, actif!.selectionEnd] : null
    racine.replaceChildren(barre(), menu.ouvert ? panneau() : '')
    // With a dossier open the banner stays in view: a colleague's version or
    // a conflict must be seen wherever the page is scrolled.
    if (!options.flottant) conteneur.classList.toggle('sird-colle', lireEtat().etat === 'ouvert' || menu.ouvert)
    if (cle) {
      const champ = racine.querySelector<HTMLInputElement>(`[data-champ="${cle}"]`)
      champ?.focus()
      if (champ && curseur) champ.setSelectionRange(curseur[0], curseur[1])
    }
  }

  // Re-render on the dossier's and the tool's changes.
  let desabonnerSynchro: (() => void) | null = null
  const suivreSynchro = () => {
    desabonnerSynchro?.()
    desabonnerSynchro = synchroActive()?.abonner(rendre) ?? null
    rendre()
  }
  const d1 = abonner(rendre)
  const d2 = abonnerActive(suivreSynchro)
  suivreSynchro()
  // Opening the menu from elsewhere on the page (home page buttons).
  const surDemande = () => {
    if (!menu.ouvert) basculerMenu()
    racine.scrollIntoView({ block: 'nearest' })
  }
  window.addEventListener('sir-dossier:menu', surDemande)
  suivreDepots()
  void demarrer()

  return () => {
    d1()
    d2()
    desabonnerSynchro?.()
    document.removeEventListener('keydown', surTouche)
    document.removeEventListener('mousedown', surClic)
    window.removeEventListener('sir-dossier:menu', surDemande)
    racine.remove()
  }
}

/** Opens the banner's menu (from a button elsewhere on the page). */
export function ouvrirMenuDossier() {
  window.dispatchEvent(new Event('sir-dossier:menu'))
}
