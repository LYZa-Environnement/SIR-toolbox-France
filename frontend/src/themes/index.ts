import type { Suivi } from './common'
import type { Site, ThemeReport } from '../types/site'
import { buildAir } from './air'
import { buildEau } from './eau'
import { buildNature } from './nature'
import { buildRisques } from './risques'
import { buildSol } from './sol'

export interface Rubrique {
  id: string
  titre: string
  sousTitre: string
  /** `suivi` lets the section report how many sources have answered while
   * the rubrique is still assembling itself. */
  build: (site: Site, suivi?: Suivi) => Promise<ThemeReport>
}

export const RUBRIQUES: Rubrique[] = [
  {
    id: 'eau',
    titre: 'Qualité de l’eau',
    sousTitre:
      "Eau potable distribuée, qualité du cours d'eau le plus proche, sites de baignade, restrictions en vigueur, captages et nappes — situés en amont ou en aval hydraulique du site.",
    build: buildEau,
  },
  {
    id: 'air',
    titre: 'Qualité de l’air',
    sousTitre:
      "Moyennes annuelles des polluants rapportées aux valeurs limites, rose des vents, plan d'exposition au bruit des aérodromes et proximité des parcelles agricoles traitées.",
    build: buildAir,
  },
  {
    id: 'sol',
    titre: 'Qualité des sols',
    sousTitre:
      "Nature pédologique, teneurs de fond de dix éléments traces, anciens sites industriels et secteurs d'information sur les sols détaillés un à un, et l'histoire du site vue du ciel.",
    build: buildSol,
  },
  {
    id: 'nature',
    titre: 'Faune et flore',
    sousTitre:
      'Périmètres Natura 2000, zones naturelles d’intérêt écologique (ZNIEFF), parcs naturels et réserves autour du site, et les espèces effectivement observées à proximité.',
    build: buildNature,
  },
  {
    id: 'risques',
    titre: 'Risques technologiques et naturels',
    sousTitre:
      'Installations classées détaillées une à une, établissements SEVESO, plans de prévention, mouvements de terrain, cavités, sismicité, argiles, radon et installation nucléaire la plus proche.',
    build: buildRisques,
  },
]
