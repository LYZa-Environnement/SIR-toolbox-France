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
  const pfca = somme(e, PFCA)
  const pfsa = somme(e, PFSA)
  const total20 = pfca + pfsa
  const r: Indicateur[] = []

  r.push({
    id: 'sulfonates',
    titre: 'Part des sulfonates (PFSA)',
    formule: 'Σ PFSA / (Σ PFSA + Σ PFCA), sur les 20 PFAS',
    format: 'part',
    ...part(pfsa, total20),
    lecture:
      'Majoritaires, les sulfonates rapprochent le profil des mousses anciennes à fluoration électrochimique (PFOS, PFHxS) et des usages historiques du PFOS. Minoritaires, ce sont les carboxylates qui dominent : produits terminaux de la dégradation des fluorotélomères, retombées diffuses, lixiviats.',
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
      'Supérieur à 1, le PFOS domine : mousses à fluoration électrochimique, chromage antérieur à l’interdiction du PFOS, boues d’épuration. Inférieur à 1, le PFOA domine : chimie des fluoropolymères, retombées diffuses, lixiviats.',
    refs: ['anderson2016', 'egle2020', 'sepulvado2011', 'prevedouros2006', 'rankin2016', 'hamid2018'],
  })
  r.push({
    id: 'pfhxsPfos',
    titre: 'Rapport PFHxS / PFOS',
    formule: 'PFHxS / PFOS',
    format: 'rapport',
    ...rapport(q(e.substances.PFHxS), q(e.substances.PFOS), 'PFOS non quantifié'),
    lecture:
      'Les mousses à fluoration électrochimique associaient PFOS, PFHxS et leurs précurseurs : un PFHxS bien présent à côté du PFOS appuie cette piste. Un PFOS sans PFHxS oriente plutôt vers d’autres usages du PFOS, à confirmer par l’historique du site.',
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
        'La fluoration électrochimique produit un mélange d’isomères linéaires et ramifiés, la télomérisation un produit essentiellement linéaire : des isomères ramifiés signent la fluoration électrochimique.',
      refs: ['benskin2010'],
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

export function formatIndicateur(i: Pick<Indicateur, 'valeur' | 'format'>): string {
  if (i.valeur === null) return '—'
  if (i.format === 'part') return `${(i.valeur * 100).toLocaleString('fr-FR', { maximumFractionDigits: i.valeur < 0.1 ? 1 : 0 })} %`
  const v = i.valeur
  return v >= 100 ? Math.round(v).toLocaleString('fr-FR') : v.toLocaleString('fr-FR', { maximumSignificantDigits: 2 })
}
