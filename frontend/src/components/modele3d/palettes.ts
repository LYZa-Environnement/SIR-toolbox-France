/**
 * Colour ramps of the 3D model's page and legend: single-hue ramps (light
 * to dark) and diverging pairs around a grey midpoint.
 */

export const RAMPE_PID = ['#ece4f3', '#c9b2df', '#a07fc6', '#7650a8', '#4b2c78']
export const RAMPE_INCERTITUDE = ['#eef1f4', '#c9d2db', '#9aa9b8', '#6b7d90', '#3f4f63']
export const MILIEU = '#d3d7d9'

export function melange(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16))
  const cb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16))
  return `#${ca.map((x, i) => Math.round(x + (cb[i] - x) * t).toString(16).padStart(2, '0')).join('')}`
}
export function dansRampe(rampe: string[], t: number): string {
  const u = Math.min(1, Math.max(0, t)) * (rampe.length - 1)
  const i = Math.min(rampe.length - 2, Math.floor(u))
  return melange(rampe[i], rampe[i + 1], u - i)
}
/** −1 → negative pole, 0 → grey, +1 → positive pole. */
export const divergente = (t: number, negatif: string, positif: string) => (t < 0 ? melange(MILIEU, negatif, Math.min(1, -t)) : melange(MILIEU, positif, Math.min(1, t)))
