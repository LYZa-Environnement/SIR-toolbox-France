/**
 * The sources of the model put together: boreholes matched by name across
 * sources (a later source completes or replaces an earlier one), soil
 * results attached to the samples of the boreholes, and the groundwater
 * monitoring consolidated by the Suivi temporel's own code (campaigns,
 * wells, compounds in a common unit, heads).
 */

import { cleOuvrage } from '../resultats/campagnes.ts'
import { lireProfondeur } from '../resultats/expert/profondeur.ts'
import { facteurUnite } from '../resultats/guides.ts'
import { CORRECTIONS_VIDES, construireBase, placerLots, type Base, type CampagneSaisie, type Corrections, type Lot, type Releve } from '../suivi/modele.ts'
import { cleSol } from './logs.ts'
import type { EchantillonSol, Forage, LectureSol, OuvrageDecrit, ParametreSol, Source, ValeurSol } from './types.ts'

/** A soil gas result set at a probe, matched with a borehole by name. */
export interface MesureGaz {
  /** Borehole key (cleOuvrage of the point's name). */
  cle: string
  nom: string
  fichier: string
  date: string
  resultats: Record<string, ValeurSol>
}

export interface Donnees {
  forages: Forage[]
  parametresSol: ParametreSol[]
  /** Soil gas, in µg/m³. */
  parametresGaz: ParametreSol[]
  gaz: MesureGaz[]
  /** Outline of the site's parcels (Lambert 93 rings), when a source gives it. */
  parcelles: [number, number][][] | null
  base: Base | null
  corrections: Corrections
  avertissements: string[]
}

const normUnite = (u: string) => u.toLowerCase().replace(/\s+/g, '').replace('μ', 'µ').replace(/^ug/, 'µg')

const proche = (a: number, b: number) => Math.abs(a - b) < 0.05

/** Sample names compared as the lab and the field sheet write them: "PZ1 (0,5-1 m)" = "pz1 0.5-1". */
const cleEchantillon = (id: string) =>
  id
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s*M\b/g, '')
    .replace(/[^A-Z0-9.]+/g, '')

function fusionnerEchantillons(a: EchantillonSol[], b: EchantillonSol[]): EchantillonSol[] {
  const liste = a.map((e) => ({ ...e, resultats: { ...e.resultats } }))
  for (const e of b) {
    const meme = liste.find((x) => cleEchantillon(x.id) === cleEchantillon(e.id) || (proche(x.de, e.de) && proche(x.a, e.a)))
    if (!meme) liste.push({ ...e, resultats: { ...e.resultats } })
    else {
      Object.assign(meme.resultats, e.resultats)
      if (!meme.date) meme.date = e.date
    }
  }
  return liste.sort((p, q) => p.de - q.de)
}

/** A borehole met again in a later source: what the later one gives wins, what it lacks is kept. */
function fusionnerForage(avant: Forage, apres: Forage): Forage {
  return {
    ...apres,
    x: apres.x ?? avant.x,
    y: apres.y ?? avant.y,
    z: apres.z ?? avant.z,
    profondeur: Math.max(apres.profondeur, apres.lithologie.length ? 0 : avant.profondeur),
    lithologie: apres.lithologie.length ? apres.lithologie : avant.lithologie,
    equipement: apres.equipement.length ? apres.equipement : avant.equipement,
    pid: apres.pid.length ? apres.pid : avant.pid,
    observations: apres.observations.length ? apres.observations : avant.observations,
    niveauEau: apres.niveauEau ?? avant.niveauEau,
    echantillons: fusionnerEchantillons(avant.echantillons, apres.echantillons),
    date: apres.date || avant.date,
  }
}

/**
 * Soil parameters of a source registered, brought to the unit already met
 * for them; another kind of unit makes another parameter. Returns the
 * conversion of that source's results.
 */
function harmoniser(parametres: Map<string, ParametreSol>, source: ParametreSol[]): (r: Record<string, ValeurSol>) => Record<string, ValeurSol> {
  const renommer = new Map<string, { cle: string; facteur: number }>()
  for (const p of source) {
    const deja = parametres.get(p.cle)
    if (!deja) {
      parametres.set(p.cle, p)
      continue
    }
    if (normUnite(deja.unite) === normUnite(p.unite)) continue
    const f = facteurUnite(p.unite, deja.unite)
    if (f !== null) renommer.set(p.cle, { cle: p.cle, facteur: f })
    else {
      const cle = `${p.cle}@${normUnite(p.unite)}`
      renommer.set(p.cle, { cle, facteur: 1 })
      if (!parametres.has(cle)) parametres.set(cle, { ...p, cle })
    }
  }
  return (resultats) => {
    if (!renommer.size) return resultats
    const r: Record<string, ValeurSol> = {}
    for (const [k, v] of Object.entries(resultats)) {
      const n = renommer.get(k)
      r[n?.cle ?? k] = n && n.facteur !== 1 && v.valeur !== null ? { ...v, valeur: v.valeur * n.facteur } : v
    }
    return r
  }
}

/**
 * Soil lab results attached to the boreholes by sample name: "S3 (0,5-1 m)"
 * goes to borehole S3 between 0.5 and 1 m, onto the sample of the log at
 * the same depths when there is one.
 */
