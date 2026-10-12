import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import CalageManuel from '../components/CalageManuel'
import { analyserDocument, type PageAnalysee } from '../lib/dict/analyse'
import { libelleCrs, metresParPoint, type Crs } from '../lib/dict/calage'
import { CATEGORIES, couleursExploitants, libelleCategorie } from '../lib/dict/categories'
import { echelleImpression, exporterPdf as produirePdf, fichierMonde, vueImpression, type Format } from '../lib/dict/export'
import { dessinerFond, FONDS, SOURCES_FONDS, type Fond } from '../lib/dict/fonds'
import { calerAuto, calerManuel, contourL93, lireDessinees, type Geo, type PointDeCalage } from '../lib/dict/geo'
import { cleExploitant, clePage, construireLots, type Lot } from '../lib/dict/lots'
import type { PdfOuvert } from '../lib/dict/pdfjs'
import { echelleRendu, ecart, extraireMasque, rvb, type Masque } from '../lib/dict/reseau'
import { composer, estomper, tailleVue, vueDesReseaux, type Contour, type CoucheSynthese, type Vue } from '../lib/dict/synthese'

interface Fichier {
  nom: string
  pages: PageAnalysee[]
}

interface Reglage {
  couleur?: string
  exclues: string[]
  visible: boolean
}

/** A page with more colour than this is a photograph or a coloured
 *  background, not a network drawing. */
const PART_COLOREE_MAX = 0.2
/** Beyond this scale a plan is an overview, too coarse to place networks. */
const ECHELLE_MAX = 2000

const fr = (n: number) => n.toLocaleString('fr-FR')
const pluriel = (n: number, mot: string) => `${fr(n)} ${mot}${n > 1 ? 's' : ''}`
const nomCourt = (nom: string) => (nom.length > 70 ? `${nom.slice(0, 40)}…${nom.slice(-26)}` : nom)
const creerCanevas = (largeur: number, hauteur: number) => {
  const c = document.createElement('canvas')
  c.width = largeur
  c.height = hauteur
  return c
}
/** Signature of a georeferencing, to know when a mask is out of date. */
const signature = (g: Geo) => JSON.stringify([g.l93, g.cadre])

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

const versBlob = (c: HTMLCanvasElement, type: string, qualite?: number) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('image impossible'))), type, qualite))

/** Base map of a view, greyed so that the networks stand out. */
async function fondDe(fond: Fond, vue: Vue, signal?: AbortSignal): Promise<{ toile: HTMLCanvasElement | null; incomplet: boolean }> {
  if (fond === 'aucun') return { toile: null, incomplet: false }
  const { largeur, hauteur } = tailleVue(vue)
  const toile = creerCanevas(largeur, hauteur)
  const ctx = toile.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, largeur, hauteur)
  const { manquantes } = await dessinerFond(ctx, fond, vue, signal)
  estomper(ctx, largeur, hauteur, fond === 'ortho' ? 0.5 : 0.6)
  return { toile, incomplet: manquantes > 0 }
}

