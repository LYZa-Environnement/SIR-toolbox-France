/** Network categories of the DT/DICT receipt (Cerfa 14435, verso;
 *  article R.554-2 of the Code de l'environnement). */
export const CATEGORIES: Record<string, { libelle: string; sensible: boolean }> = {
  HC: { libelle: 'Hydrocarbures', sensible: true },
  PC: { libelle: 'Produits chimiques', sensible: true },
  GA: { libelle: 'Gaz combustibles', sensible: true },
  CU: { libelle: 'Chaleur, froid, vapeur', sensible: true },
  EL: { libelle: 'Électricité, éclairage public', sensible: true },
  TR: { libelle: 'Transport guidé (ferroviaire, tramway)', sensible: true },
  DE: { libelle: 'Transport de déchets', sensible: true },
  DI: { libelle: 'Ouvrages de prévention des inondations', sensible: true },
  TL: { libelle: 'Communications électroniques', sensible: false },
  EA: { libelle: 'Eau potable', sensible: false },
  EU: { libelle: 'Assainissement', sensible: false },
}

export const estCategorie = (code: string) => code in CATEGORIES

export function libelleCategorie(code: string): string {
  return CATEGORIES[code] ? `${code} — ${CATEGORIES[code].libelle}` : code
}

/** Colour code of buried networks (NF P 98-332): red for electricity,
 *  yellow for gas, blue for drinking water, brown for sewers, green for
 *  telecoms… Each operator takes its category's colour, then a darker or
 *  lighter variant when several share it. */
const TEINTES: Record<string, string[]> = {
  EL: ['#e00000', '#a30000', '#ff5c5c'],
  GA: ['#d4a600', '#9c7a00', '#f2cc3d'],
  HC: ['#d4a600', '#9c7a00', '#f2cc3d'],
  PC: ['#ff7f00', '#c45f00', '#ffa64d'],
  CU: ['#8e44ad', '#5e2d73', '#b57bd0'],
  TR: ['#e75480', '#b0305a', '#f08cab'],
  DE: ['#7f7f00', '#555500', '#a8a83d'],
  DI: ['#4d6d9a', '#2f4a70', '#7f9cc4'],
  TL: ['#00a000', '#006b00', '#4fcf4f'],
  EA: ['#0057d9', '#003a91', '#4d8eff'],
  EU: ['#8b4513', '#5c2d0c', '#b8733f'],
}
const AUTRES = ['#e75480', '#00a5a5', '#6b3fa0', '#7a5c00', '#4a5a6b', '#0089a8']

/** Colours for the operators, in order: each from its first category. */
export function couleursExploitants(categories: string[][]): string[] {
  const pris = new Map<string, number>()
  let autre = 0
  return categories.map((cats) => {
    const c = cats.find((x) => TEINTES[x])
    if (!c) return AUTRES[autre++ % AUTRES.length]
    const n = pris.get(c) ?? 0
    pris.set(c, n + 1)
    return n < TEINTES[c].length ? TEINTES[c][n] : AUTRES[autre++ % AUTRES.length]
  })
}
