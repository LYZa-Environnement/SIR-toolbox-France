import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react'
import { convertir, debitMoyen, formatConcentration, lireNombre, volumeLitres, type Prelevement, type UniteSortie } from '../lib/conversion/calc'
import { telechargerClasseur } from '../lib/conversion/export'
import { LectureImpossible, lireClasseur, type Cell, type Couche, type Lecture } from '../lib/conversion/parse'

type Champ = 'duree' | 'debitDebut' | 'debitFin'
type Saisie = Record<Champ, string>

const CHAMPS: { champ: Champ; libelle: string; aide: string }[] = [
  { champ: 'duree', libelle: 'Durée (min)', aide: 'Temps de prélèvement' },
  { champ: 'debitDebut', libelle: 'Débit début (L/min)', aide: 'Débit mesuré en début de prélèvement' },
  { champ: 'debitFin', libelle: 'Débit fin (L/min)', aide: 'Optionnel : le débit retenu est alors la moyenne début / fin' },
]

const MILIEUX = ['gaz du sol', 'air ambiant', 'air intérieur'] as const

const vide: Saisie = { duree: '', debitDebut: '', debitFin: '' }

function versPrelevement(s: Saisie | undefined): Prelevement {
  return { duree: lireNombre(s?.duree ?? ''), debitDebut: lireNombre(s?.debitDebut ?? ''), debitFin: lireNombre(s?.debitFin ?? '') }
}

const fr = (x: number, chiffres: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres })

async function lireFichier(fichier: File): Promise<Lecture> {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(await fichier.arrayBuffer(), { type: 'array' })
  const feuilles = classeur.SheetNames.map((nom) => ({
    nom,
    grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
  }))
  return lireClasseur(feuilles)
}

