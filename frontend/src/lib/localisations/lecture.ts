/**
 * Reading any geographic file dropped by the user into layers of points and
 * shapes: workbooks and CSV (EQuIS EDD, Field Maps exports, surveyors'
 * tables), GeoJSON, KML/KMZ (Google Earth, My Maps), GPX (GPS, phones) and
 * shapefiles (zipped, or .shp + .dbf + .prj dropped together).
 */

import type { Cell } from '../resultats/parse'
import { familleDe } from './familles'
import { detecterSysteme, nomSysteme, prjUtilisable, systemeDepuisLibelle, systemeDepuisPrj, WGS84 } from './systemes'
import { enrichirEquis, estEquis, lireTableau, nombre, normaliser, trouverEntete } from './tableau'
import type { Couche, FormeLue, Format, PointLu, Valeur } from './types'

export const FORMATS_GEO = '.xlsx,.xlsm,.xls,.ods,.csv,.txt,.geojson,.json,.kml,.kmz,.gpx,.zip,.shp,.dbf,.prj,.cpg,.shx'

let compteur = 0
const nouvelId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `c${Date.now()}-${++compteur}`)

const ext = (nom: string) => nom.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
const base = (nom: string) => nom.replace(/\.[^.]+$/, '')

export interface Contexte {
  /** Longitude, latitude of the site or of the points already loaded: settles ambiguous systems. */
  reference?: [number, number] | null
}

/** A layer from what was read, with its system declared or guessed. */
function nouvelleCouche(
  a: { nom: string; fichier: string; format: Format; points: PointLu[]; formes?: FormeLue[]; remarques?: string[] },
  indices: { declare?: string | null; colonnes?: string[]; prj?: string; geographique?: boolean },
  ctx: Contexte,
): Couche {
  const formes = a.formes ?? []
  const remarques = [...(a.remarques ?? [])]
  const coords: [number, number][] = a.points.filter((p) => p.x !== null && p.y !== null).map((p) => [p.x!, p.y!])
  for (const f of formes) {
    const c = premiereCoordonnee(f.geometrie)
    if (c) coords.push(c)
  }
  let systeme: string | null = null
  let raison = ''
  let sur = false
  let autres: string[] = []
  let inverse = false
  let prj: string | undefined
  if (indices.prj) {
    const connu = systemeDepuisPrj(indices.prj)
    if (connu) {
      systeme = connu
      raison = 'fichier .prj'
      sur = true
    } else if (prjUtilisable(indices.prj)) {
      systeme = 'prj'
      prj = indices.prj
      raison = 'fichier .prj'
      sur = true
    } else remarques.push('Fichier .prj illisible : système deviné d’après les valeurs.')
  }
  // Per-row systems (EQuIS): the most common one is the layer's.
  if (!systeme) {
    const parLigne = new Map<string, number>()
    for (const p of a.points) if (p.systeme) parLigne.set(p.systeme, (parLigne.get(p.systeme) ?? 0) + 1)
    const [plusFrequent] = [...parLigne.entries()].sort((x, y) => y[1] - x[1])
    if (plusFrequent && !indices.declare) {
      systeme = plusFrequent[0]
      raison = 'déclaré dans le fichier'
      sur = true
    }
    if (parLigne.size > 1) remarques.push(`Plusieurs systèmes déclarés selon les lignes (${[...parLigne.keys()].map(nomSysteme).join(', ')}) : chaque point est converti depuis le sien.`)
  }
  if (!systeme) {
    const d = detecterSysteme(coords, {
      declare: indices.declare ?? (indices.geographique ? 'WGS84' : null),
      colonnes: indices.colonnes,
      reference: ctx.reference,
    })
    if (d) {
      systeme = d.code
      raison = indices.geographique && !indices.declare ? 'colonnes longitude et latitude' : d.raison
      sur = d.sur
      autres = d.autres
      inverse = !!d.inverse
    } else if (coords.length) {
      raison = 'système non reconnu : à choisir'
    }
  }
  return {
    id: nouvelId(),
    nom: a.nom,
    fichier: a.fichier,
    format: a.format,
    systeme,
    raisonSysteme: raison,
    systemeSur: sur,
    autresSystemes: autres,
    ...(prj ? { prj } : {}),
    ...(inverse ? { inverse } : {}),
    points: a.points,
    formes,
    remarques,
    importe: new Date().toISOString(),
  }
}

