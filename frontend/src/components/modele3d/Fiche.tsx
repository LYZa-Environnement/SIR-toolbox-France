import type { MesureGaz } from '../../lib/modele3d/assemblage'
import type { Tendance } from '../../lib/modele3d/calcul'
import type { Batiment } from '../../lib/modele3d/cibles'
import { couleurValeur, type Echelle } from '../../lib/modele3d/couleurs'
import { versDirection, type Proposition } from '../../lib/modele3d/delimitation'
import { FILIERES, ORDRE_FILIERES, type VolumesFilieres } from '../../lib/modele3d/filieres'
import { fr, frM } from '../../lib/modele3d/format'
import { CLASSES_LITHO } from '../../lib/modele3d/lithologie'
import { chronique, LIBELLES_ORIGINE_CHARGE, LIBELLES_ORIGINE_Z, type Enveloppe, type Modele, type Nappe } from '../../lib/modele3d/modele'
import type { ParametreSol } from '../../lib/modele3d/types'
import { USAGES } from '../../lib/modele3d/usages'
import { LIBELLES_POSITION } from '../../lib/resultats/expert/amontAval'
import { CLASSES } from '../../lib/suivi/analyse'
import { formatDate } from '../../lib/suivi/dates'
import type { Base, Compose, Resultat } from '../../lib/suivi/modele'
import type { Selection } from './rendu'

/** What the page can show a card for: an object of the scene, or a virtual borehole. */
export type SelectionPage = Selection | { type: 'virtuel'; x: number; y: number }

/** The virtual borehole: the column read at a point of the model. */
export interface ForageVirtuel {
  x: number
  y: number
  xa: number | null
  ya: number | null
  sol: number
  couches: { nom: string; couleur: string; haut: number; bas: number; ecart: number | null }[]
  charge: number | null
  ecartCharge: number | null
  /** Estimated concentration, its uncertainty factor (×/÷) and the probability of exceeding the comparison value. */
  concentration: { valeur: number; facteur: number | null; probabilite: number | null } | null
}

interface Props {
  selection: SelectionPage
  modele: Modele
  base: Base | null
  nappe: Nappe | null
  campagne: string | null
  compose: Compose | null
  echelleEaux: Echelle | null
  tendances: Tendance[]
  parametresSol: ParametreSol[]
  parametreSol: ParametreSol | null
  guideSol: (cle: string) => { valeur: number; source: string } | null
  enveloppe: Enveloppe | null
  seuil: number | null
  filieres: VolumesFilieres | null
  parametresGaz: ParametreSol[]
  gaz: MesureGaz[]
  guideGaz: (cle: string) => number | null
  batiments: Batiment[]
  /** Wells proposed to delineate the plume. */
  propositions: Proposition[]
  referenceEaux: number | null
  virtuel: ForageVirtuel | null
  lienLog: (nom: string) => string
  surFermer: () => void
}

/** What was clicked in the scene, or the virtual borehole asked for. */
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
      {s.type === 'formation' && <FicheFormation {...p} index={s.index} z={s.z} />}
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
      {s.type === 'filiere' && (
        <>
          <h3>
            <span className="m3d-pastille m3d-pastille--grande" style={{ background: FILIERES[ORDRE_FILIERES[s.rang]].couleur }} aria-hidden="true" />
            {FILIERES[ORDRE_FILIERES[s.rang]].libelle}
          </h3>
          <p className="m3d-fiche__nature">Terres à {fr(s.z)} m{p.modele.relatif ? '' : ' NGF'} : filière de l’échantillon le plus proche</p>
          {p.filieres && <p>Volume de la filière dans le site : {fr(p.filieres.volumes[ORDRE_FILIERES[s.rang]])} m³.</p>}
          <p className="st-note">Orientation d’après l’annexe II de l’arrêté du 12 décembre 2014 et les seuils de lixiviation de la décision 2003/33/CE : l’exploitant du site receveur a le dernier mot.</p>
        </>
      )}
      {s.type === 'pid' && <FichePid {...p} cle={s.cle} index={s.index} />}
      {s.type === 'observation' && <FicheObservation {...p} cle={s.cle} index={s.index} />}
      {s.type === 'gaz' && <FicheGaz {...p} cle={s.cle} />}
      {s.type === 'batiment' && p.batiments[s.index] && <FicheBatiment b={p.batiments[s.index]} />}
      {s.type === 'proposition' && <FicheProposition {...p} rang={s.rang} />}
      {s.type === 'virtuel' && p.virtuel && <FicheVirtuelle {...p} v={p.virtuel} />}
    </aside>
  )
}

