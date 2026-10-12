/**
 * Colours of the reading sheets (analysis by compound, quality control,
 * signatures, expert sheets). The two formatted tables keep the ERM
 * report layout, grey on white, and do not use these.
 */

import type { Worksheet } from 'exceljs'

/** Hex colour mixed with white: t = 0 the colour, t = 1 white. */
export function eclaircir(hex: string, t: number): string {
  const v = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => Math.round(parseInt(v.slice(i, i + 2), 16) * (1 - t) + 255 * t))
  return `FF${c.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`

/** Reading at a glance: within limits, to watch, beyond. */
export const ETAT = {
  ok: { fond: 'FFDDF0E4', texte: 'FF1F6B45' },
  vigilance: { fond: 'FFFCE8C8', texte: 'FF8A5300' },
  alerte: { fond: 'FFF8D7D3', texte: 'FF9C2A1C' },
} as const

/** Section bands: ERM deep green, white text. */
export const BANDEAU = { fond: 'FF00756A', texte: 'FFFFFFFF' }

/** Column groups of the analysis by compound. */
export const GROUPES = {
  quantification: { fort: '#2F7EA8', clair: 'FFD4E6F1' },
  distribution: { fort: '#6B4FA0', clair: 'FFE4DCF0' },
  comparaison: { fort: '#C0392B', clair: 'FFF6D9D3' },
} as const

/** Colours of the families on the signature tables, in turn. */
export const TEINTES_FAMILLES = ['#2F7EA8', '#C0392B', '#00A37E', '#E08E0B', '#6B4FA0', '#B0306A', '#4A5A6B']

/** Excel colour scale white → colour on a range of shares (0–1). */
export function echelle(ws: Worksheet, r1: number, r2: number, c1: number, hex: string, c2 = c1) {
  if (r2 < r1 || c2 < c1) return
  ws.addConditionalFormatting({
    ref: `${ws.getColumn(c1).letter}${r1}:${ws.getColumn(c2).letter}${r2}`,
    rules: [
      {
        type: 'colorScale',
        priority: 1,
        cfvo: [
          { type: 'num', value: 0 },
          { type: 'num', value: 1 },
        ],
        color: [{ argb: 'FFFFFFFF' }, { argb: eclaircir(hex, 0.35) }],
      },
    ],
  })
}

/** Excel data bar on a column, from 0 to `max` (or the column's largest). */
export function barre(ws: Worksheet, r1: number, r2: number, c: number, hex: string, max?: number) {
  if (r2 < r1) return
  const l = ws.getColumn(c).letter
  ws.addConditionalFormatting({
    ref: `${l}${r1}:${l}${r2}`,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        gradient: false,
        cfvo: [{ type: 'num', value: 0 }, max === undefined ? { type: 'max' } : { type: 'num', value: max }],
        color: { argb: eclaircir(hex, 0.3) },
      } as never,
    ],
  })
}
