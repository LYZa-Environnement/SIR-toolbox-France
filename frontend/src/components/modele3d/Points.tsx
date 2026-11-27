import { LIBELLES_SYSTEME, type Systeme } from '../../lib/modele3d/coordonnees'
import { fr } from '../../lib/modele3d/format'
import { LIBELLES_ORIGINE_Z, type Modele, type SaisiePoint } from '../../lib/modele3d/modele'

interface Props {
  modele: Modele
  systeme: Systeme | 'auto'
  saisies: Record<string, SaisiePoint>
  surSysteme: (s: Systeme | 'auto') => void
  surSaisie: (cle: string, s: SaisiePoint | null) => void
}

const nombre = (s: string): number | null => {
  const t = s.replace(/\s/g, '').replace(',', '.')
  const n = Number(t)
  return t && Number.isFinite(n) ? n : null
}

/** Every point of the model: its coordinates and ground elevation, as read or as entered here. */
export default function Points({ modele: m, systeme, saisies, surSysteme, surSaisie }: Props) {
  const enL93 = m.georef
  return (
    <div className="m3d-points-table">
      <label className="champ m3d-points-table__systeme">
        <span>Système des coordonnées des fichiers</span>
        <select value={systeme} onChange={(e) => surSysteme(e.target.value as Systeme | 'auto')}>
          <option value="auto">Reconnu automatiquement ({LIBELLES_SYSTEME[m.systeme]}{m.systemeInverse ? ', latitude et longitude inversées' : ''})</option>
          {(Object.keys(LIBELLES_SYSTEME) as Systeme[]).map((s) => (
            <option key={s} value={s}>
              {LIBELLES_SYSTEME[s]}
            </option>
          ))}
        </select>
      </label>
      <p className="st-note">
        {enL93
          ? 'Coordonnées affichées et à saisir en Lambert 93 ; une coordonnée ou une cote saisie ici remplace celle des fichiers (le classeur des logs n’est pas modifié).'
          : 'Coordonnées locales : saisies dans le même repère que les fichiers. Les cotes sont en m NGF.'}
      </p>
      <div className="tableau-defile">
        <table className="tableau">
          <thead>
            <tr>
              <th>Point</th>
              <th>{enL93 ? 'X (Lambert 93)' : 'X'}</th>
              <th>{enL93 ? 'Y (Lambert 93)' : 'Y'}</th>
              <th>Cote du sol (m NGF)</th>
              <th>Origine de la cote</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {m.points.map((p) => {
              const s = saisies[p.cle] ?? {}
              const champ = (k: keyof SaisiePoint, actuel: number | null) => (
                <input
                  key={`${p.cle}-${k}-${s[k] ?? ''}`}
                  type="text"
                  inputMode="decimal"
                  className="tableau__guide"
                  defaultValue={s[k] != null ? String(s[k]).replace('.', ',') : ''}
                  placeholder={actuel !== null && Number.isFinite(actuel) ? fr(actuel, 6).replace(/ /g, '') : 'à saisir'}
                  aria-label={`${k.toUpperCase()} de ${p.nom}`}
                  style={{ width: '8.5rem' }}
                  onBlur={(e) => {
                    const v = nombre(e.target.value)
                    if ((s[k] ?? null) === v) return
                    const suite = { ...s, [k]: v }
                    surSaisie(p.cle, suite.x == null && suite.y == null && suite.z == null ? null : suite)
                  }}
                />
              )
              return (
                <tr key={p.cle} className={p.place ? undefined : 'st-ligne-alerte'}>
                  <th scope="row">{p.nom}</th>
                  <td>{champ('x', p.xa)}</td>
                  <td>{champ('y', p.ya)}</td>
                  <td>{champ('z', m.relatif ? null : p.zSol)}</td>
                  <td style={{ fontSize: '0.8rem' }}>{LIBELLES_ORIGINE_Z[p.origineZ]}</td>
                  <td>
                    {p.saisi && (
                      <button type="button" className="btn btn--ghost btn--petit" onClick={() => surSaisie(p.cle, null)}>
                        Effacer
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
