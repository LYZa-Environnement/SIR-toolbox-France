import { volumeLitres, type Prelevement, type UniteSortie } from '../lib/resultats/calc'
import type { Lecture } from '../lib/resultats/parse'
import {
  controleBlancs,
  controleDoublons,
  controlePercee,
  LIBELLES_TYPE,
  SEUIL_PERCEE,
  type Qualification,
  type TypeEchantillon,
} from '../lib/resultats/qualite'
import { statistiques, valeursCompose } from '../lib/resultats/stats'

const fr = (x: number, chiffres = 3) => x.toLocaleString('fr-FR', { maximumSignificantDigits: chiffres })
const virgule = (s: string) => s.replace('.', ',')

interface Props {
  lecture: Lecture
  qualifications: Record<string, Qualification>
  onQualifier: (nom: string, q: Qualification) => void
  seuilDoublon: number
  onSeuilDoublon: (s: number) => void
  conversion: boolean
}

/** Sample types (editable), then what the blanks, duplicates and control
 *  layers say. */
export function ControleQualite({ lecture, qualifications, onQualifier, seuilDoublon, onSeuilDoublon, conversion }: Props) {
  const controles = lecture.points.filter((p) => qualifications[p.nom] && qualifications[p.nom].type !== 'echantillon')
  const blancs = controleBlancs(lecture, qualifications)
  const doublons = controleDoublons(lecture, qualifications, seuilDoublon)
  const percees = conversion ? controlePercee(lecture) : []
  const alertesPercee = percees.flatMap((pt) =>
    pt.composes.filter((c) => c.percee).map((c) => ({ point: pt.point, nom: c.parametre.nom, ratio: c.ratio })),
  )
  const perceesGlobales = percees.filter((p) => p.perceeGlobale)

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <strong>Contrôle qualité</strong>
      <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
        {controles.length
          ? `Échantillons de contrôle qualité : ${controles
              .map((p) => `${p.nom} (${LIBELLES_TYPE[qualifications[p.nom].type].toLowerCase()}${qualifications[p.nom].de ? ` de ${qualifications[p.nom].de}` : ''})`)
              .join(', ')}.`
          : "Aucun blanc ni doublon reconnu d'après les noms d'échantillons."}{' '}
        Ils sont exclus de l'analyse par composé. Vérifiez et corrigez si besoin :
      </p>

      <details className="qualif">
        <summary>Qualification des échantillons</summary>
        <div className="tableau-defile" style={{ marginTop: '0.75rem', maxHeight: '22rem' }}>
          <table className="tableau">
            <thead>
              <tr>
                <th>Échantillon</th>
                <th>Type</th>
                <th>Doublon de</th>
              </tr>
            </thead>
            <tbody>
              {lecture.points.map((p) => {
                const q = qualifications[p.nom] ?? { type: 'echantillon', auto: true }
                return (
                  <tr key={p.nom} className={q.type !== 'echantillon' ? 'tableau__selection' : undefined}>
                    <th scope="row">{p.nom}</th>
                    <td>
                      <select
                        value={q.type}
                        aria-label={`Type de ${p.nom}`}
                        onChange={(e) => onQualifier(p.nom, { type: e.target.value as TypeEchantillon, de: q.de, auto: false })}
                      >
                        {(Object.keys(LIBELLES_TYPE) as TypeEchantillon[]).map((t) => (
                          <option key={t} value={t}>
                            {LIBELLES_TYPE[t]}
                          </option>
                        ))}
                      </select>
                      {q.auto && q.type !== 'echantillon' && <span className="pastille">détecté</span>}
                    </td>
                    <td>
                      {q.type === 'doublon' ? (
                        <select
                          value={q.de ?? ''}
                          aria-label={`Échantillon dont ${p.nom} est le doublon`}
                          onChange={(e) => onQualifier(p.nom, { ...q, de: e.target.value || undefined, auto: false })}
                        >
                          <option value="">— à préciser —</option>
                          {lecture.points
                            .filter((x) => x.nom !== p.nom)
                            .map((x) => (
                              <option key={x.nom} value={x.nom}>
                                {x.nom}
                              </option>
                            ))}
                        </select>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>

      <div className="qualite-resultats">
        <div>
          <h3>Blancs</h3>
          {!blancs.length ? (
            <p className="qualite-neutre">Aucun blanc identifié.</p>
          ) : (
            blancs.map((b) =>
              b.composes.length ? (
                <p key={b.blanc} className="qualite-alerte">
                  {b.blanc} : {b.composes.map((c) => `${c.parametre.nom} ${virgule(c.mesure.brut)} ${c.parametre.unite}`).join(' ; ')}
                </p>
              ) : (
                <p key={b.blanc} className="qualite-ok">
                  {b.blanc} : aucun composé quantifié.
                </p>
              ),
            )
          )}
        </div>
        <div>
          <h3>
            Doublons{' '}
            <label className="qualite-seuil">
              seuil
              <input
                type="number"
                min={0}
                value={seuilDoublon}
                aria-label="Seuil d'écart relatif des doublons, en %"
                onChange={(e) => onSeuilDoublon(Number(e.target.value) || 0)}
              />
              %
            </label>
          </h3>
          {!doublons.length ? (
            <p className="qualite-neutre">
              {controles.some((p) => qualifications[p.nom].type === 'doublon')
                ? "Précisez l'échantillon d'origine des doublons."
                : 'Aucun doublon identifié.'}
            </p>
          ) : (
            doublons.map((d) => {
              const ecarts = d.ecarts.filter((e) => e.ecart !== null)
              const hors = ecarts.filter((e) => !e.conforme)
              return (
                <p key={d.doublon} className={hors.length ? 'qualite-alerte' : 'qualite-ok'}>
                  {d.doublon} / {d.original} :{' '}
                  {!ecarts.length
                    ? 'aucun composé quantifié dans les deux échantillons.'
                    : hors.length
                      ? `écart > ${seuilDoublon} % pour ${hors.map((e) => `${e.parametre.nom} (${fr(e.ecart!)} %)`).join(', ')}.`
                      : `${ecarts.length} composé${ecarts.length > 1 ? 's' : ''} comparé${ecarts.length > 1 ? 's' : ''}, écarts ≤ ${seuilDoublon} %.`}
                </p>
              )
            })
          )}
        </div>
        {conversion && (
          <div>
            <h3>Percée des tubes</h3>
            {!lecture.coucheControle ? (
              <p className="qualite-neutre">Pas de couche de contrôle : percée non vérifiable.</p>
            ) : !alertesPercee.length && !perceesGlobales.length ? (
              <p className="qualite-ok">Couche de contrôle &lt; {SEUIL_PERCEE} % de la couche de mesure pour tous les points.</p>
            ) : (
              <>
                {perceesGlobales.map((p) => (
                  <p key={p.point} className="qualite-alerte">
                    {p.point} : somme couche de contrôle = {fr((p.sommeCC / Math.max(p.sommeCM, 1e-12)) * 100)} % de la couche de mesure —
                    prélèvement non conclusif.
                  </p>
                ))}
                {alertesPercee.map((a) => (
                  <p key={`${a.point}|${a.nom}`} className="qualite-alerte">
                    {a.point} — {a.nom} : {a.ratio === null ? 'quantifié sur la seule couche de contrôle' : `${fr(a.ratio)} %`} (résultat « ≥ »).
                  </p>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: 'var(--color-muted)' }}>
        Percée : masse de la couche de contrôle &lt; 5 % de celle de la couche de mesure, par composé et pour la somme (NF X 43-267 ;
        guide BRGM/INERIS 2016 sur les gaz du sol et l'air intérieur, § 7.5). Doublons : écart relatif |a − b| / moyenne ; valeurs
        d'usage 30 % (eaux) et 50 % (sols), sans seuil réglementaire. Le détail figure dans l'onglet « Contrôle qualité » de l'Excel.
      </p>
    </div>
  )
}

/** The conversion explained on a value of the loaded file. */
export function ExempleConversion({
  lecture,
  prelevements,
  unite,
}: {
  lecture: Lecture
  prelevements: Record<string, Prelevement>
  unite: UniteSortie
}) {
  const candidats = lecture.points.flatMap((p) =>
    lecture.parametres.CM.filter((pa) => !pa.somme).map((pa) => ({ p, pa, m: lecture.valeurs.CM[p.nom]?.[pa.cle] })),
  )
  const quantifies = candidats.filter((c) => c.m && !c.m.inferieur && c.m.valeur !== null)
  const choisi = quantifies.find((c) => volumeLitres(prelevements[c.p.nom] ?? { debitDebut: null, debitFin: null, duree: null })) ?? quantifies[0]
  if (!choisi) return null
  const pr = prelevements[choisi.p.nom]
  const vol = volumeLitres(pr ?? { debitDebut: null, debitFin: null, duree: null })
  const debit = vol && pr ? (pr.debitDebut !== null && pr.debitFin !== null ? (pr.debitDebut + pr.debitFin) / 2 : (pr.debitDebut ?? pr.debitFin)!) : 1
  const duree = vol && pr ? pr.duree! : 60
  const v = debit * duree
  const masse = choisi.m!.valeur! * choisi.pa.versMicrogrammes
  const c = masse / (v / 1000) / (unite === 'mg/m³' ? 1000 : 1)
  return (
    <div className="card exemple">
      <strong>Démarche</strong>
      <p>
        Le laboratoire restitue une masse de composé piégée sur le support (µg/support). Rapportée au volume d'air pompé au travers
        du support — débit × durée de prélèvement — elle donne la concentration dans l'air prélevé.
      </p>
      <p className="exemple__formule">
        C ({unite}) = m (µg) / [Q (L/min) × t (min) / 1000]{unite === 'mg/m³' ? ' / 1000' : ''}
      </p>
      <p>
        Exemple — {choisi.p.nom}, {choisi.pa.nom} : m = {virgule(choisi.m!.brut)} µg
        {!vol && ' (débit et durée non encore renseignés : exemple avec 1 L/min pendant 60 min)'} ; V = {fr(debit, 4)} L/min ×{' '}
        {fr(duree, 4)} min = {fr(v, 4)} L = {fr(v / 1000, 4)} m³ ; C = {virgule(choisi.m!.brut)} / {fr(v / 1000, 4)} ={' '}
        <strong>
          {fr(c)} {unite}
        </strong>
        .
      </p>
    </div>
  )
}

/** Key figures per compound, as in the "Analyse par composé" sheet. */
export function AnalyseApercu({
  lecture,
  qualifications,
  guides,
  conversion,
}: {
  lecture: Lecture
  qualifications: Record<string, Qualification>
  guides: Record<string, { valeur: number; source: string } | null>
  conversion: { prelevements: Record<string, Prelevement>; unite: UniteSortie } | null
}) {
  const echantillons = lecture.points.filter((p) => (qualifications[p.nom]?.type ?? 'echantillon') === 'echantillon').map((p) => p.nom)
  const lignes = lecture.parametres.CM.map((pa) => ({
    pa,
    s: statistiques(valeursCompose(lecture, pa, echantillons, conversion), guides[pa.cle]?.valeur ?? null),
  }))
  const n = (x: number | null) => (x === null ? '-' : fr(x))
  return (
    <details className="qualif" style={{ marginTop: '1.5rem' }}>
      <summary>Analyse par composé (aperçu — le détail complet est dans l'onglet Excel)</summary>
      <div className="tableau-defile" style={{ marginTop: '0.75rem' }}>
        <table className="tableau tableau--resultats">
          <thead>
            <tr>
              <th>Composé</th>
              <th>Quantifiés / analysés</th>
              <th>Maximum</th>
              <th>Échantillon du max.</th>
              <th>Médiane</th>
              <th>Moyenne (LQ/2)</th>
              <th>Valeur guide</th>
              <th>Dépassements</th>
              <th>Max / valeur guide</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(({ pa, s }) => (
              <tr key={pa.cle}>
                <th scope="row">{pa.nom}</th>
                <td>
                  {s.quantifies} / {s.analyses}
                </td>
                <td>{n(s.max)}</td>
                <td>{s.echantillonMax ?? '-'}</td>
                <td>{n(s.mediane)}</td>
                <td>{n(s.moyenneDemiLQ)}</td>
                <td>{s.guide === null ? '-' : fr(s.guide)}</td>
                <td className={s.depassements ? 'tableau__depasse' : undefined}>{s.guide === null ? '-' : s.depassements}</td>
                <td>{n(s.ratioMaxGuide)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