export default function PlansDict() {
  const [fichiers, setFichiers] = useState<Fichier[]>([])
  const docs = useRef(new Map<string, PdfOuvert>())
  /** Same documents, for rendering (refs are not read during render). */
  const [ouverts, setOuverts] = useState<Record<string, PdfOuvert>>({})
  const fileVignettes = useRef(Promise.resolve())
  const fileMasques = useRef(Promise.resolve())
  const enCours = useRef(new Set<string>())
  const [lecture, setLecture] = useState<{ nom: string; fait: number; total: number } | null>(null)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [survol, setSurvol] = useState(false)
  const [noms, setNoms] = useState<Record<string, string>>({})
  const [choix, setChoix] = useState<Record<string, boolean>>({})
  const [vignettes, setVignettes] = useState<Record<string, string>>({})
  const [commune, setCommune] = useState<[number, number] | null>(null)
  const [manuels, setManuels] = useState<Record<string, { points: PointDeCalage[]; crs: Crs }>>({})
  const [masques, setMasques] = useState<Record<string, { sig: string; masque: Masque | null }>>({})
  const [reglages, setReglages] = useState<Record<string, Reglage>>({})
  const [fond, setFond] = useState<Fond>('plan')
  const [contours, setContours] = useState(false)
  const [calage, setCalage] = useState<string | null>(null)
  const [format, setFormat] = useState<Format>('A3')
  const [exportEnCours, setExportEnCours] = useState<'pdf' | 'png' | null>(null)
  const [erreurExport, setErreurExport] = useState<string | null>(null)
  const [fondApercu, setFondApercu] = useState<{ cle: string; toile: HTMLCanvasElement | null; erreur: boolean } | null>(null)
  const [zoom, setZoom] = useState(false)
  const apercu = useRef<HTMLCanvasElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const ouverts = docs.current
    return () => ouverts.forEach((d) => d.fermer())
  }, [])

  const { lots, doublons } = useMemo(() => construireLots(fichiers), [fichiers])
  const cle = useCallback((fichier: number, page: number) => `${fichiers[fichier]?.nom}#${page}`, [fichiers])
  const nomDe = useCallback((lot: Lot) => noms[lot.id] ?? lot.exploitant, [noms])

  // What the receipts say about the declaration.
  const recepisses = lots.map((l) => l.recepisse).filter((r) => r !== null)
  const consultations = [...new Set(recepisses.map((r) => r.consultation).filter((c) => c !== null))]
  const nomCommune = recepisses.find((r) => r.commune)?.commune ?? null
  const adresse = recepisses.find((r) => r.adresse)?.adresse ?? null
  const lieu = adresse && nomCommune && adresse.toLowerCase() !== nomCommune.toLowerCase() ? `${adresse}, ${nomCommune}` : (adresse ?? nomCommune)

  // The works' commune, to check each plan's coordinate system.
  useEffect(() => {
    if (!nomCommune) return
    const ctrl = new AbortController()
    fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(nomCommune)}&type=municipality&limit=1`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        const p = j.features?.[0]?.properties
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) setCommune([p.x, p.y])
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [nomCommune])

  /** Georeferencing of every plan page: by hand if done, else from the
   *  coordinates written on the plan, else from the ones drawn on it, read
   *  near the commune (or near the plans already placed). */
  const geos = useMemo(() => {
    const g: Record<string, Geo | null> = {}
    for (const f of fichiers) {
      for (const p of f.pages) {
        if (p.nature !== 'plan') continue
        const k = `${f.nom}#${p.index}`
        const m = manuels[k]
        g[k] = m ? calerManuel(p, m.points, m.crs) : calerAuto(p, commune)
      }
    }
    const places = Object.values(g).filter((x): x is Geo => !!x)
    const pres: [number, number] | null =
      commune ??
      (places.length
        ? [places.reduce((s, x) => s + x.l93[2], 0) / places.length, places.reduce((s, x) => s + x.l93[5], 0) / places.length]
        : null)
    if (pres) {
      for (const f of fichiers) {
        const aLire = f.pages.filter((p) => p.nature === 'plan' && !g[`${f.nom}#${p.index}`] && !manuels[`${f.nom}#${p.index}`])
        for (const [index, lues] of lireDessinees(aLire, pres)) g[`${f.nom}#${index}`] = calerAuto(f.pages[index], commune, lues)
      }
    }
    return g
  }, [fichiers, manuels, commune])

  const parDefaut = useCallback(
    (fi: number, p: number) => {
      const page = fichiers[fi].pages[p]
      const g = geos[cle(fi, p)]
      return page.nature === 'plan' && !page.assemblage && !doublons.has(clePage(fi, p)) && !!g && g.echelle <= ECHELLE_MAX
    },
    [fichiers, geos, cle, doublons],
  )
  /** Pages whose networks are extracted. */
  const candidate = useCallback((fi: number, p: number) => !!geos[cle(fi, p)] && (choix[cle(fi, p)] ?? parDefaut(fi, p)), [geos, cle, choix, parDefaut])
  const masqueDe = useCallback(
    (fi: number, p: number) => {
      const k = cle(fi, p)
      const g = geos[k]
      const m = masques[k]
      return g && m && m.sig === signature(g) ? m.masque : undefined
    },
    [cle, geos, masques],
  )
  /** Pages drawn on the synthesis: a coloured background (photograph) is
   *  left out unless the user asked for it. */
  const retenue = useCallback(
    (fi: number, p: number) => {
      if (!candidate(fi, p)) return false
      const m = masqueDe(fi, p)
      return choix[cle(fi, p)] !== undefined || !m || m.partColoree <= PART_COLOREE_MAX
    },
    [candidate, masqueDe, choix, cle],
  )

  // Network extraction, one page at a time.
  useEffect(() => {
    fichiers.forEach((f, fi) =>
      f.pages.forEach((page) => {
        const p = page.index
        const k = `${f.nom}#${p}`
        const g = geos[k]
        if (!g || !candidate(fi, p)) return
        const sig = signature(g)
        if (masques[k]?.sig === sig || enCours.current.has(k + sig)) return
        enCours.current.add(k + sig)
        fileMasques.current = fileMasques.current.then(async () => {
          const ouvert = docs.current.get(f.nom)
          if (!ouvert) return
          try {
            const { rendrePage } = await import('../lib/dict/pdfjs')
            const rendu = await rendrePage(ouvert.doc, p, echelleRendu(metresParPoint(g.l93), page.largeur, page.hauteur))
            const masque = extraireMasque(rendu, g.cadre, g.l93, g.grille)
            setMasques((m) => ({ ...m, [k]: { sig, masque } }))
          } catch (e) {
            console.error(e)
            setMasques((m) => ({ ...m, [k]: { sig, masque: null } }))
          } finally {
            enCours.current.delete(k + sig)
          }
        })
      }),
    )
  }, [fichiers, geos, candidate, masques])

  /** One group per operator, alphabetical, with its colour and pages. */
  const groupes = useMemo(() => {
    const parCle = new Map<string, { cle: string; exploitant: string; categories: string[]; pages: { fi: number; p: number }[] }>()
    for (const lot of lots) {
      const nom = nomDe(lot).trim() || lot.exploitant
      const c = cleExploitant(nom)
      const g = parCle.get(c) ?? { cle: c, exploitant: nom, categories: [], pages: [] }
      parCle.set(c, g)
      for (const cat of lot.categories) if (!g.categories.includes(cat)) g.categories.push(cat)
      for (const p of lot.pages) if (retenue(lot.fichier, p)) g.pages.push({ fi: lot.fichier, p })
    }
    const liste = [...parCle.values()].sort((a, b) => a.exploitant.localeCompare(b.exploitant, 'fr', { sensitivity: 'base' }))
    const couleurs = couleursExploitants(liste.map((g) => g.categories))
    return liste.map((g, i) => {
      const r = reglages[g.cle]
      return { ...g, couleur: r?.couleur ?? couleurs[i], exclues: r?.exclues ?? [], visible: r?.visible ?? true }
    })
  }, [lots, nomDe, retenue, reglages])

  const groupeDuLot = (lot: Lot) => groupes.find((g) => g.cle === cleExploitant(nomDe(lot).trim() || lot.exploitant))
  const regler = (c: string, r: Partial<Reglage>) =>
    setReglages((t) => ({ ...t, [c]: { couleur: t[c]?.couleur, exclues: t[c]?.exclues ?? [], visible: t[c]?.visible ?? true, ...r } }))

  /** Main colours of each operator's plans, summed over its pages. */
  const palettes = useMemo(() => {
    const r: Record<string, { couleur: string; part: number }[]> = {}
    for (const g of groupes) {
      const acc: { couleur: string; n: number }[] = []
      let total = 0
      for (const { fi, p } of g.pages) {
        const m = masqueDe(fi, p)
        if (!m) continue
        for (const c of m.palette) {
          const n = c.part * m.pixels
          total += n
          const proche = acc.find((a) => ecart(rvb(a.couleur), rvb(c.couleur)) < 48)
          if (proche) proche.n += n
          else acc.push({ couleur: c.couleur, n })
        }
      }
      r[g.cle] = acc
        .filter((a) => a.n / (total || 1) >= 0.005)
        .sort((a, b) => b.n - a.n)
        .map((a) => ({ couleur: a.couleur, part: a.n / (total || 1) }))
    }
    return r
  }, [groupes, masqueDe])

  const couchesDe = useCallback(
    (visibles: boolean) => {
      const couches: CoucheSynthese[] = []
      const traits: Contour[] = []
      for (const g of groupes) {
        if (visibles && !g.visible) continue
        for (const { fi, p } of g.pages) {
          const m = masqueDe(fi, p)
          const geo = geos[cle(fi, p)]
          if (m) couches.push({ masque: m, couleur: g.couleur, exclues: g.exclues })
          if (geo) traits.push({ coins: contourL93(geo), couleur: g.couleur })
        }
      }
      return { couches, traits }
    },
    [groupes, masqueDe, geos, cle],
  )

  const enAttente = groupes.reduce((s, g) => s + g.pages.filter(({ fi, p }) => masqueDe(fi, p) === undefined).length, 0)
  const totalPlans = groupes.reduce((s, g) => s + g.pages.length, 0)
  /** Extent of every network kept, visible or not: stable when toggling. */
  const vue = useMemo(() => (enAttente ? null : vueDesReseaux(couchesDe(false).couches, 8e6)), [couchesDe, enAttente])

  // Base map of the view, fetched once per view and kind.
  const cleFond = vue ? `${fond}|${vue.etendue.join(',')}|${vue.resolution}` : null
  useEffect(() => {
    if (!vue || !cleFond || fondApercu?.cle === cleFond) return
    const ctrl = new AbortController()
    fondDe(fond, vue, ctrl.signal)
      .then(({ toile, incomplet }) => setFondApercu({ cle: cleFond, toile, erreur: incomplet }))
      .catch(() => {
        if (!ctrl.signal.aborted) setFondApercu({ cle: cleFond, toile: null, erreur: true })
      })
    return () => ctrl.abort()
  }, [vue, cleFond, fond, fondApercu?.cle])
  const fondPret = !!cleFond && fondApercu?.cle === cleFond

  // The synthesis picture.
  useEffect(() => {
    const toile = apercu.current
    if (!toile || !vue || !fondPret) return
    const t = setTimeout(() => {
      const { couches, traits } = couchesDe(true)
      const image = composer(vue, fondApercu!.toile, couches, contours ? traits : [], creerCanevas)
      toile.width = image.width
      toile.height = image.height
      toile.getContext('2d')!.drawImage(image, 0, 0)
    }, 60)
    return () => clearTimeout(t)
  }, [vue, fondApercu, fondPret, couchesDe, contours])

  function produireVignettes(nom: string, ouvert: PdfOuvert, pages: PageAnalysee[]) {
    fileVignettes.current = fileVignettes.current.then(async () => {
      const { vignette } = await import('../lib/dict/pdfjs')
      for (const p of pages) {
        if (docs.current.get(nom) !== ouvert) return
        try {
          const url = await vignette(ouvert.doc, p.index)
          setVignettes((v) => ({ ...v, [`${nom}#${p.index}`]: url }))
        } catch {
          /* the tile keeps its placeholder */
        }
      }
    })
  }

  async function charger(liste: FileList | null) {
    if (!liste?.length) return
    const tous = [...liste]
    const pdfs = tous.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    const problemes = tous.filter((f) => !pdfs.includes(f)).map((f) => `« ${f.name} » n'est pas un PDF : il est ignoré.`)
    const { ouvrir } = await import('../lib/dict/pdfjs')
    for (const f of pdfs) {
      if (docs.current.has(f.name)) {
        problemes.push(`« ${f.name} » est déjà chargé.`)
        continue
      }
      try {
        const ouvert = await ouvrir(new Uint8Array(await f.arrayBuffer()))
        const total = ouvert.doc.numPages
        setLecture({ nom: f.name, fait: 0, total })
        const pages = await analyserDocument(ouvert.doc, (fait) => setLecture({ nom: f.name, fait, total }))
        docs.current.set(f.name, ouvert)
        setOuverts((o) => ({ ...o, [f.name]: ouvert }))
        setFichiers((avant) => [...avant, { nom: f.name, pages }])
        produireVignettes(
          f.name,
          ouvert,
          pages.filter((p) => p.nature === 'plan'),
        )
      } catch (e) {
        problemes.push(
          (e as Error)?.name === 'PasswordException'
            ? `« ${f.name} » est protégé par un mot de passe : ouvrez-le et enregistrez-en une copie sans protection.`
            : `« ${f.name} » n'a pas pu être lu comme un PDF.`,
        )
      }
    }
    setLecture(null)
    setErreurs(problemes)
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    void charger(e.dataTransfer.files)
  }

  function retirer(nom: string) {
    docs.current.get(nom)?.fermer()
    docs.current.delete(nom)
    setOuverts((o) => Object.fromEntries(Object.entries(o).filter(([n]) => n !== nom)))
    setFichiers((avant) => avant.filter((f) => f.nom !== nom))
  }

  function toutRetirer() {
    docs.current.forEach((d) => d.fermer())
    docs.current.clear()
    setOuverts({})
    setFichiers([])
    setNoms({})
    setChoix({})
    setVignettes({})
    setManuels({})
    setMasques({})
    setReglages({})
    setErreurs([])
  }

  const titre = consultations.length ? `DICT n° ${consultations.join(', ')}` : 'Réseaux des exploitants'
  const details = [lieu ? `Travaux : ${lieu}` : '', `Établi le ${new Date().toLocaleDateString('fr-FR')} avec SIR Toolbox France (ERM)`].filter(Boolean)
  const base = `Synthese reseaux${consultations.length === 1 ? ` DICT ${consultations[0]}` : ''}${nomCommune ? ` - ${nomCommune}` : ''}`
  const echelle = vue ? echelleImpression(format, vue.etendue) : null
  const sources = [
    SOURCES_FONDS[fond],
    "Réseaux : plans transmis par les exploitants en réponse à la DT / DICT, superposés après calage sur leurs coordonnées. Synthèse indicative : seuls les plans des exploitants font foi, avec la classe de précision qu'ils indiquent. Les réseaux dessinés en noir ou en gris n'y figurent pas.",
    'Coordonnées : Lambert 93 (RGF93, EPSG:2154).',
  ].filter(Boolean)

  async function exporterPdf() {
    if (!vue || !echelle) return
    setErreurExport(null)
    setExportEnCours('pdf')
    try {
      const v = vueImpression(format, vue.etendue, echelle)
      let fondImpression: HTMLCanvasElement | null = null
      try {
        fondImpression = (await fondDe(fond, v)).toile
      } catch {
        fondImpression = null
      }
      const { couches, traits } = couchesDe(true)
      const image = composer(v, fondImpression, couches, contours ? traits : [], creerCanevas)
      const jpeg = new Uint8Array(await (await versBlob(image, 'image/jpeg', 0.9)).arrayBuffer())
      const ecartM = (r: number) => `${fr(Math.round(r * 100) / 100)} m`
      const octets = await produirePdf({
        format,
        echelle,
        vue: v,
        image: jpeg,
        titre,
        details,
        legende: groupes
          .filter((g) => g.visible && g.pages.length)
          .map((g) => ({
            exploitant: g.exploitant,
            couleur: g.couleur,
            categories: g.categories.length ? g.categories.map(libelleCategorie).join(' · ') : 'Catégorie non précisée',
            detail: pluriel(g.pages.length, 'plan'),
          })),
        sources,
        plans: groupes.flatMap((g) =>
          g.pages.map(({ fi, p }) => {
            const geo = geos[cle(fi, p)]!
            return {
              exploitant: g.exploitant,
              fichier: nomCourt(fichiers[fi].nom),
              page: p + 1,
              folio: fichiers[fi].pages[p].folio,
              echelle: geo.echelle,
              systeme: libelleCrs(geo.crs),
              calage:
                geo.origine === 'manuel'
                  ? `à la main${geo.residu !== null ? ` (écart ${ecartM(geo.residu)})` : ''}`
                  : `coordonnées ${geo.origine === 'dessinees' ? 'dessinées' : 'écrites'} sur le plan (écart ${ecartM(geo.residu ?? 0)})`,
            }
          }),
        ),
      })
      telecharger(new Blob([octets as BlobPart], { type: 'application/pdf' }), `${base}.pdf`)
    } catch (e) {
      console.error(e)
      setErreurExport("L'export PDF a échoué. Réessayez ; si l'erreur persiste, choisissez un format plus petit.")
    } finally {
      setExportEnCours(null)
    }
  }

  async function exporterPng() {
    if (!vue) return
    setExportEnCours('png')
    try {
      const { couches, traits } = couchesDe(true)
      const image = composer(vue, fondApercu?.toile ?? null, couches, contours ? traits : [], creerCanevas)
      telecharger(await versBlob(image, 'image/png'), `${base}.png`)
      telecharger(new Blob([fichierMonde(vue)], { type: 'text/plain' }), `${base}.pgw`)
    } finally {
      setExportEnCours(null)
    }
  }

  const pageCalage = (() => {
    if (!calage) return null
    const i = calage.lastIndexOf('#')
    const nom = calage.slice(0, i)
    const p = Number(calage.slice(i + 1))
    const fi = fichiers.findIndex((f) => f.nom === nom)
    const lot = lots.find((l) => l.fichier === fi && l.pages.includes(p))
    const ouvert = ouverts[nom]
    return fi >= 0 && ouvert ? { p, page: fichiers[fi].pages[p], ouvert, exploitant: lot ? nomDe(lot) : nom } : null
  })()

  const nbNonCales = fichiers.reduce((s, f) => s + f.pages.filter((p) => p.nature === 'plan' && !p.assemblage && !geos[`${f.nom}#${p.index}`]).length, 0)

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Réponses aux DT / DICT</p>
          <h1 style={{ maxWidth: '24ch' }}>Synthèse des réseaux des exploitants</h1>
          <p className="lede">
            Déposez les PDF reçus des exploitants : chaque plan est calé sur ses coordonnées, ses réseaux en sont extraits, et tous sont
            réunis sur un même plan, une couleur par exploitant.
          </p>

          <h2 className="etape">
            <span>1</span> Réponses des exploitants
          </h2>
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
              accept=".pdf,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                void charger(e.target.files)
                e.target.value = ''
              }}
            />
            <p style={{ margin: 0, fontWeight: 600 }}>
              {lecture ? `Lecture de « ${nomCourt(lecture.nom)} » — page ${lecture.fait} / ${lecture.total}` : 'Déposez ici les PDF des exploitants'}
            </p>
            <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.88rem', color: 'var(--color-muted)' }}>
              Récépissés et plans joints, en une ou plusieurs fois. Les fichiers sont lus dans votre navigateur et ne sont envoyés nulle
              part.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => input.current?.click()} disabled={!!lecture}>
                {fichiers.length ? 'Ajouter des fichiers' : 'Choisir les fichiers'}
              </button>
              {fichiers.length > 0 && (
                <button type="button" className="btn btn--ghost" onClick={toutRetirer} disabled={!!lecture}>
                  Tout retirer
                </button>
              )}
            </div>
          </div>
          {erreurs.length > 0 && (
            <div role="alert" className="alerte">
              {erreurs.map((e) => (
                <p key={e} style={{ margin: 0 }}>
                  {e}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>

      {fichiers.length > 0 && (
        <section className="section section--muted">
          <div className="container">
            <h2 className="etape">
              <span>2</span> Plans et calage
            </h2>
            <p className="lede" style={{ marginBottom: '1.25rem' }}>
              Les plans qui portent leurs coordonnées sont calés d'office. Pour les autres, cliquez sur « Caler » et pointez une
              intersection de la grille. Cochez ou décochez un plan pour le retenir ou l'écarter.
            </p>
            {nbNonCales > 0 && (
              <p className="alerte" style={{ marginTop: 0 }}>
                {pluriel(nbNonCales, 'plan')} sans coordonnées lisibles : à caler à la main pour figurer sur la synthèse.
              </p>
            )}
            <datalist id="dict-exploitants">
              {[...new Set(lots.map(nomDe))].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            {fichiers.map((f, fi) =>
              lots
                .filter((l) => l.fichier === fi)
                .map((lot, k, tous) => {
                  const plans = lot.pages.filter((p) => f.pages[p].nature === 'plan')
                  const g = groupeDuLot(lot)
                  return (
                    <article key={lot.id} className="card dict-lot" style={{ borderLeftColor: g?.couleur }}>
                      <div className="dict-lot__tete">
                        <div style={{ minWidth: 0 }}>
                          <p className="dict-lot__fichier" title={f.nom}>
                            {nomCourt(f.nom)}
                            {tous.length > 1 && ` — réponse ${k + 1}`}
                          </p>
                          <label className="champ dict-lot__nom">
                            Exploitant
                            <input list="dict-exploitants" value={nomDe(lot)} onChange={(e) => setNoms((n) => ({ ...n, [lot.id]: e.target.value }))} />
                          </label>
                          <p className={`dict-lot__origine${lot.origine.type === 'fichier' ? ' dict-lot__origine--doute' : ''}`}>
                            {lot.origine.type === 'recepisse' && <>Lu dans le récépissé{lot.recepisse?.contact ? ` · contact : ${lot.recepisse.contact}` : ''}</>}
                            {lot.origine.type === 'rattache' && <>Sans récépissé : rattaché à un autre envoi du même exploitant.</>}
                            {lot.origine.type === 'fichier' && <>Pas de récépissé : nom déduit du nom du fichier, à vérifier.</>}
                          </p>
                        </div>
                        <div className="dict-lot__resume">
                          <div className="dict-lot__categories">
                            {lot.categories.length ? (
                              lot.categories.map((c) => (
                                <span key={c} className={`dict-categorie${CATEGORIES[c]?.sensible ? ' dict-categorie--sensible' : ''}`}>
                                  {libelleCategorie(c)}
                                </span>
                              ))
                            ) : (
                              <span className="dict-muet">Catégorie non précisée</span>
                            )}
                          </div>
                          {lot.recepisse?.concerne === false && <span className="dict-muet">Réseaux non concernés</span>}
                          <strong>
                            {plans.length ? `${fr(plans.filter((p) => retenue(fi, p)).length)} plan(s) retenu(s) sur ${fr(plans.length)}` : 'Aucun plan'}
                          </strong>
                          {k === 0 && (
                            <button type="button" className="btn btn--petit btn--ghost" onClick={() => retirer(f.nom)}>
                              Retirer le fichier
                            </button>
                          )}
                        </div>
                      </div>

                      {plans.length > 0 && (
                        <div className="dict-pages">
                          {plans.map((p) => {
                            const page = f.pages[p]
                            const k2 = cle(fi, p)
                            const geo = geos[k2]
                            const oui = retenue(fi, p)
                            const m = masqueDe(fi, p)
                            const doublon = doublons.get(clePage(fi, p))
                            const url = vignettes[k2]
                            return (
                              <div key={p} className={`dict-page${oui ? ' dict-page--retenue' : ''}`}>
                                <label className="dict-page__clic">
                                  <input
                                    type="checkbox"
                                    checked={oui}
                                    disabled={!geo}
                                    aria-label={`Retenir la page ${p + 1}`}
                                    onChange={(e) => setChoix((c) => ({ ...c, [k2]: e.target.checked }))}
                                  />
                                  {url ? <img src={url} alt={`Page ${p + 1}`} /> : <span className="dict-page__attente">Aperçu…</span>}
                                </label>
                                <span className="dict-page__legende">
                                  <strong>p. {p + 1}</strong>
                                  {page.folio && ` · folio ${page.folio}`}
                                </span>
                                {page.assemblage ? (
                                  <span className="dict-muet">Plan d'assemblage</span>
                                ) : geo ? (
                                  <span className="dict-page__cale">
                                    {geo.origine === 'manuel' ? 'Calé à la main' : geo.origine === 'dessinees' ? 'Calé (coordonnées dessinées lues)' : 'Calé'} ·{' '}
                                    {libelleCrs(geo.crs)} · 1:{fr(geo.echelle)}
                                  </span>
                                ) : (
                                  <span className="dict-page__doublon">Sans coordonnées lisibles</span>
                                )}
                                {geo && geo.echelle > ECHELLE_MAX && !page.assemblage && <span className="dict-muet">Plan de situation</span>}
                                {doublon && (
                                  <span className="dict-page__doublon">
                                    Déjà dans « {nomCourt(fichiers[doublon.fichier].nom)} », p. {doublon.page + 1}
                                  </span>
                                )}
                                {oui && m === undefined && <span className="dict-muet">Extraction des réseaux…</span>}
                                {oui && m && !m.emprise && <span className="dict-muet">Aucun réseau en couleur</span>}
                                {m && m.partColoree > PART_COLOREE_MAX && <span className="dict-page__doublon">Fond en couleur (photo ?)</span>}
                                {!page.assemblage && (
                                  <button type="button" className="btn btn--petit btn--ghost dict-page__caler" onClick={() => setCalage(k2)}>
                                    {geo ? 'Recaler' : 'Caler…'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </article>
                  )
                }),
            )}
          </div>
        </section>
      )}

      {fichiers.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="etape">
              <span>3</span> Plan de synthèse
            </h2>
            {totalPlans === 0 ? (
              <p className="dict-muet">Aucun plan calé n'est retenu.</p>
            ) : (
              <>
                <div className="synthese">
                  <div className="synthese__reglages">
                    <label className="champ">
                      Fond de plan
                      <select value={fond} onChange={(e) => setFond(e.target.value as Fond)}>
                        {FONDS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.libelle}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="dict-option">
                      <input type="checkbox" checked={contours} onChange={(e) => setContours(e.target.checked)} />
                      Contour des plans
                    </label>
                    {groupes
                      .filter((g) => g.pages.length)
                      .map((g) => (
                        <div key={g.cle} className="synthese__exploitant">
                          <div className="synthese__tete">
                            <input
                              type="checkbox"
                              checked={g.visible}
                              aria-label={`Afficher ${g.exploitant}`}
                              onChange={(e) => regler(g.cle, { visible: e.target.checked })}
                            />
                            <input type="color" value={g.couleur} aria-label={`Couleur de ${g.exploitant}`} onChange={(e) => regler(g.cle, { couleur: e.target.value })} />
                            <strong>{g.exploitant}</strong>
                          </div>
                          <p className="dict-muet" style={{ margin: '0.2rem 0 0.4rem' }}>
                            {g.categories.join(', ') || 'Catégorie non précisée'} · {pluriel(g.pages.length, 'plan')}
                          </p>
                          {(palettes[g.cle]?.length ?? 0) > 1 && (
                            <div className="synthese__couleurs">
                              {palettes[g.cle].map((c) => {
                                const exclue = g.exclues.some((e) => ecart(rvb(e), rvb(c.couleur)) < 48)
                                return (
                                  <button
                                    key={c.couleur}
                                    type="button"
                                    className={`synthese__teinte${exclue ? ' synthese__teinte--exclue' : ''}`}
                                    style={{ background: c.couleur }}
                                    title={`${exclue ? 'Reprendre' : 'Écarter'} cette couleur des plans d'origine (${Math.max(1, Math.round(c.part * 100))} % du tracé)`}
                                    aria-pressed={!exclue}
                                    onClick={() =>
                                      regler(g.cle, {
                                        exclues: exclue ? g.exclues.filter((e) => ecart(rvb(e), rvb(c.couleur)) >= 48) : [...g.exclues, c.couleur],
                                      })
                                    }
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    <p className="dict-muet" style={{ fontSize: '0.8rem' }}>
                      Les pastilles reprennent les couleurs des plans d'origine : cliquez sur l'une d'elles pour écarter ce qui n'est pas un
                      réseau (limite de commune, zone…).
                    </p>
                  </div>
                  <div className="synthese__carte">
                    {enAttente > 0 && <p className="dict-muet">Extraction des réseaux… {pluriel(enAttente, 'plan')} restant(s)</p>}
                    {vue && !fondPret && <p className="dict-muet">Chargement du fond IGN…</p>}
                    {fondPret && fondApercu?.erreur && (
                      <p className="alerte">Le service de l'IGN n'a pas fourni tout le fond de plan : changez de fond puis revenez pour réessayer.</p>
                    )}
                    <div
                      className={`synthese__toile${zoom ? ' synthese__toile--zoom' : ''}`}
                      onClick={() => setZoom((z) => !z)}
                      title={zoom ? 'Vue réduite' : 'Voir en grand'}
                    >
                      <canvas ref={apercu} aria-label="Plan de synthèse des réseaux" />
                    </div>
                  </div>
                </div>

                <div className="exports">
                  <div className="card export">
                    <strong>Plan PDF</strong>
                    <p>
                      Plan à l'échelle avec légende, carroyage Lambert 93 et sources, suivi de la liste des plans utilisés.
                      {echelle && ` Échelle : 1:${fr(echelle)}.`}
                    </p>
                    <label className="champ" style={{ width: '100%' }}>
                      Format
                      <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                        <option value="A3">A3 paysage</option>
                        <option value="A1">A1 paysage</option>
                        <option value="A0">A0 paysage</option>
                      </select>
                    </label>
                    <button type="button" className="btn" onClick={() => void exporterPdf()} disabled={!!exportEnCours || enAttente > 0 || !vue}>
                      {exportEnCours === 'pdf' ? 'Préparation du PDF…' : 'Télécharger le PDF'}
                    </button>
                  </div>
                  <div className="card export">
                    <strong>Image géoréférencée</strong>
                    <p>PNG et son fichier de calage (.pgw) en Lambert 93, à ouvrir dans QGIS ou AutoCAD Map.</p>
                    <button type="button" className="btn btn--ghost" onClick={() => void exporterPng()} disabled={!!exportEnCours || enAttente > 0 || !vue}>
                      {exportEnCours === 'png' ? 'Préparation…' : 'Télécharger le PNG'}
                    </button>
                  </div>
                </div>
                {erreurExport && (
                  <p role="alert" className="alerte">
                    {erreurExport}
                  </p>
                )}
                <p className="dict-muet" style={{ marginTop: '1rem', maxWidth: '52rem' }}>
                  Synthèse indicative : seuls les plans des exploitants font foi. Les réseaux dessinés en noir ou en gris ne se distinguent
                  pas du fond de plan et n'y figurent pas.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {pageCalage && calage && (
        <CalageManuel
          titre={`${pageCalage.exploitant} — p. ${pageCalage.p + 1}`}
          ouvert={pageCalage.ouvert}
          page={pageCalage.page}
          crsInitial={manuels[calage]?.crs ?? geos[calage]?.crs ?? pageCalage.page.indiceCrs ?? 'EPSG:2154'}
          pointsInitiaux={manuels[calage]?.points ?? []}
          onFermer={() => setCalage(null)}
          onValider={(points, crs) => {
            setManuels((m) => ({ ...m, [calage]: { points, crs } }))
            setChoix((c) => ({ ...c, [calage]: true }))
            setCalage(null)
          }}
        />
      )}
    </>
  )
}