function FicheBatiment({ b }: { b: Batiment }) {
  const u = USAGES[b.categorie]
  return (
    <>
      <h3>
        <span className="m3d-pastille m3d-pastille--grande" style={{ background: u.couleur }} aria-hidden="true" />
        {u.libelle}
      </h3>
      <p className="m3d-fiche__nature">Bâtiment · BD TOPO® (IGN){b.deduit ? ` · usage déduit : ${b.deduit}` : ''}</p>
      <dl className="m3d-fiche__dl">
        <dt>Usage (BD TOPO)</dt>
        <dd>{b.usage}</dd>
        {b.secondaire && (
          <>
            <dt>Usage secondaire</dt>
            <dd>
              <span className="m3d-pastille" style={{ background: USAGES[b.secondaire].couleur }} aria-hidden="true" />
              {USAGES[b.secondaire].libelle} (toit)
            </dd>
          </>
        )}
        {b.nature && !/^indiff/i.test(b.nature) && (
          <>
            <dt>Nature</dt>
            <dd>{b.nature}</dd>
          </>
        )}
        <dt>Occupants</dt>
        <dd>{b.habite && b.categorie !== 'residentiel' ? `${u.occupants} ; habitants aussi (logements)` : u.occupants}</dd>
        {b.logements !== null && (
          <>
            <dt>Logements</dt>
            <dd>{b.logements}</dd>
          </>
        )}
        {b.etages !== null && (
          <>
            <dt>Étages</dt>
            <dd>{b.etages}</dd>
          </>
        )}
        <dt>Hauteur</dt>
        <dd>{b.hauteur !== null ? frM(b.hauteur) : 'non renseignée (6 m dessinés)'}</dd>
      </dl>
      <p className="st-note">Usage issu des Fichiers fonciers par la BD TOPO : à confirmer sur place (visite, enquête de voisinage), notamment la présence d’établissements sensibles.</p>
    </>
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
  const tendance = p.compose ? p.tendances.find((t) => t.ouvrage === pt.cle && t.compose === p.compose!.cle) : undefined
  const gaz = p.gaz.filter((g) => g.cle === pt.cle)
  return (
    <>
      <h3>{pt.nom}</h3>
      <p className="m3d-fiche__nature">
        {nature}
        {pt.ouvrage && pt.ouvrage.position !== 'autre' ? ` · ${LIBELLES_POSITION[pt.ouvrage.position].toLowerCase()}` : ''}
        {f && f.lithologie.length > 0 && (
          <>
            {' · '}
            <a href={p.lienLog(pt.nom)} target="_blank" rel="noopener">
              ouvrir le log
            </a>
          </>
        )}
      </p>
      <dl className="m3d-fiche__dl">
        {pt.xa !== null && pt.ya !== null && (
          <>
            <dt>Coordonnées</dt>
            <dd>
              X {fr(pt.xa)} · Y {fr(pt.ya)}
              {p.modele.georef ? ' (Lambert 93)' : ''}
              {pt.saisi ? ' · saisies' : ''}
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
        {tendance && (
          <>
            <dt>Tendance</dt>
            <dd>
              <span style={{ color: CLASSES[tendance.classe].couleur }} aria-hidden="true">
                {CLASSES[tendance.classe].symbole}
              </span>{' '}
              {CLASSES[tendance.classe].libelle}
              {tendance.pente !== null && tendance.classe !== 'non-quantifie' && tendance.classe !== 'insuffisant' ? ` · pente de Sen ${fr(tendance.pente, 2)} ${p.compose?.unite}/an` : ''}{' '}
              <span className="st-note">({tendance.n} résultats, Suivi temporel)</span>
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
      {f && (f.pid.length > 0 || f.observations.length > 0) && (
        <>
          <h4>Mesures et observations de terrain</h4>
          <table className="m3d-fiche__table">
            <tbody>
              {f.pid.map((m, i) => (
                <tr key={`pid${i}`}>
                  <td className="m3d-num">
                    {fr(m.de)}–{fr(m.a)} m
                  </td>
                  <td>PID {fr(m.valeur)} ppm</td>
                </tr>
              ))}
              {f.observations.map((o, i) => (
                <tr key={`obs${i}`}>
                  <td className="m3d-num">
                    {fr(o.de)}–{fr(o.a)} m
                  </td>
                  <td>{[o.organoleptique, o.remarque, o.humidite].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {gaz.length > 0 && (
        <>
          <h4>Gaz du sol</h4>
          <TableGaz {...p} mesures={gaz} />
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

function TableGaz(p: Props & { mesures: MesureGaz[] }) {
  return (
    <table className="m3d-fiche__table">
      <tbody>
        {p.parametresGaz.flatMap((q) =>
          p.mesures.flatMap((g) => {
            const v = g.resultats[q.cle]
            if (!v) return []
            const r = p.guideGaz(q.cle)
            const depasse = r !== null && !v.inferieur && v.valeur !== null && v.valeur > r
            return [
              <tr key={`${g.nom}${q.cle}`}>
                <td>{q.nom}</td>
                <td className={`m3d-num${depasse ? ' m3d-depasse' : ''}`}>
                  {v.brut} {q.unite}
                </td>
                <td className="m3d-num st-note">{r !== null ? `R1 ${fr(r)}` : ''}</td>
              </tr>,
            ]
          }),
        )}
      </tbody>
    </table>
  )
}

function FicheEchantillon(p: Props & { cle: string; echantillon: string }) {
  const pt = p.modele.points.find((x) => x.cle === p.cle)
  const e = pt?.forage?.echantillons.find((x) => x.id === p.echantillon)
  if (!pt || !e) return null
  const lignes = p.parametresSol.filter((q) => e.resultats[q.cle])
  const classe = p.filieres?.echantillons.find((c) => c.cle === p.cle && c.echantillon === p.echantillon)
  return (
    <>
      <h3>{e.id}</h3>
      <p className="m3d-fiche__nature">
        Échantillon de sol · {pt.nom}, {frM(e.de)} à {frM(e.a)}
        {e.date ? ` · prélevé le ${formatDate(e.date)}` : ''}
      </p>
      {classe && (
        <p>
          <span className="m3d-pastille" style={{ background: FILIERES[classe.filiere].couleur }} aria-hidden="true" />
          <strong>{FILIERES[classe.filiere].libelle}</strong>
          {classe.motifs.length > 0 && <span className="st-note"> — {classe.motifs.join(' ; ')}</span>}
          {classe.filiere === 'indetermine' && <span className="st-note"> — {classe.manquants} critère(s) de l’annexe II non analysé(s)</span>}
        </p>
      )}
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
                <td>
                  {q.nom}
                  {q.eluat ? ' (éluat)' : ''}
                </td>
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
        {v !== undefined && (
          <>
            <dt>Volume modélisé</dt>
            <dd>{fr(v)} m³</dd>
          </>
        )}
      </dl>
      <p className="st-note">Lithologie dominante des forages voisins à la même cote (inverse du carré de la distance, un mètre vertical comptant pour dix horizontaux). Entre les forages, une lecture possible, pas une observation.</p>
    </>
  )
}

function FicheFormation(p: Props & { index: number; z: number }) {
  const r = p.modele.formations
  const f = r?.formations[p.index]
  if (!r || !f) return null
  const v = r.validations[p.index - 1] ?? null
  return (
    <>
      <h3>
        <span className="m3d-pastille m3d-pastille--grande" style={{ background: f.couleur }} aria-hidden="true" />
        {f.nom}
      </h3>
      <p className="m3d-fiche__nature">
        Formation {p.index + 1} sur {r.formations.length}, à {p.modele.relatif ? `${frM(-p.z)} sous le sol` : `${fr(p.z)} m NGF`}
      </p>
      <dl className="m3d-fiche__dl">
        <dt>Volume dans le site</dt>
        <dd>{fr(r.volumes[p.index])} m³</dd>
        {p.index > 0 && (
          <>
            <dt>Toit interpolé</dt>
            <dd>
              d’après {r.donnees[p.index - 1]} forage{r.donnees[p.index - 1] > 1 ? 's' : ''}
              {v ? ` · validation croisée : écart quadratique moyen ${frM(v.rmse)}` : ''}
            </dd>
          </>
        )}
      </dl>
    </>
  )
}

function FichePid(p: Props & { cle: string; index: number }) {
  const pt = p.modele.points.find((x) => x.cle === p.cle)
  const m = pt?.forage?.pid[p.index]
  if (!pt || !m) return null
  return (
    <>
      <h3>PID {fr(m.valeur)} ppm</h3>
      <p className="m3d-fiche__nature">
        {pt.nom}, {frM(m.de)} à {frM(m.a)} · détecteur à photo-ionisation (onglet PID des logs)
      </p>
    </>
  )
}

function FicheObservation(p: Props & { cle: string; index: number }) {
  const pt = p.modele.points.find((x) => x.cle === p.cle)
  const o = pt?.forage?.observations[p.index]
  if (!pt || !o) return null
  return (
    <>
      <h3>Observation de terrain</h3>
      <p className="m3d-fiche__nature">
        {pt.nom}, {frM(o.de)} à {frM(o.a)}
      </p>
      <dl className="m3d-fiche__dl">
        {o.organoleptique && (
          <>
            <dt>Organoleptique</dt>
            <dd>{o.organoleptique}</dd>
          </>
        )}
        {o.remarque && (
          <>
            <dt>Remarque</dt>
            <dd>{o.remarque}</dd>
          </>
        )}
        {o.humidite && (
          <>
            <dt>Humidité</dt>
            <dd>{o.humidite}</dd>
          </>
        )}
      </dl>
    </>
  )
}

function FicheGaz(p: Props & { cle: string }) {
  const mesures = p.gaz.filter((g) => g.cle === p.cle)
  if (!mesures.length) return null
  return (
    <>
      <h3>Gaz du sol · {mesures[0].nom}</h3>
      <p className="m3d-fiche__nature">
        {mesures[0].fichier}
        {mesures[0].date ? ` · ${formatDate(mesures[0].date)}` : ''}
      </p>
      <TableGaz {...p} mesures={mesures} />
      <p className="st-note">R1 : valeur repère de l’air intérieur, à titre de repère pour des gaz du sol (sans atténuation).</p>
    </>
  )
}

/** A well proposed to delineate the plume. */
function FicheProposition(p: Props & { rang: number }) {
  const x = p.propositions.find((q) => q.rang === p.rang)
  if (!x) return <p className="st-note">Emplacement recalculé : voir le tableau « Délimitation du panache ».</p>
  return (
    <>
      <h3>Emplacement proposé N{x.rang}</h3>
      <p className="m3d-fiche__nature">
        {x.motif.type === 'fermeture' ? `Pour fermer le panache au-delà de ${x.motif.front}` : 'Là où la limite du panache est la plus incertaine'}
      </p>
      <dl className="m3d-fiche__dl">
        <dt>Position</dt>
        <dd>
          {x.xa !== null && x.ya !== null ? `X ${fr(Math.round(x.xa))} · Y ${fr(Math.round(x.ya))}${p.modele.georef ? ' (Lambert 93)' : ''} · ` : ''}à {frM(Math.round(x.pres.distance))} de {x.pres.nom}, vers{' '}
          {versDirection(x.pres.azimut)}
          {x.surSite === null ? '' : x.surSite ? ' · sur le site' : ' · hors du site'}
        </dd>
        {x.concentration !== null && p.compose && (
          <>
            <dt>{p.compose.nom}</dt>
            <dd>
              ≈ {fr(Number(x.concentration.toPrecision(2)))} {p.compose.unite} (estimé){x.facteur !== null ? ` · ×/÷ ${fr(Number(x.facteur.toFixed(1)))}` : ''}
              {x.probabilite !== null && p.referenceEaux !== null ? ` · ${Math.round(x.probabilite * 100)} % de chances de dépasser ${fr(p.referenceEaux)} ${p.compose.unite}` : ''}
            </dd>
          </>
        )}
        {x.profondeurEau !== null && (
          <>
            <dt>Nappe</dt>
            <dd>≈ {frM(x.profondeurEau)} sous le sol (estimée à la date affichée)</dd>
          </>
        )}
        {x.crepine && (
          <>
            <dt>Crépine</dt>
            <dd>
              de {frM(x.crepine.de)} à {frM(x.crepine.a)} : {x.crepine.raison}
            </dd>
          </>
        )}
      </dl>
      <p className="st-note">Indicatif : accès, propriété du terrain et réseaux enterrés (DT-DICT) à vérifier ; crépine à caler sur la coupe relevée en forant.</p>
    </>
  )
}

function FicheVirtuelle(p: Props & { v: ForageVirtuel }) {
  const v = p.v
  return (
    <>
      <h3>Forage virtuel</h3>
      <p className="m3d-fiche__nature">
        Colonne lue dans le modèle{v.xa !== null && v.ya !== null ? ` en X ${fr(v.xa)} · Y ${fr(v.ya)}` : ''} · sol à {p.modele.relatif ? '0' : `${fr(v.sol)} m NGF`}
      </p>
      {v.couches.length > 0 ? (
        <table className="m3d-fiche__table">
          <tbody>
            {v.couches.map((c, i) => (
              <tr key={i}>
                <td className="m3d-num">
                  {fr(Math.max(0, Math.round((v.sol - c.haut) * 100) / 100))}–{fr(Math.round((v.sol - c.bas) * 100) / 100)} m
                </td>
                <td>
                  <span className="m3d-pastille" style={{ background: c.couleur }} aria-hidden="true" />
                  {c.nom}
                  {c.ecart !== null && Number.isFinite(c.ecart) ? <span className="st-note"> (toit ± {fr(c.ecart, 2)} m)</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="st-note">Hors de la zone modélisée (parcelles du site, ou entre les forages).</p>
      )}
      <dl className="m3d-fiche__dl">
        {v.charge !== null && (
          <>
            <dt>Nappe</dt>
            <dd>
              {p.modele.relatif ? `${frM(-v.charge)} sous le sol` : `${fr(v.charge)} m NGF`} ({frM(v.sol - v.charge)} sous le sol)
              {v.ecartCharge !== null && Number.isFinite(v.ecartCharge) ? ` ± ${fr(v.ecartCharge, 2)} m` : ''}
            </dd>
          </>
        )}
        {v.concentration && p.compose && (
          <>
            <dt>{p.compose.nom}</dt>
            <dd>
              ≈ {fr(v.concentration.valeur)} {p.compose.unite} (estimé)
              {v.concentration.facteur !== null ? ` · incertitude ×/÷ ${fr(v.concentration.facteur, 2)}` : ''}
            </dd>
            {v.concentration.probabilite !== null && p.referenceEaux !== null && (
              <>
                <dt>Dépassement</dt>
                <dd>
                  probabilité de dépasser {fr(p.referenceEaux)} {p.compose.unite} : {Math.round(v.concentration.probabilite * 100)} %
                </dd>
              </>
            )}
          </>
        )}
      </dl>
      <p className="st-note">Interpolé : une lecture du modèle entre les forages, pas une observation. Cliquez ailleurs sur le sol pour un autre forage virtuel.</p>
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
        {compose.nom} ({compose.unite}
        {lineaire ? '' : ', échelle logarithmique'}) · cercle vide : non quantifié, tracé à la LQ
      </figcaption>
    </figure>
  )
}
