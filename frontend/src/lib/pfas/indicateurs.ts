/**
 * Composition indicators of a PFAS sample. They describe the profile —
 * shares and ratios computed on quantified results only (a result below
 * the LQ counts as zero, the usual convention for profiles) — and each
 * comes with how the literature reads it. No threshold is the tool's own:
 * "majority" means more than half, and the readings say which way a value
 * points, with their sources.
 *
 * Shares are on a mass basis, as the lab reports. The fluorine balance
 * multiplies each concentration by the fluorine mass fraction of the
 * substance (computed from its formula, `substances.ts`).
 */

import type { EchantillonPfas, Valeur } from './lecture.ts'
import type { Matrice } from './reperes.ts'
import { fractionFluor, groupe, GROUPES, PAR_ID, SUBSTANCES, VINGT, type Groupe, type IdSubstance } from './substances.ts'

export interface Part {
  id: IdSubstance
  valeur: number
  part: number
}

export interface Composition {
  /** Quantified sum of the 20 and 6:2 FTS (TFA apart). */
  total: number
  /** Quantified sum of the 20 only. */
  total20: number
  parts: Part[]
  groupes: Record<Groupe, number>
  quantifiees: number
}

const q = (v: Valeur | undefined) => (v && !v.inferieur ? v.valeur : 0)

export function composition(e: EchantillonPfas): Composition {
  const membres = SUBSTANCES.filter((s) => s.id !== 'TFA')
  const valeurs = membres.map((s) => ({ id: s.id, valeur: q(e.substances[s.id]) }))
  const total = valeurs.reduce((a, v) => a + v.valeur, 0)
  const total20 = valeurs.filter((v) => PAR_ID[v.id].somme20).reduce((a, v) => a + v.valeur, 0)
  const parts = valeurs
    .filter((v) => v.valeur > 0)
    .map((v) => ({ ...v, part: v.valeur / total }))
    .sort((a, b) => b.valeur - a.valeur)
  const groupes = Object.fromEntries(GROUPES.map((g) => [g.groupe, 0])) as Record<Groupe, number>
  for (const p of parts) groupes[groupe(PAR_ID[p.id])!] += p.part
  return { total, total20, parts, groupes, quantifiees: parts.length }
}

export interface Indicateur {
  id: string
  titre: string
  /** How it is computed, in words. */
  formule: string
  valeur: number | null
  format: 'part' | 'rapport'
  /** Why it could not be computed. */
  raison?: string
  /** What this value says, written from the value itself. */
  constat: string | null
  /** The general reading, whichever the value. */
  lecture: string
  refs: string[]
}

const somme = (e: EchantillonPfas, ids: IdSubstance[]) => ids.reduce((a, id) => a + q(e.substances[id]), 0)
const ids = (f: (s: (typeof SUBSTANCES)[number]) => boolean) => VINGT.filter(f).map((s) => s.id)

const PFCA = ids((s) => s.famille === 'PFCA')
const PFSA = ids((s) => s.famille === 'PFSA')
const COURTES = ids((s) => !s.longue)
const PFCA_C9 = ids((s) => s.famille === 'PFCA' && s.carbones >= 9)

function rapport(n: number, d: number, absent: string): Pick<Indicateur, 'valeur' | 'raison'> {
  if (d > 0) return { valeur: n / d }
  return { valeur: null, raison: `${absent} : rapport non calculable.` }
}

function part(n: number, d: number): Pick<Indicateur, 'valeur' | 'raison'> {
  if (d > 0) return { valeur: n / d }
  return { valeur: null, raison: 'Aucun des composés concernés n’est quantifié.' }
}

/** Fluorine carried by the 22 substances (quantified), same unit as the values. */
export function fluorCible(e: EchantillonPfas): number {
  return SUBSTANCES.reduce((a, s) => a + q(e.substances[s.id]) * fractionFluor(s), 0)
}

export function indicateurs(e: EchantillonPfas, matrice: Matrice): Indicateur[] {
  return calculer(e, matrice).map((i) => ({ ...i, constat: i.valeur === null ? null : constater(i, e, matrice) }))
}

