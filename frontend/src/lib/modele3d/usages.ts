/**
 * Use of the buildings around and on the site, for the conceptual model and
 * the 3D view: who is exposed, and how long, depends on it (residents,
 * children included, around the clock; workers and the public a working
 * day) — the IEM and the management plan reason by use (MTES,
 * « Méthodologie nationale de gestion des sites et sols pollués », avril
 * 2017). Schools, nurseries and other sensitive establishments fall under
 * « Commercial et services » and are to be checked on site (circulaire du
 * 8 février 2007 relative à l’implantation sur des sols pollués
 * d’établissements accueillant des populations sensibles).
 *
 * Source: IGN BD TOPO® V3, `batiment` layer. `usage_1` and `usage_2` (main
 * and secondary use: Agricole, Annexe, Commercial et services, Industriel,
 * Religieux, Résidentiel, Sportif, Indifférencié) come from the DGFiP land
 * files (Fichiers fonciers) matched with the building; so does
 * `nombre_de_logements`. When the use is « Indifférencié », the number of
 * dwellings, then the older `nature` attribute (« Industriel, agricole ou
 * commercial », « Serre », « Silo »…) give a hint, flagged as deduced.
 * (IGN, « BD TOPO® Version 3 — Descriptif de contenu », thème Bâti.)
 */

export type CategorieUsage = 'residentiel' | 'commercial' | 'industriel' | 'agricole' | 'activite' | 'autre'

/**
 * Colour code, checked for colour-vision deficiencies on the scene's light
 * background: amber for housing and violet for industry follow the usual
 * land-use maps (PLU, MOS); the three uses that matter most (residential,
 * commercial, industrial) are the strongest hues, uncertain or minor uses
 * recede (a tint of the industrial violet, a neutral grey).
 */
export const USAGES: Record<CategorieUsage, { libelle: string; couleur: string; occupants: string; singulier: string; pluriel: string }> = {
  residentiel: { libelle: 'Résidentiel', couleur: '#f2a600', occupants: 'habitants, enfants compris, présents la plus grande partie du temps', singulier: 'résidentiel', pluriel: 'résidentiels' },
  commercial: { libelle: 'Commercial et services', couleur: '#c2396e', occupants: 'travailleurs et public accueilli (commerces, bureaux, services, établissements recevant du public)', singulier: 'commercial ou de services', pluriel: 'commerciaux ou de services' },
  industriel: { libelle: 'Industriel', couleur: '#5b44d6', occupants: 'travailleurs', singulier: 'industriel', pluriel: 'industriels' },
  agricole: { libelle: 'Agricole', couleur: '#7d8f3a', occupants: 'exploitants, élevages et récoltes', singulier: 'agricole', pluriel: 'agricoles' },
  activite: { libelle: 'Activité sans précision', couleur: '#a99be8', occupants: 'industriel, agricole ou commercial, sans plus de précision', singulier: 'd’activité sans précision', pluriel: 'd’activité sans précision' },
  autre: { libelle: 'Autre usage ou non renseigné', couleur: '#d6d1c8', occupants: 'annexe, religieux, sportif, ou usage non renseigné : à vérifier sur place', singulier: 'd’autre usage ou non renseigné', pluriel: 'd’autre usage ou non renseigné' },
}

export const ORDRE_USAGES: CategorieUsage[] = ['residentiel', 'commercial', 'industriel', 'agricole', 'activite', 'autre']

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** BD TOPO `usage_1` / `usage_2` value → category (null: « Indifférencié » or missing). */
function depuisUsage(u: string | null): CategorieUsage | null {
  const s = sansAccents(u ?? '')
  if (!s || s.startsWith('indifferenci')) return null
  if (s.startsWith('residenti')) return 'residentiel'
  if (s.startsWith('commerci')) return 'commercial'
  if (s.startsWith('industri')) return 'industriel'
  if (s.startsWith('agricol')) return 'agricole'
  return 'autre'
}

/** BD TOPO `nature` → category, for buildings of undifferentiated use. */
function depuisNature(n: string | null): CategorieUsage | null {
  const s = sansAccents(n ?? '')
  if (/industriel, agricole ou commercial/.test(s)) return 'activite'
  if (/^(serre|silo)/.test(s)) return 'agricole'
  return null
}

export interface AttributsBatiment {
  usage1: string | null
  usage2: string | null
  nature: string | null
  /** Number of dwellings (Fichiers fonciers), when given. */
  logements: number | null
}

export interface Classement {
  categorie: CategorieUsage
  /** Secondary use when it differs from the main one (the roof in the 3D view). */
  secondaire: CategorieUsage | null
  /** How a category was deduced when the use is not given, or null. */
  deduit: string | null
  /** Someone lives there: residential, or dwellings counted. */
  habite: boolean
}

/** Category of a building from its BD TOPO attributes. */
export function classerBatiment(a: AttributsBatiment): Classement {
  const c1 = depuisUsage(a.usage1)
  const c2 = depuisUsage(a.usage2)
  const logements = (a.logements ?? 0) > 0
  let categorie: CategorieUsage
  let deduit: string | null = null
  if (c1) categorie = c1
  else if (c2) {
    categorie = c2
    deduit = 'usage secondaire dans la BD TOPO'
  } else if (logements) {
    categorie = 'residentiel'
    deduit = 'logements recensés dans les Fichiers fonciers'
  } else {
    const n = depuisNature(a.nature)
    categorie = n ?? 'autre'
    if (n) deduit = 'nature du bâtiment dans la BD TOPO'
  }
  const secondaire = c2 && c2 !== categorie ? c2 : logements && categorie !== 'residentiel' ? 'residentiel' : null
  return { categorie, secondaire, deduit, habite: categorie === 'residentiel' || secondaire === 'residentiel' }
}

/** Number of buildings of each category, in the legend's order (absent categories left out). */
export function compterUsages(liste: { categorie: CategorieUsage }[]): [CategorieUsage, number][] {
  return ORDRE_USAGES.map((c): [CategorieUsage, number] => [c, liste.filter((b) => b.categorie === c).length]).filter(([, n]) => n > 0)
}

/** « 2 bâtiments résidentiels », « 3 bâtiments (2 résidentiels, 1 industriel) ». */
export function resumeUsages(liste: { categorie: CategorieUsage }[]): string {
  const n = liste.length
  const total = `${n} bâtiment${n > 1 ? 's' : ''}`
  const compte = compterUsages(liste)
  if (compte.length === 1) return `${total} ${n > 1 ? USAGES[compte[0][0]].pluriel : USAGES[compte[0][0]].singulier}`
  return compte.length ? `${total} (${compte.map(([c, k]) => `${k} ${k > 1 ? USAGES[c].pluriel : USAGES[c].singulier}`).join(', ')})` : total
}
