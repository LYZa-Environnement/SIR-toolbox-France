/**
 * One table per campaign: wells × parameters, gathered from the sampling
 * sheets (field parameters), the lab files (everything else) and what the
 * user typed, which always wins.
 *
 * Lab samples are matched to wells by name (`cleOuvrage`), the user
 * correcting the match where needed; a lab sample matching no sheet is a
 * well of its own.
 */

import type { Lecture } from '../resultats/parse.ts'
import { cleOuvrage, type FicheTerrain } from './fiches.ts'
import { depuisMesure, lireSaisie, PARAMS, reconnaitre, type ParamId, type Reconnu, type Valeur } from './parametres.ts'

export interface Ouvrage {
  cle: string
  nom: string
  fiche?: FicheTerrain
  /** Lab sample names matched to this well. */
  echantillons: string[]
  date: string
}

export interface Jeu {
  ouvrages: Ouvrage[]
  valeurs: Record<string, Partial<Record<ParamId, Valeur>>>
  /** Lab rows recognised, per parameter, for the user to check. */
  reconnus: Partial<Record<ParamId, string[]>>
  /** Rows with a known name but a unit not understood. */
  unitesIgnorees: string[]
}

export interface Entrees {
  fiches: FicheTerrain[]
  labo: { lecture: Lecture; nom: string } | null
  /** Lab sample name → well key ('' = left out). Missing: automatic match. */
  association: Record<string, string>
  /** `${cle}|${param}` → typed text ('' clears the value). */
  saisies: Record<string, string>
  /** Wells added by hand. */
  ajouts: string[]
}

/** The automatic match of a lab sample: the sheet with the same key, else itself. */
export function associationAuto(nomEchantillon: string, fiches: FicheTerrain[]): string {
  const cle = cleOuvrage(nomEchantillon)
  const f = fiches.find((x) => cleOuvrage(x.ouvrage) === cle) ?? fiches.find((x) => cleOuvrage(x.onglet) === cle)
  return f ? cleOuvrage(f.ouvrage) : cle
}

const PRIORITE_FER: Reconnu[] = ['fe2', 'fe-dissous', 'fe-total']
const COMPOSES_BTEX: Reconnu[] = ['benzene', 'toluene', 'ethylbenzene', 'xylenes', 'mpxylene', 'oxylene']
/** The parameter a recognised row feeds (iron forms → Fe²⁺, BTEX compounds → their sum). */
const idCible = (r: Reconnu): ParamId => (PRIORITE_FER.includes(r) ? 'fe2' : COMPOSES_BTEX.includes(r) ? 'btex' : (r as ParamId))
const NOTE_FER: Partial<Record<Reconnu, string>> = {
  'fe-dissous': 'Fer dissous retenu comme indicateur du fer ferreux',
  'fe-total': 'Fer total (échantillon non filtré) : majore le fer ferreux, à confirmer par une mesure de Fe²⁺',
}