function premiereCoordonnee(g: GeoJSON.Geometry | null): [number, number] | null {
  if (!g) return null
  if (g.type === 'GeometryCollection') {
    for (const s of g.geometries) {
      const c = premiereCoordonnee(s)
      if (c) return c
    }
    return null
  }
  let c: unknown = g.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return Array.isArray(c) && typeof c[0] === 'number' ? [c[0], c[1] as number] : null
}

// ---- Points from properties (GeoJSON, KML, GPX, shapefile) --------------------

/** A point from a feature's properties, columns recognised as in a table. */
export function pointDepuisProprietes(props: Record<string, unknown>, x: number, y: number, repli: string, z?: number): PointLu {
  const cles = Object.keys(props)
  const entete = trouverEntete([['x', 'y', ...cles]])?.role ?? {}
  // Indices shifted by the two coordinate columns added in front.
  const cle = (r: keyof typeof entete) => {
    const i = entete[r]
    return i !== undefined && i >= 2 ? cles[i - 2] : undefined
  }
  const val = (r: keyof typeof entete) => {
    const k = cle(r)
    const v = k ? props[k] : undefined
    return v === null || v === undefined ? '' : String(v).trim()
  }
  const num = (r: keyof typeof entete) => {
    const k = cle(r)
    return k ? nombre(props[k] as Cell) : null
  }
  const nom = val('nom') || repli
  const typeOrigine = val('type')
  const utilisees = new Set((['nom', 'type', 'description', 'altitude', 'repere', 'profondeur', 'date', 'systeme', 'x', 'y', 'lon', 'lat'] as const).map(cle).filter(Boolean))
  const attributs: Record<string, Valeur> = {}
  for (const k of cles) {
    if (utilisees.has(k)) continue
    const v = props[k]
    if (v === null || v === undefined || v === '' || typeof v === 'object') continue
    if (/^(objectid|fid|globalid|styleurl|stroke.*|fill.*|marker.*)$/i.test(k)) continue
    attributs[k] = typeof v === 'number' ? v : String(v)
  }
  const p: PointLu = { nom, typeOrigine, famille: familleDe(typeOrigine, nom), description: val('description'), x, y, attributs }
  const alt = num('altitude') ?? (z !== undefined && Number.isFinite(z) && z !== 0 ? z : null)
  if (alt !== null) p.altitude = alt
  const rep = num('repere')
  if (rep !== null) p.repere = rep
  const prof = num('profondeur')
  if (prof !== null) p.profondeur = prof
  const d = val('date').match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (d) p.date = d
  return p
}

const nomForme = (props: Record<string, unknown>, repli: string) => {
  for (const k of Object.keys(props)) if (/^(nom|name|libelle|label|titre|title|id|code)$/i.test(normaliser(k))) return String(props[k] ?? '').trim() || repli
  return repli
}