function calculer(e: EchantillonPfas, matrice: Matrice): Omit<Indicateur, 'constat'>[] {
  const pfca = somme(e, PFCA)
  const pfsa = somme(e, PFSA)
  const total20 = pfca + pfsa
  const r: Omit<Indicateur, 'constat'>[] = []

  r.push({
    id: 'sulfonates',
    titre: 'Part des sulfonates (PFSA)',
    formule: 'Σ PFSA / (Σ PFSA + Σ PFCA), sur les 20 PFAS',
    format: 'part',
    ...part(pfsa, total20),
    lecture:
      'Majoritaires, les sulfonates rapprochent le profil des mousses anciennes au PFOS et au PFHxS (procédé électrochimique) et des usages historiques du PFOS. Minoritaires, ce sont les carboxylates qui dominent : produits terminaux de la dégradation des fluorotélomères, retombées diffuses, lixiviats.',
    refs: ['anderson2016', 'barzenHanson2017', 'houtz2013', 'rankin2016', 'hamid2018'],
  })
  r.push({
    id: 'courtes',
    titre: 'Part des chaînes courtes',
    formule: 'PFCA C4–C7 et PFSA C4–C5 / Σ des 20 (définition de Buck et al., 2011)',
    format: 'part',
    ...part(somme(e, COURTES), total20),
    lecture:
      'Les chaînes courtes sont plus mobiles et moins retenues par les sols : leur part augmente en s’éloignant d’une source et dans les lixiviats de décharge, où les acides C4 à C7 dominent. Elles signent aussi les substituts récents aux chaînes longues.',
    refs: ['buck2011', 'guelfoHiggins2013', 'hamid2018', 'sepulvado2011'],
  })
  r.push({
    id: 'pfosPfoa',
    titre: 'Rapport PFOS / PFOA',
    formule: 'PFOS / PFOA',
    format: 'rapport',
    ...rapport(q(e.substances.PFOS), q(e.substances.PFOA), 'PFOA non quantifié'),
    lecture:
      'Supérieur à 1, le PFOS domine : mousses anciennes au PFOS, chromage antérieur à l’interdiction du PFOS, boues d’épuration. Inférieur à 1, le PFOA domine : chimie des fluoropolymères, retombées diffuses, lixiviats.',
    refs: ['anderson2016', 'egle2020', 'sepulvado2011', 'prevedouros2006', 'rankin2016', 'hamid2018'],
  })
  r.push({
    id: 'pfhxsPfos',
    titre: 'Rapport PFHxS / PFOS',
    formule: 'PFHxS / PFOS',
    format: 'rapport',
    ...rapport(q(e.substances.PFHxS), q(e.substances.PFOS), 'PFOS non quantifié'),
    lecture:
      'Les mousses fabriquées par procédé électrochimique associaient PFOS, PFHxS et leurs précurseurs : un PFHxS bien présent à côté du PFOS appuie cette piste. Un PFOS sans PFHxS oriente plutôt vers d’autres usages du PFOS, à confirmer par l’historique du site.',
    refs: ['barzenHanson2017', 'anderson2016', 'egle2020'],
  })
  r.push({
    id: 'pfcaLongues',
    titre: 'PFCA au-delà du PFOA',
    formule: 'PFNA à PFTrDA (C9–C13) / Σ PFCA',
    format: 'part',
    ...part(somme(e, PFCA_C9), pfca),
    lecture:
      'Les acides carboxyliques à chaîne longue sont liés à la chimie des fluoropolymères, à l’origine de l’essentiel des émissions historiques de PFCA. Plus fortement retenus par les sols, ils migrent moins : leur part baisse vers l’aval.',
    refs: ['prevedouros2006', 'boiteux2017', 'guelfoHiggins2013'],
  })
  r.push({
    id: 'fts',
    titre: '6:2 FTS / (PFPeA + PFHxA)',
    formule: '6:2 FTS / (PFPeA + PFHxA)',
    format: 'rapport',
    ...(e.substances.FTS62
      ? rapport(q(e.substances.FTS62), q(e.substances.PFPeA) + q(e.substances.PFHxA), 'Ni PFPeA ni PFHxA quantifié')
      : { valeur: null, raison: '6:2 FTS non analysé.' }),
    lecture:
      'Le 6:2 FTS se dégrade vite en milieu aérobie (demi-vie de moins de 5 jours en sédiment) en PFPeA et PFHxA, et ne se dégrade pas en anaérobie. Un rapport élevé indique un précurseur peu transformé (apport récent ou milieu réducteur), un rapport faible un précurseur déjà converti ou d’autres sources de PFCA.',
    refs: ['zhang2016', 'houtz2013', 'egle2020'],
  })
  r.push({
    id: 'tfa',
    titre: 'TFA / somme des 20',
    formule: 'TFA / Σ des 20 quantifiés',
    format: 'rapport',
    ...(e.substances.TFA ? rapport(q(e.substances.TFA), total20, 'Aucun des 20 PFAS quantifié') : { valeur: null, raison: 'TFA non analysé.' }),
    lecture:
      matrice === 'eau'
        ? 'Le TFA est presque partout : présent dans 92 % des eaux traitées en France, avec une médiane de 780 ng/l, bien au-dessus de la plupart des sommes des 20. Un rapport élevé est donc fréquent sans source ponctuelle ; seul un TFA nettement supérieur au bruit de fond oriente vers une source locale (industrie du fluor, pesticides, fluides frigorigènes).'
        : 'Le TFA provient de la dégradation de nombreux PFAS (fluides frigorigènes, pesticides, médicaments) et de rejets directs ; ultra-court et très mobile, il est peu retenu par les sols.',
    refs: ['arp2024', 'anses2025'],
  })

  const iso = e.isomeres.PFOS
  if (iso?.lineaire && iso?.ramifie) {
    const lin = q(iso.lineaire)
    const ram = q(iso.ramifie)
    r.push({
      id: 'ramifies',
      titre: 'Part des isomères ramifiés du PFOS',
      formule: 'PFOS ramifiés / (linéaires + ramifiés)',
      format: 'part',
      ...part(ram, lin + ram),
      lecture:
        'Le procédé électrochimique produit un mélange d’isomères linéaires et ramifiés, la télomérisation des chaînes linéaires : des isomères ramifiés signent le procédé électrochimique.',
      refs: ['benskin2010', 'iarc2025'],
    })
  }

  const global = matrice === 'eau' ? e.aof : e.eof
  if (global) {
    const f = fluorCible(e)
    r.push({
      id: 'fluor',
      titre: `Fluor des 22 substances / ${matrice === 'eau' ? 'AOF' : 'EOF'}`,
      formule: `Σ (concentration × fraction massique de fluor) / ${matrice === 'eau' ? 'AOF' : 'EOF'}`,
      format: 'part',
      ...(global.inferieur ? { valeur: null, raison: `${matrice === 'eau' ? 'AOF' : 'EOF'} inférieur à sa LQ.` } : part(f, global.valeur)),
      lecture:
        'Part du fluor organique global expliquée par les substances dosées. Une part faible signale des PFAS non recherchés (précurseurs, autres familles) : de l’ordre de 50 % au mieux dans une nappe touchée par des mousses, moins de 5 % en contamination diffuse. Les lignes directrices européennes prévoient de doser le TFA à part des paramètres globaux.',
      refs: ['wagner2013', 'willach2016', 'epa1621', 'lignesDirectrices2024'],
    })
  }
  return r
}

