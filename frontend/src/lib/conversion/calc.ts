/**
 * Mass on the sorbent → air concentration.
 *
 *   V (L)      = débit (L/min) × durée (min)
 *   V (m³)     = V (L) / 1000
 *   C (µg/m³)  = m (µg) / V (m³)
 *
 * The flow is the mean of the flows read at the start and at the end of
 * sampling when both are given — the usual field practice, and what the
 * reference tables did by hand with "=(1,17+1,204)/2".
 */

import type { Mesure, Parametre } from './parse.ts'

export type UniteSortie = 'µg/m³' | 'mg/m³'

export interface Prelevement {
  debitDebut: number | null
  debitFin: number | null
  duree: number | null
}

export function debitMoyen(p: Prelevement): number | null {
  const debits = [p.debitDebut, p.debitFin].filter((d): d is number => d !== null && Number.isFinite(d) && d > 0)
  return debits.length ? debits.reduce((a, b) => a + b, 0) / debits.length : null
}

export function volumeLitres(p: Prelevement): number | null {
  const debit = debitMoyen(p)
  return debit !== null && p.duree !== null && p.duree > 0 ? debit * p.duree : null
}

export interface Concentration {
  valeur: number
  inferieur: boolean
}

export function convertir(mesure: Mesure | undefined, parametre: Parametre, volumeL: number | null, unite: UniteSortie): Concentration | null {
  if (!mesure || mesure.valeur === null || !volumeL) return null
  const microgrammes = mesure.valeur * parametre.versMicrogrammes
  const parM3 = microgrammes / (volumeL / 1000)
  return { valeur: unite === 'mg/m³' ? parM3 / 1000 : parM3, inferieur: mesure.inferieur }
}

/** Two significant figures — the precision the labs report masses with. */
export function arrondiSignificatif(x: number, chiffres = 2): number {
  if (x === 0 || !Number.isFinite(x)) return x
  const d = chiffres - 1 - Math.floor(Math.log10(Math.abs(x)))
  const f = 10 ** d
  return Math.round(x * f) / f
}

/** Decimals by magnitude — the number formats the Excel export applies. */
export function decimales(x: number): number {
  const a = Math.abs(x)
  return a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.1 ? 3 : 4
}

/** As the exported table shows it: a "<LQ" to two significant figures,
 *  a quantified value with decimals by magnitude. */
export function formatConcentration(c: Concentration | null): string {
  if (!c) return '-'
  if (c.inferieur) return `<${arrondiSignificatif(c.valeur).toLocaleString('fr-FR', { maximumFractionDigits: 10 })}`
  const d = decimales(c.valeur)
  return c.valeur.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false })
}

/** "1,23" or "1.23" → 1.23; empty or invalid → null. */
export function lireNombre(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