const proprietesSimples = (props: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object').map(([k, v]) => [k, typeof v === 'number' ? v : String(v)])) as Record<string, Valeur>

/** Points and shapes of GeoJSON features. */
export function depuisEntites(entites: { geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }[], prefixe: string) {
  const points: PointLu[] = []
  const formes: FormeLue[] = []
  entites.forEach((f, i) => {
    const g = f.geometry
    const props = f.properties ?? {}
    if (!g) return
    if (g.type === 'Point') points.push(pointDepuisProprietes(props, g.coordinates[0], g.coordinates[1], `${prefixe} ${i + 1}`, g.coordinates[2]))
    else if (g.type === 'MultiPoint') {
      const p0 = pointDepuisProprietes(props, 0, 0, `${prefixe} ${i + 1}`)
      g.coordinates.forEach((c, j) => points.push({ ...p0, nom: g.coordinates.length > 1 ? `${p0.nom}-${j + 1}` : p0.nom, x: c[0], y: c[1], attributs: { ...p0.attributs } }))
    } else formes.push({ nom: nomForme(props, `${prefixe} ${i + 1}`), geometrie: g, attributs: proprietesSimples(props) })
  })
  return { points, formes }
}

// ---- GeoJSON ------------------------------------------------------------------

export function lireGeoJson(texteJson: string, fichier: string, ctx: Contexte = {}): Couche[] {
  let obj: { type?: string; features?: unknown[]; geometry?: unknown; crs?: { properties?: { name?: string } } }
  try {
    obj = JSON.parse(texteJson)
  } catch {
    throw new Error(`${fichier} : ce n’est pas un fichier GeoJSON valide.`)
  }
  const entites =
    obj.type === 'FeatureCollection'
      ? ((obj.features ?? []) as { geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }[])
      : obj.type === 'Feature'
        ? [obj as unknown as { geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }]
        : obj.type && 'coordinates' in obj
          ? [{ geometry: obj as unknown as GeoJSON.Geometry, properties: {} }]
          : null
  if (!entites) throw new Error(`${fichier} : ce n’est pas un fichier GeoJSON (ni « FeatureCollection », ni « Feature »).`)
  const { points, formes } = depuisEntites(entites, 'Objet')
  // RFC 7946 is WGS 84; older files name their system in "crs".
  const declare = obj.crs?.properties?.name ?? null
  return [nouvelleCouche({ nom: fichier, fichier, format: 'geojson', points, formes }, { declare: declare && systemeDepuisLibelle(declare) ? declare : null }, ctx)]
}

// ---- KML and GPX (XML) ------------------------------------------------------------

const elements = (racine: Element | Document, nom: string): Element[] => [...racine.getElementsByTagName('*')].filter((e) => e.localName === nom)
const enfant = (el: Element, nom: string): Element | undefined => [...el.children].find((e) => e.localName === nom)
const texteDe = (el: Element | undefined) => (el?.textContent ?? '').trim()

function analyserXml(texteXml: string, fichier: string): Document {
  if (typeof DOMParser === 'undefined') throw new Error('Lecture XML indisponible dans cet environnement.')
  // CDATA sections (HTML descriptions of Google My Maps) as escaped text:
  // the same content, read alike by every XML parser.
  const sansCdata = texteXml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
  const doc = new DOMParser().parseFromString(sansCdata, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`${fichier} : fichier XML illisible.`)
  return doc
}

/** "lon,lat[,alt] lon,lat…" of KML. */
const coordsKml = (t: string) =>
  t
    .trim()
    .split(/\s+/)
    .map((c) => c.split(',').map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))

function geometrieKml(el: Element): GeoJSON.Geometry | null {
  switch (el.localName) {
    case 'Point': {
      const c = coordsKml(texteDe(enfant(el, 'coordinates')))[0]
      return c ? { type: 'Point', coordinates: c } : null
    }
    case 'LineString':
      return { type: 'LineString', coordinates: coordsKml(texteDe(enfant(el, 'coordinates'))) }
    case 'Polygon': {
      const anneau = (b: Element | undefined) => (b ? coordsKml(texteDe(elements(b, 'coordinates')[0])) : [])
      const ext = anneau(enfant(el, 'outerBoundaryIs'))
      const ints = [...el.children].filter((e) => e.localName === 'innerBoundaryIs').map(anneau)
      return { type: 'Polygon', coordinates: [ext, ...ints] }
    }
    case 'MultiGeometry': {
      const geoms = [...el.children].map(geometrieKml).filter((g): g is GeoJSON.Geometry => !!g)
      return geoms.length === 1 ? geoms[0] : { type: 'GeometryCollection', geometries: geoms }
    }
    default:
      return null
  }
}

