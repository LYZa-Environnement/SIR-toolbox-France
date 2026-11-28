import type { Tendance } from '../../lib/modele3d/calcul'
import { couleurValeur, type Echelle } from '../../lib/modele3d/couleurs'
import { fr, frM } from '../../lib/modele3d/format'
import type { Modele, Nappe, Panache, PointSol } from '../../lib/modele3d/modele'
import { CLASSES } from '../../lib/suivi/analyse'
import { formatDate } from '../../lib/suivi/dates'
import type { Compose } from '../../lib/suivi/modele'

interface Props {
  modele: Modele
  nappe: Nappe | null
  nappeA: Nappe | null
  etape: { libelle: string } | null
  etapeA: { libelle: string } | null
  pan: Panache | null
  compose: Compose | null
  echelleEaux: Echelle | null
  tendances: Tendance[]
  parametreSol: { nom: string; unite: string } | null
  sols: PointSol[]
  guide: { valeur: number } | null
  echelleSol: Echelle
}

/** The values shown in the view, as tables: water levels and concentrations of the date, soil results. */
export default function Tableaux(props: Props) {
  const { modele, nappe, nappeA, etape, etapeA, pan, compose, echelleEaux, tendances, parametreSol, sols, guide, echelleSol } = props
  return (
    <details className="m3d-tableaux">
      <summary>Tableaux des valeurs affichées</summary>
      {nappe && nappe.charges.length + (pan?.valeurs.length ?? 0) > 0 && (
        <>
          <h3>Eaux souterraines · {etape?.libelle}</h3>
          <div className="tableau-defile">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Ouvrage</th>
                  <th>Niveau d’eau</th>
                  <th>Profondeur de l’eau</th>
                  {etapeA && <th>{`Écart avec le ${etapeA.libelle}`}</th>}
                  {compose && <th>{`${compose.nom} (${compose.unite})`}</th>}
                  {compose && echelleEaux?.reference && <th>Rapport à la valeur de comparaison</th>}
                  {compose && tendances.length > 0 && <th>Tendance</th>}
                </tr>
              </thead>
              <tbody>
                {modele.points
                  .filter((p) => nappe.charges.some((c) => c.cle === p.cle) || pan?.valeurs.some((v) => v.cle === p.cle))
                  .map((p) => {
                    const c = nappe.charges.find((x) => x.cle === p.cle)
                    const ca = nappeA?.charges.find((x) => x.cle === p.cle)
                    const r = pan?.valeurs.find((x) => x.cle === p.cle)?.resultat
                    const t = compose ? tendances.find((x) => x.ouvrage === p.cle && x.compose === compose.cle) : undefined
                    return (
                      <tr key={p.cle}>
                        <th scope="row">{p.nom}</th>
                        <td>{c ? (modele.relatif ? `${frM(-c.charge)} sous le sol` : `${fr(c.charge)} m NGF`) : '–'}</td>
                        <td>{c?.profondeur != null ? frM(c.profondeur) : '–'}</td>
                        {etapeA && <td>{c && ca ? `${c.charge - ca.charge >= 0 ? '+' : '−'}${frM(Math.abs(c.charge - ca.charge))}` : '–'}</td>}
                        {compose && (
                          <td>
                            {r && echelleEaux && <span className="m3d-pastille" style={{ background: couleurValeur(r.valeur, r.inferieur, echelleEaux) }} aria-hidden="true" />}
                            {r ? r.brut : '–'}
                          </td>
                        )}
                        {compose && echelleEaux?.reference && <td>{r && !r.inferieur ? `× ${fr(r.valeur / echelleEaux.reference, 2)}` : '–'}</td>}
                        {compose && tendances.length > 0 && (
                          <td>
                            {t ? (
                              <>
                                <span style={{ color: CLASSES[t.classe].couleur }} aria-hidden="true">
                                  {CLASSES[t.classe].symbole}
                                </span>{' '}
                                {CLASSES[t.classe].court}
                              </>
                            ) : (
                              '–'
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {parametreSol && sols.length > 0 && (
        <>
          <h3>Sols · {parametreSol.nom}</h3>
          <div className="tableau-defile">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Échantillon</th>
                  <th>Forage</th>
                  <th>Profondeur</th>
                  <th>Date</th>
                  <th>{`Résultat (${parametreSol.unite})`}</th>
                  {guide && <th>Rapport à la valeur guide</th>}
                </tr>
              </thead>
              <tbody>
                {sols.map((s) => (
                  <tr key={`${s.cle}|${s.echantillon}`}>
                    <th scope="row">{s.echantillon}</th>
                    <td>{s.forage}</td>
                    <td>
                      {fr(s.de)} – {fr(s.a)} m
                    </td>
                    <td>{s.date ? formatDate(s.date) : '–'}</td>
                    <td>
                      <span className="m3d-pastille" style={{ background: couleurValeur(s.valeur, s.inferieur, echelleSol) }} aria-hidden="true" />
                      {s.brut}
                    </td>
                    {guide && <td>{!s.inferieur && s.valeur !== null ? `× ${fr(s.valeur / guide.valeur, 2)}` : '–'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </details>
  )
}
