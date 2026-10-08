import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react'
import { convertir, debitMoyen, formatConcentration, lireNombre, volumeLitres, type Prelevement, type UniteSortie } from '../lib/resultats/calc'
import { AnalyseApercu, ControleQualite, ExempleConversion } from '../components/ControleQualite'
import { telechargerClasseur } from '../lib/resultats/export'
import { qualifierAuto, type Qualification } from '../lib/resultats/qualite'
import {
  legendeGuides,
  valeurGuideEn,
  type ContexteMetaux,
  type Matrice,
  type OptionsGuides,
  type Repere,
} from '../lib/resultats/guides'
import { LectureImpossible, lireClasseur, type Cell, type Couche, type Lecture, type Parametre } from '../lib/resultats/parse'

type Champ = 'duree' | 'debitDebut' | 'debitFin'
type Saisie = Record<Champ, string>
type MilieuAir = 'gaz du sol' | 'air ambiant' | 'air intérieur'

const MATRICES: { id: Matrice; titre: string; detail: string }[] = [
  { id: 'eau', titre: 'Eaux souterraines', detail: 'Résultats en µg/l, mg/l… comparés aux valeurs ERM eaux souterraines' },
  { id: 'sol', titre: 'Sols', detail: 'Résultats en mg/kg MS comparés aux valeurs ERM sols (bruit de fond, note interministérielle, ISDI)' },
  { id: 'air', titre: 'Gaz du sol / air', detail: 'Masses par support converties en concentrations, comparées aux valeurs repères R1, R2, R3' },
]

const LABORATOIRES = ['ALS / Wessling', 'Eurofins', 'SGS', 'Autre']

const CHAMPS: { champ: Champ; libelle: string; aide: string }[] = [
  { champ: 'duree', libelle: 'Durée (min)', aide: 'Temps de prélèvement' },
  { champ: 'debitDebut', libelle: 'Débit début (L/min)', aide: 'Débit mesuré en début de prélèvement' },
  { champ: 'debitFin', libelle: 'Débit fin (L/min)', aide: 'Optionnel : le débit retenu est alors la moyenne début / fin' },
]

const vide: Saisie = { duree: '', debitDebut: '', debitFin: '' }
const SANS_PRELEVEMENT: Prelevement = { duree: null, debitDebut: null, debitFin: null }

function versPrelevement(s: Saisie | undefined): Prelevement {
  return { duree: lireNombre(s?.duree ?? ''), debitDebut: lireNombre(s?.debitDebut ?? ''), debitFin: lireNombre(s?.debitFin ?? '') }
}

/** Lab values as French readers expect them: "0.69" → "0,69". */
const virgule = (brut: string) => brut.replace('.', ',')

const fr = (x: number, chiffres: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres })

function libelleMatrice(m: Matrice, milieu: MilieuAir): string {
  return m === 'eau' ? 'eaux souterraines' : m === 'sol' ? 'sols' : milieu
}

function dansLa(libelle: string): string {
  return libelle.startsWith('air') ? `l'${libelle}` : `les ${libelle}`
}

async function lireFichier(fichier: File, matrice: Matrice): Promise<Lecture> {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(await fichier.arrayBuffer(), { type: 'array' })
  const feuilles = classeur.SheetNames.map((nom) => ({
    nom,
    grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }),
  }))
  return lireClasseur(feuilles, matrice === 'air' ? 'support' : 'tout')
}

/** A file whose units belong to another matrix is most likely a wrong pick. */
function avertissementMatrice(matrice: Matrice, l: Lecture): string | null {
  const u = l.unites.join(' ').toLowerCase()
  if (matrice === 'eau' && /\/\s*kg/.test(u)) return 'Ce fichier contient des unités en /kg : il semble s’agir de résultats sur sols.'
  if (matrice === 'sol' && /\/\s*l\b/.test(u) && !/\/\s*kg/.test(u)) return 'Ce fichier contient des unités en /l : il semble s’agir de résultats sur eaux.'
  return null
}

