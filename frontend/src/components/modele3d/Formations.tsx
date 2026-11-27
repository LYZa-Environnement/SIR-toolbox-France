import { CLASSES_LITHO } from '../../lib/modele3d/lithologie'
import { fr } from '../../lib/modele3d/format'
import type { ConfigFormations, MotCle } from '../../lib/modele3d/formations'

interface Props {
  config: ConfigFormations
  motsCles: MotCle[]
  volumes: number[] | null
  /** The changed grouping; null goes back to the proposed one. */
  surChange: (c: ConfigFormations | null) => void
}

let compteur = 0

/**
 * The formations of the model, top to bottom, and the keywords of the logs
 * they group: rename, recolour, reorder, merge or split.
 */
export default function Formations({ config, motsCles, volumes, surChange }: Props) {
  const f = config.formations
  const changer = (formations = f, affectation = config.affectation) => surChange({ formations, affectation })
  const deplacer = (i: number, d: number) => {
    const l = [...f]
    ;[l[i], l[i + d]] = [l[i + d], l[i]]
    changer(l)
  }
  const supprimer = (i: number) => {
    // Its keywords go to the formation above (below for the first).
    const vers = f[i === 0 ? 1 : i - 1]?.id
    if (!vers) return
    const affectation = Object.fromEntries(Object.entries(config.affectation).map(([k, v]) => [k, v === f[i].id ? vers : v]))
    changer(
      f.filter((_, k) => k !== i),
      affectation,
    )
  }
  return (
    <div className="m3d-formations">
      <ol className="m3d-formations__liste">
        {f.map((x, i) => (
          <li key={x.id}>
            <input type="color" value={x.couleur} aria-label={`Couleur de ${x.nom}`} onChange={(e) => changer(f.map((y, k) => (k === i ? { ...y, couleur: e.target.value } : y)))} />
            <input type="text" value={x.nom} aria-label={`Nom de la formation ${i + 1}`} onChange={(e) => changer(f.map((y, k) => (k === i ? { ...y, nom: e.target.value } : y)))} />
            <span className="st-note m3d-num">{volumes?.[i] !== undefined ? `${fr(volumes[i])} m³` : ''}</span>
            <button type="button" className="btn btn--ghost btn--petit" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={`Monter ${x.nom}`}>
              ↑
            </button>
            <button type="button" className="btn btn--ghost btn--petit" onClick={() => deplacer(i, 1)} disabled={i === f.length - 1} aria-label={`Descendre ${x.nom}`}>
              ↓
            </button>
            <button type="button" className="btn btn--ghost btn--petit" onClick={() => supprimer(i)} disabled={f.length < 2}>
              Fusionner
            </button>
          </li>
        ))}
      </ol>
      <div className="st-boutons">
        <button type="button" className="btn btn--ghost btn--petit" onClick={() => changer([...f, { id: `f${Date.now().toString(36)}${compteur++}`, nom: 'Nouvelle formation', couleur: '#b8b8b8' }])}>
          Ajouter une formation
        </button>
        <button type="button" className="btn btn--ghost btn--petit" onClick={() => surChange(null)}>
          Revenir à la proposition
        </button>
      </div>
      <div className="tableau-defile">
        <table className="tableau">
          <thead>
            <tr>
              <th>Mot-clé des logs</th>
              <th>Forages</th>
              <th>Formation</th>
            </tr>
          </thead>
          <tbody>
            {motsCles.map((k) => (
              <tr key={k.cle}>
                <th scope="row">
                  <span className="m3d-pastille" style={{ background: CLASSES_LITHO[k.classe]?.couleur }} aria-hidden="true" />
                  {k.libelle}
                </th>
                <td>{k.forages}</td>
                <td>
                  <select value={config.affectation[k.cle] ?? ''} aria-label={`Formation de ${k.libelle}`} onChange={(e) => changer(f, { ...config.affectation, [k.cle]: e.target.value })}>
                    {f.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nom}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
