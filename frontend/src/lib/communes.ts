/**
 * Paris, Lyon and Marseille are split into municipal arrondissements, each
 * with its own INSEE code (75101–75120, 69381–69389, 13201–13216). The
 * geocoder returns the arrondissement's code, but not every service knows it.
 *
 * Verified live (11/2026), Paris 7e (75107) against Paris (75056):
 * - Géorisques GASPAR (catnat, risques, pprn, pprt) and Hub'Eau
 *   qualite_eau_potable answer only for the whole commune: 75107 returns
 *   nothing, 75056 returns the PPRi de Paris, the carrières plans, etc.;
 * - Géorisques zonage_sismique and radon answer only per arrondissement.
 *
 * So the arrondissement code stays the site's code, and the services that
 * need the commune convert it with this function.
 */
export function codeCommuneEntiere(code: string): string {
  const c = code.trim()
  if (/^751(0[1-9]|1\d|20)$/.test(c)) return '75056'
  if (/^6938[1-9]$/.test(c)) return '69123'
  if (/^132(0[1-9]|1[0-6])$/.test(c)) return '13055'
  return c
}