function rattacherSols(forages: Map<string, Forage>, parametres: Map<string, ParametreSol>, sols: LectureSol[]): string[] {
  const nonRattaches: string[] = []
  for (const s of sols) {
    const params = s.lecture.parametres.CM
    const temp: ParametreSol[] = params.map((p) => {
      const eluat = /[ée]luat|lixiv/i.test(p.famille) || /[ée]luat|lixiv/i.test(p.nom)
      return { cle: cleSol(p.nom, p.cas, eluat), nom: p.nom, cas: p.cas, unite: p.unite, famille: p.famille, eluat }
    })
    const convertir = harmoniser(parametres, temp)
    for (const pt of s.lecture.points) {
      const prof = lireProfondeur(pt.nom)
      const f = prof ? forages.get(cleOuvrage(prof.sondage)) : undefined
      if (!prof || !f) {
        nonRattaches.push(pt.nom)
        continue
      }
      const resultats: Record<string, ValeurSol> = {}
      const valeurs = s.lecture.valeurs.CM[pt.nom] ?? {}
      params.forEach((p, i) => {
        const m = valeurs[p.cle]
        if (m && (m.valeur !== null || m.inferieur)) resultats[temp[i].cle] = { valeur: m.valeur, inferieur: m.inferieur, brut: m.brut }
      })
      f.echantillons = fusionnerEchantillons(f.echantillons, [{ id: pt.nom, de: prof.haut, a: prof.bas, date: s.date, resultats: convertir(resultats) }])
      if (prof.bas > f.profondeur) f.profondeur = prof.bas
    }
  }
  return nonRattaches
}

export function assembler(sources: Source[]): Donnees {
  const avertissements: string[] = []
  const forages = new Map<string, Forage>()
  const parametres = new Map<string, ParametreSol>()
  for (const s of sources) {
    const convertir = harmoniser(parametres, s.parametresSol)
    const copies = s.forages.map((f) => ({ ...f, echantillons: f.echantillons.map((e) => ({ ...e, resultats: convertir({ ...e.resultats }) })) }))
    for (const f of copies) {
      const avant = forages.get(f.cle)
      forages.set(f.cle, avant ? fusionnerForage(avant, f) : f)
    }
  }
  const nonRattaches = rattacherSols(
    forages,
    parametres,
    sources.flatMap((s) => s.sols),
  )
  if (nonRattaches.length)
    avertissements.push(
      `Échantillons de sol sans forage correspondant (nom attendu : forage puis profondeurs, « S3 (0,5-1 m) ») : ${nonRattaches.slice(0, 12).join(', ')}${nonRattaches.length > 12 ? '…' : ''}.`,
    )

  // Groundwater: the campaigns of Suivi temporel as the user grouped them, the other lots placed in them.
  const eaux = sources.flatMap((s) => (s.eaux ? [s.eaux] : []))
  const lots: Lot[] = eaux.flatMap((e) => e.lots)
  const releves: Releve[] = eaux.flatMap((e) => e.releves)
  const ouvragesDecrits: OuvrageDecrit[] = eaux.flatMap((e) => e.ouvrages)
  const corrections = eaux.find((e) => e.corrections)?.corrections ?? CORRECTIONS_VIDES
  let campagnes: CampagneSaisie[] = eaux.find((e) => e.campagnes.length)?.campagnes ?? []
  const places = new Set(campagnes.flatMap((c) => c.lots))
  campagnes = placerLots(
    campagnes,
    lots.filter((l) => !places.has(l.id)),
  )
  let base: Base | null = null
  if (lots.length || releves.length) {
    try {
      base = construireBase({ lots, campagnes, releves, ouvragesDecrits, corrections })
      if (base.sansDate.length) avertissements.push(`${base.sansDate.length} campagne(s) d'eaux souterraines sans date, laissée(s) de côté : datez-les dans Suivi temporel.`)
    } catch (e) {
      avertissements.push(`Eaux souterraines : les données n'ont pas pu être réunies (${(e as Error).message}).`)
    }
  }

  // Soil gas: concentrations brought to µg/m³, each probe matched with a borehole by name.
  const parametresGaz = new Map<string, ParametreSol>()
  const gaz: MesureGaz[] = []
  for (const l of sources.flatMap((s) => s.gaz ?? [])) {
    const facteurs = new Map(l.parametres.map((p) => [p.cle, facteurUnite(p.unite, 'µg/m³') ?? 1]))
    for (const p of l.parametres) if (!parametresGaz.has(p.cle)) parametresGaz.set(p.cle, { ...p, unite: facteurUnite(p.unite, 'µg/m³') === null ? p.unite : 'µg/m³' })
    for (const [nom, valeurs] of Object.entries(l.points)) {
      const resultats: Record<string, ValeurSol> = {}
      for (const [k, v] of Object.entries(valeurs)) {
        const f = facteurs.get(k) ?? 1
        resultats[k] = f === 1 || v.valeur === null ? v : { ...v, valeur: v.valeur * f, brut: `${v.inferieur ? '<' : ''}${String(Number((v.valeur * f).toPrecision(3))).replace('.', ',')}` }
      }
      gaz.push({ cle: cleOuvrage(nom), nom, fichier: l.fichier, date: l.date, resultats })
    }
  }
  const sansForage = gaz.filter((g) => !forages.has(g.cle)).map((g) => g.nom)
  if (sansForage.length) avertissements.push(`Gaz du sol sans forage du même nom (non placés) : ${sansForage.join(', ')}.`)

  const liste = [...forages.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }))
  const utilises = new Set(liste.flatMap((f) => f.echantillons.flatMap((e) => Object.keys(e.resultats))))
  return {
    forages: liste,
    parametresSol: [...parametres.values()].filter((p) => utilises.has(p.cle)),
    parametresGaz: [...parametresGaz.values()],
    gaz: gaz.filter((g) => forages.has(g.cle)),
    parcelles: sources.find((s) => s.parcelles?.length)?.parcelles ?? null,
    base,
    corrections,
    avertissements: [...avertissements, ...sources.flatMap((s) => s.avertissements.map((a) => `${s.nom} : ${a}`))],
  }
}