export function lireKml(texteXml: string, fichier: string, ctx: Contexte = {}): Couche[] {
  const doc = analyserXml(texteXml, fichier)
  const entites: { geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> }[] = []
  for (const pm of elements(doc, 'Placemark')) {
    const props: Record<string, unknown> = {}
    const nom = texteDe(enfant(pm, 'name'))
    if (nom) props.name = nom
    const desc = texteDe(enfant(pm, 'description')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (desc) props.description = desc
    // The folder a placemark sits in often says what it is ("Piézomètres").
    const dossier = pm.parentElement?.localName === 'Folder' ? texteDe(enfant(pm.parentElement, 'name')) : ''
    for (const d of elements(pm, 'Data')) props[d.getAttribute('name') ?? ''] = texteDe(enfant(d, 'value'))
    for (const d of elements(pm, 'SimpleData')) props[d.getAttribute('name') ?? ''] = texteDe(d)
    if (dossier && !Object.keys(props).some((k) => /^type/i.test(k))) props.type = dossier
    const geom = [...pm.children].map(geometrieKml).find((g) => g)
    entites.push({ geometry: geom ?? null, properties: props })
  }
  if (!entites.length) throw new Error(`${fichier} : aucun repère (Placemark) dans ce fichier KML.`)
  const { points, formes } = depuisEntites(entites, 'Repère')
  return [nouvelleCouche({ nom: fichier, fichier, format: 'kml', points, formes }, { declare: 'WGS84' }, ctx)]
}

export function lireGpx(texteXml: string, fichier: string, ctx: Contexte = {}): Couche[] {
  const doc = analyserXml(texteXml, fichier)
  const entites: { geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> }[] = []
  const lonLat = (e: Element) => [Number(e.getAttribute('lon')), Number(e.getAttribute('lat'))]
  for (const w of elements(doc, 'wpt')) {
    const props: Record<string, unknown> = {}
    for (const k of ['name', 'desc', 'type', 'cmt', 'sym']) {
      const v = texteDe(enfant(w, k))
      if (v) props[k === 'desc' ? 'description' : k] = v
    }
    const ele = Number(texteDe(enfant(w, 'ele')))
    const t = texteDe(enfant(w, 'time'))
    if (t) props.date = t
    entites.push({ geometry: { type: 'Point', coordinates: Number.isFinite(ele) && texteDe(enfant(w, 'ele')) ? [...lonLat(w), ele] : lonLat(w) }, properties: props })
  }
  for (const r of elements(doc, 'rte')) entites.push({ geometry: { type: 'LineString', coordinates: elements(r, 'rtept').map(lonLat) }, properties: { name: texteDe(enfant(r, 'name')) || 'Itinéraire' } })
  for (const t of elements(doc, 'trk')) {
    const segments = elements(t, 'trkseg').map((s) => elements(s, 'trkpt').map(lonLat))
    entites.push({ geometry: segments.length === 1 ? { type: 'LineString', coordinates: segments[0] } : { type: 'MultiLineString', coordinates: segments }, properties: { name: texteDe(enfant(t, 'name')) || 'Trace' } })
  }
  if (!entites.length) throw new Error(`${fichier} : aucun point, itinéraire ni trace dans ce fichier GPX.`)
  const { points, formes } = depuisEntites(entites, 'Point')
  return [nouvelleCouche({ nom: fichier, fichier, format: 'gpx', points, formes }, { declare: 'WGS84' }, ctx)]
}

// ---- Workbooks and CSV -------------------------------------------------------------

export interface Feuille {
  nom: string
  grille: Cell[][]
}

/** Layers of a workbook already split into sheets. */
export function depuisFeuilles(feuilles: Feuille[], fichier: string, ctx: Contexte = {}): Couche[] {
  if (estEquis(feuilles)) {
    const loc = feuilles.find((f) => /^locations?$/i.test(f.nom))!
    const r = lireTableau(loc.grille)
    if (!r || !r.points.length) throw new Error(`${fichier} : l’onglet Locations du format EQuIS ne contient aucun point.`)
    const remarques = [`Format EQuIS (onglet ${loc.nom}).`, ...r.remarques]
    const n = enrichirEquis(r.points, feuilles)
    if (n) remarques.push(`Cote du repère ou profondeur de ${n} ouvrage${n > 1 ? 's' : ''} lue${n > 1 ? 's' : ''} dans les onglets Wells et WellDatum.`)
    return [nouvelleCouche({ nom: fichier, fichier, format: 'equis', points: r.points, remarques }, { declare: null, colonnes: r.colonnesXY }, ctx)]
  }
  const lus = feuilles.map((f) => ({ f, r: lireTableau(f.grille) })).filter((x) => x.r && x.r.points.length)
  if (!lus.length) {
    throw new Error(`${fichier} : aucune colonne de coordonnées reconnue (X et Y, ou longitude et latitude). Le modèle simple à télécharger sur cette page montre la forme attendue.`)
  }
  return lus.map(({ f, r }) =>
    nouvelleCouche(
      { nom: lus.length > 1 ? `${fichier} — ${f.nom}` : fichier, fichier, format: 'tableau', points: r!.points, remarques: [`Colonnes de coordonnées : « ${r!.colonnesXY[0]} » et « ${r!.colonnesXY[1]} ».`, ...r!.remarques] },
      { declare: r!.declare, colonnes: r!.colonnesXY, geographique: r!.geographique },
      ctx,
    ),
  )
}

/** Workbook sheets, without the reference lists of EQuIS templates (rt_*, hidden, thousands of rows). */
async function feuillesClasseur(fichier: File): Promise<Feuille[]> {
  if (/\.(csv|txt)$/i.test(fichier.name)) {
    const { lireFeuilles } = await import('../fichiers')
    return lireFeuilles(fichier)
  }
  const XLSX = await import('xlsx')
  const octets = await fichier.arrayBuffer()
  const noms = XLSX.read(octets, { type: 'array', bookSheets: true }).SheetNames
  const utiles = noms.filter((n) => !/^(rt_|enumerations$|description du format$)/i.test(n))
  const classeur = XLSX.read(octets, { type: 'array', sheets: utiles })
  return utiles
    .filter((n) => classeur.Sheets[n])
    .map((nom) => ({ nom, grille: XLSX.utils.sheet_to_json<Cell[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null }) }))
}

