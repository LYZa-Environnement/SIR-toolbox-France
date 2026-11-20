import { useEffect, useMemo, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import ZoneDepot from '../components/ZoneDepot'
import Numeriseur, { type Mode, type Reglages } from '../components/chromato/Numeriseur'
import { GraphiqueComparaison, GraphiqueProfil, ZoomDoublets } from '../components/chromato/Graphique'
import { LIBELLES_CIBLE, type CiblePic } from '../components/chromato/constantes'
import { Bibliographie, Cite, Resultats } from '../components/chromato/Lecture'
import { COMPOSES_VIDES, composesDepuisLecture, echantillonsComposes, type CodeBtex, type Composes } from '../lib/chromato/composes'
import { exemples } from '../lib/chromato/exemple'
import { comparer, entreeDepuisProfil, interpreter, LIBELLES_CORRESPONDANCE, type Entree, type Lecture, type Matrice, type OuiNon } from '../lib/chromato/interpretation'
import { couleurEn, couleurFond, couleurTrace, etalonsProbables, extraireTrace, lireTraceTexte, normaliserCadre, type Cadre } from '../lib/chromato/numerisation'
import { PRODUITS } from '../lib/chromato/produits'
import { construireProfil, distributionFractions, picPres, POINTS_PAR_CARBONE_MIN, type Fraction, type Pic, type PointCalage, type Profil, type Trace } from '../lib/chromato/profil'
import { NOMS_HAP } from '../lib/resultats/expert/diagnostics'
import { lireClasseur, type Lecture as LectureLabo } from '../lib/resultats/parse'
import { lireFeuilles, telechargerBlob } from '../lib/fichiers'
import { jourIso, nombreFr } from '../lib/format'

type Source =
  | { type: 'image'; nom: string; image: ImageData; pdf?: { doc: PDFDocumentProxy; page: number; suggerees: number[] } }
  | { type: 'trace'; nom: string; trace: Trace; calage?: PointCalage[] }

const REGLAGES_VIDES: Reglages = { cadre: null, x10: null, x40: null, couleur: null, tolerance: 80 }

/** Lab fractions most often reported with the C10–C40 index. */
const BANDES: [number, number][] = [
  [10, 12],
  [12, 16],
  [16, 21],
  [21, 35],
  [35, 40],
]

interface Saisie {
  hct: string
  lq: string
  c17: string
  pr: string
  c18: string
  ph: string
  fractions: string[]
  B: string
  T: string
  E: string
  X: string
  plomb: OuiNon
  oxygenes: OuiNon
  produit: string
  /** PAH typed by hand, by code (Nap, Phe…). */
  hap: Record<string, string>
}

const SAISIE_VIDE: Saisie = { hct: '', lq: '', c17: '', pr: '', c18: '', ph: '', fractions: BANDES.map(() => ''), B: '', T: '', E: '', X: '', plomb: null, oxygenes: null, produit: '', hap: {} }

const nb = (s: string): number | null => {
  const v = Number(s.replace(',', '.').trim())
  return s.trim() && Number.isFinite(v) ? v : null
}

async function chargerPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  return pdfjs
}

/** A PDF page as pixels, about 2 400 px wide: enough to split the n-C17 / pristane doublet. */
async function rendrePage(doc: PDFDocumentProxy, n: number): Promise<ImageData> {
  const page = await doc.getPage(n)
  const echelle = 2400 / page.getViewport({ scale: 1 }).width
  const vp = page.getViewport({ scale: echelle })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Pages whose text mentions a chromatogram or the C10 / C40 markers. */
async function pagesChromatogrammes(doc: PDFDocumentProxy): Promise<number[]> {
  const trouvees: number[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const t = (await (await doc.getPage(i)).getTextContent()).items.map((it) => ('str' in it ? it.str : '')).join(' ')
    if (/chromatogra|\bC\s?10\b.*\bC\s?40\b|hydrocarbures?\s+C10/i.test(t)) trouvees.push(i)
  }
  return trouvees
}

async function imageDepuisFichier(f: Blob): Promise<ImageData> {
  const b = await createImageBitmap(f)
  const canvas = document.createElement('canvas')
  canvas.width = b.width
  canvas.height = b.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, b.width, b.height)
  ctx.drawImage(b, 0, 0)
  return ctx.getImageData(0, 0, b.width, b.height)
}

/** Naphthalene / phenanthrene of a reading, formatted, or null. */
function napPhe(l: Lecture): string | null {
  const v = l.composes?.indices.find((i) => i.libelle.startsWith('Naphtalène'))?.valeur
  return v === undefined || v === null ? null : nombreFr(v)
}

interface Echantillon {
  nom: string
  entree: Entree
  lecture: Lecture
}

