import { telechargerBlob } from '../../lib/fichiers'
import { jourIso } from '../../lib/format'
import { libelleCote, motifProposition, versDirection, type BilanCote, type Delimitation as Delim, type StatutCote } from '../../lib/modele3d/delimitation'
import { fr, frM } from '../../lib/modele3d/format'

interface Props {
  d: Delim
  nom: string
  unite: string
  /** Date shown (label of the campaign). */
  date: string
  /** Coordinates in Lambert 93 (else local). */
  georef: boolean
  nombre: number
  surNombre: (n: number) => void
  surProposition: (rang: number) => void
}

const STATUTS: Record<StatutCote, { libelle: string; classe: string }> = {
  delimite: { libelle: 'délimité', classe: 'm3d-statut--ok' },
  juste: { libelle: 'délimité de justesse', classe: 'm3d-statut--juste' },
  ouvert: { libelle: 'non délimité', classe: 'm3d-statut--ouvert' },
}

/** An estimate: two significant figures, no more is known. */
const deuxChiffres = (v: number) => fr(Number(v.toPrecision(2)))
/** A distance to the metre. */
const metres = (d: number) => `${fr(Math.round(d))} m`
const pourcent = (p: number | null) => (p === null ? '–' : `${Math.round(p * 100)} %`)
const surface = (a: number | null) => (a === null ? '–' : `${fr(Math.round(a))} m²`)

function verdict(d: Delim, nom: string, unite: string): string {
  const ref = `${fr(d.reference)} ${unite}`
  const sens = d.aval !== null
  const au = (c: BilanCote) => libelleCote(c.cote, c.azimut, sens)
  if (d.verdict === 'aucun-depassement') return `Aucun ouvrage ne dépasse la valeur de comparaison de ${nom} (${ref}) à cette date : pas de panache à délimiter.`
  if (d.verdict === 'delimite') return `Panache de ${nom} délimité dans les quatre directions par des ouvrages sous la valeur de comparaison (${ref}).`
  const ouverts = d.cotes.filter((c) => c.statut === 'ouvert')
  if (d.verdict === 'non-delimite')
    return `Panache de ${nom} non délimité ${ouverts.map((c) => `${au(c)} au-delà de ${c.front.join(', ')}`).join(' ; ')} : aucun ouvrage sous la valeur de comparaison (${ref}) de ce côté.`
  const justes = d.cotes.filter((c) => c.statut === 'juste')
  return `Panache de ${nom} délimité, à confirmer${justes.length ? ` : ${justes.map((c) => au(c)).join(', ')}, l’ouvrage qui le ferme est entre la moitié de la valeur et la valeur (${ref})` : ''}${d.partBord > 0 ? `${justes.length ? ' ; ' : ' : '}le champ interpolé dépasse la valeur sur ${pourcent(d.partBord)} du pourtour des ouvrages` : ''}.`
}

function exporter(d: Delim, nom: string, unite: string, georef: boolean) {
  const n = (x: number | null, chiffres = 2) => (x === null || !Number.isFinite(x) ? '' : String(Number(x.toFixed(chiffres))).replace('.', ','))
  const lignes = [
    ['Emplacement', `X${georef ? ' (Lambert 93)' : ''}`, `Y${georef ? ' (Lambert 93)' : ''}`, 'Motif', 'Ouvrage le plus proche', 'Distance (m)', 'Probabilité de dépassement', `${nom} estimé (${unite})`, 'Facteur d’incertitude (×/÷)', 'Profondeur de l’eau estimée (m)', 'Sur le site'],
    ...d.propositions.map((p) => [
      `N${p.rang}`,
      n(p.xa ?? p.x, 1),
      n(p.ya ?? p.y, 1),
      motifProposition(p, d),
      p.pres.nom,
      n(p.pres.distance, 0),
      p.probabilite === null ? '' : n(p.probabilite, 2),
      p.concentration === null ? '' : n(Number(p.concentration.toPrecision(2)), 6),
      n(p.facteur, 1),
      n(p.profondeurEau, 1),
      p.surSite === null ? '' : p.surSite ? 'oui' : 'non',
    ]),
  ]
  const csv = lignes.map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n')
  telechargerBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), `Emplacements proposes ${nom} ${jourIso()}.csv`)
}

