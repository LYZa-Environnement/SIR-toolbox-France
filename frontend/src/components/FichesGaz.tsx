import type { Point } from '../lib/resultats/parse'
import type { EtatFichesGaz } from '../lib/resultats/lireFichesGaz'
import { useTri } from '../lib/tri'
import { EnTete } from './Tri'
import {
  LIBELLES_DEBIT,
  LIBELLES_DUREE,
  retenir,
  type SourceDebit,
  type SourceDuree,
} from '../lib/resultats/fichesGaz'

const fr = (x: number | null, chiffres = 3) => (x === null ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres }))
const dateFr = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d || '—')

/**
 * Sampling sheets of the soil gas campaign: duration and flows of each
 * sample read from its sheet, matched by name (correctable), with the
 * checks that tell a doubtful duration or flow.
 */
export function FichesGaz({
  points,
  etat,
  association,
  sourceDuree,
  sourceDebit,
  onAssocier,
  onSourceDuree,
  onSourceDebit,
}: {
  points: Point[]
  etat: EtatFichesGaz | null
  /** Sheet index per sample, -1 when none. */
  association: Record<string, number>
  sourceDuree: SourceDuree
  sourceDebit: SourceDebit
  onAssocier: (echantillon: string, fiche: number) => void
  onSourceDuree: (s: SourceDuree) => void
  onSourceDebit: (s: SourceDebit) => void
}) {
  if (!etat) {
    return (
      <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
        Chargez les fiches de prélèvement à l’étape 2 : la durée et les débits de chaque échantillon y sont lus et reportés dans le
        tableau ci-dessous. Sinon, saisissez-les.
      </p>
    )
  }
  return <FichesChargees {...{ points, etat, association, sourceDuree, sourceDebit, onAssocier, onSourceDuree, onSourceDebit }} />
}

