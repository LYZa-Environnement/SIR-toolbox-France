/**
 * Lab results → the units the arrêté du 2 février 1998 states its limits in:
 * mg/m³ (normal conditions, dry gas) for air — mg C/m³ for total VOC —, and
 * mg/l for water (pH in pH units, temperature in °C).
 */

import type { Substance } from './substances.ts'

export type Milieu = 'air' | 'eau'

/** Molar volume at 273,15 K and 101,325 kPa (l/mol): ppm(v) → mg/m³. */
const VOLUME_MOLAIRE = 22.414

/** Molar masses of the gases often reported in ppm. */
const MASSES_MOLAIRES: Record<string, number> = {
  co: 28.01,
  so2: 64.07,
  nox: 46.01,
  n2o: 44.01,
  ch4: 16.04,
  hcl: 36.46,
  hf: 20.01,
  h2s: 34.08,
  nh3: 17.03,
  hcn: 27.03,
  hbr: 80.91,
  chlore: 70.9,
  phosphine: 34.0,
  phosgene: 98.92,
}

const PREFIXES: Record<string, number> = { ng: 1e-6, µg: 1e-3, ug: 1e-3, mcg: 1e-3, mg: 1, g: 1000 }

const compacte = (u: string) => u.toLowerCase().replace(/μ/g, 'µ').replace(/³/g, '3').replace(/\s+/g, '')

export interface Conversion {
  /** Factor to the reference unit; null when the unit cannot be read. */
  facteur: number | null
  /** Needs the sampled volume (mass per sorbent tube). */
  support?: boolean
  note?: string
}

/** Units of air results: mg/m³, µg/m³, mgC/m³, ppm, µg/support. */
export function conversionAir(unite: string, s: Substance | null): Conversion {
  const u = compacte(unite)
  let m = u.match(/^(ng|µg|ug|mcg|mg|g)(c|eq\.?c|éq\.?c)?\/n?m3/)
  if (m) return { facteur: PREFIXES[m[1]] }
  m = u.match(/^(ng|µg|ug|mcg|mg|g)\/(support|supp?\.?|[ée]ch\.?|[ée]chantillon|tube|cartouche|badge|filtre)/)
  if (m) return { facteur: PREFIXES[m[1]], support: true }
  m = u.match(/^(ppm|ppb)(v)?(?:[ée]q\.?)?(ch4|c3h8|c|propane|m[ée]thane)?/)
  if (m) {
    const parPpm = m[1] === 'ppb' ? 1e-3 : 1
    if (s?.id === 'covt') {
      // Total VOC by FID: ppm of an equivalent → mg C/m³.
      const carbones = m[3] === 'c3h8' || m[3] === 'propane' ? 3 : 1
      return { facteur: (parPpm * carbones * 12.011) / VOLUME_MOLAIRE, note: `ppm éq. ${carbones === 3 ? 'propane' : 'CH4 / C'} converti en mg C/m³` }
    }
    const masse = s ? (MASSES_MOLAIRES[s.id] ?? s.cov?.masseMolaire) : undefined
    return masse ? { facteur: (parPpm * masse) / VOLUME_MOLAIRE, note: 'ppm(v) converti en mg/m³ aux conditions normales' } : { facteur: null }
  }
  return { facteur: null }
}

/** Water: mass per litre, with or without the element ("mg O2/l", "mg N/l"). */
export function conversionEau(unite: string, s: Substance | null, nom = ''): Conversion {
  if (s?.id === 'ph') return { facteur: 1 }
  if (s?.id === 'temperature') return /°?c\b|celsius/i.test(unite) || !unite.trim() ? { facteur: 1 } : { facteur: null }
  const u = compacte(unite)
  const m = u.match(/^(ng|µg|ug|mcg|mg|g)([a-z0-9]{0,3}-?[a-z0-9]{0,3})?\/l/)
  if (!m) return { facteur: null }
  let f = PREFIXES[m[1]]
  const element = `${m[2] ?? ''}${(u.match(/\/l(.*)$/)?.[1] ?? '').replace(/[^a-z0-9]/g, '')}`
  // Nitrates and nitrites as ions, brought to nitrogen for the global nitrogen.
  const enAzote = /^(n|n-?no[23])$/.test(element) || /n-no[23]|\ben n\b|\(n\)/i.test(nom)
  if (s?.id === 'nitrates' && !enAzote) f *= 14.007 / 62.004
  if (s?.id === 'nitrites' && !enAzote) f *= 14.007 / 46.005
  return { facteur: f }
}

export const UNITE_REFERENCE: Record<Milieu, string> = { air: 'mg/m³', eau: 'mg/l' }