// ---- Shapefiles --------------------------------------------------------------------

interface PiecesShp {
  nom: string
  shp?: ArrayBuffer
  dbf?: ArrayBuffer
  prj?: string
  cpg?: string
}

async function lireShapefile(p: PiecesShp, ctx: Contexte): Promise<Couche> {
  if (!p.shp) throw new Error(`${p.nom} : le fichier .shp manque (un shapefile se dépose avec ses .shp, .dbf et .prj, ou zippé).`)
  const { getShapefile } = await import('shpjs')
  // Without the .prj: coordinates kept as they are, converted here.
  const fc = (await getShapefile({ shp: p.shp, dbf: p.dbf, cpg: p.cpg })) as GeoJSON.FeatureCollection
  const { points, formes } = depuisEntites(fc.features as { geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }[], 'Objet')
  const remarques: string[] = []
  if (!p.dbf) remarques.push('Fichier .dbf absent : objets sans attributs.')
  if (!p.prj) remarques.push('Fichier .prj absent : système deviné d’après les valeurs.')
  return nouvelleCouche({ nom: `${p.nom}.shp`, fichier: `${p.nom}.shp`, format: 'shapefile', points, formes, remarques }, { prj: p.prj }, ctx)
}

async function lireZip(fichier: File, ctx: Contexte): Promise<Couche[]> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await fichier.arrayBuffer())
  const pieces = new Map<string, PiecesShp>()
  const autres: Couche[] = []
  for (const entree of Object.values(zip.files)) {
    if (entree.dir || /__MACOSX|\/\._/.test(entree.name)) continue
    const nom = entree.name.split('/').pop()!
    const e = ext(nom)
    if (['shp', 'dbf', 'prj', 'cpg'].includes(e)) {
      const cle = entree.name.replace(/\.[^.]+$/, '')
      const p = pieces.get(cle) ?? { nom: base(nom) }
      if (e === 'shp') p.shp = await entree.async('arraybuffer')
      if (e === 'dbf') p.dbf = await entree.async('arraybuffer')
      if (e === 'prj') p.prj = await entree.async('string')
      if (e === 'cpg') p.cpg = (await entree.async('string')).trim()
      pieces.set(cle, p)
    } else if (e === 'kml') autres.push(...lireKml(await entree.async('string'), nom, ctx))
    else if (e === 'geojson') autres.push(...lireGeoJson(await entree.async('string'), nom, ctx))
    else if (e === 'gpx') autres.push(...lireGpx(await entree.async('string'), nom, ctx))
  }
  const couches = [...autres]
  for (const p of pieces.values()) if (p.shp) couches.push(await lireShapefile(p, ctx))
  if (!couches.length) throw new Error(`${fichier.name} : aucun shapefile, KML, GeoJSON ni GPX dans cette archive.`)
  return couches
}