function FichesChargees({
  points,
  etat,
  association,
  sourceDuree,
  sourceDebit,
  onAssocier,
  onSourceDuree,
  onSourceDebit,
}: {
  points: Point[]
  etat: EtatFichesGaz
  association: Record<string, number>
  sourceDuree: SourceDuree
  sourceDebit: SourceDebit
  onAssocier: (echantillon: string, fiche: number) => void
  onSourceDuree: (s: SourceDuree) => void
  onSourceDebit: (s: SourceDebit) => void
}) {
  const rapproches = etat ? points.filter((p) => (association[p.nom] ?? -1) >= 0) : []
  const utilisees = new Set(Object.values(association))
  const sansEchantillon = etat ? etat.fiches.filter((_, i) => !utilisees.has(i)) : []
  const aVerifier = etat
    ? rapproches
        .map((p) => ({ nom: p.nom, alertes: retenir(etat.fiches[association[p.nom]], sourceDuree, sourceDebit).alertes }))
        .filter((x) => x.alertes.length)
    : []

  const lignes = points.map((p) => {
    const i = association[p.nom] ?? -1
    const f = i >= 0 ? etat.fiches[i] : null
    return { p, i, f, r: f ? retenir(f, sourceDuree, sourceDebit) : null }
  })
  const { tries, tri, trier } = useTri(lignes, {
    nom: (x) => x.p.nom,
    fiche: (x) => x.f?.ouvrage,
    date: (x) => x.f?.date,
    erm: (x) => x.f?.dureeErm,
    pompe: (x) => x.f?.dureePompe,
    horaires: (x) => x.f?.dureeHoraires,
    consigne: (x) => x.f?.debitConsigne,
    releve: (x) => x.f?.releves[x.f.releves.length - 1]?.debit,
    volFiche: (x) => x.f?.volumeFiche,
    volCalc: (x) => x.r?.volume,
    controles: (x) => (x.r ? x.r.alertes.length : null),
  })
  const th = { tri, onTrier: trier }

  return (
    <div className="card" style={{ margin: '0 0 1.5rem' }}>
      <strong>Fiches de prélèvement</strong>
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.88rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
        Durée et débits de chaque échantillon lus sur sa fiche (rapprochement par le nom, corrigeable) et reportés dans le tableau
        ci-dessous ; les valeurs reportées restent modifiables, changer une option ou une fiche les remplace.
      </p>
      {etat && (
        <>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
            {etat.fichiers.join(', ')} : {etat.fiches.length} fiche{etat.fiches.length > 1 ? 's' : ''} lue{etat.fiches.length > 1 ? 's' : ''} ·{' '}
            {rapproches.length} échantillon{rapproches.length > 1 ? 's' : ''} sur {points.length} rapproché{rapproches.length > 1 ? 's' : ''}
            {etat.ignores.length > 0 && (
              <span style={{ color: 'var(--color-muted)' }}> · onglets ignorés : {etat.ignores.join(', ')}</span>
            )}
          </p>

          <div className="grid grid--2" style={{ margin: '1rem 0', alignItems: 'end', maxWidth: '52rem' }}>
            <label className="champ">
              Durée retenue
              <select value={sourceDuree} onChange={(e) => onSourceDuree(e.target.value as SourceDuree)}>
                {(Object.keys(LIBELLES_DUREE) as SourceDuree[]).map((s) => (
                  <option key={s} value={s}>
                    {LIBELLES_DUREE[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ">
              Débits retenus
              <select value={sourceDebit} onChange={(e) => onSourceDebit(e.target.value as SourceDebit)}>
                {(Object.keys(LIBELLES_DEBIT) as SourceDebit[]).map((s) => (
                  <option key={s} value={s}>
                    {LIBELLES_DEBIT[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
            Durée : celle choisie, à défaut la première renseignée (mesurée par ERM, puis affichée sur la pompe, puis horaires). Débits
            relevés : le débit de la pompe relevé au début de l'échantillonnage — à défaut le débit d'échantillonnage de la fiche — et
            celui relevé à la fin ; le débit retenu est leur moyenne. Sont signalés : des durées écartées de plus de 2 min, un débit
            de fin écarté de plus de 10 % du débit de début, un volume calculé écarté de plus de 5 % du volume noté sur la fiche.
          </p>

          <div className="tableau-defile">
            <table className="tableau">
              <thead>
                <tr>
                  <EnTete cle="nom" {...th}>Échantillon</EnTete>
                  <EnTete cle="fiche" {...th}>Fiche</EnTete>
                  <EnTete cle="date" {...th}>Date</EnTete>
                  <EnTete cle="erm" {...th} title={LIBELLES_DUREE.erm}>Durée ERM (min)</EnTete>
                  <EnTete cle="pompe" {...th} title={LIBELLES_DUREE.pompe}>Durée pompe (min)</EnTete>
                  <EnTete cle="horaires" {...th} title={LIBELLES_DUREE.horaires}>Horaires (min)</EnTete>
                  <EnTete cle="consigne" {...th}>Débit d'échantillonnage (L/min)</EnTete>
                  <EnTete cle="releve" {...th}>Débits relevés (L/min)</EnTete>
                  <EnTete cle="volFiche" {...th}>Volume fiche (L)</EnTete>
                  <EnTete cle="volCalc" {...th}>Volume calculé (L)</EnTete>
                  <EnTete cle="controles" {...th}>Contrôles</EnTete>
                </tr>
              </thead>
              <tbody>
                {tries.map(({ p, i, f, r }) => {
                  const gras = (s: SourceDuree) => (r?.sourceDuree === s ? { fontWeight: 700, color: 'var(--color-ink)' } : undefined)
                  return (
                    <tr key={p.nom}>
                      <th scope="row">{p.nom}</th>
                      <td>
                        <select value={String(i)} aria-label={`Fiche de prélèvement de ${p.nom}`} onChange={(e) => onAssocier(p.nom, Number(e.target.value))}>
                          <option value="-1">— aucune —</option>
                          {etat.fiches.map((x, k) => (
                            <option key={k} value={String(k)}>
                              {x.ouvrage}
                              {x.ouvrage !== x.onglet ? ` (onglet ${x.onglet})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      {f && r ? (
                        <>
                          <td>{dateFr(f.date)}</td>
                          <td className="tableau__calcule" style={gras('erm')}>{fr(f.dureeErm, 1)}</td>
                          <td className="tableau__calcule" style={gras('pompe')}>{fr(f.dureePompe, 1)}</td>
                          <td className="tableau__calcule" style={gras('horaires')}>{fr(f.dureeHoraires, 1)}</td>
                          <td className="tableau__calcule">{fr(f.debitConsigne)}</td>
                          <td className="tableau__calcule">{f.releves.length ? f.releves.map((x) => `${fr(x.debit)}${x.heure ? ` (${x.heure})` : ''}`).join(' · ') : '—'}</td>
                          <td className="tableau__calcule">{fr(f.volumeFiche, 1)}</td>
                          <td className="tableau__calcule">{fr(r.volume, 1)}</td>
                          <td style={{ fontSize: '0.8rem', minWidth: '16rem', color: r.alertes.length ? 'var(--level-elevee)' : 'var(--level-faible)' }}>
                            {r.alertes.length ? r.alertes.map((a) => <div key={a}>{a}</div>) : 'Concordant'}
                          </td>
                        </>
                      ) : (
                        <td colSpan={9} style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                          Pas de fiche rapprochée : durée et débits à saisir (blanc de transport, échantillon nommé autrement…).
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {aVerifier.length > 0 && (
            <div className="alerte" style={{ maxWidth: '52rem' }}>
              <strong>À vérifier sur les fiches</strong>
              <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
                {aVerifier.map(({ nom, alertes }) => (
                  <li key={nom}>
                    {nom} : {alertes.join(' ; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sansEchantillon.length > 0 && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
              Fiches sans échantillon dans le fichier du laboratoire : {sansEchantillon.map((f) => f.ouvrage).join(', ')}.
            </p>
          )}

        </>
      )}
    </div>
  )
}
