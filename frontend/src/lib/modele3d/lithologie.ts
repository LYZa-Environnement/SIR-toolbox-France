/**
 * Lithology classes of the 3D model. A log's keyword ("SABLE ARGILEUX",
 * "Remblais sablo-graveleux") is read as the logs do (logs-forage.html,
 * LIT_TOKENS): its components in the order they are written, the first
 * one being the main one — "SABLE ARGILEUX" is a sand, "ARGILE SABLEUSE" a
 * clay. The model correlates boreholes on that main component.
 *
 * The colours are the logs' pale tints, deepened so that they still read
 * on a shaded 3D block.
 */

export interface ClasseLitho {
  id: string
  libelle: string
  couleur: string
}

const TOKENS: [string, RegExp][] = [
  ['veg', /TERRE VEGETALE|TOPSOIL/],
  ['asph', /ASPHALTE|ENROBE|BITUME/],
  ['beton', /BETON|CIMENT|DALLE/],
  ['remb', /REMBLAI/],
  ['tourbe', /TOURBE/],
  ['granite', /GRANITE/],
  ['gneiss', /GNEISS/],
  ['schist', /SCHIST/],
  ['gypse', /GYPSE/],
  ['conglo', /CONGLOMERAT/],
  ['craie', /CRAIE|CRAYEU/],
  ['calc', /CALCAIRE/],
  ['marne', /MARNE|MARNEU/],
  ['gres', /GRES\b/],
  ['argile', /ARGILE|ARGILEU/],
  ['silt', /SILT|LIMON/],
  ['sable', /SABLE(?!S? FILTRANT)|SABLEU/],
  ['grav', /GRAVIER|GRAVELEU|GRAVE\b/],
  ['galet', /GALET/],
  ['silex', /SILEX/],
  ['nodule', /NODULE/],
]

export const CLASSES_LITHO: Record<string, ClasseLitho> = {
  veg: { id: 'veg', libelle: 'Terre végétale', couleur: '#7fa65a' },
  asph: { id: 'asph', libelle: 'Enrobé', couleur: '#4b4b4b' },
  beton: { id: 'beton', libelle: 'Béton, dalle', couleur: '#9b9b9b' },
  remb: { id: 'remb', libelle: 'Remblais', couleur: '#a18e7b' },
  tourbe: { id: 'tourbe', libelle: 'Tourbe', couleur: '#5d4733' },
  granite: { id: 'granite', libelle: 'Granite', couleur: '#d9a8a0' },
  gneiss: { id: 'gneiss', libelle: 'Gneiss', couleur: '#c7a8c0' },
  schist: { id: 'schist', libelle: 'Schiste', couleur: '#8d96aa' },
  gypse: { id: 'gypse', libelle: 'Gypse', couleur: '#e6d9ea' },
  conglo: { id: 'conglo', libelle: 'Conglomérat', couleur: '#d1a671' },
  craie: { id: 'craie', libelle: 'Craie', couleur: '#ecebdc' },
  calc: { id: 'calc', libelle: 'Calcaire', couleur: '#9db5c6' },
  marne: { id: 'marne', libelle: 'Marne', couleur: '#a9b78a' },
  gres: { id: 'gres', libelle: 'Grès', couleur: '#d2a75e' },
  argile: { id: 'argile', libelle: 'Argile', couleur: '#c4875a' },
  silt: { id: 'silt', libelle: 'Limon, silt', couleur: '#d8b67f' },
  sable: { id: 'sable', libelle: 'Sable', couleur: '#ecd078' },
  grav: { id: 'grav', libelle: 'Graviers', couleur: '#d6964a' },
  galet: { id: 'galet', libelle: 'Galets', couleur: '#bf8546' },
  silex: { id: 'silex', libelle: 'Silex', couleur: '#8a8a8a' },
  nodule: { id: 'nodule', libelle: 'Nodules', couleur: '#b9b9b9' },
  autre: { id: 'autre', libelle: 'Non classé', couleur: '#c9c9c9' },
}

/** Display order of the legend: from the surface downwards, as a log reads. */
export const ORDRE_CLASSES = Object.keys(CLASSES_LITHO)

const majuscules = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Components of a keyword, main one first ("ARGILE SABLEUSE" → argile, sable). */
export function composants(cle: string): string[] {
  const k = majuscules(cle)
  const trouves: { id: string; a: number }[] = []
  for (const [id, re] of TOKENS) {
    const m = k.match(re)
    if (m) trouves.push({ id, a: m.index ?? 0 })
  }
  return trouves.sort((p, q) => p.a - q.a).map((t) => t.id)
}

/** Class of a lithology keyword (its description when the keyword says nothing). */
export function classeLitho(cle: string, description = ''): string {
  return composants(cle)[0] ?? composants(description)[0] ?? 'autre'
}
