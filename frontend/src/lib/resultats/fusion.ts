/**
 * Several lab files of one campaign merged into one reading: a lab may
 * report a campaign in two files (two orders, two batches, metals apart
 * from organics). Samples are matched by name — the same sample in both
 * files is one column, its results gathered —, parameters by CAS number,
 * else by name; a parameter met in another unit of the same kind is
 * converted to the first file's unit.
 */

import { facteurUnite, normaliser } from './guides.ts'
import { LectureImpossible, type Couche, type Lecture, type Mesure, type Parametre, type Point } from './parse.ts'

const CAS = /^\d{2,7}-\d{2}-\d$/
const cleNom = (nom: string) => nom.trim().replace(/\s+/g, ' ').toLowerCase()
const unite = (u: string) => u.toLowerCase().replace(/\s+/g, '')

export interface Fusion {
  lecture: Lecture
  /** What the merge did, for the user to check. */
  notes: string[]
}

export function fusionnerLectures(fichiers: { lecture: Lecture; nom: string }[]): Fusion {
  if (fichiers.length === 1) return { lecture: fichiers[0].lecture, notes: [] }
  const modes = new Set(fichiers.map((f) => f.lecture.mode))
  if (modes.size > 1) {
    throw new LectureImpossible(
      'Ces fichiers ne sont pas de même nature (masses par support pour l’un, concentrations dans l’air pour l’autre) : ils ne peuvent pas être réunis dans un même tableau.',
    )
  }
  const points: Point[] = []
  const parPoint = new Map<string, Point>()
  const parametres: Record<Couche, Parametre[]> = { CM: [], CC: [] }
  const valeurs: Lecture['valeurs'] = { CM: {}, CC: {} }
  let communs = 0
  const conflits: string[] = []
  let convertis = 0

  for (const { lecture: l } of fichiers) {
    // Samples: one column per sample name, whichever file brings it.
    const noms = new Map<string, string>()
    for (const p of l.points) {
      const vu = parPoint.get(cleNom(p.nom))
      if (vu) {
        communs++
        noms.set(p.nom, vu.nom)
        for (const [c, lib] of Object.entries(p.libelles) as [Couche, string][]) vu.libelles[c] ??= lib
        continue
      }
      const point = { nom: p.nom, libelles: { ...p.libelles } }
      points.push(point)
      parPoint.set(cleNom(p.nom), point)
      noms.set(p.nom, p.nom)
    }
    for (const c of ['CM', 'CC'] as Couche[]) {
      // Rows of the earlier files only: two rows of one file stay two rows
      // (naphthalene among the PAH and among the volatiles).
      const anterieurs = new Set(parametres[c])
      for (const pa of l.parametres[c]) {
        // The same parameter: by CAS number, else by name, in a unit of
        // the same kind (µg/l and mg/l, not µg/l and mg/kg).
        const memes = (x: Parametre) => (CAS.test(pa.cas) && CAS.test(x.cas) ? x.cas === pa.cas : normaliser(x.nom) === normaliser(pa.nom))
        let cible = parametres[c].find((x) => anterieurs.has(x) && memes(x) && (unite(x.unite) === unite(pa.unite) || facteurUnite(pa.unite, x.unite) !== null))
        let f = 1
        if (cible && unite(cible.unite) !== unite(pa.unite)) f = facteurUnite(pa.unite, cible.unite)!
        if (!cible) {
          let cle = pa.cle
          if (parametres[c].some((x) => x.cle === cle)) cle = `${pa.cle}|${unite(pa.unite)}`
          for (let k = 2; parametres[c].some((x) => x.cle === cle); k++) cle = `${pa.cle}|${k}`
          cible = { ...pa, cle }
          // New rows go with their family, after the last one of it.
          const dernier = parametres[c].map((x) => x.famille).lastIndexOf(pa.famille)
          parametres[c].splice(dernier >= 0 ? dernier + 1 : parametres[c].length, 0, cible)
        } else if (f !== 1) convertis++
        for (const [ancien, nouveau] of noms) {
          const m = l.valeurs[c][ancien]?.[pa.cle]
          if (!m) continue
          const ligne = (valeurs[c][nouveau] ??= {})
          // Rounded to 12 digits: 0,003 mg/l is 3 µg/l, not 3,0000000000000004.
          const v = m.valeur === null ? null : Number((m.valeur * f).toPrecision(12))
          const conv: Mesure = f === 1 || v === null ? m : { brut: `${m.inferieur ? '<' : ''}${Number(v.toPrecision(6))}`, valeur: v, inferieur: m.inferieur }
          const deja = ligne[cible.cle]
          if (deja) {
            // Both files report it: the first one is kept.
            const egal = (a: number | null, b: number | null) => a === b || (a !== null && b !== null && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)))
            if (!egal(deja.valeur, conv.valeur) || deja.inferieur !== conv.inferieur) conflits.push(`${cible.nom}, ${nouveau} : ${deja.brut.replace(".", ",")} / ${conv.brut.replace(".", ",")}`)
            continue
          }
          ligne[cible.cle] = conv
        }
      }
    }
  }

  const notes: string[] = []
  if (communs) notes.push(`${communs} échantillon${communs > 1 ? 's' : ''} présent${communs > 1 ? 's' : ''} dans plusieurs fichiers : une seule colonne, résultats regroupés.`)
  if (convertis) notes.push(`${convertis} paramètre${convertis > 1 ? 's' : ''} rendu${convertis > 1 ? 's' : ''} dans une autre unité, converti${convertis > 1 ? 's' : ''} dans celle du premier fichier.`)
  if (conflits.length) {
    const n = conflits.length
    notes.push(
      `${n} résultat${n > 1 ? 's' : ''} donné${n > 1 ? 's' : ''} différemment par deux fichiers pour le même échantillon, la valeur du premier fichier est retenue : ${conflits.slice(0, 6).join(' ; ')}${n > 6 ? ' ; …' : ''}.`,
    )
  }
  return {
    lecture: {
      points,
      parametres,
      valeurs,
      coucheControle: parametres.CC.length > 0,
      lignesIgnorees: [...new Set(fichiers.flatMap((f) => f.lecture.lignesIgnorees))],
      unites: [...new Set(fichiers.flatMap((f) => f.lecture.unites))],
      mode: fichiers[0].lecture.mode,
      feuille: [...new Set(fichiers.map((f) => f.lecture.feuille).filter(Boolean))].join(', '),
    },
    notes,
  }
}