/** Is the plume delineated by the wells, on which sides, and where to put the next wells. */
export default function Delimitation(p: Props) {
  const d = p.d
  const sens = d.aval !== null
  return (
    <div className="m3d-delimitation">
      <p className={`m3d-verdict m3d-verdict--${d.verdict}`}>
        <strong>{p.date}</strong> · {verdict(d, p.nom, p.unite)}
      </p>

      {d.depassants.length > 0 && (
        <>
          <p>
            Au-dessus de la valeur de comparaison : {d.depassants.map((w) => `${w.nom} (× ${fr(w.rapport, 2)})`).join(', ')} · {d.ouvrages} ouvrage{d.ouvrages > 1 ? 's' : ''} analysé
            {d.ouvrages > 1 ? 's' : ''} à cette date.
          </p>
          <div className="tableau-defile">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Panache</th>
                  <th>Ouvrages au front</th>
                  <th>Ouvrage qui le ferme (le plus proche)</th>
                </tr>
              </thead>
              <tbody>
                {d.cotes.map((c) => (
                  <tr key={c.cote}>
                    <th scope="row">{libelleCote(c.cote, c.azimut, sens)}</th>
                    <td>
                      <span className={`m3d-statut ${STATUTS[c.statut].classe}`}>{STATUTS[c.statut].libelle}</span>
                    </td>
                    <td>{c.front.join(', ') || '–'}</td>
                    <td>
                      {c.temoins.length
                        ? c.temoins
                            .slice(0, 3)
                            .map((t) => `${t.nom} (${t.resultat.brut} ${p.unite}, à ${metres(t.distance)})`)
                            .join(' ; ')
                        : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ul className="m3d-delimitation__chiffres">
        {d.bord.length > 0 && (
          <li>
            Pourtour des ouvrages franchi par le panache interpolé : <strong>{pourcent(d.partBord)}</strong> (trait rouge au sol dans la vue)
          </li>
        )}
        {d.aire50 !== null && (
          <li>
            Dépassement probable (≥ 50 %) sur <strong>{surface(d.aire50)}</strong>, quasi certain (≥ 90 %) sur {surface(d.aire90)} · surface au classement douteux{' '}
            <strong>{surface(d.douteux)}</strong>
          </li>
        )}
      </ul>

      <div className="st-entete-carte">
        <h3>Emplacements proposés</h3>
        <div className="st-boutons">
          <label className="champ m3d-delimitation__nombre">
            <span>Nombre</span>
            <select value={p.nombre} onChange={(e) => p.surNombre(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn--ghost btn--petit" onClick={() => exporter(d, p.nom, p.unite, p.georef)} disabled={!d.propositions.length}>
            Exporter (CSV)
          </button>
        </div>
      </div>
      {d.propositions.length ? (
        <div className="tableau-defile">
          <table className="tableau">
            <thead>
              <tr>
                <th>Emplacement</th>
                <th>Pourquoi</th>
                <th>{p.georef ? 'X · Y (Lambert 93)' : 'X · Y (repère local)'}</th>
                <th>Position</th>
                <th>Probabilité de dépassement</th>
                <th>{`${p.nom} estimé (${p.unite})`}</th>
                <th>Eau estimée</th>
                <th>Sur le site</th>
                <th>Doute restant</th>
              </tr>
            </thead>
            <tbody>
              {d.propositions.map((x) => (
                <tr key={x.rang}>
                  <th scope="row">
                    <button type="button" className="m3d-lien" onClick={() => p.surProposition(x.rang)}>
                      N{x.rang}
                    </button>
                  </th>
                  <td style={{ whiteSpace: 'normal', minWidth: '14rem' }}>{motifProposition(x, d)}</td>
                  <td className="m3d-num">
                    {fr(Math.round(x.xa ?? x.x))} · {fr(Math.round(x.ya ?? x.y))}
                  </td>
                  <td>
                    à {metres(x.pres.distance)} de {x.pres.nom}, vers {versDirection(x.pres.azimut)}
                  </td>
                  <td>{x.probabilite === null ? (x.concentration === null ? 'hors de la zone interpolée' : '–') : pourcent(x.probabilite)}</td>
                  <td>{x.concentration === null ? '–' : `≈ ${deuxChiffres(x.concentration)}${x.facteur !== null ? ` (×/÷ ${fr(Number(x.facteur.toFixed(1)))})` : ''}`}</td>
                  <td>{x.profondeurEau === null ? '–' : `≈ ${frM(x.profondeurEau)} sous le sol`}</td>
                  <td>{x.surSite === null ? '–' : x.surSite ? 'oui' : 'non'}</td>
                  <td>{surface(x.douteuxApres)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="st-note">
          {p.nombre === 0
            ? 'Aucun emplacement demandé.'
            : d.verdict === 'aucun-depassement' && !d.douteux
              ? 'Rien à proposer : pas de dépassement à encadrer.'
              : 'Rien à proposer : la limite du panache est déjà encadrée par les ouvrages, ou le krigeage n’est pas disponible.'}
        </p>
      )}

      {d.avertissements.length > 0 && (
        <ul className="st-note">
          {d.avertissements.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <p className="st-note">
        Fermeture : autour de chaque ouvrage au-dessus de la valeur, quatre quadrants de 90° orientés sur l’écoulement ; un côté est fermé par un ouvrage sous la valeur dans ce
        quadrant (de justesse entre la moitié de la valeur et la valeur). Un résultat non quantifié avec une LQ au-dessus de la valeur ne ferme rien. Probabilité de dépassement : krigeage du logarithme des concentrations, erreur supposée gaussienne (Goovaerts, 1997) ; l’incertitude de
        la tendance n’est pas comptée. Emplacements : d’abord au-delà du front de chaque côté ouvert, puis là où le classement au-dessus ou au-dessous de la valeur est le plus
        douteux, l’incertitude recalculée avec chaque ouvrage ajouté. Emplacements indicatifs : accès, propriété du terrain, réseaux enterrés (DT-DICT) et profondeur de
        crépine à vérifier.
      </p>
    </div>
  )
}
