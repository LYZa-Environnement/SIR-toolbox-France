import { useRef, useState } from 'react'
import { LIBELLES_REGIME, type Campagne, type Ouvrage, type Regime } from '../lib/resultats/campagnes'
import type { Lecture } from '../lib/resultats/parse'

export interface InfoCampagne {
  date: string
  regime: Regime
}

export interface AutreCampagne extends InfoCampagne {
  lecture: Lecture
  fichier: string
  controles: string[]
}

interface Props {
  /** All campaigns, the main file's first. */
  campagnes: Campagne[]
  ouvrages: Ouvrage[]
  onInfo: (i: number, info: Partial<InfoCampagne>) => void
  onAjouter: (f: File) => Promise<string | null>
  onRetirer: (i: number) => void
  onOuvrages: (o: Ouvrage[]) => void
  facteur: number
  onFacteur: (f: number) => void
}

const MAX = 4

/** Other campaigns of the same wells, their date and hydrological regime,
 *  and which sample is which well from one campaign to the next. */
export function Campagnes({ campagnes, ouvrages, onInfo, onAjouter, onRetirer, onOuvrages, facteur, onFacteur }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const plusieurs = campagnes.length > 1

  async function ajouter(f: File | undefined) {
    if (!f) return
    setChargement(true)
    setErreur(await onAjouter(f))
    setChargement(false)
  }

  /** Puts a sample in a well, taking it out of the one that had it. */
  function associer(ligne: number, campagne: number, echantillon: string | null) {
    const suite = ouvrages.map((o) => ({ ...o, echantillons: [...o.echantillons] }))
    if (echantillon) for (const o of suite) if (o.echantillons[campagne] === echantillon) o.echantillons[campagne] = null
    suite[ligne].echantillons[campagne] = echantillon
    // A sample taken out of every well becomes a well of its own.
    campagnes.forEach((c, i) => {
      const places = new Set(suite.map((o) => o.echantillons[i]))
      for (const p of c.lecture.points) {
        if (c.controles.includes(p.nom) || places.has(p.nom)) continue
        suite.push({ nom: p.nom, echantillons: campagnes.map((_, k) => (k === i ? p.nom : null)) })
      }
    })
    onOuvrages(suite.filter((o) => o.echantillons.some(Boolean)).map((o) => ({ ...o, nom: o.echantillons.find(Boolean)! })))
  }

  const absents = (i: number) => ouvrages.filter((o) => !o.echantillons[i]).length
  const uniques = ouvrages.filter((o) => o.echantillons.filter(Boolean).length < 2).length

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <strong>Campagnes à comparer</strong>
      <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
        Ajoutez le fichier d'une autre campagne sur les mêmes ouvrages : les exports comparent alors les campagnes (onglets
        « Comparaison campagnes », « Évolutions et tendances », « Graphiques évolution » et « Statistiques campagnes »). Indiquez la date et le régime de chaque
        campagne : les tendances hautes eaux / basses eaux demandent au moins une campagne de chaque. Les onglets de mise en forme
        portent sur le fichier principal.
      </p>
      <div className="tableau-defile">
        <table className="tableau">
          <thead>
            <tr>
              <th>Campagne</th>
              <th>Fichier</th>
              <th>Date</th>
              <th>Régime</th>
              <th>Ouvrages</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campagnes.map((c, i) => (
              <tr key={`${i}-${c.fichier}`}>
                <th scope="row">{i === 0 ? 'Campagne 1 (fichier principal)' : `Campagne ${i + 1}`}</th>
                <td style={{ fontSize: '0.82rem', maxWidth: '18rem', overflowWrap: 'anywhere' }}>{c.fichier}</td>
                <td>
                  <input type="date" value={c.date} aria-label={`Date de la campagne ${i + 1}`} onChange={(e) => onInfo(i, { date: e.target.value })} />
                </td>
                <td>
                  <select
                    value={c.regime ?? ''}
                    aria-label={`Régime hydrologique de la campagne ${i + 1}`}
                    onChange={(e) => onInfo(i, { regime: (e.target.value || null) as Regime })}
                  >
                    <option value="">— non précisé —</option>
                    <option value="HE">{LIBELLES_REGIME.HE}</option>
                    <option value="BE">{LIBELLES_REGIME.BE}</option>
                  </select>
                </td>
                <td style={{ fontSize: '0.82rem' }}>
                  {c.lecture.points.length - c.controles.length}
                  {c.controles.length > 0 && ` (+ ${c.controles.length} contrôle${c.controles.length > 1 ? 's' : ''} écarté${c.controles.length > 1 ? 's' : ''})`}
                </td>
                <td>
                  {i > 0 && (
                    <button type="button" className="btn btn--ghost btn--petit" onClick={() => onRetirer(i)}>
                      Retirer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          void ajouter(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginTop: '0.75rem', fontSize: '0.85rem' }}>
        {campagnes.length < MAX && (
          <button type="button" className="btn btn--petit" onClick={() => input.current?.click()} disabled={chargement}>
            {chargement ? 'Lecture…' : plusieurs ? 'Ajouter une autre campagne' : 'Ajouter une campagne à comparer'}
          </button>
        )}
        {plusieurs && (
          <label className="qualite-seuil">
            Évolution retenue à partir d'un facteur{' '}
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
            entre campagnes
          </label>
        )}
      </div>
      {erreur && (
        <p role="alert" className="alerte">
          {erreur}
        </p>
      )}

      {plusieurs && (
        <details className="qualif" open style={{ marginTop: '1rem' }}>
          <summary>Association des ouvrages ({ouvrages.length})</summary>
          <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            Les échantillons sont associés d'après leur nom (« Pz 01 », « PZ1 » et « pz-1 » désignent le même ouvrage). Corrigez si
            besoin : un ouvrage non échantillonné lors d'une campagne reste vide pour celle-ci.{' '}
            {campagnes.map((_, i) => absents(i)).some(Boolean) &&
              campagnes
                .map((_, i) => (absents(i) ? `${absents(i)} ouvrage${absents(i) > 1 ? 's' : ''} sans échantillon en campagne ${i + 1}` : ''))
                .filter(Boolean)
                .join(' ; ') + '.'}
          </p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            Comparaisons, évolutions et graphiques : seuls les ouvrages échantillonnés lors d'au moins deux campagnes
            {uniques > 0 && ` (${uniques} ouvrage${uniques > 1 ? 's' : ''} grisé${uniques > 1 ? 's' : ''} écarté${uniques > 1 ? 's' : ''})`}. Les statistiques
            portent sur l'ensemble des données.
          </p>
          <div className="tableau-defile" style={{ maxHeight: '24rem' }}>
            <table className="tableau">
              <thead>
                <tr>
                  <th>Ouvrage</th>
                  {campagnes.map((_, i) => (
                    <th key={i}>Campagne {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ouvrages.map((o, ligne) => (
                  <tr key={`${ligne}-${o.nom}`} className={o.echantillons.every(Boolean) ? 'tableau__selection' : undefined}>
                    <th scope="row" style={o.echantillons.filter(Boolean).length < 2 ? { color: 'var(--color-muted)', fontWeight: 400 } : undefined}>
                      {o.nom}
                    </th>
                    {campagnes.map((c, i) => (
                      <td key={i}>
                        <select
                          value={o.echantillons[i] ?? ''}
                          aria-label={`Échantillon de ${o.nom} en campagne ${i + 1}`}
                          onChange={(e) => associer(ligne, i, e.target.value || null)}
                        >
                          <option value="">— non échantillonné —</option>
                          {c.lecture.points
                            .filter((p) => !c.controles.includes(p.nom))
                            .map((p) => (
                              <option key={p.nom} value={p.nom}>
                                {p.nom}
                              </option>
                            ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
