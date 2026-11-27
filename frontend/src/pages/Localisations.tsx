import { useEffect, useMemo, useState } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import '../leaflet-icon-fix'
import ZoneDepot from '../components/ZoneDepot'
import { BASE_LAYERS } from '../lib/basemap'
import { telechargerBlob, telechargerClasseurExcel } from '../lib/fichiers'
import { jourIso } from '../lib/format'
import { classeurEquis, classeurExcel, modeleSimple, systemeLocal, versCsv, versGeoJson, versGpx, versKml } from '../lib/localisations/export'
import { FAMILLE, FAMILLES, type DefFamille } from '../lib/localisations/familles'
import { FORMATS_GEO, lireFichiers } from '../lib/localisations/lecture'
import { centre, cleNom, synthese, systemeDe, type Conflit, type FormeSituee, type PointSitue, type Synthese } from '../lib/localisations/synthese'
import { courtSysteme, LAMBERT93, nomSysteme, PAR_CODE, SYSTEMES, WGS84 } from '../lib/localisations/systemes'
import type { Couche, Famille, Format } from '../lib/localisations/types'

const FORMAT: Record<Format, string> = {
  equis: 'EQuIS (EDD)',
  tableau: 'Tableau',
  geojson: 'GeoJSON',
  kml: 'KML',
  gpx: 'GPX',
  shapefile: 'Shapefile',
}

const fr = (v: number, decimales: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? motPluriel : mot}`

// ---- Map --------------------------------------------------------------------------

/** SVG of a kind's symbol: shape and colour, so that kinds stay apart without colour. */
function symbole(f: DefFamille, taille = 14): string {
  const c = taille / 2
  const r = c - 1.5
  const trait = 'stroke="#ffffff" stroke-width="1.5"'
  const forme =
    f.forme === 'carre'
      ? `<rect x="${c - r * 0.85}" y="${c - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" fill="${f.couleur}" ${trait}/>`
      : f.forme === 'losange'
        ? `<polygon points="${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}" fill="${f.couleur}" ${trait}/>`
        : f.forme === 'triangle'
          ? `<polygon points="${c},${c - r} ${c + r},${c + r * 0.8} ${c - r},${c + r * 0.8}" fill="${f.couleur}" ${trait}/>`
          : `<circle cx="${c}" cy="${c}" r="${r}" fill="${f.couleur}" ${trait}/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}" aria-hidden="true">${forme}</svg>`
}

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function popup(p: PointSitue): string {
  const lignes: [string, string][] = [['Type', p.typeOrigine || FAMILLE[p.famille].libelle]]
  if (p.description) lignes.push(['Description', p.description])
  if (p.x93 !== null) lignes.push(['Lambert 93', `${fr(p.x93, 2)} ; ${fr(p.y93!, 2)}`])
  if (p.systemeUtilise && p.systemeUtilise !== LAMBERT93 && p.systemeUtilise !== WGS84 && p.x !== null) lignes.push([courtSysteme(p.systemeUtilise), `${fr(p.x, 2)} ; ${fr(p.y!, 2)}`])
  lignes.push(['WGS 84', `${p.lat!.toFixed(6)}, ${p.lon!.toFixed(6)}`])
  if (p.altitude !== undefined) lignes.push(['Altitude TN', `${fr(p.altitude, 2)} m`])
  if (p.repere !== undefined) lignes.push(['Cote du repère', `${fr(p.repere, 2)} m`])
  if (p.profondeur !== undefined) lignes.push(['Profondeur', `${fr(p.profondeur, 2)} m`])
  if (p.date) lignes.push(['Date', new Date(`${p.date}T12:00:00`).toLocaleDateString('fr-FR')])
  for (const [k, v] of Object.entries(p.attributs).slice(0, 8)) lignes.push([k, String(v)])
  lignes.push(['Source', [p.source, ...p.autresSources].join(' ; ')])
  return `<strong>${echapper(p.nom)}</strong><table class="loc__popup">${lignes.map(([k, v]) => `<tr><th>${echapper(k)}</th><td>${echapper(v)}</td></tr>`).join('')}</table>`
}