export default function Chromatogrammes() {
  const [source, setSource] = useState<Source | null>(null)
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_VIDES)
  const [mode, setMode] = useState<Mode | null>(null)
  const [temps10, setTemps10] = useState('')
  const [temps40, setTemps40] = useState('')
  const [manuels, setManuels] = useState<Partial<Record<CiblePic, number | null>>>({})
  const [cible, setCible] = useState<CiblePic | null>(null)
  const [nom, setNom] = useState('')
  const [matrice, setMatrice] = useState<Matrice>('sol')
  const [saisie, setSaisie] = useState<Saisie>(SAISIE_VIDE)
  const [comparaison, setComparaison] = useState<Echantillon[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  /** n-C10 and n-C40 added by the lab as standards. */
  const [etalons, setEtalons] = useState(true)
  const [labo, setLabo] = useState<{ nom: string; lecture: LectureLabo; echantillons: string[] } | null>(null)
  const [echantillonLabo, setEchantillonLabo] = useState('')
  const [chargement, setChargement] = useState(false)

  function nouvelleSource(s: Source, calage?: PointCalage[], avecEtalons?: boolean) {
    setSource(s)
    if (avecEtalons !== undefined) setEtalons(avecEtalons)
    setReglages(REGLAGES_VIDES)
    setManuels({})
    setCible(null)
    setMode(s.type === 'image' ? 'cadre' : null)
    setNom(s.nom.replace(/\.[a-z0-9]+$/i, ''))
    // A numerical trace with the lab's standards: their peaks give C10 and C40.
    const proposes = !calage && s.type === 'trace' && (avecEtalons ?? etalons) ? etalonsProbables(s.trace) : null
    setTemps10(calage ? String(calage[0].x) : proposes ? String(Math.round(proposes.x10 * 1000) / 1000) : '')
    setTemps40(calage ? String(calage[1].x) : proposes ? String(Math.round(proposes.x40 * 1000) / 1000) : '')
    setErreur(null)
  }

  async function charger(fichiers: File[]) {
    const f = fichiers[0]
    if (!f) return
    setChargement(true)
    setErreur(null)
    try {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        const pdfjs = await chargerPdfjs()
        const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise
        const suggerees = await pagesChromatogrammes(doc)
        const page = suggerees[0] ?? 1
        nouvelleSource({ type: 'image', nom: f.name, image: await rendrePage(doc, page), pdf: { doc, page, suggerees } })
      } else if (f.type.startsWith('image/') || /\.(png|jpe?g|bmp|gif|webp)$/i.test(f.name)) {
        nouvelleSource({ type: 'image', nom: f.name, image: await imageDepuisFichier(f) })
      } else {
        nouvelleSource({ type: 'trace', nom: f.name, trace: lireTraceTexte(await f.text()) })
      }
    } catch (e) {
      setErreur(`${f.name} : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setChargement(false)
    }
  }

  async function changerPage(n: number) {
    if (source?.type !== 'image' || !source.pdf) return
    const { doc } = source.pdf
    if (n < 1 || n > doc.numPages) return
    setChargement(true)
    try {
      const image = await rendrePage(doc, n)
      setSource({ ...source, image, pdf: { ...source.pdf, page: n } })
      setReglages(REGLAGES_VIDES)
      setManuels({})
      setMode('cadre')
    } finally {
      setChargement(false)
    }
  }

  // A screenshot pasted anywhere on the page (Ctrl+V).
  useEffect(() => {
    const coller = (ev: ClipboardEvent) => {
      const item = [...(ev.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (!f) return
      ev.preventDefault()
      void charger([new File([f], `capture-${jourIso()}.png`, { type: f.type })])
    }
    window.addEventListener('paste', coller)
    return () => window.removeEventListener('paste', coller)
  })

  // ---- Digitising ----
  const image = source?.type === 'image' ? source.image : null
  const traceImage = useMemo(() => {
    if (!image || !reglages.cadre) return null
    const couleur = reglages.couleur ?? couleurTrace(image, reglages.cadre, couleurFond(image, reglages.cadre))
    return couleur ? extraireTrace(image, reglages.cadre, couleur, reglages.tolerance) : null
  }, [image, reglages.cadre, reglages.couleur, reglages.tolerance])

  const calage: PointCalage[] | null = useMemo(() => {
    if (source?.type === 'image') return reglages.x10 !== null && reglages.x40 !== null ? [{ x: reglages.x10, c: 10 }, { x: reglages.x40, c: 40 }] : null
    if (source?.type === 'trace') {
      const a = nb(temps10)
      const b = nb(temps40)
      return a !== null && b !== null && b > a ? [{ x: a, c: 10 }, { x: b, c: 40 }] : null
    }
    return null
  }, [source, reglages.x10, reglages.x40, temps10, temps40])

  // A frame where almost no column holds the trace colour gives nothing to read.
  const traceLisible = traceImage && traceImage.manquantes < 0.9 * traceImage.x.length ? traceImage : null
  const trace: Trace | null = source?.type === 'trace' ? source.trace : traceLisible
  const calcul = useMemo((): { profil: Profil } | { erreur: string } | null => {
    if (!trace || !calage) return null
    try {
      return { profil: construireProfil(trace, calage, { etalons }) }
    } catch (e) {
      return { erreur: e instanceof Error ? e.message : String(e) }
    }
  }, [trace, calage, etalons])
  const profil = calcul && 'profil' in calcul ? calcul.profil : null

  const picsManuels = useMemo(() => {
    const r: Partial<Record<CiblePic, Pic | null>> = {}
    if (!profil) return r
    for (const k of Object.keys(manuels) as CiblePic[]) {
      const c = manuels[k]
      r[k] = c === null || c === undefined ? null : picPres(profil, c)
    }
    return r
  }, [profil, manuels])

  // ---- The lab's PAH, BTEX and indices ----
  async function chargerLabo(fichiers: File[]) {
    const f = fichiers[0]
    if (!f) return
    setErreur(null)
    try {
      const lecture = lireClasseur(await lireFeuilles(f), 'tout')
      const liste = echantillonsComposes(lecture)
      if (!liste.length) throw new Error('aucun échantillon lu.')
      setLabo({ nom: f.name, lecture, echantillons: liste })
      // The sample whose name is closest to the chromatogram's, else the first.
      const cle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')
      setEchantillonLabo(liste.find((n) => nom && (cle(n).includes(cle(nom)) || cle(nom).includes(cle(n)))) ?? liste[0])
    } catch (e) {
      setErreur(`${f.name} : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const composes: Composes | null = useMemo(() => {
    const deFichier = labo && echantillonLabo ? composesDepuisLecture(labo.lecture, echantillonLabo) : null
    const c: Composes = deFichier ? { ...deFichier, hap: { ...deFichier.hap }, btex: { ...deFichier.btex } } : { ...COMPOSES_VIDES, hap: {}, btex: {} }
    // Values typed by hand complete or replace the file.
    for (const [k, v] of Object.entries(saisie.hap)) {
      const x = nb(v)
      if (x !== null) c.hap[k] = x
    }
    for (const k of ['B', 'T', 'E', 'X'] as CodeBtex[]) {
      const x = nb(saisie[k])
      if (x !== null) c.btex[k] = x
    }
    return Object.keys(c.hap).length || Object.keys(c.btex).length || c.hct !== null || c.c5c10 !== null || c.fractions.length ? c : null
  }, [labo, echantillonLabo, saisie])

  // ---- Reading ----
  const entree: Entree | null = useMemo(() => {
    const saisies: Fraction[] = BANDES.flatMap(([bas, h], i) => {
      const v = nb(saisie.fractions[i])
      return v !== null && v > 0 ? [{ bas, haut: h, valeur: v }] : []
    })
    const fractions = saisies.length ? saisies : (composes?.fractions.filter((f) => f.valeur > 0) ?? [])
    const base: Entree | null = profil
      ? entreeDepuisProfil(nom || 'Échantillon', matrice, profil, picsManuels)
      : fractions.length || composes || nb(saisie.c17) !== null || nb(saisie.pr) !== null || saisie.plomb
        ? {
            nom: nom || 'Échantillon',
            matrice,
            source: fractions.length ? 'fractions' : 'saisie',
            distribution: distributionFractions(fractions),
            indicateurs: null,
            c17: null,
            pr: null,
            c18: null,
            ph: null,
          }
        : null
    if (!base) return null
    const iso = composes?.isoprenoides ?? {}
    const lab = { c17: nb(saisie.c17) ?? iso.c17 ?? null, pr: nb(saisie.pr) ?? iso.pr ?? null, c18: nb(saisie.c18) ?? iso.c18 ?? null, ph: nb(saisie.ph) ?? iso.ph ?? null }
    return {
      ...base,
      // The lab's quantified isoprenoids, when given, replace the chromatogram heights.
      ...(lab.pr !== null ? { c17: lab.c17 ?? 0, pr: lab.pr, doublets: { c17: 'resolu' as const, c18: base.doublets?.c18 ?? 'resolu' } } : {}),
      ...(lab.ph !== null ? { c18: lab.c18 ?? 0, ph: lab.ph } : {}),
      composes,
      plomb: saisie.plomb,
      oxygenes: saisie.oxygenes,
      hct: nb(saisie.hct) ?? composes?.hct ?? null,
      lq: nb(saisie.lq),
      produitImpose: saisie.produit || null,
    }
  }, [profil, picsManuels, nom, matrice, saisie, composes])
  const lecture = useMemo(() => (entree ? interpreter(entree) : null), [entree])

  function ajouterComparaison() {
    if (!entree || !lecture) return
    const base = entree.nom
    let n = base
    for (let i = 2; comparaison.some((e) => e.nom === n); i++) n = `${base} (${i})`
    setComparaison([...comparaison, { nom: n, entree: { ...entree, nom: n }, lecture }])
  }

  function exporterComparaison() {
    const lignes = [
      ['Échantillon', 'Produit', 'Stade', 'n-C17/Pr', 'n-C18/Ph', 'Pr/Ph', 'Émergence des n-alcanes', 'Médiane (C)', 'Origine des HAP', 'Séquence HAP / BTEX', 'Naphtalène / phénanthrène', 'Âge (n-C17/Pr)'],
      ...comparaison.map(({ nom: n, entree: e, lecture: l }) => [
        n,
        l.produit?.nom ?? '',
        l.stade.libelle,
        e.c17 !== null && e.pr ? nombreFr(e.c17 / e.pr) : '',
        e.c18 !== null && e.ph ? nombreFr(e.c18 / e.ph) : '',
        e.pr && e.ph ? nombreFr(e.pr / e.ph) : '',
        e.indicateurs?.emergence != null ? nombreFr(e.indicateurs.emergence) : '',
        e.distribution ? nombreFr(e.distribution.q50, 1) : '',
        l.composes?.origine?.verdict ?? '',
        l.composes?.sequence?.libelle ?? '',
        napPhe(l) ?? '',
        l.ages[0]?.applicable ? l.ages[0].valeur : '',
      ]),
    ]
    const csv = lignes.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    telechargerBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `chromatogrammes-${jourIso()}.csv`)
  }

  const etape = !source ? 0 : source.type === 'trace' ? (calage ? 3 : 2) : !reglages.cadre ? 1 : !calage ? 2 : 3
  /** The lab's standards on a digitised trace: proposed as C10 and C40. */
  function etalonsSur(cadre: Cadre, couleurChoisie = reglages.couleur): { x10: number; x40: number } | null {
    if (!image) return null
    const couleur = couleurChoisie ?? couleurTrace(image, cadre, couleurFond(image, cadre))
    return couleur ? etalonsProbables(extraireTrace(image, cadre, couleur, reglages.tolerance)) : null
  }

  function cadrer(cadre: Cadre) {
    const proposes = etalons && reglages.x10 === null && reglages.x40 === null ? etalonsSur(cadre) : null
    setReglages({ ...reglages, cadre, ...(proposes ?? {}) })
    setMode(proposes || reglages.x10 !== null ? null : 'c10')
  }

  function calerSurEtalons() {
    if (!reglages.cadre) return
    const proposes = etalonsSur(reglages.cadre)
    if (proposes) setReglages({ ...reglages, ...proposes })
    else setErreur('Pics étalons C10 et C40 non trouvés : placez C10 et C40 à la main.')
  }

  const choisirPoint = (m: Exclude<Mode, 'cadre'>, x: number, y: number) => {
    if (!image) return
    if (m === 'c10') setReglages({ ...reglages, x10: x })
    else if (m === 'c40') setReglages({ ...reglages, x40: x })
    else setReglages({ ...reglages, couleur: couleurEn(image, x, y) })
    setMode(m === 'c10' && reglages.x40 === null ? 'c40' : null)
  }

  const champ = (cle: keyof Saisie, libelle: string, aide?: string) => (
    <label className="champ">
      {libelle}
      <input value={saisie[cle] as string} onChange={(e) => setSaisie({ ...saisie, [cle]: e.target.value })} inputMode="decimal" title={aide} />
    </label>
  )

  return (
    <>
      <section className="section pfas chromato">
        <div className="container">
          <p className="eyebrow">Hydrocarbures pétroliers — sols et eaux</p>
          <h1 style={{ maxWidth: '24ch' }}>Lecture des chromatogrammes</h1>
          <p className="lede">
            Tirer d’un chromatogramme d’hydrocarbures C10–C40 du rapport de laboratoire la nature probable du produit, son origine (pétrolière ou non), son état
            d’altération et un âge approché du déversement, en suivant la démarche du rapport BRGM RP-64174-FR
            <Cite ids={['brgm2014']} />.
          </p>

          <details className="pfas-intro" open={!source}>
            <summary>Ce qu’un chromatogramme dit, et ce qu’il ne dit pas</summary>
            <div className="grid grid--3" style={{ marginTop: '1rem' }}>
              <div className="card">
                <h3>La nature du produit</h3>
                <p>
                  Les composés sortent par température d’ébullition croissante : essence, kérosène, gazole, puis huiles et résidus. La plage de carbones et la forme
                  (série de n-alcanes, bosse non résolue) orientent vers une coupe pétrolière <Cite ids={['brgm2014', 'itrc2018']} />.
                </p>
              </div>
              <div className="card">
                <h3>L’altération et l’âge</h3>
                <p>
                  Les légers s’évaporent, puis les bactéries consomment les n-alcanes avant le pristane et le phytane. Le rapport n-C17/pristane mesure cette
                  biodégradation ; pour un gazole dans un sol, il donne un âge approché <Cite ids={['christensenLarsen1993', 'brgm2014']} />.
                </p>
              </div>
              <div className="card">
                <h3>Les limites</h3>
                <p>
                  La CG/DIF ne relie pas à coup sûr un échantillon à une source : produits de même nature, mélanges et fortes altérations demandent la CG/SM
                  (biomarqueurs, HAP alkylés) voire l’isotopie <Cite ids={['brgm2014']} />. Les âges dépendent du site : ce sont des ordres de grandeur
                  <Cite ids={['hurstSchmidt2005']} />.
                </p>
              </div>
            </div>
          </details>

          <h2 style={{ marginTop: '2rem' }}>1. Le chromatogramme</h2>
          <ZoneDepot
            titre="Déposez le rapport du laboratoire (PDF), une capture du chromatogramme, ou la trace exportée (CSV)"
            aide={
              <>
                PDF : les pages qui mentionnent un chromatogramme sont proposées. Image : PNG ou JPEG, ou collez une capture avec Ctrl+V. CSV : deux colonnes, temps de
                rétention et signal. Tout est lu dans le navigateur.
              </>
            }
            chargement={chargement}
            libelleChargement="Lecture…"
            accept=".pdf,.png,.jpg,.jpeg,.bmp,.gif,.webp,.csv,.txt"
            onFichiers={charger}
            actions={(choisir) => (
              <div className="depot__actions">
                <button type="button" className="btn" onClick={choisir} disabled={chargement}>
                  Choisir un fichier
                </button>
                {exemples().map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    className="btn btn--ghost btn--petit"
                    title={ex.description}
                    onClick={() => nouvelleSource({ type: 'trace', nom: `Exemple — ${ex.nom}`, trace: ex.trace, calage: ex.calage }, ex.calage, !!ex.etalons)}
                  >
                    {ex.nom}
                  </button>
                ))}
              </div>
            )}
          />
          <label className="chromato-option">
            <input type="checkbox" checked={etalons} onChange={(e) => setEtalons(e.target.checked)} />
            <span>
              Le laboratoire ajoute n-C10 et n-C40 comme étalons : leurs pics servent à caler l’axe et sont retirés du produit (aire, série de n-alcanes, échelle du
              graphique).
            </span>
          </label>
          {erreur && (
            <p className="badge badge--elevee" role="alert" style={{ marginTop: '0.75rem' }}>
              {erreur}
            </p>
          )}

          {source?.type === 'image' && (
            <div className="card chromato-numerisation">
              {source.pdf && (
                <div className="chromato-pages">
                  <button type="button" className="btn btn--ghost btn--petit" onClick={() => changerPage(source.pdf!.page - 1)} disabled={chargement || source.pdf.page <= 1}>
                    ← Page précédente
                  </button>
                  <span>
                    Page {source.pdf.page} / {source.pdf.doc.numPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--petit"
                    onClick={() => changerPage(source.pdf!.page + 1)}
                    disabled={chargement || source.pdf.page >= source.pdf.doc.numPages}
                  >
                    Page suivante →
                  </button>
                  {source.pdf.suggerees.length > 0 && (
                    <span className="pfas-note">
                      Pages avec chromatogramme :{' '}
                      {source.pdf.suggerees.slice(0, 20).map((n) => (
                        <button key={n} type="button" className="lien-bouton" onClick={() => changerPage(n)}>
                          {n}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              )}
              <ol className="chromato-etapes">
                <li className={etape === 1 ? 'actif' : reglages.cadre ? 'fait' : ''}>
                  <button type="button" className={`btn btn--petit${mode === 'cadre' ? '' : ' btn--ghost'}`} onClick={() => setMode('cadre')}>
                    Cadrer le graphique
                  </button>
                  <span>Tracez un rectangle au ras des axes, sans les légendes ni le titre.</span>
                </li>
                <li className={etape === 2 ? 'actif' : calage ? 'fait' : ''}>
                  <button type="button" className={`btn btn--petit${mode === 'c10' ? '' : ' btn--ghost'}`} onClick={() => setMode('c10')} disabled={!reglages.cadre}>
                    Placer C10
                  </button>
                  <button type="button" className={`btn btn--petit${mode === 'c40' ? '' : ' btn--ghost'}`} onClick={() => setMode('c40')} disabled={!reglages.cadre}>
                    Placer C40
                  </button>
                  <button type="button" className="btn btn--petit btn--ghost" onClick={calerSurEtalons} disabled={!reglages.cadre || !etalons}>
                    Caler sur les pics étalons
                  </button>
                  <span>
                    Cliquez sur les pics de n-décane et n-tétracontane (ou les repères imprimés par le laboratoire). Avec l’option « étalons », ils sont proposés dès le
                    cadrage : vérifiez les deux traits bleus.
                  </span>
                </li>
                <li className={etape === 3 ? 'actif' : ''}>
                  <button type="button" className={`btn btn--petit${mode === 'couleur' ? '' : ' btn--ghost'}`} onClick={() => setMode('couleur')} disabled={!reglages.cadre}>
                    Couleur de la trace
                  </button>
                  <label className="chromato-tolerance">
                    Tolérance
                    <input type="range" min={20} max={200} value={reglages.tolerance} onChange={(e) => setReglages({ ...reglages, tolerance: Number(e.target.value) })} />
                  </label>
                  <span>Vérifiez que la trace rouge suit le chromatogramme et que le pointillé vert est sur l’axe des abscisses (le zéro ; graduations et étiquettes sous l’axe sont ignorées). Sinon, cliquez sur la courbe pour en prendre la couleur.</span>
                </li>
              </ol>
              <Numeriseur
                image={source.image}
                reglages={reglages}
                mode={mode}
                trace={traceImage}
                onCadre={(c) => cadrer(normaliserCadre(c, source.image))}
                onPoint={choisirPoint}
              />
              {traceImage && traceImage.manquantes > 0.3 * traceImage.x.length && (
                <p className="pfas-note">
                  {Math.round((traceImage.manquantes / traceImage.x.length) * 100)} % des colonnes sans trace : choisissez la couleur de la courbe ou augmentez la
                  tolérance.
                </p>
              )}
            </div>
          )}

          {source?.type === 'trace' && !source.calage && (
            <div className="card chromato-numerisation">
              <p>Trace numérique : indiquez les temps de rétention du n-décane (C10) et du n-tétracontane (C40), dans l’unité de la première colonne.</p>
              <div className="chromato-champs">
                <label className="champ">
                  Temps C10
                  <input value={temps10} onChange={(e) => setTemps10(e.target.value)} inputMode="decimal" />
                </label>
                <label className="champ">
                  Temps C40
                  <input value={temps40} onChange={(e) => setTemps40(e.target.value)} inputMode="decimal" />
                </label>
              </div>
            </div>
          )}

          {calcul && 'erreur' in calcul && (
            <p className="badge badge--elevee" role="alert">
              {calcul.erreur}
            </p>
          )}

          {profil && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="chromato-entete">
                <label className="champ">
                  Échantillon
                  <input value={nom} onChange={(e) => setNom(e.target.value)} />
                </label>
                <label className="champ">
                  Milieu
                  <select value={matrice} onChange={(e) => setMatrice(e.target.value as Matrice)}>
                    <option value="sol">Sol</option>
                    <option value="eau">Eau</option>
                  </select>
                </label>
                <p className="pfas-note">
                  Axe des carbones {profil.recalage ? `recalé sur ${profil.recalage} n-alcanes` : 'calé sur C10 et C40 seulement (pas de série de n-alcanes régulière)'} ·{' '}
                  {Math.round(profil.pointsParCarbone)} points par carbone
                  {profil.pointsParCarbone < POINTS_PAR_CARBONE_MIN && ` (moins de ${POINTS_PAR_CARBONE_MIN} : doublets n-C17/pristane illisibles, prenez une image plus grande)`}
                </p>
              </div>
              <GraphiqueProfil p={profil} produit={lecture?.produit ?? null} pr={picsManuels.pr !== undefined ? picsManuels.pr : profil.pristane} ph={picsManuels.ph !== undefined ? picsManuels.ph : profil.phytane} />
              <details className="chromato-doublets" open={profil.doublets.c17 !== 'resolu'}>
                <summary>Doublets n-C17 / pristane et n-C18 / phytane</summary>
                <p className="pfas-note">
                  Pristane et phytane sortent juste après n-C17 et n-C18 <Cite ids={['nistRi']} />. Vérifiez l’attribution ; au besoin, choisissez un composé puis
                  cliquez sur son sommet. Les hauteurs sont lues au-dessus de la bosse.
                </p>
                <div className="chromato-cibles">
                  {(Object.keys(LIBELLES_CIBLE) as CiblePic[]).map((k) => (
                    <button key={k} type="button" className={`btn btn--petit${cible === k ? '' : ' btn--ghost'}`} onClick={() => setCible(cible === k ? null : k)}>
                      {LIBELLES_CIBLE[k]}
                    </button>
                  ))}
                  {cible && (
                    <button type="button" className="btn btn--petit btn--ghost" onClick={() => setManuels({ ...manuels, [cible]: null })}>
                      {LIBELLES_CIBLE[cible]} absent
                    </button>
                  )}
                  {Object.keys(manuels).length > 0 && (
                    <button type="button" className="btn btn--petit btn--ghost" onClick={() => setManuels({})}>
                      Revenir à la lecture automatique
                    </button>
                  )}
                </div>
                <ZoomDoublets
                  p={profil}
                  cible={cible}
                  pics={{
                    c17: picsManuels.c17 !== undefined ? picsManuels.c17 : profil.alcanes[17],
                    pr: picsManuels.pr !== undefined ? picsManuels.pr : profil.pristane,
                    c18: picsManuels.c18 !== undefined ? picsManuels.c18 : profil.alcanes[18],
                    ph: picsManuels.ph !== undefined ? picsManuels.ph : profil.phytane,
                  }}
                  onChoisir={(c) => {
                    if (!cible) return
                    setManuels({ ...manuels, [cible]: c })
                    setCible(null)
                  }}
                />
              </details>
            </div>
          )}

          <details className="card chromato-saisie" open={!source || !composes}>
            <summary>
              <strong>2. Résultats d’analyses du laboratoire</strong> <span className="pfas-note">— HAP, BTEX, indices : en complément du chromatogramme, ou à sa place</span>
            </summary>
            <p className="pfas-note">
              Pristane et phytane ne sont presque jamais au programme ; les 16 HAP et les BTEX le sont. Ils donnent l’origine des HAP (pétrolière ou de combustion) et un
              ordre d’altération (les composés légers disparaissent avant les lourds) <Cite ids={['brgm2014']} />.
            </p>
            <div className="chromato-labo">
              <ZoneDepot
                titre="Déposez le fichier de résultats du laboratoire (Excel ou CSV)"
                aide="HAP, BTEX, indice C10–C40, C5–C10, fractions — et pristane / phytane s’ils y figurent — sont lus pour l’échantillon choisi."
                chargement={false}
                onFichiers={chargerLabo}
              />
              {labo && (
                <div className="chromato-champs">
                  <label className="champ">
                    Échantillon du fichier
                    <select value={echantillonLabo} onChange={(e) => setEchantillonLabo(e.target.value)}>
                      {labo.echantillons.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="pfas-note" style={{ alignSelf: 'end' }}>
                    {labo.nom} :{' '}
                    {composes
                      ? [
                          Object.keys(composes.hap).length && `${Object.keys(composes.hap).length} HAP`,
                          Object.keys(composes.btex).length && `${Object.keys(composes.btex).length} BTEX`,
                          composes.hct !== null && 'indice C10–C40',
                          composes.c5c10 !== null && 'C5–C10',
                          composes.fractions.length && `${composes.fractions.length} fractions`,
                          Object.keys(composes.isoprenoides).length && 'isoprénoïdes',
                        ]
                          .filter(Boolean)
                          .join(', ') || 'rien d’utile pour cet échantillon'
                      : 'rien d’utile pour cet échantillon'}
                    {composes?.unite && ` (${composes.unite})`}
                  </p>
                </div>
              )}
            </div>
            <div className="chromato-champs">
              {champ('hct', 'Indice C10–C40')}
              {champ('lq', 'LQ de l’indice')}
              <label className="champ">
                Produit (si connu)
                <select value={saisie.produit} onChange={(e) => setSaisie({ ...saisie, produit: e.target.value })}>
                  <option value="">Lecture automatique</option>
                  {PRODUITS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <h4>BTEX et additifs</h4>
            <div className="chromato-champs">
              {champ('B', 'Benzène')}
              {champ('T', 'Toluène')}
              {champ('E', 'Éthylbenzène')}
              {champ('X', 'Xylènes')}
              <label className="champ">
                Alkyl-plomb
                <select value={saisie.plomb ?? ''} onChange={(e) => setSaisie({ ...saisie, plomb: (e.target.value || null) as OuiNon })}>
                  <option value="">Non recherché</option>
                  <option value="oui">Détecté</option>
                  <option value="non">Non détecté</option>
                </select>
              </label>
              <label className="champ">
                MTBE, ETBE, TAME
                <select value={saisie.oxygenes ?? ''} onChange={(e) => setSaisie({ ...saisie, oxygenes: (e.target.value || null) as OuiNon })}>
                  <option value="">Non recherchés</option>
                  <option value="oui">Détectés</option>
                  <option value="non">Non détectés</option>
                </select>
              </label>
            </div>
            <details className="chromato-sous">
              <summary>16 HAP (saisie à la main{composes && Object.keys(composes.hap).length ? ', complète le fichier' : ''})</summary>
              <p className="pfas-note">Une valeur sous la LQ se saisit 0. Même unité pour tous.</p>
              <div className="chromato-champs">
                {Object.entries(NOMS_HAP).map(([code, libelle]) => (
                  <label className="champ" key={code}>
                    {libelle}
                    <input
                      value={saisie.hap[code] ?? ''}
                      inputMode="decimal"
                      placeholder={composes?.hap[code] !== undefined ? nombreFr(composes.hap[code]!) : ''}
                      onChange={(e) => setSaisie({ ...saisie, hap: { ...saisie.hap, [code]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            </details>
            {!profil && (
              <details className="chromato-sous">
                <summary>Fractions carbonées</summary>
                <div className="chromato-champs">
                  {BANDES.map(([a, b], i) => (
                    <label className="champ" key={a}>
                      C{a}–C{b}
                      <input
                        value={saisie.fractions[i]}
                        inputMode="decimal"
                        onChange={(e) => setSaisie({ ...saisie, fractions: saisie.fractions.map((v, k) => (k === i ? e.target.value : v)) })}
                      />
                    </label>
                  ))}
                </div>
              </details>
            )}
            <details className="chromato-sous">
              <summary>n-C17, pristane, n-C18, phytane (rarement proposés)</summary>
              <p className="pfas-note">Seulement si un laboratoire les a dosés (empreinte CG/DIF détaillée) : ils remplacent alors les hauteurs lues sur l’image.</p>
              <div className="chromato-champs">
                {champ('c17', 'n-C17')}
                {champ('pr', 'Pristane')}
                {champ('c18', 'n-C18')}
                {champ('ph', 'Phytane')}
              </div>
            </details>
          </details>
        </div>
      </section>

      {lecture && (
        <section className="section section--muted">
          <div className="container">
            <div className="chromato-titre-resultats">
              <h2>3. Lecture{entree?.nom ? ` — ${entree.nom}` : ''}</h2>
              <div className="depot__actions">
                <button type="button" className="btn" onClick={ajouterComparaison}>
                  Ajouter à la comparaison
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => void navigator.clipboard?.writeText(lecture.synthese)}>
                  Copier la synthèse
                </button>
              </div>
            </div>
            <Resultats l={lecture} />
          </div>
        </section>
      )}

      {comparaison.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="chromato-titre-resultats">
              <h2>4. Comparaison des échantillons</h2>
              <div className="depot__actions">
                <button type="button" className="btn btn--ghost" onClick={exporterComparaison}>
                  Exporter (CSV)
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setComparaison([])}>
                  Vider
                </button>
              </div>
            </div>
            <p className="pfas-note">
              Les quatre conclusions du BRGM (correspondance, probable, indéterminée, pas de correspondance) <Cite ids={['brgm2014']} />, à partir de la corrélation des
              profils et du rapport pristane/phytane, stable au vieillissement. Seuils de corrélation (0,95 ; 0,85 ; 0,6) et tolérance de 20 % sur Pr/Ph : repères de
              l’outil.
            </p>
            {comparaison.filter((c) => c.entree.distribution).length > 0 && (
              <GraphiqueComparaison series={comparaison.filter((c) => c.entree.distribution).slice(0, 8).map((c) => ({ nom: c.nom, d: c.entree.distribution! }))} />
            )}
            <div className="tableau-defile">
              <table className="tableau chromato-tableau">
                <thead>
                  <tr>
                    <th>Échantillon</th>
                    <th>Produit</th>
                    <th>Altération</th>
                    <th>n-C17/Pr</th>
                    <th>Pr/Ph</th>
                    <th>HAP : origine, séquence</th>
                    <th>Âge (n-C17/Pr)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...comparaison]
                    .sort((a, b) => (b.lecture.stade.code ?? -1) - (a.lecture.stade.code ?? -1))
                    .map(({ nom: n, entree: e, lecture: l }) => (
                      <tr key={n}>
                        <th>{n}</th>
                        <td>{l.produit?.nom ?? '—'}</td>
                        <td>{l.stade.libelle}</td>
                        <td className="tableau__conc">{e.c17 !== null && e.pr ? nombreFr(e.c17 / e.pr) : '—'}</td>
                        <td className="tableau__conc">{e.pr && e.ph ? nombreFr(e.pr / e.ph) : '—'}</td>
                        <td>
                          {l.composes?.origine || l.composes?.sequence
                            ? [l.composes.origine?.verdict, l.composes.sequence?.libelle.toLowerCase(), napPhe(l) && `Nap/Phé ${napPhe(l)}`].filter(Boolean).join(' · ')
                            : '—'}
                        </td>
                        <td>{l.ages[0]?.applicable ? l.ages[0].valeur : '—'}</td>
                        <td>
                          <button type="button" className="btn btn--ghost btn--petit" onClick={() => setComparaison(comparaison.filter((x) => x.nom !== n))}>
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="pfas-note">Classés du plus altéré au moins altéré : pour un même produit, un ordre d’ancienneté relative.</p>
            {comparaison.length >= 2 && (
              <div className="tableau-defile">
                <table className="tableau chromato-tableau">
                  <thead>
                    <tr>
                      <th>Paire</th>
                      <th>Conclusion</th>
                      <th>Éléments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparaison.flatMap((a, i) =>
                      comparaison.slice(i + 1).map((b) => {
                        const c = comparer(a.entree, b.entree, a.lecture, b.lecture)
                        const badge = c.niveau === 'correspondance' ? 'badge--faible' : c.niveau === 'probable' ? 'badge--moderee' : c.niveau === 'aucune' ? 'badge--elevee' : 'badge--indeterminee'
                        return (
                          <tr key={`${a.nom}|${b.nom}`}>
                            <th>
                              {a.nom} / {b.nom}
                            </th>
                            <td>
                              <span className={`badge ${badge}`}>{LIBELLES_CORRESPONDANCE[c.niveau]}</span>
                            </td>
                            <td className="chromato-raisons">{c.texte}</td>
                          </tr>
                        )
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <h2>Méthode et références</h2>
          <div className="pfas-note" style={{ maxWidth: '52rem' }}>
            <p>
              Numérisation : la trace est lue colonne par colonne dans le cadre choisi (point le plus haut de la couleur de la courbe ; lignes de grille et repères
              verticaux écartés). Axe des carbones : interpolation entre les repères C10 et C40 <Cite ids={['iso16703']} />, puis recalage sur la série des n-alcanes
              (courbure du programme de four, puis pic par pic). Ligne de base : enveloppe convexe inférieure de la trace. Bosse non résolue : ouverture morphologique
              sur un carbone (enveloppe de vallée à vallée) ; les hauteurs de pics sont lues au-dessus d’elle <Cite ids={['brgm2014']} />.
            </p>
            <p>
              Produits : plages de carbones du BRGM et de l’ITRC ; les bandes de l’outil sont indicatives <Cite ids={['brgm2014', 'itrc2018']} />. Stades : échelle de
              Peters et Moldowan ramenée à ce que voit la CG/DIF ; les seuils sur n-C17/pristane (80, 40 et 10 % du rapport d’un gazole frais) sont des repères de
              l’outil <Cite ids={['petersMoldowan2005', 'brgm2014']} />. Âge : équation de Christensen et Larsen pour les gazoles, rapport BTEX de Kaplan pour les essences,
              additifs <Cite ids={['christensenLarsen1993', 'kaplan1997', 'directive9870']} />.
            </p>
            <p>Ces lectures aident l’interprétation ; elles ne remplacent ni l’examen du chromatogramme par l’ingénieur, ni l’historique du site, ni une expertise de forensie environnementale.</p>
          </div>
          <Bibliographie />
        </div>
      </section>
    </>
  )
}
