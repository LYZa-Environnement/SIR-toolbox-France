/**
 * ERM guide values (valeurs indicatives de comparaison) for a lab parameter.
 *
 * The three reference workbooks are extracted to data/valeurs-guides.json by
 * scripts/valeurs-guides.mjs. A parameter is matched by CAS number when both
 * sides have one, else by name — labs and references spell the same
 * substance differently ("1,1-dichloroéthène" / "1,1-Dichloroéthylène",
 * "chloroforme" / "Trichlorométhane (chloroforme)"), hence the normalising
 * and the few synonyms below.
 */

import donnees from '../../data/valeurs-guides.json' with { type: 'json' }
import type { Parametre } from './parse.ts'

export type Matrice = 'eau' | 'sol' | 'air'
export type CasEau = 1 | 2 | 3
export type ContexteMetaux = 'sur site' | 'hors site'
export type Repere = 'r1' | 'r2' | 'r3'

export interface OptionsGuides {
  casEau: CasEau
  metaux: ContexteMetaux
  repere: Repere
}

export interface ValeurGuide {
  /** In the reference's own unit (`unite`). */
  valeur: number
  unite: string
  source: string
}

export const REFERENTIELS = donnees

// ---- Name matching -------------------------------------------------------

const SYNONYMES: [RegExp, string][] = [
  [/\bethene\b/g, 'ethylene'],
  [/\bchloroforme\b/g, 'trichloromethane'],
  [/\btetrachlorure de carbone\b/g, 'tetrachloromethane'],
  [/\bchlorure de methylene\b/g, 'dichloromethane'],
  [/\b(perchloroethylene|pce)\b/g, 'tetrachloroethylene'],
  [/\btce\b/g, 'trichloroethylene'],
  [/^(somme des |total )?xylenes( totaux| m p et o| m p o| o m p)?$/, 'xylenes'],
  [/^btex( totaux)?$/, 'btex'],
  [/^(somme (de |des )?(16 )?hap( 15| 16)?( et naphtalene)?( volatil)?|hap totaux|hap (16 )?somme|somme hap)$/, 'somme des hap'],
  [/^(indice |indice d )?hydrocarbures?( totaux)? c10 (a )?c40$/, 'hydrocarbures c10 c40'],
  [/^chrome total$/, 'chrome'],
  [/^mercure et composes$/, 'mercure'],
  [/^(pcb 7 congeneres|somme des 7 pcb|pcb totaux 7|somme des pcb 7|pcb somme des 7 congeneres)$/, 'pcb 7'],
  // A lab's plain "COT" on soil is the raw-soil one, not the leachate one.
  [/^cot$/, 'cot sur sol brut'],
]

export function normaliser(nom: string): string {
  let n = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  for (const [motif, remplacement] of SYNONYMES) n = n.replace(motif, remplacement)
  return n
}

/** "Trichlorométhane (chloroforme)" answers to both names. */
function cles(nom: string): string[] {
  const sansParentheses = nom.replace(/\([^)]*\)/g, ' ')
  const dedans = [...nom.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])
  return [...new Set([normaliser(nom), normaliser(sansParentheses), ...dedans.map(normaliser)].filter((k) => k.length > 1))]
}

function trouver<T extends { cas: string; nom: string }>(liste: T[], p: Parametre): T | undefined {
  if (p.cas) {
    const parCas = liste.find((e) => e.cas === p.cas)
    if (parCas) return parCas
  }
  const voulues = cles(p.nom)
  return liste.find((e) => cles(e.nom).some((k) => voulues.includes(k)))
}

// ---- Units ---------------------------------------------------------------

const MASSE: Record<string, number> = { ng: 1e-9, µg: 1e-6, ug: 1e-6, mcg: 1e-6, mg: 1e-3, g: 1 }
const BASE: Record<string, number> = { l: 1, ml: 1e-3, kg: 1, g: 1e-3, m3: 1, 'm³': 1 }

/** Factor f such that a value in `de` × f is in `vers`; null if unrelated. */
export function facteurUnite(de: string, vers: string): number | null {
  const lire = (u: string) => {
    const m = u.trim().toLowerCase().replace('μ', 'µ').match(/^(ng|µg|ug|mcg|mg|g)\s*\/\s*(ml|l|kg|g|m3|m³)(?![a-z0-9])/)
    return m ? { masse: MASSE[m[1]], base: m[2] === 'm³' ? 'm3' : m[2] } : null
  }
  const a = lire(de)
  const b = lire(vers)
  if (!a || !b) return null
  const famille = (x: string) => (x === 'l' || x === 'ml' ? 'v' : x === 'm3' ? 'a' : 'm')
  if (famille(a.base) !== famille(b.base)) return null
  return a.masse / BASE[a.base] / (b.masse / BASE[b.base])
}