function CouchePoints({ points, etiquettes }: { points: PointSitue[]; etiquettes: boolean }) {
  const map = useMap()
  useEffect(() => {
    const groupe = L.layerGroup()
    const icones = new Map(FAMILLES.map((f) => [f.id, L.divIcon({ className: 'loc__marqueur', html: symbole(f), iconSize: [14, 14], iconAnchor: [7, 7] })]))
    for (const p of points) {
      const m = L.marker([p.lat!, p.lon!], { icon: icones.get(p.famille), title: p.nom, keyboard: true, riseOnHover: true })
      m.bindPopup(popup(p), { maxWidth: 340 })
      if (etiquettes) m.bindTooltip(echapper(p.nom), { permanent: true, direction: 'right', offset: [6, 0], className: 'loc__etiquette' })
      groupe.addLayer(m)
    }
    groupe.addTo(map)
    return () => {
      groupe.remove()
    }
  }, [map, points, etiquettes])
  return null
}

function CoucheFormes({ formes }: { formes: FormeSituee[] }) {
  const donnees = useMemo(() => ({ type: 'FeatureCollection' as const, features: formes.map((f) => ({ type: 'Feature' as const, geometry: f.wgs, properties: { nom: f.nom, source: f.source } })) }), [formes])
  return (
    <GeoJSON
      data={donnees as never}
      style={() => ({ color: '#0d2421', weight: 2, opacity: 0.9, fillColor: '#00756a', fillOpacity: 0.08 })}
      pointToLayer={(_f, latlng) => L.circleMarker(latlng, { radius: 3 })}
      onEachFeature={(f, couche) => {
        const p = f.properties as { nom: string; source: string }
        couche.bindPopup(`<strong>${echapper(p.nom)}</strong><br><span style="color:#4f625f">${echapper(p.source)}</span>`)
      }}
    />
  )
}

/**
 * Frames the points once: remounted (key) when the set of files changes, so
 * that switching a kind off or choosing a version keeps the view.
 */
function Cadrage({ emprise }: { emprise: Synthese['emprise'] }) {
  const map = useMap()
  const [initiale] = useState(emprise)
  useEffect(() => {
    if (initiale) map.fitBounds(initiale, { padding: [24, 24], maxZoom: 19 })
  }, [map, initiale])
  return null
}

