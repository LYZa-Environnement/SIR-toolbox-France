import type { Colonne, Schema as S } from '../../lib/modele3d/conceptuel'

interface Props {
  schema: S
  /** Retained or not, as the user changed it (by item id). */
  choix: Record<string, boolean>
  surChoix: (id: string, retenu: boolean) => void
  surExport: () => void
  cibles: 'aucune' | 'chargement' | 'ok' | 'indisponible'
  erreursCibles: string[]
}

const COLONNES: [Colonne, string][] = [
  ['source', 'Sources de pollution'],
  ['transfert', 'Voies de transfert et milieux d’exposition'],
  ['cible', 'Cibles'],
]

/** The conceptual model proposed from the data: each item kept or set aside, then exported. */
export default function Schema(p: Props) {
  const retenu = (id: string, defaut: boolean) => p.choix[id] ?? defaut
  return (
    <div className="m3d-schema">
      <div className="m3d-schema__colonnes">
        {COLONNES.map(([c, titre]) => (
          <section key={c} className={`m3d-schema__colonne m3d-schema__colonne--${c}`} aria-label={titre}>
            <h4>{titre}</h4>
            {p.schema.elements
              .filter((e) => e.colonne === c)
              .map((e) => (
                <label key={e.id} className={`m3d-schema__element${retenu(e.id, e.retenu) ? '' : ' m3d-schema__element--ecarte'}`}>
                  <input type="checkbox" checked={retenu(e.id, e.retenu)} onChange={(ev) => p.surChoix(e.id, ev.target.checked)} />
                  <span>
                    <strong>{e.titre}</strong>
                    {e.preuves.map((x, i) => (
                      <span key={i} className="m3d-schema__preuve">
                        {x}
                      </span>
                    ))}
                  </span>
                </label>
              ))}
          </section>
        ))}
      </div>
      <div className="st-boutons">
        <button type="button" className="btn btn--petit" onClick={p.surExport}>
          Télécharger le schéma (SVG)
        </button>
      </div>
      <p className="st-note">
        {p.cibles === 'chargement'
          ? 'Recherche des bâtiments, cours d’eau et prélèvements autour du site…'
          : p.cibles === 'indisponible'
            ? 'Cibles publiques non recherchées : coordonnées non géoréférencées (Lambert 93 nécessaire).'
            : 'Cibles : bâtiments et cours d’eau de la BD TOPO (IGN), prélèvements déclarés à la BNPE (Hub’Eau) ; amont / aval d’après le sens d’écoulement de la dernière campagne.'}{' '}
        Proposé d’après les données du modèle, à valider par l’ingénieur (méthodologie nationale de gestion des sites et sols pollués, avril 2017).
      </p>
      {p.erreursCibles.map((e) => (
        <p key={e} className="st-note">
          {e}
        </p>
      ))}
    </div>
  )
}
