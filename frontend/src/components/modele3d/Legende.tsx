import { COULEUR_NQ, RAMPE, type Echelle } from '../../lib/modele3d/couleurs'
import { FILIERES, ORDRE_FILIERES } from '../../lib/modele3d/filieres'
import { fr } from '../../lib/modele3d/format'
import { CLASSES_CONCENTRATION, type ClasseConcentration } from '../../lib/modele3d/modele'
import type { Compose } from '../../lib/suivi/modele'
import { USAGES, type CategorieUsage } from '../../lib/modele3d/usages'
import { MILIEU, RAMPE_INCERTITUDE, RAMPE_PID } from './palettes'

/** Legend of the view: the scales of what is coloured, folded on a phone. */
export default function Legende(p: {
  ouverte: boolean
  surBascule: () => void
  compose: Compose | null
  echelleEaux: Echelle | null
  comparaison: 'concentration' | 'charge' | null
  incertitude: boolean
  /** Comparison value when the water table shows the probability of exceeding it. */
  probabilite: number | null
  delimitation: boolean
  parametre: { nom: string; unite: string } | null
  echelleSol: Echelle
  gaz: { nom: string; unite: string } | null
  echelleGaz: Echelle | null
  filieres: boolean
  pid: boolean
  enveloppe: { volume: number } | null
  seuil: number | null
  /** Buildings shown, by use, or null. */
  usages: [CategorieUsage, number][] | null
  /** Some buildings have a secondary use (their roof). */
  mixtes: boolean
}) {
  const blocs: { titre: string; echelle: Echelle; unite: string }[] = []
  if (p.compose && p.echelleEaux && !p.comparaison) blocs.push({ titre: `Eaux : ${p.compose.nom}`, echelle: p.echelleEaux, unite: p.compose.unite })
  if (p.parametre) blocs.push({ titre: `Sols : ${p.parametre.nom}`, echelle: p.echelleSol, unite: p.parametre.unite })
  if (p.gaz && p.echelleGaz) blocs.push({ titre: `Gaz du sol : ${p.gaz.nom}`, echelle: p.echelleGaz, unite: p.gaz.unite })
  const vide = !blocs.length && !p.enveloppe && !p.comparaison && !p.incertitude && p.probabilite === null && !p.delimitation && !p.filieres && !p.pid && !p.usages
  if (vide) return null
  return (
    <div className={`m3d-legende${p.ouverte ? '' : ' m3d-legende--repliee'}`}>
      <button type="button" className="m3d-legende__bascule" onClick={p.surBascule} aria-expanded={p.ouverte}>
        Légende {p.ouverte ? '▾' : '▸'}
      </button>
      {p.ouverte && (
        <>
          {p.comparaison && (
            <div className="m3d-legende__bloc">
              <strong>{p.comparaison === 'charge' ? 'Écart de niveau avec la date A' : `Rapport des concentrations (${p.compose?.nom})`}</strong>
              <div
                className="m3d-rampe"
                style={{ background: p.comparaison === 'charge' ? `linear-gradient(to right, #9c5b1f, ${MILIEU}, #1f5f9c)` : `linear-gradient(to right, #2f8f5b, ${MILIEU}, #b3261e)` }}
                aria-hidden="true"
              />
              <div className="m3d-rampe__bornes">
                <span>{p.comparaison === 'charge' ? '−1 m' : '÷ 10'}</span>
                <span>{p.comparaison === 'charge' ? '+1 m' : '× 10'}</span>
              </div>
            </div>
          )}
          {p.incertitude && (
            <div className="m3d-legende__bloc">
              <strong>Incertitude du krigeage (nappe)</strong>
              <div className="m3d-rampe" style={{ background: `linear-gradient(to right, ${RAMPE_INCERTITUDE.join(', ')})` }} aria-hidden="true" />
              <div className="m3d-rampe__bornes">
                <span>faible</span>
                <span>forte</span>
              </div>
            </div>
          )}
          {p.probabilite !== null && (
            <div className="m3d-legende__bloc">
              <strong>
                Probabilité de dépasser {fr(p.probabilite)} {p.compose?.unite}
              </strong>
              <div className="m3d-rampe" style={{ background: `linear-gradient(to right, #2f8f5b, ${MILIEU}, #b3261e)` }} aria-hidden="true" />
              <div className="m3d-rampe__bornes">
                <span>0 %</span>
                <span>50 %</span>
                <span>100 %</span>
              </div>
            </div>
          )}
          {p.delimitation && (
            <div className="m3d-legende__bloc">
              <strong>Délimitation du panache</strong>
              <ul>
                <li>
                  <span className="m3d-trait" style={{ background: '#b3261e' }} aria-hidden="true" />
                  limite des ouvrages franchie par le panache
                </li>
                <li>
                  <span className="m3d-trait" style={{ background: '#2f8f5b' }} aria-hidden="true" />
                  limite des ouvrages, panache en deçà
                </li>
                <li>
                  <span className="m3d-pastille" style={{ background: '#6a3fb5' }} aria-hidden="true" />
                  N1, N2… emplacements proposés
                </li>
              </ul>
            </div>
          )}
          {blocs.map((b) => (
            <div key={b.titre} className="m3d-legende__bloc">
              <strong>{b.titre}</strong>
              {b.echelle.reference ? (
                <ul>
                  {(Object.keys(CLASSES_CONCENTRATION) as ClasseConcentration[]).map((c) => (
                    <li key={c}>
                      <span className="m3d-pastille" style={{ background: CLASSES_CONCENTRATION[c].couleur }} aria-hidden="true" />
                      {CLASSES_CONCENTRATION[c].libelle}
                    </li>
                  ))}
                  <li className="st-note">
                    référence : {fr(b.echelle.reference)} {b.unite}
                  </li>
                </ul>
              ) : (
                <>
                  <div className="m3d-rampe" style={{ background: `linear-gradient(to right, ${RAMPE.join(', ')})` }} aria-hidden="true" />
                  <div className="m3d-rampe__bornes">
                    <span>{fr(b.echelle.min)}</span>
                    <span>
                      {fr(b.echelle.max)} {b.unite}
                    </span>
                  </div>
                  <span className="st-note">
                    <span className="m3d-pastille" style={{ background: COULEUR_NQ }} aria-hidden="true" />
                    non quantifié
                  </span>
                </>
              )}
            </div>
          ))}
          {p.filieres && (
            <div className="m3d-legende__bloc">
              <strong>Terres par filière</strong>
              <ul>
                {ORDRE_FILIERES.map((f) => (
                  <li key={f}>
                    <span className="m3d-pastille" style={{ background: FILIERES[f].couleur }} aria-hidden="true" />
                    {FILIERES[f].court}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.pid && (
            <div className="m3d-legende__bloc">
              <strong>PID (ppm, échelle logarithmique)</strong>
              <div className="m3d-rampe" style={{ background: `linear-gradient(to right, ${RAMPE_PID.join(', ')})` }} aria-hidden="true" />
            </div>
          )}
          {p.usages && (
            <div className="m3d-legende__bloc">
              <strong>Bâtiments : usage (BD TOPO)</strong>
              <ul>
                {p.usages.map(([u, n]) => (
                  <li key={u}>
                    <span className="m3d-pastille" style={{ background: USAGES[u].couleur }} aria-hidden="true" />
                    {USAGES[u].libelle} ({n})
                  </li>
                ))}
                {p.mixtes && <li className="st-note">toit : usage secondaire, s’il diffère</li>}
              </ul>
            </div>
          )}
          {p.enveloppe && p.seuil && (
            <div className="m3d-legende__bloc">
              <span className="m3d-pastille" style={{ background: '#b3261e', opacity: 0.6 }} aria-hidden="true" />
              Sols ≥ {fr(p.seuil)} {p.parametre?.unite} : {fr(p.enveloppe.volume)} m³
            </div>
          )}
        </>
      )}
    </div>
  )
}
