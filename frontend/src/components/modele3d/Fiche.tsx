import { CLASSES_LITHO } from '../../lib/modele3d/lithologie'
import { chronique, LIBELLES_ORIGINE_CHARGE, LIBELLES_ORIGINE_Z, type Enveloppe, type Modele, type Nappe } from '../../lib/modele3d/modele'
import { couleurValeur, type Echelle } from '../../lib/modele3d/couleurs'
import type { ParametreSol } from '../../lib/modele3d/types'
import { LIBELLES_POSITION } from '../../lib/resultats/expert/amontAval'
import { formatDate } from '../../lib/suivi/dates'
import type { Base, Compose, Resultat } from '../../lib/suivi/modele'
import { fr, frM } from '../../lib/modele3d/format'
import type { Selection } from './rendu'

interface Props {
  selection: Selection
  modele: Modele
  base: Base | null
  nappe: Nappe | null
  campagne: string | null
  compose: Compose | null
  echelleEaux: Echelle | null
  parametresSol: ParametreSol[]
  parametreSol: ParametreSol | null
  guideSol: (cle: string) => { valeur: number; source: string } | null
  enveloppe: Enveloppe | null
  seuil: number | null
  surFermer: () => void
}

/** What was clicked in the scene: a borehole or well, a soil sample, a block of the geology or of the soil envelope. */
export default function Fiche(p: Props) {
  const s = p.selection
  return (
    <aside className="m3d-fiche" aria-label="Sélection">
      <button type="button" className="m3d-fiche__fermer" onClick={p.surFermer} aria-label="Fermer la fiche">
        ×
      </button>
      {s.type === 'point' && <FichePoint {...p} cle={s.cle} />}
      {s.type === 'echantillon' && <FicheEchantillon {...p} cle={s.cle} echantillon={s.echantillon} />}
      {s.type === 'bloc' && <FicheBloc {...p} classe={s.classe} x={s.x} y={s.y} z={s.z} />}
      {s.type === 'enveloppe' && (
        <>
          <h3>Sols au-dessus du seuil</h3>
          <p>
            {p.parametreSol?.nom} ≥ {fr(p.seuil)} {p.parametreSol?.unite} à {fr(s.z)} m{p.modele.relatif ? '' : ' NGF'}.
          </p>
          {p.enveloppe && (
            <p>
              Volume de l’enveloppe : <strong>{fr(p.enveloppe.volume)} m³</strong> ({p.enveloppe.depassements} échantillon{p.enveloppe.depassements > 1 ? 's' : ''} au-dessus du seuil).
            </p>
          )}
          <p className="st-note">Interpolation inverse distance sur le logarithme des résultats : un ordre de grandeur pour orienter des investigations complémentaires, pas une cubature.</p>
        </>
      )}
    </aside>
  )
}