function Carte({ s, cle, etiquettes }: { s: Synthese; cle: string; etiquettes: boolean }) {
  const [baseId, setBaseId] = useState(BASE_LAYERS[0].id)
  const base = BASE_LAYERS.find((b) => b.id === baseId) ?? BASE_LAYERS[0]
  const placables = useMemo(() => s.points.filter((p) => !p.horsFrance), [s.points])
  const depart: [number, number] = s.emprise ? [(s.emprise[0][0] + s.emprise[1][0]) / 2, (s.emprise[0][1] + s.emprise[1][1]) / 2] : [46.6, 2.4]
  return (
    <div>
      <div className="reseaux__carte loc__carte">
        <MapContainer center={depart} zoom={s.emprise ? 17 : 6} zoomSnap={0.5} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer key={base.id} url={base.url} attribution={base.attribution} maxNativeZoom={base.maxNativeZoom} maxZoom={21} />
          {s.formes.length > 0 && <CoucheFormes key={s.formes.map((f) => f.id).join()} formes={s.formes} />}
          <CouchePoints points={placables} etiquettes={etiquettes} />
          <Cadrage key={cle} emprise={s.emprise} />
        </MapContainer>
      </div>
      <div className="reseaux__fonds">
        {BASE_LAYERS.map((option) => (
          <button key={option.id} type="button" className={`reseaux__pastille${option.id === baseId ? ' reseaux__pastille--active' : ''}`} onClick={() => setBaseId(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---- Files -------------------------------------------------------------------------

function ChoixSysteme({ couche, onChange }: { couche: Couche; onChange: (code: string | undefined) => void }) {
  const actuel = systemeDe(couche)
  const proposes = [couche.systeme, ...couche.autresSystemes].filter((c): c is string => !!c)
  const autres = SYSTEMES.map((s) => s.code).filter((c) => !proposes.includes(c))
  return (
    <select
      value={actuel ?? ''}
      aria-label={`Système de coordonnées de ${couche.nom}`}
      onChange={(e) => onChange(e.target.value === couche.systeme ? undefined : e.target.value || undefined)}
      className="loc__systeme"
    >
      {!actuel && <option value="">Choisir le système…</option>}
      {proposes.length > 0 && (
        <optgroup label="Compatibles avec les valeurs">
          {proposes.map((c) => (
            <option key={c} value={c}>
              {nomSysteme(c)}
              {c === couche.systeme ? ' (détecté)' : ''}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Autres systèmes">
        {autres.map((c) => (
          <option key={c} value={c}>
            {nomSysteme(c)}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

function Fichiers({ couches, onModifier, onRetirer }: { couches: Couche[]; onModifier: (id: string, m: Partial<Couche>) => void; onRetirer: (id: string) => void }) {
  return (
    <ul className="loc__fichiers">
      {couches.map((c) => {
        const systeme = systemeDe(c)
        const aConfirmer = !c.systemeForce && (!c.systemeSur || !systeme) && (c.points.some((p) => p.x !== null) || c.formes.length > 0)
        const note = systeme ? PAR_CODE.get(systeme)?.note : undefined
        return (
          <li key={c.id} className={`loc__fichier${c.masquee ? ' loc__fichier--masque' : ''}`}>
            <div className="loc__fichier-tete">
              <div>
                <strong>{c.nom}</strong>
                <span className="loc__format">{FORMAT[c.format]}</span>
                <p className="loc__fichier-compte">
                  {pluriel(c.points.length, 'point')}
                  {c.formes.length > 0 ? ` et ${pluriel(c.formes.length, 'contour ou tracé', 'contours ou tracés')}` : ''}
                </p>
              </div>
              <div className="loc__fichier-actions">
                <label className="loc__case">
                  <input type="checkbox" checked={!c.masquee} onChange={() => onModifier(c.id, { masquee: !c.masquee })} /> Affiché
                </label>
                <button type="button" className="btn btn--petit btn--ghost" onClick={() => onRetirer(c.id)}>
                  Retirer
                </button>
              </div>
            </div>
            <div className="loc__fichier-systeme">
              <ChoixSysteme couche={c} onChange={(code) => onModifier(c.id, { systemeForce: code })} />
              {aConfirmer ? (
                <span className="badge badge--moderee">À confirmer</span>
              ) : (
                <span className="loc__raison">{c.systemeForce ? 'choisi à la main' : c.raisonSysteme}</span>
              )}
            </div>
            {aConfirmer && (
              <p className="loc__raison">
                {systeme ? `${c.raisonSysteme} : ` : ''}vérifier sur la carte que les points tombent au bon endroit, sinon choisir un autre système.
              </p>
            )}
            {note && <p className="loc__raison">{note}</p>}
            {c.remarques.length > 0 && <p className="loc__remarques">{c.remarques.join(' ')}</p>}
          </li>
        )
      })}
    </ul>
  )
}

function Conflits({ conflits, onChoisir }: { conflits: Conflit[]; onChoisir: (nom: string, id: string) => void }) {
  return (
    <div className="alerte" role="note">
      <strong>
        {pluriel(conflits.length, 'point')} à des positions différentes selon les fichiers.
      </strong>{' '}
      La position du dernier fichier déposé est retenue ; choisissez une autre version si elle est plus fiable (levé de géomètre plutôt que GPS, par exemple).
      <table className="tableau loc__conflits">
        <thead>
          <tr>
            <th>Point</th>
            <th>Écart</th>
            <th>Position retenue</th>
          </tr>
        </thead>
        <tbody>
          {conflits.map((c) => (
            <tr key={c.nom}>
              <th>{c.nom}</th>
              <td>{c.ecartM < 1000 ? `${fr(c.ecartM, c.ecartM < 10 ? 2 : 0)} m` : `${fr(c.ecartM / 1000, 1)} km`}</td>
              <td>
                <select value={c.retenu} onChange={(e) => onChoisir(c.nom, e.target.value)} aria-label={`Version retenue pour ${c.nom}`}>
                  {c.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.source} — {fr(v.x93!, 2)} ; {fr(v.y93!, 2)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Points table ---------------------------------------------------------------------

const LIMITE = 200

function TableauPoints({ points }: { points: PointSitue[] }) {
  const [recherche, setRecherche] = useState('')
  const [tout, setTout] = useState(false)
  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const liste = q ? points.filter((p) => `${p.nom} ${p.description} ${p.typeOrigine} ${p.source}`.toLowerCase().includes(q)) : points
    return [...liste].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }))
  }, [points, recherche])
  const affiches = tout ? filtres : filtres.slice(0, LIMITE)
  return (
    <div>
      <label className="champ loc__recherche">
        Rechercher un point
        <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, description, type, fichier" />
      </label>
      <div className="tableau-defile">
        <table className="tableau loc__tableau">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Famille</th>
              <th>Type</th>
              <th>X Lambert 93</th>
              <th>Y Lambert 93</th>
              <th>Alt. TN</th>
              <th>Repère</th>
              <th>Prof.</th>
              <th>Description</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {affiches.map((p) => (
              <tr key={p.id}>
                <th>{p.nom}</th>
                <td>
                  <span className="loc__symbole" dangerouslySetInnerHTML={{ __html: symbole(FAMILLE[p.famille], 12) }} /> {FAMILLE[p.famille].libelle}
                </td>
                <td>{p.typeOrigine}</td>
                <td className="loc__nombre">{p.x93 === null ? '—' : fr(p.x93, 2)}</td>
                <td className="loc__nombre">{p.y93 === null ? '—' : fr(p.y93, 2)}</td>
                <td className="loc__nombre">{p.altitude === undefined ? '' : fr(p.altitude, 2)}</td>
                <td className="loc__nombre">{p.repere === undefined ? '' : fr(p.repere, 2)}</td>
                <td className="loc__nombre">{p.profondeur === undefined ? '' : fr(p.profondeur, 2)}</td>
                <td>{p.description}</td>
                <td className="loc__source">{[p.source, ...p.autresSources].join(' ; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtres.length > affiches.length && (
        <button type="button" className="btn btn--petit btn--ghost" style={{ marginTop: '0.6rem' }} onClick={() => setTout(true)}>
          Afficher les {filtres.length.toLocaleString('fr-FR')} points
        </button>
      )}
    </div>
  )
}

// ---- Page --------------------------------------------------------------------------------

export default function Localisations() {
  const [couches, setCouches] = useState<Couche[]>([])
  const [choix, setChoix] = useState<Record<string, string>>({})
  const [chargement, setChargement] = useState(false)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [masquees, setMasquees] = useState<Set<Famille>>(new Set())
  const [etiquettes, setEtiquettes] = useState<boolean | null>(null)
  const [systemeEdd, setSystemeEdd] = useState<string | null>(null)

  const s = useMemo(() => synthese(couches, choix), [couches, choix])
  // What is shown is what is exported: the kinds switched off are left out of both.
  const vue = useMemo<Synthese>(
    () => (masquees.size ? { ...s, points: s.points.filter((p) => !masquees.has(p.famille)), sansCoordonnees: s.sansCoordonnees.filter((p) => !masquees.has(p.famille)) } : s),
    [s, masquees],
  )
  const cleCadrage = couches.map((c) => `${c.id}${systemeDe(c)}${c.masquee ? '-' : ''}`).join('|')
  const avecEtiquettes = etiquettes ?? vue.points.length <= 150
  const local = systemeLocal(s)
  const eddSysteme = systemeEdd ?? local ?? LAMBERT93

  async function ajouter(fichiers: File[]) {
    setChargement(true)
    try {
      const { couches: nouvelles, erreurs: e } = await lireFichiers(fichiers, { reference: centre(s) })
      setCouches((c) => [...c, ...nouvelles])
      setErreurs(e)
    } finally {
      setChargement(false)
    }
  }

  const modifier = (id: string, m: Partial<Couche>) => setCouches((cs) => cs.map((c) => (c.id === id ? { ...c, ...m } : c)))
  const retirer = (id: string) => setCouches((cs) => cs.filter((c) => c.id !== id))
  const basculer = (f: Famille) =>
    setMasquees((m) => {
      const suite = new Set(m)
      if (suite.has(f)) suite.delete(f)
      else suite.add(f)
      return suite
    })
  const nomFichier = (ext: string) => `localisations-${jourIso()}.${ext}`
  const texte = (contenu: string, type: string, ext: string) => telechargerBlob(new Blob([contenu], { type }), nomFichier(ext))
  const rien = vue.points.length === 0

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Localisation des points</p>
          <h1 style={{ maxWidth: '24ch' }}>Les points d’investigation sur une carte</h1>
          <p className="lede">
            Déposez les fichiers de localisation tels qu’ils arrivent — classeur EQuIS, export ArcGIS Field Maps, tableau du géomètre, relevé GPS, couche SIG : les
            points sont convertis en Lambert 93 et en WGS 84, réunis sur une carte, les doublons entre fichiers repérés, puis exportés pour le SIG, Google Earth, le
            GPS de terrain ou EQuIS.
          </p>
          <ZoneDepot
            titre="Déposez ici un ou plusieurs fichiers de localisation"
            aide={
              <>
                Excel ou CSV (une colonne de nom, X et Y ou longitude et latitude), EQuIS GeologyEDD (onglet Locations), GeoJSON, KML ou KMZ, GPX, shapefile (.zip,
                ou .shp + .dbf + .prj déposés ensemble). Le système de coordonnées est reconnu (Lambert 93, CC42 à CC50, WGS 84, UTM, Lambert II étendu) et peut
                être corrigé fichier par fichier.
              </>
            }
            chargement={chargement}
            libelleChargement="Lecture des fichiers…"
            accept={FORMATS_GEO}
            multiple
            onFichiers={ajouter}
            actions={(choisir) => (
              <div className="depot__actions">
                <button type="button" className="btn" onClick={choisir} disabled={chargement}>
                  Choisir des fichiers
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => telechargerBlob(new Blob([modeleSimple()], { type: 'text/csv;charset=utf-8' }), 'modele-localisation-points.csv')}>
                  Modèle simple (CSV)
                </button>
              </div>
            )}
          />
          {erreurs.length > 0 && (
            <div className="alerte" role="alert" style={{ marginTop: '1rem', maxWidth: '40rem' }}>
              {erreurs.map((e) => (
                <p key={e} style={{ margin: '0.2rem 0' }}>
                  {e}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>

      {couches.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="reseaux__entete">
              <div>
                <strong>
                  {pluriel(vue.points.length, 'point')} sur la carte
                  {s.fusionnes > 0 ? `, ${pluriel(s.fusionnes, 'doublon fusionné', 'doublons fusionnés')}` : ''}
                </strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                  {pluriel(couches.length, 'fichier')}
                  {vue.sansCoordonnees.length > 0 ? ` — ${pluriel(vue.sansCoordonnees.length, 'point')} sans coordonnées` : ''}
                  {local ? ` — système local du site : ${nomSysteme(local)}` : ''}
                </p>
              </div>
              <div className="reseaux__actions">
                <button type="button" className="btn btn--petit btn--ghost" disabled={rien} onClick={() => texte(versGeoJson(vue), 'application/geo+json', 'geojson')} title="QGIS, ArcGIS : longitude, latitude en WGS 84">
                  GeoJSON
                </button>
                <button type="button" className="btn btn--petit btn--ghost" disabled={rien} onClick={() => texte(versKml(vue, 'Localisation des points'), 'application/vnd.google-earth.kml+xml', 'kml')} title="Google Earth, Google My Maps">
                  KML
                </button>
                <button type="button" className="btn btn--petit btn--ghost" disabled={rien} onClick={() => texte(versGpx(vue), 'application/gpx+xml', 'gpx')} title="GPS ou téléphone de terrain">
                  GPX
                </button>
                <button type="button" className="btn btn--petit btn--ghost" disabled={rien} onClick={() => texte(versCsv(vue), 'text/csv;charset=utf-8', 'csv')} title="Lambert 93, système local et WGS 84">
                  CSV
                </button>
                <button type="button" className="btn btn--petit btn--ghost" disabled={rien} onClick={async () => telechargerClasseurExcel(await classeurExcel(vue), nomFichier('xlsx'))}>
                  Excel
                </button>
              </div>
            </div>

            {s.conflits.length > 0 && <Conflits conflits={s.conflits} onChoisir={(nom, id) => setChoix((c) => ({ ...c, [cleNom(nom)]: id }))} />}
            {s.horsFrance.length > 0 && (
              <div className="alerte" role="note">
                <strong>{pluriel(s.horsFrance.length, 'point')} hors de France</strong> ({s.horsFrance.slice(0, 8).map((p) => p.nom).join(', ')}
                {s.horsFrance.length > 8 ? '…' : ''}) : le système de coordonnées de leur fichier est sans doute erroné. Ils ne sont pas dessinés.
              </div>
            )}

            <div className="reseaux__grille">
              <Carte s={vue} cle={cleCadrage} etiquettes={avecEtiquettes} />
              <aside className="reseaux__legende" aria-label="Familles de points">
                <p className="reseaux__legende-titre">Familles de points</p>
                <ul>
                  {FAMILLES.map((f) => {
                    const n = s.parFamille.get(f.id) ?? 0
                    if (!n) return null
                    return (
                      <li key={f.id}>
                        <label>
                          <input type="checkbox" checked={!masquees.has(f.id)} onChange={() => basculer(f.id)} />
                          <span className="loc__symbole" dangerouslySetInnerHTML={{ __html: symbole(f) }} />
                          <span className="reseaux__legende-libelle">{f.libelle}</span>
                          <span className="reseaux__legende-nombre">{n}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                <label className="loc__case">
                  <input type="checkbox" checked={avecEtiquettes} onChange={() => setEtiquettes(!avecEtiquettes)} /> Noms des points
                </label>
                <p className="reseaux__legende-note">Les familles décochées sont aussi retirées des exports. Cliquez sur un point pour ses coordonnées et sa source.</p>
                <div className="loc__edd">
                  <p className="reseaux__legende-titre">EDD EQuIS (onglet Locations)</p>
                  <select value={eddSysteme} onChange={(e) => setSystemeEdd(e.target.value)} aria-label="Système des coordonnées de l’EDD">
                    {[LAMBERT93, ...(local && local !== LAMBERT93 ? [local] : []), WGS84].map((c) => (
                      <option key={c} value={c}>
                        {nomSysteme(c)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn--petit btn--ghost" disabled={rien} onClick={async () => telechargerClasseurExcel(await classeurEquis(vue, eddSysteme), `Locations-EDD-${jourIso()}.xlsx`)}>
                    Exporter l’EDD
                  </button>
                </div>
              </aside>
            </div>

            <h2 className="loc__titre">Fichiers chargés</h2>
            <Fichiers couches={couches} onModifier={modifier} onRetirer={retirer} />

            {vue.sansCoordonnees.length > 0 && (
              <details className="loc__details">
                <summary>{pluriel(vue.sansCoordonnees.length, 'point')} sans coordonnées</summary>
                <p>
                  {vue.sansCoordonnees
                    .map((p) => p.nom + (p.attributs.remark ? ` (${p.attributs.remark})` : ''))
                    .join(', ')}
                </p>
              </details>
            )}

            <h2 className="loc__titre">Points</h2>
            <TableauPoints points={vue.points} />
          </div>
        </section>
      )}
    </>
  )
}
