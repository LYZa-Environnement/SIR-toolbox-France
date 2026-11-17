import type { ReactNode } from 'react'

export type TeinteVolet = 'vert' | 'bleu' | 'ocre' | 'violet' | 'brique' | 'ardoise'

/**
 * A folded sub-section of the results page: a coloured header (title, one
 * line of summary, badges) that opens its content. Content stays mounted
 * when folded, so what it computes keeps running.
 */
export function Volet({
  id,
  titre,
  resume,
  teinte,
  ouvert,
  onBasculer,
  badges,
  children,
}: {
  id: string
  titre: string
  resume?: ReactNode
  teinte: TeinteVolet
  ouvert: boolean
  onBasculer: () => void
  badges?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={`volet-${id}`} className={`volet volet--${teinte}${ouvert ? ' volet--ouvert' : ''}`}>
      <button type="button" className="volet__tete" aria-expanded={ouvert} aria-controls={`volet-${id}-corps`} onClick={onBasculer}>
        <span className="volet__textes">
          <span className="volet__titre">{titre}</span>
          {resume && <span className="volet__resume">{resume}</span>}
        </span>
        {badges && <span className="volet__badges">{badges}</span>}
        <span className="volet__chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      <div id={`volet-${id}-corps`} className="volet__corps" hidden={!ouvert}>
        {children}
      </div>
    </section>
  )
}

/** A key figure of the results; clicking it opens the volet that details it. */
export function Tuile({
  valeur,
  libelle,
  detail,
  teinte,
  etat,
  onClick,
}: {
  valeur: ReactNode
  libelle: string
  detail?: ReactNode
  teinte: TeinteVolet
  etat?: 'ok' | 'vigilance' | 'alerte'
  onClick: () => void
}) {
  return (
    <button type="button" className={`tuile volet--${teinte}${etat ? ` tuile--${etat}` : ''}`} onClick={onClick}>
      <span className="tuile__valeur">{valeur}</span>
      <span className="tuile__libelle">{libelle}</span>
      {detail && <span className="tuile__detail">{detail}</span>}
      <span className="tuile__voir" aria-hidden="true">
        Voir →
      </span>
    </button>
  )
}
