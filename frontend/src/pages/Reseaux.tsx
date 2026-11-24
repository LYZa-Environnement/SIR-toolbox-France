import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import '../leaflet-icon-fix'
import AddressSearch from '../components/AddressSearch'
import { BASE_LAYERS } from '../lib/basemap'
import { telechargerBlob } from '../lib/fichiers'
import { jourIso } from '../lib/format'
import {
  adresseDuPoint,
  chargerChaleur,
  chargerDistributeurs,
  chargerFibre,
  chargerSource,
  codeCommune,
  empriseAutour,
  FICHE_FIBRE,
  LIMITE_OBJETS,
  sourcesConcernees,
  type Distributeurs,
  type FibreCommune,
  type ReseauChaleurProche,
} from '../lib/reseaux/requetes'
import { SOURCE, SOURCES } from '../lib/reseaux/sources'
import { formatDistance, formatLongueur, gestionnaires, situer, synthese, versCsv, versGeoJson, type ObjetSitue } from '../lib/reseaux/synthese'
import { CATEGORIE, CATEGORIES, type Reseau, type ResultatSource, type SourceReseau } from '../lib/reseaux/types'
import type { Site } from '../types/site'

const RAYONS = [50, 100, 200, 300, 500]
const RAYON_DEFAUT = 200

const GUICHET_UNIQUE = 'https://www.reseaux-et-canalisations.ineris.fr/'

/** Answer of one source; a source with no answer yet for the current search is loading. */
type EtatSource = { etat: 'ok'; resultat: ResultatSource } | { etat: 'erreur'; message: string }
type Chargement<T> = { etat: 'chargement' } | { etat: 'ok'; valeur: T | null } | { etat: 'erreur' }
const CHARGEMENT = { etat: 'chargement' } as const

/** Commune and point information of one search, tagged like the network answers. */
interface Contexte {
  cle: string
  distributeurs?: Chargement<Distributeurs>
  fibre?: Chargement<FibreCommune>
  chaleur?: Chargement<ReseauChaleurProche>
}
type ValeurContexte<K extends 'distributeurs' | 'fibre' | 'chaleur'> = NonNullable<Contexte[K]> extends Chargement<infer T> ? T : never

interface Point {
  lat: number
  lon: number
  label: string
  citycode: string
  city: string
}

const titreSource = (id: string) => {
  const s = SOURCE[id]
  return s ? `${s.titre} — ${s.producteur}` : id
}

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function popup(o: ObjetSitue): string {
  const source = SOURCE[o.source]
  const lignes = [
    `<strong>${echapper(o.element)}</strong>`,
    `<div style="color:${CATEGORIE[o.reseau].couleur};font-weight:600">${echapper(CATEGORIE[o.reseau].libelle)}</div>`,
    o.gestionnaire ? `<div>Gestionnaire : ${echapper(o.gestionnaire)}</div>` : '',
    `<div>Distance au point : ${formatDistance(o.distanceM)}${o.lineaire && o.longueurM > 0 ? ` · ${formatLongueur(o.longueurM)} dans le rayon` : ''}</div>`,
    ...o.details.map(([k, v]) => `<div>${echapper(k)} : ${echapper(v)}</div>`),
    source ? `<div style="margin-top:0.35rem;font-size:0.75rem;color:#4f625f">${echapper(source.producteur)} — <a href="${echapper(source.fiche)}" target="_blank" rel="noopener noreferrer">fiche</a></div>` : '',
  ]
  return `<div style="font-size:0.8rem;line-height:1.4;max-width:18rem">${lignes.join('')}</div>`
}

/** Heavier strokes for the higher voltages and the transport networks, dashes for overhead lines. */
function epaisseur(o: ObjetSitue): number {
  if (/HTB|transport|poste source/i.test(o.element)) return 4.5
  if (/HTA|collecteur|structurant/i.test(o.element)) return 3.5
  return 2.5
}

function Cadrage({ point, rayonM }: { point: Point; rayonM: number }) {
  const map = useMap()
  useEffect(() => {
    const [o, s, e, n] = empriseAutour(point.lat, point.lon, rayonM)
    map.fitBounds(
      [
        [s, o],
        [n, e],
      ],
      { padding: [8, 8] },
    )
  }, [map, point.lat, point.lon, rayonM])
  return null
}

