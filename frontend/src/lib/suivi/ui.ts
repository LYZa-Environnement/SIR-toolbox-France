/** Helpers and types shared by the time-series page and its components. */

import { CLASSES, fr, frPente, pTexte, type AnalyseSerie } from './analyse.ts'

export function telechargerBlob(nom: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const nomFichier = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _.,()+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)

export function infoSerie(s: AnalyseSerie): string {
  const d = s.derniere
  return [
    `${s.ouvrage.nom} · ${s.compose.nom}`,
    CLASSES[s.classe].libelle + (s.mk ? ` (${pTexte(s.mk.pBilateral)})` : ''),
    s.sen && s.statut === 'teste' ? `Sen ${frPente(s)}` : '',
    `${s.n} résultats, ${s.nQ} quantifiés`,
    d ? `dernier : ${d.inferieur ? '<' : ''}${fr(d.valeur)} ${s.compose.unite}${s.ratioDernier ? ` (${fr(s.ratioDernier, 2)} × la valeur de référence)` : ''}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export type ModeVue = 'compose' | 'ouvrage' | 'serie'

export interface Selection {
  mode: ModeVue
  compose: string
  ouvrage: string
  /** Wells shown for a compound (empty: all). */
  ouvrages: string[]
  /** Compounds shown for a well (empty: the quantified ones of the family). */
  composes: string[]
}

export interface OptionsVue {
  log: 'auto' | 'lin' | 'log'
  sen: boolean
  lissage: boolean
  niveaux: boolean
  fenetreSeule: boolean
}

export const OPTIONS_VUE: OptionsVue = { log: 'auto', sen: true, lissage: false, niveaux: false, fenetreSeule: false }