const pc = (x: number) => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: x < 0.1 && x > 0 ? 1 : 0 })} %`
const fois = (x: number) => (x >= 10 ? Math.round(x).toLocaleString('fr-FR') : x.toLocaleString('fr-FR', { maximumSignificantDigits: 2 }))

/** The reading of this sample's value: which way it points, in words. */
function constater(i: Omit<Indicateur, 'constat'>, e: EchantillonPfas, matrice: Matrice): string {
  const v = i.valeur!
  switch (i.id) {
    case 'sulfonates':
      if (v === 0) return 'Aucun sulfonate quantifié : profil entièrement carboxylique, du côté des produits de dégradation des fluorotélomères, des apports diffus ou des lixiviats.'
      if (v === 1) return 'Uniquement des sulfonates : profil du côté des mousses anciennes au PFOS et des usages historiques du PFOS.'
      return v > 0.5
        ? `Les sulfonates font ${pc(v)} des 20 PFAS quantifiés : ils dominent. Le profil se rapproche des mousses anciennes au PFOS et des usages historiques du PFOS.`
        : `Les sulfonates ne font que ${pc(v)} : les carboxylates dominent (${pc(1 - v)}). Le profil se rapproche des produits de dégradation des fluorotélomères, des apports diffus ou des lixiviats.`
    case 'courtes':
      return v > 0.5
        ? `Les chaînes courtes font ${pc(v)} des 20 PFAS quantifiés : profil mobile, attendu en aval d’une source, dans un lixiviat ou avec les substituts récents.`
        : `Les chaînes longues dominent (${pc(1 - v)}) : profil plus retenu par les sols, plutôt attendu près de la source ou pour des apports anciens.`
    case 'pfosPfoa':
      if (v === 0) return 'PFOS non quantifié, PFOA présent : le PFOA domine, du côté des fluoropolymères, des apports diffus ou des lixiviats.'
      return v >= 1
        ? `Le PFOS est ${fois(v)} fois plus abondant que le PFOA : du côté des mousses anciennes, du chromage antérieur à l’interdiction du PFOS ou des boues.`
        : `Le PFOA est ${fois(1 / v)} fois plus abondant que le PFOS : du côté des fluoropolymères, des apports diffus ou des lixiviats.`
    case 'pfhxsPfos':
      return v > 0
        ? `PFHxS quantifié avec le PFOS (${fois(v)} fois le PFOS) : cette association appuie la piste des mousses anciennes au PFOS.`
        : 'PFHxS non quantifié à côté du PFOS : la piste des mousses anciennes perd un appui ; d’autres usages du PFOS (chromage ancien, boues) restent possibles.'
    case 'pfcaLongues': {
      if (v === 0) return 'Aucun carboxylique au-delà du PFOA (C9 à C13) n’est quantifié : pas de signature de chaînes longues.'
      const noms = VINGT.filter((s) => s.famille === 'PFCA' && s.carbones >= 9 && q(e.substances[s.id]) > 0).map((s) => s.abreviation)
      return `${pc(v)} des carboxylates ont 9 carbones ou plus (${noms.join(', ')}). Plus cette part est forte, plus la piste de la chimie des fluoropolymères et la proximité d’une source se renforcent : ces composés migrent peu.`
    }
    case 'fts':
      if (v === 0) return '6:2 FTS non quantifié alors que le PFPeA ou le PFHxA sont présents : pas de précurseur 6:2 visible ; ces PFCA viennent d’une conversion déjà complète ou d’une autre source.'
      return v >= 1
        ? `Le 6:2 FTS dépasse ses produits de dégradation (${fois(v)} fois PFPeA + PFHxA) : précurseur peu transformé, apport récent ou milieu pauvre en oxygène.`
        : `Les produits de dégradation dépassent le 6:2 FTS (${fois(1 / v)} fois) : précurseur déjà largement converti, ou PFCA d’une autre origine.`
    case 'tfa': {
      const tfa = q(e.substances.TFA)
      const mediane =
        matrice === 'eau'
          ? tfa > 780
            ? ' Il dépasse la médiane nationale de l’eau traitée (780 ng/l) : à comparer à l’amont avant d’y voir une source locale.'
            : ' Il reste sous la médiane nationale de l’eau traitée (780 ng/l) : niveau courant en France.'
          : ''
      if (v === 0) return `TFA non quantifié.`
      return v >= 1
        ? `Le TFA vaut ${fois(v)} fois la somme des 20.${mediane}`
        : `Le TFA est inférieur à la somme des 20 (${fois(v)} fois) : la contamination est portée par les PFAS de la liste.${mediane}`
    }
    case 'ramifies':
      return v > 0
        ? `${pc(v)} d’isomères ramifiés : signature du procédé électrochimique, seul procédé qui produise le PFOS.`
        : 'Aucun isomère ramifié quantifié : ramifiés sous la LQ, ou isomères séparés par le transport dans le milieu ; le PFOS lui-même ne vient que du procédé électrochimique.'
    case 'fluor':
      if (v >= 1) return 'Les substances dosées portent autant de fluor que le paramètre global, voire plus : écart entre méthodes à signaler au laboratoire.'
      return `Les 22 substances expliquent ${pc(v)} du fluor organique mesuré ; ${pc(1 - v)} restent non identifiés.${
        v >= 0.5
          ? ' C’est au niveau des meilleurs bilans publiés près de sources de mousses.'
          : v < 0.05
            ? ' C’est l’ordre de grandeur des contaminations diffuses.'
            : ' Une part importante de PFAS n’est pas recherchée (précurseurs, autres familles) : un TOP ou une liste élargie la préciserait.'
      }`
  }
  return ''
}

export function formatIndicateur(i: Pick<Indicateur, 'valeur' | 'format'>): string {
  if (i.valeur === null) return '—'
  if (i.format === 'part') return `${(i.valeur * 100).toLocaleString('fr-FR', { maximumFractionDigits: i.valeur < 0.1 ? 1 : 0 })} %`
  const v = i.valeur
  return v >= 100 ? Math.round(v).toLocaleString('fr-FR') : v.toLocaleString('fr-FR', { maximumSignificantDigits: 2 })
}
