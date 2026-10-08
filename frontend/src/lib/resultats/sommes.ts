/**
 * Sums the ERM groundwater reference compares to but labs do not report:
 * the 4-PAH and 6-PAH sums of its notes (1) and (2). They are added as
 * computed parameters after their last component.
 *
 * Convention, the labs' own for their totals (e.g. "BTEX totaux <0,76" =
 * sum of the individual LQs): the sum of the quantified values; when none
 * is quantified, "<" the sum of the quantification limits.
 */

import { normaliser } from './guides.ts'
import type { Lecture, Mesure, Parametre } from './parse.ts'

const compact = (nom: string) => normaliser(nom).replace(/ /g, '')

const SOMMES: { nom: string; composes: string[] }[] = [
  {
    nom: 'Somme de 6 HAP (calculée)',
    composes: ['fluoranthene', 'benzobfluoranthene', 'benzokfluoranthene', 'benzoapyrene', 'benzoghiperylene', 'indeno123cdpyrene'],
  },
  {
    nom: 'Somme de 4 HAP (calculée)',
    composes: ['benzobfluoranthene', 'benzokfluoranthene', 'benzoghiperylene', 'indeno123cdpyrene'],
  },
]

function format(x: number): string {
  return String(Number(x.toPrecision(3))).replace('.', ',')
}

export function ajouterSommesCalculees(lecture: Lecture): Lecture {
  const parametres = [...lecture.parametres.CM]
  const valeurs = { ...lecture.valeurs.CM }
  for (const s of SOMMES) {
    const cible = compact(s.nom.replace(/\s*\(calcul[ée]e\)/, ''))
    if (parametres.some((p) => compact(p.nom) === cible || normaliser(p.nom) === normaliser(s.nom))) continue
    const composants = parametres.filter((p) => s.composes.includes(compact(p.nom)) && /g\s*\//i.test(p.unite))
    if (!composants.length) continue
    const unite = composants[0].unite
    const parametre: Parametre = {
      cle: `${composants[0].famille}|${s.nom}`.toLowerCase(),
      famille: composants[0].famille,
      nom: s.nom,
      cas: '',
      unite,
      versMicrogrammes: composants[0].versMicrogrammes,
      somme: true,
    }
    const dernier = Math.max(...composants.map((c) => parametres.indexOf(c)))
    parametres.splice(dernier + 1, 0, parametre)
    for (const point of lecture.points) {
      const mesures = composants.map((c) => lecture.valeurs.CM[point.nom]?.[c.cle]).filter((m): m is Mesure => !!m && m.valeur !== null)
      if (!mesures.length) continue
      const quantifiees = mesures.filter((m) => !m.inferieur)
      const total = (quantifiees.length ? quantifiees : mesures).reduce((a, m) => a + m.valeur!, 0)
      const inferieur = !quantifiees.length
      valeurs[point.nom] = { ...valeurs[point.nom], [parametre.cle]: { brut: `${inferieur ? '<' : ''}${format(total)}`, valeur: total, inferieur } }
    }
  }
  return { ...lecture, parametres: { ...lecture.parametres, CM: parametres }, valeurs: { ...lecture.valeurs, CM: valeurs } }
}
