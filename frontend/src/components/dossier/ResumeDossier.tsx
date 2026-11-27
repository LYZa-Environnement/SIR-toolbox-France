import { Link } from 'react-router-dom'
import { formatSurface } from '../../lib/cadastre'
import { quand, type Trace } from '../../lib/dossier/format'
import { OUTILS_DOSSIER } from '../../lib/dossier/outils'
import { OUTIL_POINTS, type EtatPoints } from '../../lib/dossier/points'
import { signature } from '../../lib/dossier/session'
import { useDossier, usePointsDossier } from '../../lib/dossier/useSynchroDossier'
import { ouvrirMenuDossier } from './bandeau'

const parQui = (t: Trace) => (t.par === signature() ? 'vous' : t.par)

const FAMILLES_COURTES: [string, string, string][] = [
  ['piezometre', 'piézomètre', 'piézomètres'],
  ['sondage', 'sondage', 'sondages'],
  ['gaz-sol', 'piézair', 'piézairs'],
  ['sous-dalle', 'vapor pin', 'vapor pins'],
  ['air', 'prélèvement d’air', 'prélèvements d’air'],
  ['traitement', 'ouvrage de traitement', 'ouvrages de traitement'],
  ['eau-surface', 'point d’eau de surface', 'points d’eau de surface'],
  ['autre', 'autre point', 'autres points'],
]

/** The dossier's investigation points, next to its site: how many, of which kinds, and where to change them. */
function LignePoints({ etat, trace }: { etat: EtatPoints; trace: Trace | undefined }) {
  if (etat.etat !== 'pret') return <p className="dossier-resume__site"><strong>Points d'investigation :</strong> lecture…</p>
  const n = etat.points.length
  if (!n)
    return (
      <p className="dossier-resume__site">
        <strong>Points d'investigation :</strong> pas encore chargés — <Link to="/points">les charger</Link> (EQuIS, Field Maps, tableau du géomètre, GPS, SIG), ils
        seront repris par Réseaux, Suivi temporel et Logs de forage.
        {etat.erreur && <span className="dossier-resume__erreur"> {etat.erreur}</span>}
      </p>
    )
  const compte = new Map<string, number>()
  for (const p of etat.points) compte.set(p.famille, (compte.get(p.famille) ?? 0) + 1)
  const detail = FAMILLES_COURTES.filter(([id]) => compte.get(id))
    .map(([id, un, plusieurs]) => `${compte.get(id)} ${compte.get(id)! > 1 ? plusieurs : un}`)
    .join(', ')
  return (
    <p className="dossier-resume__site">
      <strong>Points d'investigation :</strong> {n.toLocaleString('fr-FR')} point{n > 1 ? 's' : ''} ({detail})
      {trace ? ` — modifiés ${quand(trace.le)} par ${parQui(trace)}` : ''} <Link to="/points">voir ou modifier</Link>
    </p>
  )
}

/** Home page: the open dossier at a glance, or how to work in one. */
export default function ResumeDossier() {
  const etat = useDossier()
  const points = usePointsDossier()
  if (etat.etat === 'demarrage') return null
  if (etat.etat === 'indisponible')
    return (
      <div className="dossier-resume dossier-resume--vide">
        <p className="dossier-resume__titre">Dossiers d'étude</p>
        <p>
          Pour enregistrer votre travail dans un dossier (sur votre poste ou dans OneDrive) et le rouvrir plus tard, ouvrez SIR Toolbox dans <strong>Edge</strong>{' '}
          ou <strong>Chrome</strong>.
        </p>
      </div>
    )
  if (etat.etat !== 'ouvert')
    return (
      <div className="dossier-resume dossier-resume--vide">
        <p className="dossier-resume__titre">Dossiers d'étude</p>
        <p>
          Ouvrez ou créez un dossier pour une étude : chaque outil utilisé y est enregistré au fil de l'eau, avec les fichiers déposés et les exports. Rangé dans
          OneDrive, le dossier se rouvre plus tard, sur ce poste ou sur celui d'un collègue. Le site et les <Link to="/points">points d'investigation</Link> y sont
          saisis une fois et repris par les outils.
        </p>
        <button type="button" className="btn btn--petit" onClick={ouvrirMenuDossier}>
          {etat.etat === 'a-autoriser' ? `Reprendre « ${etat.nom} » ou un autre dossier` : 'Ouvrir ou créer un dossier'}
        </button>
      </div>
    )
  const { fiche, repertoire } = etat.dossier
  // The points have their own line, under the site.
  const utilises = Object.entries(fiche.outils)
    .filter(([id]) => OUTILS_DOSSIER[id] && id !== OUTIL_POINTS)
    .sort((a, b) => b[1].le.localeCompare(a[1].le))
  return (
    <div className="dossier-resume">
      <p className="dossier-resume__titre">Dossier ouvert</p>
      <h2 className="dossier-resume__nom">
        {fiche.nom}
        {fiche.affaire && <span className="dossier-resume__affaire">{fiche.affaire}</span>}
      </h2>
      <p className="dossier-resume__meta">
        Dossier « {repertoire.name} » · créé {quand(fiche.cree.le)}
        {fiche.cree.par && ` par ${parQui(fiche.cree)}`}
      </p>
      <p className="dossier-resume__site">
        {fiche.site ? (
          <>
            <strong>Site :</strong> {fiche.site.label}
            {fiche.site.surfaceM2 ? ` — ${fiche.site.parcelles?.length ?? 0} parcelle(s), ${formatSurface(fiche.site.surfaceM2)}` : ''}{' '}
            <Link to="/site-setting">modifier</Link>
          </>
        ) : (
          <>
            <strong>Site :</strong> pas encore défini — <Link to="/site-setting">le saisir dans l'Assistant Site Setting</Link>, il sera repris par les autres outils.
          </>
        )}
      </p>
      <LignePoints etat={points} trace={fiche.outils[OUTIL_POINTS]} />
      {utilises.length > 0 ? (
        <ul className="dossier-resume__outils">
          {utilises.map(([id, t]) => {
            const o = OUTILS_DOSSIER[id]
            const texte = (
              <>
                <strong>{o.titre}</strong>
                <span>
                  {quand(t.le)} par {parQui(t)}
                </span>
              </>
            )
            return (
              <li key={id}>
                {o.route ? <Link to={o.route}>{texte}</Link> : <a href={`${import.meta.env.BASE_URL}${o.page}`}>{texte}</a>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="dossier-resume__meta">Aucun outil utilisé pour l'instant : ouvrez un outil ci-dessous, son travail sera enregistré dans le dossier.</p>
      )}
    </div>
  )
}