function FichePoint(p: Props & { cle: string }) {
  const pt = p.modele.points.find((x) => x.cle === p.cle)
  if (!pt) return null
  const f = pt.forage
  const nature = pt.crepine ? 'Piézomètre' : pt.ouvrage ? 'Ouvrage de surveillance' : 'Sondage'
  const charge = p.nappe?.charges.find((c) => c.cle === pt.cle)
  const resultat = p.compose && p.campagne && p.base ? p.base.resultats.find((r) => r.ouvrage === pt.cle && r.compose === p.compose!.cle && r.campagne === p.campagne && !r.exclu) : undefined
  const serie = p.compose && p.base && pt.ouvrage ? chronique(p.base, pt.cle, p.compose.cle) : []
  return (
    <>
      <h3>{pt.nom}</h3>
      <p className="m3d-fiche__nature">
        {nature}
        {pt.ouvrage && pt.ouvrage.position !== 'autre' ? ` · ${LIBELLES_POSITION[pt.ouvrage.position].toLowerCase()}` : ''}
      </p>
      <dl className="m3d-fiche__dl">
        {pt.xa !== null && pt.ya !== null && (
          <>
            <dt>Coordonnées</dt>
            <dd>
              X {fr(pt.xa)} · Y {fr(pt.ya)}
              {p.modele.georef ? ' (Lambert 93)' : ''}
            </dd>
          </>
        )}
        <dt>Sol</dt>
        <dd>
          {p.modele.relatif ? 'pris à 0' : `${fr(pt.zSol)} m NGF`} <span className="st-note">({LIBELLES_ORIGINE_Z[pt.origineZ]})</span>
        </dd>
        {f && f.profondeur > 0 && (
          <>
            <dt>Profondeur</dt>
            <dd>{frM(f.profondeur)}</dd>
          </>
        )}
        {pt.crepine && (
          <>
            <dt>Crépine</dt>
            <dd>
              {frM(pt.crepine.de)} à {frM(pt.crepine.a)}
            </dd>
          </>
        )}
        {f?.niveauEau != null && (
          <>
            <dt>Eau à la foration</dt>
            <dd>{frM(f.niveauEau)} sous le sol</dd>
          </>
        )}
        {charge && (
          <>
            <dt>Niveau d’eau</dt>
            <dd>
              {p.modele.relatif ? `${frM(-charge.charge)} sous le sol` : `${fr(charge.charge)} m NGF`}
              {charge.profondeur !== null && !p.modele.relatif ? ` (${frM(charge.profondeur)} sous le repère)` : ''}{' '}
              <span className="st-note">{LIBELLES_ORIGINE_CHARGE[charge.origine]}</span>
            </dd>
          </>
        )}
        {p.compose && (
          <>
            <dt>{p.compose.nom}</dt>
            <dd>
              {resultat ? (
                <>
                  <span className="m3d-pastille" style={{ background: couleurValeur(resultat.valeur, resultat.inferieur, p.echelleEaux!) }} aria-hidden="true" />
                  {resultat.brut} {p.compose.unite}
                  {p.echelleEaux?.reference && !resultat.inferieur ? ` (${fr(resultat.valeur / p.echelleEaux.reference, 2)} × la valeur de comparaison)` : ''}
                </>
              ) : (
                <span className="st-note">pas de résultat à cette date</span>
              )}
            </dd>
          </>
        )}
      </dl>
      {serie.length > 1 && p.compose && <Chronique serie={serie} compose={p.compose} reference={p.echelleEaux?.reference ?? null} campagne={p.campagne} />}
      {f && f.lithologie.length > 0 && (
        <>
          <h4>Lithologie</h4>
          <table className="m3d-fiche__table">
            <tbody>
              {f.lithologie.map((l) => (
                <tr key={`${l.de}-${l.a}`}>
                  <td className="m3d-num">
                    {fr(l.de)}–{fr(l.a)} m
                  </td>
                  <td>
                    <span className="m3d-pastille" style={{ background: CLASSES_LITHO[l.classe]?.couleur }} aria-hidden="true" />
                    {l.cle || CLASSES_LITHO[l.classe]?.libelle}
                    {l.description && <span className="st-note"> — {l.description}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {f && f.echantillons.length > 0 && (
        <>
          <h4>Échantillons de sol{p.parametreSol ? ` · ${p.parametreSol.nom}` : ''}</h4>
          <table className="m3d-fiche__table">
            <tbody>
              {f.echantillons.map((e) => {
                const v = p.parametreSol ? e.resultats[p.parametreSol.cle] : undefined
                return (
                  <tr key={e.id}>
                    <td>{e.id}</td>
                    <td className="m3d-num">{p.parametreSol ? (v ? `${v.brut} ${p.parametreSol.unite}` : '–') : `${Object.keys(e.resultats).length} résultat(s)`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

function FicheEchantillon(p: Props & { cle: string; echantillon: string }) {
  const pt = p.modele.points.find((x) => x.cle === p.cle)
  const e = pt?.forage?.echantillons.find((x) => x.id === p.echantillon)
  if (!pt || !e) return null
  const lignes = p.parametresSol.filter((q) => e.resultats[q.cle])
  return (
    <>
      <h3>{e.id}</h3>
      <p className="m3d-fiche__nature">
        Échantillon de sol · {pt.nom}, {frM(e.de)} à {frM(e.a)}
        {e.date ? ` · prélevé le ${formatDate(e.date)}` : ''}
      </p>
      <table className="m3d-fiche__table">
        <thead>
          <tr>
            <th>Paramètre</th>
            <th>Résultat</th>
            <th>Valeur guide</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((q) => {
            const v = e.resultats[q.cle]
            const g = p.guideSol(q.cle)
            const depasse = g && !v.inferieur && v.valeur !== null && v.valeur > g.valeur
            return (
              <tr key={q.cle} className={q.cle === p.parametreSol?.cle ? 'm3d-ligne-choisie' : undefined}>
                <td>{q.nom}</td>
                <td className={`m3d-num${depasse ? ' m3d-depasse' : ''}`}>
                  {v.brut} {q.unite}
                </td>
                <td className="m3d-num">{g ? `${fr(g.valeur)} ${g.source}` : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="st-note">En gras : au-dessus de la valeur guide ERM pour les sols (sur site).</p>
    </>
  )
}

function FicheBloc(p: Props & { classe: string; x: number; y: number; z: number }) {
  const c = CLASSES_LITHO[p.classe]
  const v = p.modele.geologie?.volumes[p.classe]
  return (
    <>
      <h3>
        <span className="m3d-pastille m3d-pastille--grande" style={{ background: c?.couleur }} aria-hidden="true" />
        {c?.libelle ?? p.classe}
      </h3>
      <p className="m3d-fiche__nature">Bloc du modèle géologique</p>
      <dl className="m3d-fiche__dl">
        <dt>Cote</dt>
        <dd>{p.modele.relatif ? `${frM(-p.z)} sous le sol` : `${fr(p.z)} m NGF`}</dd>
        {p.modele.georef || p.modele.origine.x ? (
          <>
            <dt>Position</dt>
            <dd>
              X {fr(p.x + p.modele.origine.x)} · Y {fr(p.y + p.modele.origine.y)}
            </dd>
          </>
        ) : null}
        {v !== undefined && (
          <>
            <dt>Volume modélisé</dt>
            <dd>{fr(v)} m³</dd>
          </>
        )}
      </dl>
      <p className="st-note">
        Lithologie dominante des forages voisins à la même cote (inverse du carré de la distance, un mètre vertical comptant pour dix horizontaux). Entre les forages, une lecture
        possible, pas une observation.
      </p>
    </>
  )
}

/** A well's chronicle of the compound: log scale for concentrations, the date shown marked. */
function Chronique({ serie, compose, reference, campagne }: { serie: Resultat[]; compose: Compose; reference: number | null; campagne: string | null }) {
  const L = 290
  const H = 120
  const g = { h: 8, d: 8, b: 20, gauche: 46 }
  const lineaire = !!compose.terrain
  const vs = serie.map((r) => r.valeur).filter((v) => lineaire || v > 0)
  if (reference) vs.push(reference)
  if (!vs.length) return null
  let min = Math.min(...vs)
  let max = Math.max(...vs)
  if (!lineaire) {
    min = 10 ** Math.floor(Math.log10(min))
    max = 10 ** Math.ceil(Math.log10(max))
    if (max <= min) max = min * 10
  } else if (max === min) [min, max] = [min - 1, max + 1]
  const t0 = serie[0].t
  const t1 = serie[serie.length - 1].t
  const X = (t: number) => g.gauche + ((t - t0) / Math.max(1e-6, t1 - t0)) * (L - g.gauche - g.d)
  const Y = (v: number) => {
    const u = lineaire ? (v - min) / (max - min) : (Math.log10(Math.max(v, min)) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))
    return H - g.b - u * (H - g.h - g.b)
  }
  const courant = serie.find((r) => r.campagne === campagne)
  const chemin = serie.map((r, i) => `${i ? 'L' : 'M'}${X(r.t).toFixed(1)},${Y(r.valeur).toFixed(1)}`).join(' ')
  return (
    <figure className="m3d-chronique">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`Chronique de ${compose.nom}`}>
        <line x1={g.gauche} x2={L - g.d} y1={H - g.b} y2={H - g.b} className="m3d-chronique__axe" />
        <text x={g.gauche - 4} y={Y(max) + 4} textAnchor="end" className="m3d-chronique__texte">
          {fr(max)}
        </text>
        <text x={g.gauche - 4} y={Y(min)} textAnchor="end" className="m3d-chronique__texte">
          {fr(min)}
        </text>
        <text x={g.gauche} y={H - 5} className="m3d-chronique__texte">
          {Math.floor(t0)}
        </text>
        <text x={L - g.d} y={H - 5} textAnchor="end" className="m3d-chronique__texte">
          {Math.floor(t1)}
        </text>
        {reference && (
          <>
            <line x1={g.gauche} x2={L - g.d} y1={Y(reference)} y2={Y(reference)} className="m3d-chronique__reference" />
            <text x={L - g.d} y={Y(reference) - 3} textAnchor="end" className="m3d-chronique__texte">
              valeur de comparaison
            </text>
          </>
        )}
        {courant && <line x1={X(courant.t)} x2={X(courant.t)} y1={g.h} y2={H - g.b} className="m3d-chronique__curseur" />}
        <path d={chemin} className="m3d-chronique__ligne" />
        {serie.map((r) => (
          <circle key={r.id} cx={X(r.t)} cy={Y(r.valeur)} r={r.campagne === campagne ? 5 : 4} className={r.inferieur ? 'm3d-chronique__nq' : 'm3d-chronique__point'}>
            <title>{`${formatDate(r.date)} : ${r.brut} ${compose.unite}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="st-note">
        {compose.nom} ({compose.unite}{lineaire ? '' : ', échelle logarithmique'}) · cercle vide : non quantifié, tracé à la LQ
      </figcaption>
    </figure>
  )
}