function ClicDeplacement({ actif, onPoint }: { actif: boolean; onPoint: (lat: number, lon: number) => void }) {
  const map = useMapEvents({
    click(e) {
      if (actif) onPoint(e.latlng.lat, e.latlng.lng)
    },
  })
  useEffect(() => {
    map.getContainer().style.cursor = actif ? 'crosshair' : ''
  }, [map, actif])
  return null
}

function CoucheReseau({ objets }: { objets: ObjetSitue[] }) {
  const donnees = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: objets.map((o) => ({ type: 'Feature' as const, geometry: o.geometrie, properties: { id: o.id } })),
    }),
    [objets],
  )
  const parId = useMemo(() => new Map(objets.map((o) => [o.id, o])), [objets])
  return (
    <GeoJSON
      data={donnees as never}
      style={(f) => {
        const o = parId.get((f?.properties as { id?: string } | undefined)?.id ?? '')
        if (!o) return {}
        const couleur = CATEGORIE[o.reseau].couleur
        // The style also applies to the point markers: keep them as filled dots with a white ring.
        if (o.geometrie.type === 'Point' || o.geometrie.type === 'MultiPoint') return { color: '#ffffff', weight: 1.2, opacity: 1, fillColor: couleur, fillOpacity: 1 }
        return { color: couleur, weight: epaisseur(o), opacity: 0.95, dashArray: o.aerien ? '7 5' : undefined, fillColor: couleur, fillOpacity: 0.2 }
      }}
      pointToLayer={(f, latlng) => {
        const o = parId.get((f.properties as { id: string }).id)
        const couleur = o ? CATEGORIE[o.reseau].couleur : '#333'
        return L.circleMarker(latlng, { radius: 4.5, color: '#ffffff', weight: 1.2, fillColor: couleur, fillOpacity: 1 })
      }}
      onEachFeature={(f, couche) => {
        const o = parId.get((f.properties as { id: string }).id)
        if (o) couche.bindPopup(popup(o))
      }}
    />
  )
}