export default function ResultatsLabo() {
  const [matrice, setMatrice] = useState<Matrice | null>(null)
  const [milieu, setMilieu] = useState<MilieuAir>('gaz du sol')
  const [laboratoire, setLaboratoire] = useState('')
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [fichier, setFichier] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({})
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [exclus, setExclus] = useState<Record<string, boolean>>({})
  const [aAppliquer, setAAppliquer] = useState<Saisie>(vide)
  const [unite, setUnite] = useState<UniteSortie>('µg/m³')
  const [metaux, setMetaux] = useState<ContexteMetaux>('sur site')
  const [repere, setRepere] = useState<Repere>('r1')
  const [surcharges, setSurcharges] = useState<Record<string, string>>({})
  const [parFamille, setParFamille] = useState<Record<string, string>>({})
  const [qualifications, setQualifications] = useState<Record<string, Qualification>>({})
  const [seuilDoublon, setSeuilDoublon] = useState(30)
  const [titre, setTitre] = useState('')
  const [sousTitre, setSousTitre] = useState('Echantillons prélevés par ERM le ')
  const [coucheApercu, setCoucheApercu] = useState<Couche>('CM')
  const [export_, setExport] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const conversion = matrice === 'air'
  const libelle = matrice ? libelleMatrice(matrice, milieu) : ''
  const titreParDefaut = `Tableau X - Résultats dans ${dansLa(libelle)}`
  const options: OptionsGuides = { metaux, repere }

  function choisirMatrice(m: Matrice) {
    if (m === matrice) return
    setMatrice(m)
    setLecture(null)
    setFichier('')
    setErreur(null)
    setSurcharges({})
    setParFamille({})
  }

  async function charger(f: File | undefined) {
    if (!f || !matrice) return
    setChargement(true)
    setErreur(null)
    try {
      const l = await lireFichier(f, matrice)
      setLecture(l)
      setFichier(f.name)
      setSaisies({})
      setSelection({})
      setExclus({})
      setAAppliquer(vide)
      setSurcharges({})
      setParFamille({})
      setQualifications(qualifierAuto(l.points))
      setSeuilDoublon(matrice === 'sol' ? 50 : 30)
      setCoucheApercu('CM')
    } catch (e) {
      setLecture(null)
      setErreur(
        e instanceof LectureImpossible
          ? `${e.message}${matrice === 'air' ? ' Pour des eaux ou des sols, choisissez la matrice correspondante.' : ''} Si ce fichier vient bien d'un laboratoire, transmettez-le pour que son format soit pris en charge.`
          : "Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un classeur Excel (.xlsx, .xls) ou d'un CSV.",
      )
    } finally {
      setChargement(false)
    }
  }

  const points = useMemo(() => lecture?.points ?? [], [lecture])
  const retenus = points.filter((p) => !exclus[p.nom])
  const selectionnes = points.filter((p) => selection[p.nom])
  const prelevements = useMemo(
    () => Object.fromEntries(points.map((p) => [p.nom, versPrelevement(saisies[p.nom])])),
    [points, saisies],
  )
  const sansVolume = conversion ? retenus.filter((p) => volumeLitres(prelevements[p.nom]) === null) : []

  /** ERM value per parameter, in the row's unit or the output unit. */
  const automatiques = useMemo(() => {
    const g: Record<string, { valeur: number; source: string } | null> = {}
    if (!lecture || !matrice) return g
    for (const c of ['CM', 'CC'] as const) {
      for (const p of lecture.parametres[c]) g[p.cle] = valeurGuideEn(matrice, p, { metaux, repere }, conversion ? unite : p.unite)
    }
    return g
  }, [lecture, matrice, metaux, repere, conversion, unite])

  /** Families holding parameters without an ERM value — where the user
   *  fills in the project's own value (e.g. what ERM experience gave). */
  const famillesSansValeur = useMemo(() => {
    if (!lecture) return []
    const parFam = new Map<string, { manquants: string[]; unite: string }>()
    for (const c of conversion ? (['CM', 'CC'] as const) : (['CM'] as const)) {
      for (const p of lecture.parametres[c]) {
        // Only concentrations take a guide value — not a pH, a % or a °C.
        if (automatiques[p.cle] || !/g\s*\//i.test(p.unite)) continue
        const f = p.famille || 'Autres paramètres'
        const e = parFam.get(f) ?? { manquants: [], unite: conversion ? unite : p.unite }
        if (!e.manquants.includes(p.nom)) e.manquants.push(p.nom)
        parFam.set(f, e)
      }
    }
    return [...parFam.entries()].map(([famille, e]) => ({ famille, ...e }))
  }, [lecture, automatiques, conversion, unite])

  /** Retained value: per-parameter entry, else ERM value, else family entry. */
  const guides = useMemo(() => {
    const g: Record<string, { valeur: number; source: string } | null> = {}
    if (!lecture) return g
    for (const c of ['CM', 'CC'] as const) {
      for (const p of lecture.parametres[c]) {
        const saisie = surcharges[p.cle]
        if (saisie !== undefined && saisie.trim() !== '') {
          const v = lireNombre(saisie)
          g[p.cle] = v === null ? null : { valeur: v, source: 'Saisie' }
          continue
        }
        const famille = lireNombre(parFamille[p.famille || 'Autres paramètres'] ?? '')
        g[p.cle] = automatiques[p.cle] ?? (famille === null ? null : { valeur: famille, source: 'Saisie' })
      }
    }
    return g
  }, [lecture, surcharges, parFamille, automatiques])

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

  function appliquer(cibles: string[]) {
    setSaisies((s) => {
      const suite = { ...s }
      for (const nom of cibles) {
        const actuel = { ...vide, ...suite[nom] }
        for (const { champ } of CHAMPS) if (aAppliquer[champ].trim()) actuel[champ] = aAppliquer[champ].trim()
        suite[nom] = actuel
      }
      return suite
    })
  }

  async function exporter() {
    if (!lecture || !matrice) return
    setExport(true)
    try {
      await telechargerClasseur(
        { ...lecture, points: retenus },
        {
          libelleMatrice: libelle,
          conversion,
          titre: titre || titreParDefaut,
          sousTitre,
          laboratoire: laboratoire === 'Autre' ? '' : laboratoire,
          unite,
          prelevements,
          guides,
          libelleGuide: conversion ? `Valeur repère ${repere.toUpperCase()}` : 'Valeur de comparaison',
          legende: legendeGuides(matrice, options),
          qualifications,
          seuilDoublon,
        },
        `Tableau X - Résultats ${libelle}.xlsx`,
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

  const avertissement = matrice && lecture ? avertissementMatrice(matrice, lecture) : null
  const parametresApercu = lecture?.parametres[conversion ? coucheApercu : 'CM'] ?? []
  const toutSelectionne = points.length > 0 && selectionnes.length === points.length

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Résultats de laboratoire</p>
          <h1 style={{ maxWidth: '24ch' }}>
            Mise en forme des résultats <em>d'analyses</em>
          </h1>
          <p className="lede">
            Chargez le fichier transmis par le laboratoire : les résultats sont restitués dans un tableau Excel au format des rapports
            ERM, avec un onglet mis en forme et un onglet comparé aux valeurs guides ERM. Pour les gaz du sol et l'air, les masses par
            support sont converties en concentrations.
          </p>

          <h2 className="etape">
            <span>1</span> Matrice
          </h2>
          <div className="grid grid--3 choix" role="radiogroup" aria-label="Matrice">
            {MATRICES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={matrice === m.id}
                className={`card choix__option${matrice === m.id ? ' choix__option--actif' : ''}`}
                onClick={() => choisirMatrice(m.id)}
              >
                <strong>{m.titre}</strong>
                <span>{m.detail}</span>
              </button>
            ))}
          </div>
          {matrice === 'air' && (
            <div className="grid grid--4" style={{ marginTop: '1rem', alignItems: 'end' }}>
              <label className="champ">
                Milieu
                <select value={milieu} onChange={(e) => setMilieu(e.target.value as MilieuAir)}>
                  <option value="gaz du sol">Gaz du sol</option>
                  <option value="air ambiant">Air ambiant</option>
                  <option value="air intérieur">Air intérieur</option>
                </select>
              </label>
              <label className="champ">
                Unité de sortie
                <select value={unite} onChange={(e) => setUnite(e.target.value as UniteSortie)}>
                  <option value="µg/m³">µg/m³</option>
                  <option value="mg/m³">mg/m³</option>
                </select>
              </label>
            </div>
          )}

          {matrice && (
            <>
              <h2 className="etape">
                <span>2</span> Fichier du laboratoire
              </h2>
              <div className="grid grid--4" style={{ marginBottom: '1rem' }}>
                <label className="champ">
                  Laboratoire
                  <select value={laboratoire} onChange={(e) => setLaboratoire(e.target.value)}>
                    <option value="">Non précisé</option>
                    {LABORATOIRES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
                  Excel (.xlsx, .xls) ou CSV — la disposition du fichier est reconnue automatiquement. Le fichier est lu dans votre
                  navigateur et n'est envoyé nulle part.
                </p>
                <button type="button" className="btn" onClick={() => input.current?.click()} disabled={chargement}>
                  Choisir un fichier
                </button>
              </div>
            </>
          )}

          {erreur && (
            <p role="alert" className="alerte">
              {erreur}
            </p>
          )}

          {lecture && (
            <div className="card" style={{ marginTop: '1.5rem', maxWidth: '40rem' }}>
              <strong>{fichier}</strong>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: 'var(--color-muted)' }}>
                {lecture.feuille && <>Feuille « {lecture.feuille} » · </>}
                {points.length} échantillon{points.length > 1 ? 's' : ''} · {lecture.parametres.CM.length} paramètres
                {lecture.coucheControle ? ' · couche de mesure et couche de contrôle' : ''} · unités : {lecture.unites.join(', ')}
              </p>
              {conversion && lecture.lignesIgnorees.length > 0 && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                  Lignes non converties (unité autre qu'une masse par support) : {lecture.lignesIgnorees.join(', ')}
                </p>
              )}
              {avertissement && <p className="alerte" style={{ margin: '0.75rem 0 0' }}>{avertissement}</p>}
            </div>
          )}

          {lecture && (
            <ControleQualite
              lecture={lecture}
              qualifications={qualifications}
              onQualifier={(nom, q) => setQualifications({ ...qualifications, [nom]: q })}
              seuilDoublon={seuilDoublon}
              onSeuilDoublon={setSeuilDoublon}
              conversion={conversion}
            />
          )}
        </div>
      </section>

      {lecture && conversion && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>3</span> Conditions de prélèvement
            </h2>
            <p className="lede" style={{ marginBottom: '1.25rem' }}>
              Volume prélevé = débit × durée ; avec un débit de début et de fin, le débit retenu est leur moyenne. Cochez des
              échantillons, saisissez durée et débit sur la ligne « Valeurs à appliquer », puis appliquez-les à la sélection. Une colonne
              copiée depuis Excel peut aussi être collée directement dans la première case.
            </p>

            <ExempleConversion lecture={lecture} prelevements={prelevements} unite={unite} />

            <div className="tableau-defile">
              <table className="tableau">
                <thead>
                  <tr>
                    <th style={{ width: '2.5rem' }}>
                      <input
                        type="checkbox"
                        checked={toutSelectionne}
                        aria-label="Sélectionner tous les échantillons"
                        onChange={(e) => setSelection(Object.fromEntries(points.map((p) => [p.nom, e.target.checked])))}
                      />
                    </th>
                    <th>Échantillon</th>
                    {CHAMPS.map((c) => (
                      <th key={c.champ} title={c.aide}>
                        {c.libelle}
                      </th>
                    ))}
                    <th>Débit retenu (L/min)</th>
                    <th>Volume (L)</th>
                    <th>Volume (m³)</th>
                    <th>Dans le tableau</th>
                  </tr>
                  <tr className="tableau__tous">
                    <td />
                    <td>Valeurs à appliquer</td>
                    {CHAMPS.map((c) => (
                      <td key={c.champ}>
                        <input
                          inputMode="decimal"
                          value={aAppliquer[c.champ]}
                          aria-label={`${c.libelle} à appliquer`}
                          onChange={(e) => setAAppliquer({ ...aAppliquer, [c.champ]: e.target.value })}
                        />
                      </td>
                    ))}
                    <td colSpan={4}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn--petit"
                          disabled={!selectionnes.length}
                          onClick={() => appliquer(selectionnes.map((p) => p.nom))}
                        >
                          Appliquer à la sélection ({selectionnes.length})
                        </button>
                        <button type="button" className="btn btn--petit btn--ghost" onClick={() => appliquer(points.map((p) => p.nom))}>
                          Appliquer à tous
                        </button>
                      </div>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => {
                    const pr = prelevements[p.nom]
                    const debit = debitMoyen(pr)
                    const vol = volumeLitres(pr)
                    return (
                      <tr key={p.nom} className={`${exclus[p.nom] ? 'tableau__exclu' : ''}${selection[p.nom] ? ' tableau__selection' : ''}`}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={!!selection[p.nom]}
                            aria-label={`Sélectionner ${p.nom}`}
                            onChange={(e) => setSelection({ ...selection, [p.nom]: e.target.checked })}
                          />
                        </td>
                        <th scope="row">{p.nom}</th>
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
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={!exclus[p.nom]}
                            aria-label={`Inclure ${p.nom} dans le tableau`}
                            onChange={(e) => setExclus({ ...exclus, [p.nom]: !e.target.checked })}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {lecture && matrice && (
        <section className="section">
          <div className="container">
            <h2 className="etape">
              <span>{conversion ? 4 : 3}</span> Valeurs guides et tableau
            </h2>

            <div className="grid grid--4" style={{ margin: '1.25rem 0 0.75rem', alignItems: 'end' }}>
              {matrice === 'sol' && (
                <>
                  <label className="champ">
                    Métaux
                    <select value={metaux} onChange={(e) => setMetaux(e.target.value as ContexteMetaux)}>
                      <option value="sur site">Sur site (bruit de fond)</option>
                      <option value="hors site">Hors site (seuil de vigilance)</option>
                    </select>
                  </label>
                </>
              )}
              {matrice === 'air' && (
                <label className="champ">
                  Valeur repère
                  <select value={repere} onChange={(e) => setRepere(e.target.value as Repere)}>
                    <option value="r1">R1</option>
                    <option value="r2">R2</option>
                    <option value="r3">R3</option>
                  </select>
                </label>
              )}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', maxWidth: '52rem' }}>
              Les valeurs guides sont retrouvées par n° CAS ou par nom. Chacune peut être corrigée dans le tableau ci-dessous : une
              valeur saisie remplace la valeur ERM (« - » pour n'en retenir aucune).
            </p>

            {famillesSansValeur.length > 0 && (
              <div className="card" style={{ margin: '1.25rem 0', maxWidth: '52rem' }}>
                <strong>Valeurs à renseigner par famille</strong>
                <p style={{ margin: '0.35rem 0 0.9rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                  Ces composés n'ont pas de valeur guide ERM publiée
                  {matrice === 'sol' ? ' (pour les COHV, CAV et HAP, la valeur retenue dépend de l’usage du site)' : ''}. Une valeur
                  saisie ici s'applique à tous les composés de la famille sans valeur guide ; une saisie composé par composé dans le
                  tableau reste prioritaire.
                </p>
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {famillesSansValeur.map((f) => (
                    <label key={f.famille} className="famille-valeur">
                      <span>
                        <strong>{f.famille}</strong>
                        <small>
                          {f.manquants.length} composé{f.manquants.length > 1 ? 's' : ''} : {f.manquants.slice(0, 6).join(', ')}
                          {f.manquants.length > 6 ? '…' : ''}
                        </small>
                      </span>
                      <span className="famille-valeur__saisie">
                        <input
                          inputMode="decimal"
                          value={parFamille[f.famille] ?? ''}
                          placeholder="-"
                          aria-label={`Valeur guide pour la famille ${f.famille}`}
                          aria-invalid={!!parFamille[f.famille] && lireNombre(parFamille[f.famille]) === null}
                          onChange={(e) => setParFamille({ ...parFamille, [f.famille]: e.target.value })}
                        />
                        <span>{f.unite}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid--4" style={{ margin: '1.25rem 0 1.5rem', alignItems: 'end' }}>
              <label className="champ" style={{ gridColumn: 'span 2' }}>
                Titre du tableau
                <input value={titre} placeholder={titreParDefaut} onChange={(e) => setTitre(e.target.value)} />
              </label>
              <label className="champ" style={{ gridColumn: 'span 2' }}>
                Sous-titre
                <input value={sousTitre} onChange={(e) => setSousTitre(e.target.value)} />
              </label>
            </div>

            {conversion && lecture.coucheControle && (
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
                    <th rowSpan={conversion ? 2 : 1}>Composé</th>
                    {!conversion && <th>Unité</th>}
                    <th rowSpan={conversion ? 2 : 1}>
                      {conversion ? `Valeur repère ${repere.toUpperCase()} (${unite})` : 'Valeur guide'}
                    </th>
                    <th rowSpan={conversion ? 2 : 1}>Source</th>
                    {retenus.map((p) => (
                      <th key={p.nom} colSpan={conversion ? 2 : 1}>
                        {p.nom}
                      </th>
                    ))}
                  </tr>
                  {conversion && (
                    <tr>
                      {retenus.map((p) => (
                        <UnitesPoint key={p.nom} unite={unite} uniteBrute={parametresApercu[0]?.unite ?? 'µg/support'} />
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {parametresApercu.map((pa, i) => (
                    <LigneFamille
                      key={pa.cle}
                      afficher={i === 0 || parametresApercu[i - 1].famille !== pa.famille}
                      famille={pa.famille}
                      colonnes={(conversion ? 3 : 4) + (conversion ? 2 : 1) * retenus.length}
                    >
                      <tr>
                        <th scope="row" style={{ fontStyle: pa.somme ? 'italic' : undefined, textAlign: pa.somme ? 'right' : undefined }}>
                          {pa.nom}
                        </th>
                        {!conversion && <td>{pa.unite}</td>}
                        <CelluleGuide
                          parametre={pa}
                          guide={guides[pa.cle]}
                          saisie={surcharges[pa.cle]}
                          onChange={(v) => setSurcharges({ ...surcharges, [pa.cle]: v })}
                        />
                        {retenus.map((p) => {
                          const m = lecture.valeurs[conversion ? coucheApercu : 'CM'][p.nom]?.[pa.cle]
                          const g = guides[pa.cle]
                          if (!conversion) {
                            const depasse = !!m && !m.inferieur && m.valeur !== null && !!g && m.valeur > g.valeur
                            return (
                              <td key={p.nom} className={m?.inferieur ? 'tableau__lq' : depasse ? 'tableau__depasse' : undefined}>
                                {m ? virgule(m.brut) : '-'}
                              </td>
                            )
                          }
                          const c = convertir(m, pa, volumeLitres(prelevements[p.nom] ?? SANS_PRELEVEMENT), unite)
                          const depasse = !!c && !c.inferieur && !!g && c.valeur > g.valeur
                          return (
                            <ValeursPoint key={p.nom} brut={m ? virgule(m.brut) : '-'} lq={!!m?.inferieur} conc={formatConcentration(c)} depasse={depasse} />
                          )
                        })}
                      </tr>
                    </LigneFamille>
                  ))}
                </tbody>
              </table>
            </div>

            <AnalyseApercu
              lecture={lecture}
              qualifications={qualifications}
              guides={guides}
              conversion={conversion ? { prelevements, unite } : null}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginTop: '1.5rem' }}>
              <button type="button" className="btn" onClick={exporter} disabled={export_ || !retenus.length}>
                {export_ ? 'Préparation…' : 'Télécharger le tableau Excel'}
              </button>
              <span style={{ fontSize: '0.88rem', color: 'var(--color-muted)' }}>
                « Tableau X - Résultats {libelle}.xlsx » — onglets « Mis en forme », « Valeurs guides ERM », « Analyse par composé » et « Contrôle qualité ».
                {sansVolume.length > 0 && <> Sans débit ni durée, aucune concentration pour : {sansVolume.map((p) => p.nom).join(', ')}.</>}
              </span>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

function CelluleGuide({
  parametre,
  guide,
  saisie,
  onChange,
}: {
  parametre: Parametre
  guide: { valeur: number; source: string } | null | undefined
  saisie: string | undefined
  onChange: (v: string) => void
}) {
  const auto = saisie === undefined || saisie.trim() === ''
  return (
    <>
      <td>
        <input
          className="tableau__guide"
          inputMode="decimal"
          value={saisie ?? ''}
          placeholder={guide ? fr(guide.valeur, 6) : '-'}
          aria-label={`Valeur guide — ${parametre.nom}`}
          onChange={(e) => onChange(e.target.value)}
        />
      </td>
      <td className="tableau__calcule" style={{ textAlign: 'center' }}>
        {auto ? (guide?.source ?? '-') : guide ? 'Saisie' : '-'}
      </td>
    </>
  )
}

function UnitesPoint({ unite, uniteBrute }: { unite: UniteSortie; uniteBrute: string }) {
  return (
    <>
      <th className="tableau__unite">{uniteBrute.replace(/\s+/g, '')}</th>
      <th className="tableau__unite tableau__conc">{unite}</th>
    </>
  )
}

function ValeursPoint({ brut, lq, conc, depasse }: { brut: string; lq: boolean; conc: string; depasse: boolean }) {
  return (
    <>
      <td className={lq ? 'tableau__lq' : undefined}>{brut}</td>
      <td className={`tableau__conc${lq ? ' tableau__lq' : depasse ? ' tableau__depasse' : ''}`}>{conc}</td>
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