export default function Conversion() {
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [fichier, setFichier] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({})
  const [exclus, setExclus] = useState<Record<string, boolean>>({})
  const [tous, setTous] = useState<Saisie>(vide)
  const [unite, setUnite] = useState<UniteSortie>('µg/m³')
  const [milieu, setMilieu] = useState<(typeof MILIEUX)[number]>('gaz du sol')
  const [titre, setTitre] = useState('')
  const [sousTitre, setSousTitre] = useState('Echantillons prélevés par ERM le ')
  const [coucheApercu, setCoucheApercu] = useState<Couche>('CM')
  const [export_, setExport] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const titreParDefaut = `Tableau X - Résultats dans ${milieu === 'gaz du sol' ? 'les gaz du sol' : `l'${milieu}`}`

  async function charger(f: File | undefined) {
    if (!f) return
    setChargement(true)
    setErreur(null)
    try {
      const l = await lireFichier(f)
      setLecture(l)
      setFichier(f.name)
      setSaisies({})
      setExclus({})
      setTous(vide)
      setCoucheApercu('CM')
    } catch (e) {
      setLecture(null)
      setErreur(
        e instanceof LectureImpossible
          ? `${e.message} Si ce fichier vient bien d'un laboratoire, transmettez-le pour que son format soit pris en charge.`
          : "Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un classeur Excel (.xlsx, .xls) ou d'un CSV.",
      )
    } finally {
      setChargement(false)
    }
  }

  const points = useMemo(() => lecture?.points ?? [], [lecture])
  const retenus = points.filter((p) => !exclus[p.nom])
  const prelevements = useMemo(
    () => Object.fromEntries(points.map((p) => [p.nom, versPrelevement(saisies[p.nom])])),
    [points, saisies],
  )
  const sansVolume = retenus.filter((p) => volumeLitres(prelevements[p.nom]) === null)

  function modifier(nom: string, champ: Champ, valeur: string) {
    setSaisies((s) => ({ ...s, [nom]: { ...vide, ...s[nom], [champ]: valeur } }))
  }

  // Pasting a column (or a block) copied from Excel fills the rows below.
  function coller(e: ClipboardEvent<HTMLInputElement>, ligne: number, champ: Champ) {
    const texte = e.clipboardData.getData('text')
    if (!/[\n\t]/.test(texte.trim())) return
    e.preventDefault()
    const lignes = texte.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    const debut = CHAMPS.findIndex((c) => c.champ === champ)
    setSaisies((s) => {
      const suite = { ...s }
      lignes.forEach((cols, i) => {
        const p = points[ligne + i]
        if (!p) return
        cols.forEach((v, j) => {
          const c = CHAMPS[debut + j]
          if (c) suite[p.nom] = { ...vide, ...suite[p.nom], [c.champ]: v.trim() }
        })
      })
      return suite
    })
  }

  function appliquerATous() {
    setSaisies((s) => {
      const suite = { ...s }
      for (const p of points) {
        const actuel = { ...vide, ...suite[p.nom] }
        for (const { champ } of CHAMPS) if (tous[champ].trim()) actuel[champ] = tous[champ].trim()
        suite[p.nom] = actuel
      }
      return suite
    })
  }

  async function exporter() {
    if (!lecture) return
    setExport(true)
    try {
      const filtree: Lecture = { ...lecture, points: retenus }
      const base = fichier.replace(/\.[^.]+$/, '')
      await telechargerClasseur(
        filtree,
        { titre: titre || titreParDefaut, sousTitre, unite, prelevements },
        `Conversion ${milieu} - ${base}.xlsx`,
      )
    } finally {
      setExport(false)
    }
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    void charger(e.dataTransfer.files[0])
  }

  const parametresApercu = lecture?.parametres[coucheApercu] ?? []

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Gaz du sol · air ambiant</p>
          <h1 style={{ maxWidth: '22ch' }}>
            Conversion des résultats de laboratoire en <em>concentrations</em>
          </h1>
          <p className="lede">
            Chargez le fichier transmis par le laboratoire (ALS / Wessling, Eurofins, SGS), renseignez pour chaque échantillon la
            durée et le débit de prélèvement : les masses par support sont converties en {unite} et restituées dans un tableau Excel
            prêt à intégrer au rapport.
          </p>

          <div
            className={`depot${survol ? ' depot--survol' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setSurvol(true)
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={deposer}
          >
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                void charger(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <p style={{ margin: 0, fontWeight: 600 }}>{chargement ? 'Lecture du fichier…' : 'Déposez ici le fichier du laboratoire'}</p>
            <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
              Excel (.xlsx, .xls) ou CSV — le fichier est lu dans votre navigateur et n'est envoyé nulle part.
            </p>
            <button type="button" className="btn" onClick={() => input.current?.click()} disabled={chargement}>
              Choisir un fichier
            </button>
          </div>

          {erreur && (
            <p role="alert" className="alerte">
              {erreur}
            </p>
          )}

          {lecture && (
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <strong>{fichier}</strong>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: 'var(--color-muted)' }}>
                {lecture.feuille && <>Feuille « {lecture.feuille} » · </>}
                {points.length} échantillon{points.length > 1 ? 's' : ''} · {lecture.parametres.CM.length} paramètres
                {lecture.coucheControle ? ' · couche de mesure et couche de contrôle' : ''}
              </p>
              {lecture.lignesIgnorees.length > 0 && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                  Lignes non converties (unité autre qu'une masse par support) : {lecture.lignesIgnorees.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {lecture && (
        <>
          <section className="section section--muted">
            <div className="container">
              <p className="eyebrow">Étape 2</p>
              <h2>Conditions de prélèvement</h2>
              <p className="lede" style={{ marginBottom: '1.25rem' }}>
                Volume prélevé = débit × durée. Avec un débit de début et de fin, le débit retenu est leur moyenne. Une colonne copiée
                depuis Excel peut être collée directement dans la première case : elle remplit les lignes suivantes.
              </p>

              <div className="tableau-defile">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Échantillon</th>
                      <th>Inclure</th>
                      {CHAMPS.map((c) => (
                        <th key={c.champ} title={c.aide}>
                          {c.libelle}
                        </th>
                      ))}
                      <th>Débit retenu (L/min)</th>
                      <th>Volume (L)</th>
                      <th>Volume (m³)</th>
                    </tr>
                    <tr className="tableau__tous">
                      <td>Tous les échantillons</td>
                      <td />
                      {CHAMPS.map((c) => (
                        <td key={c.champ}>
                          <input
                            inputMode="decimal"
                            value={tous[c.champ]}
                            aria-label={`${c.libelle} pour tous les échantillons`}
                            onChange={(e) => setTous({ ...tous, [c.champ]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td colSpan={3}>
                        <button type="button" className="btn btn--petit btn--ghost" onClick={appliquerATous}>
                          Appliquer à tous
                        </button>
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p, i) => {
                      const pr = prelevements[p.nom]
                      const debit = debitMoyen(pr)
                      const vol = volumeLitres(pr)
                      return (
                        <tr key={p.nom} className={exclus[p.nom] ? 'tableau__exclu' : undefined}>
                          <th scope="row">{p.nom}</th>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={!exclus[p.nom]}
                              aria-label={`Inclure ${p.nom} dans le tableau`}
                              onChange={(e) => setExclus({ ...exclus, [p.nom]: !e.target.checked })}
                            />
                          </td>
                          {CHAMPS.map((c) => (
                            <td key={c.champ}>
                              <input
                                inputMode="decimal"
                                value={saisies[p.nom]?.[c.champ] ?? ''}
                                aria-label={`${c.libelle} — ${p.nom}`}
                                aria-invalid={!!saisies[p.nom]?.[c.champ] && lireNombre(saisies[p.nom][c.champ]) === null}
                                onChange={(e) => modifier(p.nom, c.champ, e.target.value)}
                                onPaste={(e) => coller(e, i, c.champ)}
                              />
                            </td>
                          ))}
                          <td className="tableau__calcule">{debit === null ? '—' : fr(debit, 3)}</td>
                          <td className="tableau__calcule">{vol === null ? '—' : fr(vol, 1)}</td>
                          <td className="tableau__calcule">{vol === null ? '—' : fr(vol / 1000, 4)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="container">
              <p className="eyebrow">Étape 3</p>
              <h2>Résultats convertis</h2>

              <div className="grid grid--4" style={{ margin: '1.25rem 0 1.5rem', alignItems: 'end' }}>
                <label className="champ">
                  Milieu
                  <select value={milieu} onChange={(e) => setMilieu(e.target.value as (typeof MILIEUX)[number])}>
                    {MILIEUX.map((m) => (
                      <option key={m} value={m}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="champ">
                  Unité de sortie
                  <select value={unite} onChange={(e) => setUnite(e.target.value as UniteSortie)}>
                    <option value="µg/m³">µg/m³</option>
                    <option value="mg/m³">mg/m³</option>
                  </select>
                </label>
                <label className="champ" style={{ gridColumn: 'span 2' }}>
                  Titre du tableau
                  <input value={titre} placeholder={titreParDefaut} onChange={(e) => setTitre(e.target.value)} />
                </label>
                <label className="champ" style={{ gridColumn: 'span 4' }}>
                  Sous-titre
                  <input value={sousTitre} onChange={(e) => setSousTitre(e.target.value)} />
                </label>
              </div>

              {lecture.coucheControle && (
                <div role="tablist" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  {(['CM', 'CC'] as const).map((c) => (
                    <button
                      key={c}
                      role="tab"
                      type="button"
                      aria-selected={coucheApercu === c}
                      className={`btn btn--petit${coucheApercu === c ? '' : ' btn--ghost'}`}
                      onClick={() => setCoucheApercu(c)}
                    >
                      {c === 'CM' ? 'Couche de mesure' : 'Couche de contrôle'}
                    </button>
                  ))}
                </div>
              )}

              <div className="tableau-defile">
                <table className="tableau tableau--resultats">
                  <thead>
                    <tr>
                      <th rowSpan={2}>Composé</th>
                      {retenus.map((p) => (
                        <th key={p.nom} colSpan={2}>
                          {p.nom}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {retenus.map((p) => (
                        <FragmentUnites key={p.nom} unite={unite} uniteBrute={parametresApercu[0]?.unite ?? 'µg/support'} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parametresApercu.map((pa, i) => (
                      <LigneFamille key={pa.cle} afficher={i === 0 || parametresApercu[i - 1].famille !== pa.famille} famille={pa.famille} colonnes={1 + 2 * retenus.length}>
                        <tr>
                          <th scope="row" style={{ fontStyle: pa.somme ? 'italic' : undefined, textAlign: pa.somme ? 'right' : undefined }}>
                            {pa.nom}
                          </th>
                          {retenus.map((p) => {
                            const m = lecture.valeurs[coucheApercu][p.nom]?.[pa.cle]
                            const c = convertir(m, pa, volumeLitres(prelevements[p.nom]), unite)
                            return (
                              <FragmentValeurs key={p.nom} brut={m?.brut ?? '-'} lq={!!m?.inferieur} conc={formatConcentration(c)} />
                            )
                          })}
                        </tr>
                      </LigneFamille>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginTop: '1.5rem' }}>
                <button type="button" className="btn" onClick={exporter} disabled={export_ || !retenus.length}>
                  {export_ ? 'Préparation…' : 'Télécharger le tableau Excel'}
                </button>
                {sansVolume.length > 0 && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                    Sans débit ni durée, aucune concentration ne sera calculée pour : {sansVolume.map((p) => p.nom).join(', ')}.
                  </span>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  )
}

function FragmentUnites({ unite, uniteBrute }: { unite: UniteSortie; uniteBrute: string }) {
  return (
    <>
      <th className="tableau__unite">{uniteBrute.replace(/\s+/g, '')}</th>
      <th className="tableau__unite tableau__conc">{unite}</th>
    </>
  )
}

function FragmentValeurs({ brut, lq, conc }: { brut: string; lq: boolean; conc: string }) {
  return (
    <>
      <td className={lq ? 'tableau__lq' : undefined}>{brut}</td>
      <td className={`tableau__conc${lq ? ' tableau__lq' : ''}`}>{conc}</td>
    </>
  )
}

function LigneFamille({ afficher, famille, colonnes, children }: { afficher: boolean; famille: string; colonnes: number; children: ReactNode }) {
  return (
    <>
      {afficher && famille && (
        <tr className="tableau__famille">
          <td colSpan={colonnes}>{famille}</td>
        </tr>
      )}
      {children}
    </>
  )
}
