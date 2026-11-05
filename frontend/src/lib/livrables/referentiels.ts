/** The deliverables the tool checks. */

import { REFERENTIELS_ATTES } from './attes.ts'
import type { Referentiel } from './controles.ts'
import { REFERENTIEL_IOTA } from './iota.ts'

export const REFERENTIELS: Referentiel[] = [...REFERENTIELS_ATTES, REFERENTIEL_IOTA]
