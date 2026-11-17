import { useRef, useState } from 'react'
import type { Cell, Point } from '../lib/resultats/parse'
import {
  LIBELLES_DEBIT,
  LIBELLES_DUREE,
  lireFichesGaz,
  retenir,
  type FicheGaz,
  type SourceDebit,
  type SourceDuree,
} from '../lib/resultats/fichesGaz'
import { QualiteGaz } from './QualiteGaz'

export interface EtatFichesGaz {
  fiches: FicheGaz[]
  fichiers: string[]
  ignores: string[]
}

const fr = (x: number | null, chiffres = 3) => (x === null ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres }))
const dateFr = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d || '—')

/** Reads the sampling sheet workbooks (one sheet per tab). */
async function lireClasseurs(liste: File[]): Promise<EtatFichesGaz> {
  const XLSX = await import('xlsx')
  const etat: EtatFichesGaz = { fiches: [], fichiers: [], ignores: [] }
  for (const f of liste) {
    const classeur = XLSX.read(await f.arrayBuffer(), { type: 'array' })
    const feuilles = classeur.SheetNames.map((nom) => ({
      nom,
      grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
    }))
    const { fiches, ignores } = lireFichesGaz(feuilles)
    etat.fiches.push(...fiches)
    etat.ignores.push(...ignores.map((o) => (liste.length > 1 ? `${f.name} › ${o}` : o)))
    etat.fichiers.push(f.name)
  }
  return etat
}

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
  onCharger,
  onRetirer,
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
  onCharger: (etat: EtatFichesGaz) => void
  onRetirer: () => void
  onAssocier: (echantillon: string, fiche: number) => void
  onSourceDuree: (s: SourceDuree) => void
  onSourceDebit: (s: SourceDebit) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger(liste: File[]) {
    if (!liste.length) return
    setChargement(true)
    setErreur(null)
    try {
      const lu = await lireClasseurs(liste)
      if (!lu.fiches.length) {
        setErreur(
          `Aucune fiche de prélèvement reconnue dans ${liste.map((f) => f.name).join(', ')} : chaque onglet doit porter le débit d'échantillonnage ou le tableau de purge et d'échantillonnage (colonnes « Étape » et « Débit »).`,
        )
        return
      }
      onCharger(lu)
    } catch {
      setErreur("Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un classeur Excel (.xlsx, .xls).")
    } finally {
      setChargement(false)
    }
  }

  const rapproches = etat ? points.filter((p) => (association[p.nom] ?? -1) >= 0) : []
  const utilisees = new Set(Object.values(association))
  const sansEchantillon = etat ? etat.fiches.filter((_, i) => !utilisees.has(i)) : []
  const aVerifier = etat
    ? rapproches
        .map((p) => ({ nom: p.nom, alertes: retenir(etat.fiches[association[p.nom]], sourceDuree, sourceDebit).alertes }))
        .filter((x) => x.alertes.length)
    : []

  return (
    <div className="card" style={{ margin: '0 0 1.5rem' }}>
      <strong>Fiches de prélèvement</strong>
      <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.9rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
        Chargez le classeur des fiches de prélèvement de gaz du sol ou d'air (une fiche par onglet) : la durée et les débits de chaque
        échantillon y sont lus et reportés dans le tableau ci-dessous, l'échantillon étant rapproché de sa fiche par son nom
        (corrigeable). Les valeurs reportées restent modifiables ; changer une option ou une fiche les remplace.
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept=".xlsx,.xlsm,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          void charger([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn--petit" onClick={() => input.current?.click()} disabled={chargement}>
          {chargement ? 'Lecture…' : etat ? 'Charger d’autres fiches' : 'Charger les fiches de prélèvement'}
        </button>
        {etat && (
          <button type="button" className="btn btn--petit btn--ghost" onClick={onRetirer}>
            Retirer les fiches
          </button>
        )}
      </div>
      {erreur && (
        <p role="alert" className="alerte">
          {erreur}
        </p>
      )}

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
                  <th>Échantillon</th>
                  <th>Fiche</th>
                  <th>Date</th>
                  <th title={LIBELLES_DUREE.erm}>Durée ERM (min)</th>
                  <th title={LIBELLES_DUREE.pompe}>Durée pompe (min)</th>
                  <th title={LIBELLES_DUREE.horaires}>Horaires (min)</th>
                  <th>Débit d'échantillonnage (L/min)</th>
                  <th>Débits relevés (L/min)</th>
                  <th>Volume fiche (L)</th>
                  <th>Volume calculé (L)</th>
                  <th>Contrôles</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => {
                  const i = association[p.nom] ?? -1
                  const f = i >= 0 ? etat.fiches[i] : null
                  const r = f ? retenir(f, sourceDuree, sourceDebit) : null
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

          <QualiteGaz fiches={etat.fiches} sourceDuree={sourceDuree} sourceDebit={sourceDebit} />
        </>
      )}
    </div>
  )
}
