import { FILIERES, ORDRE_FILIERES, type VolumesFilieres } from '../../lib/modele3d/filieres'
import { fr } from '../../lib/modele3d/format'

/** Soils by disposal route: volumes and tonnages in the site, and each sample's route with its reasons. */
export default function Filieres(p: { filieres: VolumesFilieres; densite: number; surDensite: (v: number) => void }) {
  return (
    <details className="m3d-tableaux">
      <summary>Terres : filières d’évacuation</summary>
      <div className="m3d-filieres">
        <table className="tableau">
          <thead>
            <tr>
              <th>Filière proposée</th>
              <th>Échantillons</th>
              <th>Volume dans le site (m³)</th>
              <th>Tonnage (t)</th>
            </tr>
          </thead>
          <tbody>
            {ORDRE_FILIERES.map((f) => (
              <tr key={f}>
                <th scope="row">
                  <span className="m3d-pastille" style={{ background: FILIERES[f].couleur }} aria-hidden="true" />
                  {FILIERES[f].libelle}
                </th>
                <td>{p.filieres.echantillons.filter((e) => e.filiere === f).length}</td>
                <td>{fr(p.filieres.volumes[f])}</td>
                <td>{fr(p.filieres.volumes[f] * p.densite)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Non caractérisé (dans le site, jusqu’au fond des échantillons, hors de leur portée)</th>
              <td>–</td>
              <td>{fr(p.filieres.volumes['non-caracterise'])}</td>
              <td>{fr(p.filieres.volumes['non-caracterise'] * p.densite)}</td>
            </tr>
          </tbody>
        </table>
        <label className="champ m3d-filieres__densite">
          <span>Masse volumique des terres (t/m³)</span>
          <input type="number" min={1} max={2.6} step={0.05} value={p.densite} onChange={(e) => p.surDensite(Number(e.target.value) || 1.8)} />
        </label>
        <div className="tableau-defile">
          <table className="tableau">
            <thead>
              <tr>
                <th>Échantillon</th>
                <th>Filière</th>
                <th>Motifs</th>
              </tr>
            </thead>
            <tbody>
              {p.filieres.echantillons.map((e) => (
                <tr key={`${e.cle}|${e.echantillon}`}>
                  <th scope="row">{e.echantillon}</th>
                  <td>
                    <span className="m3d-pastille" style={{ background: FILIERES[e.filiere].couleur }} aria-hidden="true" />
                    {FILIERES[e.filiere].court}
                  </td>
                  <td style={{ whiteSpace: 'normal', fontSize: '0.82rem' }}>{[...e.motifs, ...(e.filiere === 'indetermine' ? [`${e.manquants} critère(s) non analysé(s)`] : []), ...e.remarques].join(' ; ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="st-note">
          ISDI : arrêté du 12 décembre 2014, annexe II (avec ses notes). ISDND et ISDD : seuils de lixiviation de la décision 2003/33/CE (annexe, points 2.2.2 et
          2.4.1), repris par les arrêtés du 15 février 2016 et du 30 décembre 2002. Orientation indicative : le caractère dangereux d’un déchet dépend de ses propriétés
          de danger (HP 1 à HP 15), et l’exploitant du site receveur a le dernier mot. Volumes : chaque bloc prend la filière de l’échantillon le plus proche, dans les
          parcelles du site.
        </p>
      </div>
    </details>
  )
}