export function construireJeu(e: Entrees): Jeu {
  const ouvrages: Ouvrage[] = []
  const parCle = new Map<string, Ouvrage>()
  const ajouter = (cle: string, nom: string): Ouvrage => {
    let o = parCle.get(cle)
    if (!o) {
      o = { cle, nom, echantillons: [], date: '' }
      parCle.set(cle, o)
      ouvrages.push(o)
    }
    return o
  }
  const valeurs: Jeu['valeurs'] = {}
  const poser = (cle: string, id: ParamId, v: Valeur, ecraser = false) => {
    const t = (valeurs[cle] ??= {})
    if (!t[id] || ecraser) t[id] = v
  }

  // 1. Sampling sheets: field parameters at the end of the purge.
  for (const f of e.fiches) {
    const cle = cleOuvrage(f.ouvrage)
    if (f.vide) {
      // An empty sheet still names a well a lab sample can be matched to.
      continue
    }
    const o = ajouter(cle, f.ouvrage)
    o.fiche ??= f
    o.date ||= f.date
    for (const p of ['ph', 'orp', 'od', 'ce', 't'] as const) {
      const fin = f.finale[p]
      if (!fin) continue
      poser(cle, p, {
        valeur: fin.valeur,
        inferieur: false,
        source: `Fiche ${f.onglet}`,
        note: fin.anterieure ? 'Non mesuré en fin de purge : dernière valeur relevée avant' : undefined,
      })
    }
  }

  // 2. Lab results.
  const reconnus: Jeu['reconnus'] = {}
  const unitesIgnorees: string[] = []
  if (e.labo) {
    const { lecture, nom: fichier } = e.labo
    const params = lecture.parametres.CM
    const roles = params.map((p) => ({ p, role: reconnaitre(p) }))
    for (const { p, role } of roles) {
      if (!role) continue
      const id = idCible(role)
      if (PARAMS.some((d) => d.id === id)) (reconnus[id] ??= []).push(`${p.nom} (${p.unite})`)
    }
    for (const point of lecture.points) {
      const choix = e.association[point.nom]
      const cle = choix === undefined ? associationAuto(point.nom, e.fiches) : choix
      if (!cle) continue
      const fiche = e.fiches.find((f) => cleOuvrage(f.ouvrage) === cle)
      const o = ajouter(cle, fiche?.ouvrage ?? point.nom)
      if (fiche && !o.fiche) o.fiche = fiche
      o.date ||= fiche?.date ?? ''
      o.echantillons.push(point.nom)
      const mesures = lecture.valeurs.CM[point.nom] ?? {}
      const lus = new Map<Reconnu, Valeur>()
      for (const { p, role } of roles) {
        if (!role) continue
        const m = mesures[p.cle]
        if (!m) continue
        const v = depuisMesure(m, p.unite, idCible(role), p.nom, fichier)
        if (!v) {
          const t = `${p.nom} (${p.unite})`
          if (!unitesIgnorees.includes(t)) unitesIgnorees.push(t)
          continue
        }
        // Several totals (C10-C40, C5-C40): the widest range, i.e. the largest.
        const deja = lus.get(role)
        if (!deja || (role === 'hc' && !v.inferieur && (deja.inferieur || v.valeur > deja.valeur))) lus.set(role, v)
      }
      // Iron: the best form available.
      for (const r of PRIORITE_FER) {
        const v = lus.get(r)
        if (v) {
          poser(cle, 'fe2', { ...v, note: NOTE_FER[r] })
          break
        }
      }
      // BTEX: the lab's sum, else the sum of the compounds.
      const btex = lus.get('btex')
      if (btex) poser(cle, 'btex', btex)
      else {
        const xyl = lus.get('xylenes') ? [lus.get('xylenes')!] : (['mpxylene', 'oxylene'] as Reconnu[]).map((r) => lus.get(r)).filter((v): v is Valeur => !!v)
        const composes = [...(['benzene', 'toluene', 'ethylbenzene'] as Reconnu[]).map((r) => lus.get(r)).filter((v): v is Valeur => !!v), ...xyl]
        if (composes.length) {
          const quantifies = composes.filter((v) => !v.inferieur)
          poser(cle, 'btex', {
            valeur: quantifies.length ? quantifies.reduce((s, v) => s + v.valeur, 0) : Math.max(...composes.map((v) => v.valeur)),
            inferieur: !quantifies.length,
            source: fichier,
            note: `Somme calculée de ${composes.length} composé${composes.length > 1 ? 's' : ''} (valeurs < LQ comptées nulles)`,
          })
        }
      }
      for (const [role, v] of lus) {
        if (PRIORITE_FER.includes(role) || role === 'btex' || !PARAMS.some((d) => d.id === role)) continue
        const id = role as ParamId
        const terrain = ['ph', 'orp', 'od', 'ce', 't'].includes(id)
        poser(cle, id, terrain ? { ...v, note: 'Mesure du laboratoire (pas de mesure de terrain)' } : v)
      }
    }
  }

  // 3. Wells added by hand, then typed values.
  for (const nom of e.ajouts) ajouter(cleOuvrage(nom), nom)
  for (const [k, texte] of Object.entries(e.saisies)) {
    const [cle, id] = k.split('|') as [string, ParamId]
    if (!parCle.has(cle)) continue
    const lu = lireSaisie(texte)
    if (lu === undefined) continue
    if (lu === null) {
      if (valeurs[cle]) delete valeurs[cle][id]
      continue
    }
    poser(cle, id, { ...lu, source: 'Saisie' }, true)
  }

  return { ouvrages, valeurs, reconnus, unitesIgnorees }
}

/** The offset to bring the measured redox to the hydrogen electrode, read from the sheets. */
export function decalageFiches(fiches: FicheTerrain[]): number | null {
  const d = fiches.map((f) => f.decalage).filter((x): x is number => x !== null)
  if (!d.length) return null
  d.sort((a, b) => a - b)
  return d[Math.floor(d.length / 2)]
}
