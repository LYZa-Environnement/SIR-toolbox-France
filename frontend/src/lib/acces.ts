/**
 * Password at the entrance of the site.
 *
 * The site is static (GitHub Pages): there is no server to check a password,
 * so this only keeps casual visitors out — anyone reading the page's code can
 * get past it. Only the SHA-256 fingerprint of the password is in the code,
 * not the password itself. Once entered, it is remembered in the browser; a
 * new password (a new fingerprint) asks for it again.
 *
 * The standalone pages (logs, maillage, données publiques) carry the same
 * check inline, with the same key and fingerprint.
 */

export const EMPREINTE = '1bc3201a9f24a2fe48f634f90d406aaf6cbf5e36e292870ecba98d74b065ee1b'
export const CLE_ACCES = 'sir-toolbox.acces'

export function estDeverrouille(): boolean {
  try {
    return localStorage.getItem(CLE_ACCES) === EMPREINTE
  } catch {
    return false
  }
}

/** Typographic apostrophes and accents typed as combining marks count as the plain ones. */
export function normaliserMotDePasse(saisie: string): string {
  return saisie.trim().normalize('NFC').replace(/[’‘ʼ´`]/g, "'")
}

export async function empreinte(texte: string): Promise<string> {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))
  return [...new Uint8Array(octets)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function deverrouiller(saisie: string): Promise<boolean> {
  if ((await empreinte(normaliserMotDePasse(saisie))) !== EMPREINTE) return false
  try {
    localStorage.setItem(CLE_ACCES, EMPREINTE)
  } catch {
    /* remembered for this visit only */
  }
  return true
}

export function verrouiller() {
  try {
    localStorage.removeItem(CLE_ACCES)
  } catch {
    /* nothing stored */
  }
}