function Carte({
  point,
  rayonM,
  objets,
  visibles,
  deplacement,
  onPoint,
}: {
  point: Point
  rayonM: number
  objets: ObjetSitue[]
  visibles: Set<Reseau>
  deplacement: boolean
  onPoint: (lat: number, lon: number) => void
}) {
  const [baseId, setBaseId] = useState(BASE_LAYERS[0].id)
  const base = BASE_LAYERS.find((b) => b.id === baseId) ?? BASE_LAYERS[0]
  // One layer per family, so that a family switched off or on redraws alone.
  const parReseau = useMemo(() => CATEGORIES.map((c) => ({ id: c.id, objets: objets.filter((o) => o.reseau === c.id) })), [objets])
  return (
    <div>
      <div className="reseaux__carte">
        <MapContainer center={[point.lat, point.lon]} zoom={17} style={{ height: '100%', width: '100%' }} scrollWheelZoom preferCanvas>
          <TileLayer key={base.id} url={base.url} attribution={base.attribution} maxNativeZoom={base.maxNativeZoom} maxZoom={21} />
          <Circle center={[point.lat, point.lon]} radius={rayonM} pathOptions={{ color: '#0d2421', weight: 1.5, dashArray: '4 4', fill: false }} interactive={false} />
          {parReseau.map(({ id, objets: liste }) =>
            visibles.has(id) && liste.length > 0 ? <CoucheReseau key={`${id}-${liste.length}-${liste[0]?.id}`} objets={liste} /> : null,
          )}
          <CircleMarker center={[point.lat, point.lon]} radius={7} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#0d2421', fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -6]}>
              {point.label}
            </Tooltip>
          </CircleMarker>
          <Cadrage point={point} rayonM={rayonM} />
          <ClicDeplacement actif={deplacement} onPoint={onPoint} />
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

function Avertissement() {
  return (
    <div className="alerte" role="note">
      <strong>Des tracés indicatifs, pas une réponse d’exploitant.</strong> Les sondages, forages et fouilles d’une investigation sont des travaux au sens de la
      réglementation anti-endommagement (code de l’environnement, articles L. 554-1 à L. 554-5 et R. 554-1 et suivants) : la déclaration de projet de travaux (DT)
      et la déclaration d’intention de commencement de travaux (DICT) auprès du{' '}
      <a href={GUICHET_UNIQUE} target="_blank" rel="noopener noreferrer">
        guichet unique
      </a>{' '}
      restent obligatoires. Les données ci-dessous servent à préparer l’implantation et à recouper les réponses des exploitants ; elles n’ont pas de classe de
      précision garantie et ne couvrent pas tous les réseaux.
    </div>
  )
}

function libelleEtat(e: EtatSource | undefined, limite: number): string {
  if (!e) return 'Interrogation…'
  if (e.etat === 'erreur') return 'Indisponible'
  const n = e.resultat.objets.length
  return `${n} objet${n > 1 ? 's' : ''}${e.resultat.tronque ? ` (limité à ${limite.toLocaleString('fr-FR')} : réduire le rayon)` : ''}`
}

export default function Reseaux() {
  const [point, setPoint] = useState<Point | null>(null)
  const [rayonM, setRayonM] = useState(RAYON_DEFAUT)
  // Answers are tagged with the search they belong to: an answer to a previous
  // search is never read as current, and a new search starts with nothing
  // rather than with a reset made inside an effect.
  const [reponses, setReponses] = useState<{ cle: string; etats: Record<string, EtatSource> }>({ cle: '', etats: {} })
  const [contexte, setContexte] = useState<Contexte>({ cle: '' })
  const [visibles, setVisibles] = useState<Set<Reseau>>(() => new Set(CATEGORIES.map((c) => c.id)))
  const [deplacement, setDeplacement] = useState(false)
  const [essai, setEssai] = useState(0)
  const pointAbort = useRef<AbortController | null>(null)

  const emprise = useMemo(() => (point ? empriseAutour(point.lat, point.lon, rayonM) : null), [point, rayonM])
  const concernees = useMemo(() => (emprise ? sourcesConcernees(SOURCES, emprise) : []), [emprise])
  const cleSources = point ? `${point.lat},${point.lon},${rayonM},${essai}` : ''
  const commune = point ? codeCommune(point.citycode) : ''
  const cleContexte = point ? `${point.lat},${point.lon},${commune},${essai}` : ''
  const etats = useMemo(() => (reponses.cle === cleSources ? reponses.etats : {}), [reponses, cleSources])

  // Network layers: every source covering the extent, in parallel; each one fills in as it answers.
  useEffect(() => {
    if (!emprise) return
    const controleur = new AbortController()
    const poser = (id: string, etat: EtatSource) => {
      if (controleur.signal.aborted) return
      setReponses((prev) => ({ cle: cleSources, etats: { ...(prev.cle === cleSources ? prev.etats : {}), [id]: etat } }))
    }
    for (const s of concernees) {
      chargerSource(s, emprise, controleur.signal)
        .then((resultat) => poser(s.id, { etat: 'ok', resultat }))
        .catch((err: unknown) => poser(s.id, { etat: 'erreur', message: err instanceof Error ? err.message : String(err) }))
    }
    return () => controleur.abort()
  }, [emprise, concernees, cleSources])

  // Commune and point information: distribution operators, fibre network, nearest heating network.
  useEffect(() => {
    if (!point) return
    const controleur = new AbortController()
    const { signal } = controleur
    function suivre<K extends 'distributeurs' | 'fibre' | 'chaleur'>(cle: K, promesse: Promise<ValeurContexte<K> | null>) {
      const poser = (c: Chargement<ValeurContexte<K>>) => {
        if (!signal.aborted) setContexte((prev) => ({ ...(prev.cle === cleContexte ? prev : { cle: cleContexte }), [cle]: c }))
      }
      promesse.then((valeur) => poser({ etat: 'ok', valeur })).catch(() => poser({ etat: 'erreur' }))
    }
    if (commune) {
      suivre('distributeurs', chargerDistributeurs(commune, signal))
      suivre('fibre', chargerFibre(commune, signal))
    }
    suivre('chaleur', chargerChaleur(point.lat, point.lon, signal))
    return () => controleur.abort()
  }, [point, commune, cleContexte])

  const ctx: Contexte = contexte.cle === cleContexte ? contexte : { cle: cleContexte }
  const sansCommune: Chargement<never> = { etat: 'ok', valeur: null }
  const distributeurs = commune ? (ctx.distributeurs ?? CHARGEMENT) : sansCommune
  const fibre = commune ? (ctx.fibre ?? CHARGEMENT) : sansCommune
  const chaleur = ctx.chaleur ?? CHARGEMENT

  const objets = useMemo(() => {
    if (!point) return []
    const tous = Object.values(etats).flatMap((e) => (e.etat === 'ok' ? e.resultat.objets : []))
    return situer(tous, point.lat, point.lon, rayonM)
  }, [etats, point, rayonM])
  const lignes = useMemo(() => synthese(objets), [objets])
  const listeGestionnaires = useMemo(() => gestionnaires(objets), [objets])
  const enCours = concernees.filter((s) => !etats[s.id]).length
  const enErreur = concernees.filter((s) => etats[s.id]?.etat === 'erreur')

  function choisirAdresse(site: Site) {
    setDeplacement(false)
    setPoint({ lat: site.lat, lon: site.lon, label: site.label, citycode: site.citycode, city: site.city })
  }

  async function deplacer(lat: number, lon: number) {
    setDeplacement(false)
    setPoint((p) => ({ lat, lon, label: 'Point choisi sur la carte', citycode: p?.citycode ?? '', city: p?.city ?? '' }))
    pointAbort.current?.abort()
    const controleur = new AbortController()
    pointAbort.current = controleur
    try {
      const adresse = await adresseDuPoint(lat, lon, controleur.signal)
      if (adresse && !controleur.signal.aborted) setPoint({ lat, lon, label: `Point choisi sur la carte, près du ${adresse.label}`, citycode: adresse.citycode, city: adresse.city })
    } catch {
      /* the point stays usable without its address */
    }
  }

  function basculer(id: Reseau) {
    setVisibles((v) => {
      const suite = new Set(v)
      if (suite.has(id)) suite.delete(id)
      else suite.add(id)
      return suite
    })
  }

  const nomFichier = (ext: string) => `reseaux-${(point?.city || 'site').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${rayonM}m-${jourIso()}.${ext}`

  // Families with no source at all on this territory: said plainly, with where to ask.
  const reseauxCouverts = new Set(concernees.flatMap((s) => s.reseaux))
  const presents = new Set(objets.map((o) => o.reseau))
  // Once every source has answered: families with nothing in the radius, split between
  // "no open source here at all" and "sources asked, nothing published within the radius".
  const sansSource = CATEGORIES.filter((c) => !reseauxCouverts.has(c.id))
  const sansObjet = CATEGORIES.filter((c) => reseauxCouverts.has(c.id) && !presents.has(c.id))
  const contexteEnErreur = [distributeurs, fibre, chaleur].some((c) => c.etat === 'erreur')
  const parCategorie = (id: Reseau) => objets.filter((o) => o.reseau === id).length

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Réseaux et concessionnaires</p>
          <h1 style={{ maxWidth: '22ch' }}>Les réseaux autour d’un site</h1>
          <p className="lede">
            Électricité, gaz, eau, assainissement, éclairage public, fibre, chaleur : les tracés publiés en données ouvertes par les gestionnaires de réseaux,
            l’IGN, le Géoportail de l’Urbanisme et les collectivités, réunis sur une carte pour préparer l’implantation des sondages et la liste des exploitants à
            consulter.
          </p>
          <Avertissement />

          <div className="reseaux__saisie">
            <div style={{ flex: '1 1 22rem', maxWidth: '36rem' }}>
              <AddressSearch onSelect={choisirAdresse} />
            </div>
            <label className="champ" style={{ flex: '0 0 auto' }}>
              Rayon
              <select value={rayonM} onChange={(e) => setRayonM(Number(e.target.value))}>
                {RAYONS.map((r) => (
                  <option key={r} value={r}>
                    {r} m
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!point && (
            <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', maxWidth: '40rem' }}>
              Saisissez une adresse ; le point pourra ensuite être déplacé sur la carte (site sans adresse, emprise d’un sondage).
            </p>
          )}
        </div>
      </section>

      {point && emprise && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="reseaux__entete">
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted)' }}>Point de recherche</p>
                <strong>{point.label}</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                  {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
                  {point.city ? ` — ${point.city}` : ''} — rayon {rayonM} m
                </p>
              </div>
              <div className="reseaux__actions">
                <button type="button" className={`btn btn--petit${deplacement ? '' : ' btn--ghost'}`} onClick={() => setDeplacement((d) => !d)} aria-pressed={deplacement}>
                  {deplacement ? 'Cliquez sur la carte…' : 'Déplacer le point'}
                </button>
                <button type="button" className="btn btn--petit btn--ghost" disabled={objets.length === 0} onClick={() => telechargerBlob(new Blob([versGeoJson(objets, titreSource)], { type: 'application/geo+json' }), nomFichier('geojson'))}>
                  Export GeoJSON
                </button>
                <button type="button" className="btn btn--petit btn--ghost" disabled={lignes.length === 0} onClick={() => telechargerBlob(new Blob(['﻿', versCsv(lignes, titreSource)], { type: 'text/csv;charset=utf-8' }), nomFichier('csv'))}>
                  Synthèse CSV
                </button>
              </div>
            </div>

            <div className="reseaux__grille">
              <Carte point={point} rayonM={rayonM} objets={objets} visibles={visibles} deplacement={deplacement} onPoint={deplacer} />

              <aside className="reseaux__legende" aria-label="Réseaux affichés">
                <p className="reseaux__legende-titre">
                  {enCours > 0 ? `Interrogation de ${enCours} source${enCours > 1 ? 's' : ''}…` : `${objets.length} objet${objets.length > 1 ? 's' : ''} dans le rayon`}
                </p>
                <ul>
                  {CATEGORIES.map((c) => {
                    const n = parCategorie(c.id)
                    const couvert = reseauxCouverts.has(c.id)
                    return (
                      <li key={c.id} className={couvert ? undefined : 'reseaux__legende--vide'}>
                        <label>
                          <input type="checkbox" checked={visibles.has(c.id)} onChange={() => basculer(c.id)} disabled={n === 0} />
                          <span className="reseaux__trait" style={{ background: c.couleur }} aria-hidden="true" />
                          <span className="reseaux__legende-libelle">{c.libelle}</span>
                          <span className="reseaux__legende-nombre">{couvert ? n : 'aucune source'}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                <p className="reseaux__legende-note">
                  Trait plein : souterrain ou non précisé ; tirets : aérien. Couleurs du code des réseaux (NF P 98-332). Cliquez sur un objet pour ses attributs et
                  sa source.
                </p>
                {(enErreur.length > 0 || contexteEnErreur) && (
                  <p className="reseaux__legende-note" style={{ color: 'var(--level-elevee)' }}>
                    {enErreur.length > 0 ? `${enErreur.length} source${enErreur.length > 1 ? 's' : ''} sans réponse.` : 'Une information communale n’a pas répondu.'}{' '}
                    <button type="button" className="reseaux__lien" onClick={() => setEssai((n) => n + 1)}>
                      Réessayer
                    </button>
                  </p>
                )}
              </aside>
            </div>

            <h2 className="reseaux__titre">Synthèse par réseau</h2>
            {lignes.length === 0 ? (
              <p style={{ color: 'var(--color-muted)' }}>{enCours > 0 ? 'Les sources répondent…' : 'Aucun réseau publié dans ce rayon.'}</p>
            ) : (
              <div className="tableau-defile">
                <table className="tableau reseaux__tableau">
                  <thead>
                    <tr>
                      <th>Réseau</th>
                      <th>Distance au point</th>
                      <th>Linéaire dans le rayon</th>
                      <th>Objets</th>
                      <th>Gestionnaires nommés par les données</th>
                      <th>Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={l.reseau}>
                        <th>
                          <span className="reseaux__trait" style={{ background: CATEGORIE[l.reseau].couleur }} aria-hidden="true" /> {CATEGORIE[l.reseau].libelle}
                        </th>
                        <td>{formatDistance(l.distanceMinM)}</td>
                        <td>{formatLongueur(l.lineaireM)}</td>
                        <td>{l.objets}</td>
                        <td className="reseaux__texte">{l.gestionnaires.join(', ') || '—'}</td>
                        <td className="reseaux__texte">{l.elements.map(([e, n]) => `${e} (${n})`).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid--2" style={{ gap: '1.25rem', marginTop: '2rem' }}>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Exploitants à consulter</h3>
                <p className="reseaux__aide">Gestionnaires nommés par les objets du rayon, du plus proche au plus éloigné, puis les distributeurs désignés pour la commune.</p>
                {listeGestionnaires.length > 0 ? (
                  <ul className="reseaux__liste">
                    {listeGestionnaires.map((g) => (
                      <li key={g.gestionnaire}>
                        <strong>{g.gestionnaire}</strong> — {g.reseaux.map((r) => CATEGORIE[r].libelle.toLowerCase()).join(', ')} — à {formatDistance(g.distanceMinM)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="reseaux__aide">{enCours > 0 ? 'En attente des sources…' : 'Aucun gestionnaire nommé par les objets du rayon.'}</p>
                )}
                <ContexteCommune distributeurs={distributeurs} />
              </div>

              <div className="card">
                <h3 style={{ marginTop: 0 }}>Fibre et chaleur</h3>
                <ContexteFibre fibre={fibre} />
                <ContexteChaleur chaleur={chaleur} />
              </div>
            </div>

            {enCours === 0 && (sansSource.length > 0 || sansObjet.length > 0) && (
              <div className="card" style={{ marginTop: '1.25rem' }}>
                <h3 style={{ marginTop: 0 }}>Ce que la carte ne montre pas</h3>
                {sansSource.length > 0 && (
                  <p>
                    <strong>Aucune source ouverte sur ce secteur</strong> : {sansSource.map((c) => c.libelle.toLowerCase()).join(', ')}.
                  </p>
                )}
                {sansObjet.length > 0 && (
                  <p>
                    <strong>Sources interrogées, rien de publié dans le rayon</strong> : {sansObjet.map((c) => c.libelle.toLowerCase()).join(', ')}. Pour l’eau
                    potable et l’assainissement, seules les canalisations grevées d’une servitude (A5) figurent dans les sources nationales.
                  </p>
                )}
                <p style={{ marginBottom: 0 }}>
                  L’absence d’un réseau sur la carte ne signifie pas qu’il n’y en a pas : seules les réponses des exploitants au{' '}
                  <a href={GUICHET_UNIQUE} target="_blank" rel="noopener noreferrer">
                    guichet unique
                  </a>{' '}
                  font foi. Pour l’eau et l’assainissement, le service compétent est la commune, le syndicat ou l’intercommunalité ; ses plans de récolement se
                  demandent directement.
                </p>
              </div>
            )}

            <h2 className="reseaux__titre">Sources interrogées</h2>
            <p className="reseaux__aide" style={{ maxWidth: '48rem' }}>
              Chaque source est interrogée sur le carré qui contient le cercle, et seuls les objets à moins de {rayonM} m du point sont retenus. Les sources locales ne
              le sont que si leur territoire recoupe la zone.
            </p>
            <div className="tableau-defile">
              <table className="tableau reseaux__tableau">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Producteur</th>
                    <th>Territoire</th>
                    <th>Résultat</th>
                    <th>Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {concernees.map((s: SourceReseau) => (
                    <tr key={s.id}>
                      <th className="reseaux__texte">
                        <a href={s.fiche} target="_blank" rel="noopener noreferrer">
                          {s.titre}
                        </a>
                        {s.note && <div className="reseaux__note">{s.note}</div>}
                      </th>
                      <td className="reseaux__texte">{s.producteur}</td>
                      <td className="reseaux__texte">{s.territoire}</td>
                      <td>{libelleEtat(etats[s.id], s.limite ?? LIMITE_OBJETS)}</td>
                      <td>{s.licence ?? 'voir la fiche'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

function ContexteCommune({ distributeurs }: { distributeurs: Chargement<Distributeurs> }) {
  if (distributeurs.etat === 'chargement') return <p className="reseaux__aide">Distributeurs de la commune…</p>
  if (distributeurs.etat === 'erreur') return <p className="reseaux__aide">Distributeurs de la commune indisponibles (Agence ORE).</p>
  const d = distributeurs.valeur
  if (!d) return null
  return (
    <p style={{ fontSize: '0.9rem', marginBottom: 0 }}>
      <strong>Distributeurs désignés pour {d.commune}</strong> : électricité {d.electricite.join(', ') || 'non renseigné'} ; gaz {d.gaz.join(', ') || 'pas de réseau de distribution'}.{' '}
      <span className="reseaux__source">
        Source :{' '}
        <a href="https://www.data.gouv.fr/dataservices/6a44cff71cb906fe376b9f4c" target="_blank" rel="noopener noreferrer">
          Agence ORE
        </a>
      </span>
    </p>
  )
}

function ContexteFibre({ fibre }: { fibre: Chargement<FibreCommune> }) {
  if (fibre.etat === 'chargement') return <p className="reseaux__aide">Réseau fibre de la commune…</p>
  const source = (
    <span className="reseaux__source">
      Source :{' '}
      <a href={FICHE_FIBRE} target="_blank" rel="noopener noreferrer">
        ANCT, indicateur France Très Haut Débit
      </a>
    </span>
  )
  if (fibre.etat === 'erreur') return <p className="reseaux__aide">Indicateur fibre indisponible. {source}</p>
  const f = fibre.valeur
  if (!f) return <p className="reseaux__aide">Commune absente de l’indicateur fibre. {source}</p>
  return (
    <div style={{ fontSize: '0.9rem' }}>
      <p style={{ marginTop: 0 }}>
        <strong>Fibre à {f.commune}</strong> : réseau {f.categorie ? `${f.categorie} ` : ''}
        {f.zonage ? `(${f.zonage})` : ''}, exploité par <strong>{f.exploitant ?? 'non renseigné'}</strong>
        {f.operateurInfrastructure && f.operateurInfrastructure !== f.exploitant ? `, opérateur d’infrastructure ${f.operateurInfrastructure}` : ''}
        {f.porteur && f.porteur !== f.exploitant ? `, projet porté par ${f.porteur}` : ''}.
        {f.locaux && f.locauxFtth !== undefined ? ` ${f.locauxFtth.toLocaleString('fr-FR')} locaux raccordables sur ${f.locaux.toLocaleString('fr-FR')}.` : ''}
      </p>
      <p>
        Réseau cuivre (Orange) : {f.fermetureCuivre ? `fermeture technique programmée à partir de ${f.fermetureCuivre}` : 'pas de fermeture programmée d’ici 2030'}.
        Les tracés des réseaux fibre et cuivre ne sont pas publiés, sauf réseaux d’initiative publique ouverts (voir la carte) ; ils figurent dans les réponses
        aux DT-DICT. {f.trimestre ? `Données ${f.trimestre}.` : ''} {source}
      </p>
    </div>
  )
}

function ContexteChaleur({ chaleur }: { chaleur: Chargement<ReseauChaleurProche> }) {
  const source = (
    <span className="reseaux__source">
      Source :{' '}
      <a href="https://france-chaleur-urbaine.beta.gouv.fr/carte" target="_blank" rel="noopener noreferrer">
        France Chaleur Urbaine
      </a>
    </span>
  )
  if (chaleur.etat === 'chargement') return <p className="reseaux__aide">Réseau de chaleur le plus proche…</p>
  if (chaleur.etat === 'erreur') return <p className="reseaux__aide">France Chaleur Urbaine indisponible. {source}</p>
  const c = chaleur.valeur
  if (!c) return <p className="reseaux__aide">Pas de réseau de chaleur référencé à proximité. {source}</p>
  return (
    <p style={{ fontSize: '0.9rem', marginBottom: 0 }}>
      <strong>Réseau de chaleur le plus proche</strong> : {c.nom}
      {c.gestionnaire && c.gestionnaire !== c.nom ? ` (${c.gestionnaire})` : ''}, {c.distanceM < 1 ? 'au droit du point' : `à environ ${formatDistance(c.distanceM)}`}
      {c.classe ? ' ; réseau classé' : ''}
      {c.dansPdp ? ', et le point est dans son périmètre de développement prioritaire (raccordement obligatoire des bâtiments neufs)' : ''}. {source}
    </p>
  )
}
