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

/** One colour per operator, on the plans' band, the contents page and
 *  the screen. */
const PALETTE = ['#00756a', '#c34a35', '#2f5d9e', '#a3671a', '#6b3fa0', '#1f6b45', '#b0306a', '#4a5a6b', '#0089a8', '#7a5c00']

export const couleurGroupe = (i: number) => PALETTE[i % PALETTE.length]
