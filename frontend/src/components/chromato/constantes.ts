/** Categorical slots, fixed order (one per sample, never cycled). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

export type CiblePic = 'c17' | 'pr' | 'c18' | 'ph'
export const LIBELLES_CIBLE: Record<CiblePic, string> = { c17: 'n-C17', pr: 'Pristane', c18: 'n-C18', ph: 'Phytane' }