// ---- Entry point -----------------------------------------------------------------------

export interface ResultatLecture {
  couches: Couche[]
  erreurs: string[]
}

/**
 * Layers of the dropped files. Files of one shapefile dropped together
 * (.shp, .dbf, .prj, .cpg) are read as one layer; a file that cannot be read
 * gives an error and does not stop the others.
 */
export async function lireFichiers(fichiers: File[], ctx: Contexte = {}): Promise<ResultatLecture> {
  const couches: Couche[] = []
  const erreurs: string[] = []
  const shp = new Map<string, PiecesShp>()
  // Points already read in this batch settle the systems of the next files.
  const contexte = (): Contexte => {
    if (ctx.reference) return ctx
    const c = couches.find((k) => k.systeme === WGS84 && k.points.some((p) => p.x !== null))
    const p = c?.points.find((q) => q.x !== null)
    return p ? { reference: [p.x!, p.y!] } : ctx
  }
  for (const f of fichiers) {
    const e = ext(f.name)
    try {
      if (['shp', 'dbf', 'prj', 'cpg', 'shx'].includes(e)) {
        const p = shp.get(base(f.name)) ?? { nom: base(f.name) }
        if (e === 'shp') p.shp = await f.arrayBuffer()
        if (e === 'dbf') p.dbf = await f.arrayBuffer()
        if (e === 'prj') p.prj = await f.text()
        if (e === 'cpg') p.cpg = (await f.text()).trim()
        shp.set(base(f.name), p)
      } else if (['xlsx', 'xlsm', 'xls', 'ods', 'csv', 'txt'].includes(e)) couches.push(...depuisFeuilles(await feuillesClasseur(f), f.name, contexte()))
      else if (e === 'geojson' || e === 'json') couches.push(...lireGeoJson(await f.text(), f.name, contexte()))
      else if (e === 'kml') couches.push(...lireKml(await f.text(), f.name, contexte()))
      else if (e === 'kmz') {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(await f.arrayBuffer())
        const kml = Object.values(zip.files).find((z) => /\.kml$/i.test(z.name))
        if (!kml) throw new Error(`${f.name} : aucun fichier KML dans cette archive KMZ.`)
        couches.push(...lireKml(await kml.async('string'), f.name, contexte()))
      } else if (e === 'gpx') couches.push(...lireGpx(await f.text(), f.name, contexte()))
      else if (e === 'zip') couches.push(...(await lireZip(f, contexte())))
      else if (e === 'dxf' || e === 'dwg') throw new Error(`${f.name} : les plans DAO (DXF, DWG) ne sont pas lus. Exporter les points en CSV ou en shapefile depuis le logiciel de DAO ou de SIG.`)
      else throw new Error(`${f.name} : format non reconnu. Formats lus : Excel, CSV, GeoJSON, KML/KMZ, GPX, shapefile (.zip ou .shp + .dbf + .prj).`)
    } catch (err) {
      erreurs.push(err instanceof Error ? err.message : String(err))
    }
  }
  for (const p of shp.values()) {
    try {
      couches.push(await lireShapefile(p, contexte()))
    } catch (err) {
      erreurs.push(err instanceof Error ? err.message : String(err))
    }
  }
  return { couches, erreurs }
}