// ---- Values per matrix -----------------------------------------------------

function eau(p: Parametre, o: OptionsGuides): ValeurGuide | null {
  const e = trouver(donnees.eau.valeurs, p)
  if (!e) return null
  const rangs = donnees.eau.cas.find((c) => c.id === o.casEau)!.rangs as Record<string, number>
  const ordre = Object.keys(rangs).sort((x, y) => rangs[x] - rangs[y])
  const sources = e.sources as Record<string, number>
  const code = ordre.find((s) => sources[s] !== undefined)
  return code ? { valeur: sources[code], unite: donnees.eau.unite, source: code } : null
}

function sol(p: Parametre, o: OptionsGuides): ValeurGuide | null {
  const m = trouver(donnees.sol.metaux, p)
  if (m) {
    // Sur site, le bruit de fond prime ; hors site, le seuil de vigilance.
    const candidats: [number | null, string][] =
      o.metaux === 'sur site'
        ? [[m.inra, '(a)'], [m.seuilVigilance, '(b)']]
        : [[m.seuilVigilance, '(b)'], [m.inra, '(a)']]
    const retenu = candidats.find(([v]) => v !== null)
    return retenu ? { valeur: retenu[0]!, unite: donnees.sol.unite, source: retenu[1] } : null
  }
  const org = trouver(donnees.sol.organiques, p)
  if (!org) return null
  return org.valeur === null ? null : { valeur: org.valeur, unite: donnees.sol.unite, source: org.source }
}

function air(p: Parametre, o: OptionsGuides): ValeurGuide | null {
  const a = trouver(donnees.air.valeurs, p)
  const v = a?.[o.repere]
  return v === null || v === undefined ? null : { valeur: v, unite: 'mg/m³', source: o.repere.toUpperCase() }
}

export function valeurGuide(matrice: Matrice, p: Parametre, o: OptionsGuides): ValeurGuide | null {
  return matrice === 'eau' ? eau(p, o) : matrice === 'sol' ? sol(p, o) : air(p, o)
}

/** The guide value expressed in `unite` (the lab's, or the output one). */
export function valeurGuideEn(matrice: Matrice, p: Parametre, o: OptionsGuides, unite: string): { valeur: number; source: string } | null {
  const g = valeurGuide(matrice, p, o)
  if (!g) return null
  const f = facteurUnite(g.unite, unite)
  return f === null ? null : { valeur: Number((g.valeur * f).toPrecision(12)), source: g.source }
}

// ---- Legend under the table -------------------------------------------------

export function legendeGuides(matrice: Matrice, o: OptionsGuides): { titre: string; sources: { code: string; libelle: string }[]; reference: string } {
  if (matrice === 'eau') {
    const cas = donnees.eau.cas.find((c) => c.id === o.casEau)!
    return {
      titre: `Valeurs de comparaison retenues — cas ${cas.id} : ${cas.libelle}`,
      sources: donnees.eau.sources,
      reference: `ERM, valeurs indicatives de comparaison pour les eaux souterraines (mise à jour du ${dateFr(donnees.eau.miseAJour)})`,
    }
  }
  if (matrice === 'sol') {
    return {
      titre: `Valeurs de comparaison retenues — métaux : ${o.metaux === 'sur site' ? 'réutilisation sur site' : 'usage hors site'} ; composés organiques : critères d'admission en installation de stockage de déchets inertes`,
      sources: donnees.sol.sources,
      reference: `ERM, valeurs indicatives de comparaison pour les sols (version d'octobre 2023)`,
    }
  }
  return {
    titre: `Valeurs de comparaison retenues — valeurs repères ${o.repere.toUpperCase()} pour l'air intérieur`,
    sources: [
      { code: 'R1, R2, R3', libelle: "Valeurs repères pour l'air intérieur de la méthodologie nationale de gestion des sites et sols pollués" },
      {
        code: 'Sources',
        libelle:
          "INERIS, rapport INERIS-21-204087-2706501-v1.0 du 21/10/2021, actualisation 2021 des valeurs repères R1, R2 et R3 ; HCSP, avis du 11 septembre 2025 relatif au tétrachloroéthylène",
      },
    ],
    reference: `ERM, valeurs repères R1, R2 et R3 pour l'air intérieur (mise à jour du ${dateFr(donnees.air.miseAJour)})`,
  }
}

function dateFr(iso: string): string {
  const [a, m, j] = iso.split('-')
  return j ? `${j}/${m}/${a}` : iso
}
