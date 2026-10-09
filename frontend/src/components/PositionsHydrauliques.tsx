import type { Point } from '../lib/resultats/parse'
import { LIBELLES_POSITION, type Position } from '../lib/resultats/expert/amontAval'

interface Props {
  points: Point[]
  positions: Record<string, Position>
  /** Positions read from the sample names, flagged as detected. */
  auto: Record<string, Position>
  onPositions: (p: Record<string, Position>) => void
  facteur: number
  onFacteur: (f: number) => void
}

const POSITIONS: Position[] = ['amont', 'droit', 'aval']

/** Hydraulic position of each well, for the upgradient / downgradient
 *  sheet of the expert export. */
export function PositionsHydrauliques({ points, positions, auto, onPositions, facteur, onFacteur }: Props) {
  const compte = (pos: Position) => points.filter((p) => positions[p.nom] === pos).length
  const nonRenseignes = points.filter((p) => !positions[p.nom])
  const pret = compte('amont') > 0 && compte('droit') + compte('aval') > 0

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <strong>Position hydraulique des ouvrages</strong>
      <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
        Indiquez la position de chaque ouvrage par rapport au sens d'écoulement des eaux souterraines : l'export expert compare alors
        l'amont et l'aval du site (onglet « Amont - aval »). Les blancs et doublons ne sont pas repris.{' '}
        {pret
          ? `${compte('amont')} en amont, ${compte('droit')} au droit du site, ${compte('aval')} en aval.`
          : 'Il faut au moins un ouvrage en amont et un au droit du site ou en aval.'}
      </p>

      <details className="qualif" open>
        <summary>Ouvrages</summary>
        <div className="tableau-defile" style={{ marginTop: '0.75rem', maxHeight: '22rem' }}>
          <table className="tableau">
            <thead>
              <tr>
                <th>Échantillon</th>
                <th>Position</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.nom} className={positions[p.nom] ? 'tableau__selection' : undefined}>
                  <th scope="row">{p.nom}</th>
                  <td>
                    <select
                      value={positions[p.nom] ?? ''}
                      aria-label={`Position hydraulique de ${p.nom}`}
                      onChange={(e) => {
                        const suite = { ...positions }
                        if (e.target.value) suite[p.nom] = e.target.value as Position
                        else delete suite[p.nom]
                        onPositions(suite)
                      }}
                    >
                      <option value="">— non renseignée —</option>
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {LIBELLES_POSITION[pos]}
                        </option>
                      ))}
                    </select>
                    {auto[p.nom] && auto[p.nom] === positions[p.nom] && <span className="pastille">détecté</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginTop: '0.75rem', fontSize: '0.85rem' }}>
          {nonRenseignes.length > 0 && compte('amont') > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--petit"
              onClick={() => onPositions({ ...positions, ...Object.fromEntries(nonRenseignes.map((p) => [p.nom, 'aval' as Position])) })}
            >
              Placer les {nonRenseignes.length} non renseignés en aval
            </button>
          )}
          <label className="qualite-seuil">
            Écart retenu à partir d'un facteur{' '}
            <input
              type="number"
              min={1.1}
              step={0.1}
              value={facteur}
              style={{ width: '4.5rem' }}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v > 1) onFacteur(v)
              }}
            />{' '}
            entre aval et amont
          </label>
        </div>
      </details>
    </div>
  )
}
