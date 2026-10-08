/**
 * Chlorinated solvents (COHV) regrouped by degradation chain and ordered
 * from parent compound to daughter products, so that a table read top to
 * bottom follows reductive dechlorination:
 *
 * - chloroethenes: PCE → TCE → DCE isomers → vinyl chloride;
 * - chloroethanes: hexa- → penta- → tetra- → tri- → dichloroethanes →
 *   chloroethane (1,1,1-TCA → 1,1-DCA, 1,1,2-TCA → 1,2-DCA → chloroethane);
 * - chloromethanes: carbon tetrachloride → chloroform → dichloromethane →
 *   chloromethane;
 * - chloropropanes / chloropropenes, then brominated compounds.
 *
 * Each chain becomes its own family ("COHV — Chloroéthènes"), which also
 * gives one signature per chain. Parameter keys are left untouched.
 */

import { normaliser } from './guides.ts'
import type { Couche, Lecture, Parametre } from './parse.ts'

const CHAINES: { chaine: string; composes: string[][] }[] = [
  {
    chaine: 'Chloroéthènes',
    composes: [
      ['tetrachloroethylene'],
      ['trichloroethylene'],
      ['11dichloroethylene'],
      ['cis12dichloroethylene', '12cisdichloroethylene'],
      ['trans12dichloroethylene', '12transdichloroethylene'],
      ['chloruredevinyle', 'chloroethylene', 'monochloroethylene'],
    ],
  },
  {
    chaine: 'Chloroéthanes',
    composes: [
      ['hexachloroethane'],
      ['pentachloroethane'],
      ['1122tetrachloroethane'],
      ['1112tetrachloroethane'],
      ['111trichloroethane'],
      ['112trichloroethane'],
      ['11dichloroethane'],
      ['12dichloroethane'],
      ['chloroethane', 'monochloroethane'],
    ],
  },
  {
    chaine: 'Chlorométhanes',
    composes: [['tetrachloromethane'], ['trichloromethane'], ['dichloromethane'], ['chloromethane', 'monochloromethane']],
  },
  {
    chaine: 'Chloropropanes et chloropropènes',
    composes: [
      ['123trichloropropane'],
      ['12dichloropropane'],
      ['13dichloropropane'],
      ['22dichloropropane'],
      ['11dichloropropene', '11dichloropropylene'],
      ['cis13dichloropropene', 'cis13dichloropropylene'],
      ['trans13dichloropropene', 'trans13dichloropropylene'],
      ['13dichloropropene', '13dichloropropylene'],
    ],
  },
  {
    chaine: 'Composés bromés',
    composes: [
      ['tribromomethane', 'bromoforme'],
      ['dibromochloromethane', 'chlorodibromomethane'],
      ['bromodichloromethane'],
      ['12dibromoethane'],
      ['dibromomethane'],
      ['bromochloromethane'],
      ['bromomethane'],
    ],
  },
]

const FAMILLE_COHV = /halog|cohv|organo.?chlor/i

function compacts(nom: string): string[] {
  const sans = nom.replace(/\([^)]*\)/g, ' ')
  const dedans = [...nom.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])
  // "dichloroéthène" and "dichloroéthylène" are the same compound.
  return [nom, sans, ...dedans].map((n) => normaliser(n).replace(/ /g, '').replace(/ethene/g, 'ethylene')).filter(Boolean)
}

/** Chain index and rank within the chain, or null for a non-COHV. */
function position(nom: string): { chaine: number; rang: number } | null {
  const c = compacts(nom)
  for (let i = 0; i < CHAINES.length; i++) {
    const rang = CHAINES[i].composes.findIndex((variantes) => variantes.some((v) => c.includes(v)))
    if (rang >= 0) return { chaine: i, rang }
  }
  return null
}

function ordonnerCouche(parametres: Parametre[]): Parametre[] {
  const places = parametres.map((p) => ({ p, pos: p.somme ? null : position(p.nom) }))
  const premiers = places.findIndex((x) => x.pos || (FAMILLE_COHV.test(x.p.famille) && !/chlorobenz|pcb|biph/i.test(x.p.famille)))
  if (premiers < 0 || !places.some((x) => x.pos)) return parametres

  const cohv = places.filter((x) => x.pos)
  // What else sat in a COHV family: sums go last, the rest under "Autres".
  const resteFamille = places.filter(
    (x) => !x.pos && ((FAMILLE_COHV.test(x.p.famille) && !/chlorobenz|pcb|biph/i.test(x.p.famille)) || (x.p.somme && /cohv/i.test(x.p.nom))),
  )
  const autres = resteFamille.filter((x) => !x.p.somme).map((x) => ({ ...x.p, famille: 'COHV — Autres' }))
  const sommes = resteFamille.filter((x) => x.p.somme).map((x) => ({ ...x.p, famille: 'COHV — Sommes' }))
  const tries = cohv
    .sort((a, b) => a.pos!.chaine - b.pos!.chaine || a.pos!.rang - b.pos!.rang)
    .map((x) => ({ ...x.p, famille: `COHV — ${CHAINES[x.pos!.chaine].chaine}` }))

  const retires = new Set([...cohv, ...resteFamille].map((x) => x.p.cle))
  const avant = parametres.slice(0, premiers).filter((p) => !retires.has(p.cle))
  const apres = parametres.slice(premiers).filter((p) => !retires.has(p.cle))
  return [...avant, ...tries, ...autres, ...sommes, ...apres]
}

export function ordonnerCOHV(lecture: Lecture): Lecture {
  const parametres = { ...lecture.parametres }
  for (const c of ['CM', 'CC'] as Couche[]) parametres[c] = ordonnerCouche(lecture.parametres[c])
  return { ...lecture, parametres }
}
