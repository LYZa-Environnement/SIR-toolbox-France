/**
 * Facts of the evaluated deliverable — site, commune, address, client,
 * date, media, substances, sampling points, laboratory, use — read from
 * its text, so that a sentence proposed for a missing point speaks of
 * this document and not of a generic one. Each reading is a heuristic: a
 * fact not found is left for the reader to fill in, in square brackets.
 */

import type { Texte } from './controles.ts'

export interface Faits {
  /** Name of the site, as written ("ancienne usine Dupont"). */
  site?: string
  commune?: string
  adresse?: string
  /** Client, maître d'ouvrage or donneur d'ordre. */
  client?: string
  /** Date of the report ("mars 2025", "12 mars 2025"). */
  date?: string
  annee?: string
  reference?: string
  /** Media investigated, most common first. */
  milieux: string[]
  /** Families of substances, most cited first. */
  substances: string[]
  /** Sampling points, as ranges: "S1 à S12". */
  sondages?: string
  piezometres?: string
  gaz?: string
  labo?: string
  usage?: string
  /** Depth of the water table: "8,5 m". */
  nappe?: string
  /** Codes of services (A100, A200, DIAG…). */
  codes: string[]
  parcelles?: string
}

const MOIS = 'janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre'

/** A proper name of place: "Lyon", "LE HAVRE", "Saint-Priest", "Villeneuve-d’Ascq". */
const NOM = "[A-ZÉÈÀÂÎÔ][A-Za-zÀ-ÿ'’]*(?:(?:-|\\s)(?:(?:sur|sous|en|lès|les|le|la|de|du|des)(?:-|\\s)|d['’])?[A-ZÉÈÀÂÎÔ][A-Za-zÀ-ÿ'’]*)*"

const MOTS_NON_COMMUNE = /^(Cedex|France|Tél|Tel|Fax|SIRET|Le|La|Les|Section|Annexe|Figure|Tableau)$/i

/** "LYON" → "Lyon", "SAINT-PRIEST" → "Saint-Priest"; mixed case kept. */
function casse(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(Sur|Sous|En|Lès|Les|Le|La|De|Du|Des)\b(?=[-\s])/g, (m, _a, i: number) => (i === 0 ? m : m.toLowerCase()))
}

const net = (s: string) => s.replace(/\s+/g, ' ').trim()

function premier(textes: string[], re: RegExp, groupe = 1): string | undefined {
  for (const t of textes) {
    const m = re.exec(t)
    if (m?.[groupe]) return net(m[groupe])
  }
  return undefined
}

function commune(pages: string[]): string | undefined {
  const tout = pages.join('\n')
  const motifs = [
    new RegExp(`(?:sur la |dans la |la )?commune (?:de |d['’])\\s*(${NOM})`, 'g'),
    new RegExp(`\\b(?:situ[ée]e?s?|implant[ée]e?s?|localis[ée]e?s?|sise?s?)\\s+(?:au\\s+[^,\\n]{0,60},\\s*)?(?:à|a)\\s+(${NOM})`, 'g'),
  ]
  for (const re of motifs) {
    for (const m of tout.matchAll(re)) {
      const c = net(m[1])
      if (!MOTS_NON_COMMUNE.test(c) && c.length > 1) return casse(c)
    }
  }
  // A postal code in a sentence about the site, rather than the consultant's
  // address repeated in every footer.
  const cp = new RegExp(`\\b(?:0[1-9]|[1-8]\\d|9[0-8]|2[AB])\\d{3}\\s+(${NOM})`, 'g')
  let repli: string | undefined
  for (const m of tout.matchAll(cp)) {
    const c = net(m[1])
    if (MOTS_NON_COMMUNE.test(c)) continue
    const avant = tout.slice(Math.max(0, (m.index ?? 0) - 160), m.index).toLowerCase()
    if (/\bsite|situ[ée]|terrain|projet|parcelle/.test(avant)) return casse(c)
    repli ??= casse(c)
  }
  return repli
}

function adresse(pages: string[]): string | undefined {
  const re = /\b(\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|boulevard|bd|chemin|route|all[ée]e|place|impasse|quai|cours|voie|rond-point)\s[^,\n;.()]{2,60})/gi
  const tout = pages.join('\n')
  let repli: string | undefined
  for (const m of tout.matchAll(re)) {
    const a = net(m[1])
    const avant = tout.slice(Math.max(0, (m.index ?? 0) - 160), m.index).toLowerCase()
    if (/\bsite|situ[ée]|terrain|projet|sis\b|localis/.test(avant)) return a
    repli ??= a
  }
  return repli
}

function client(pages: string[]): string | undefined {
  const textes = pages.slice(0, 6)
  const fin = String.raw`(?=\s*(?:[,.;(\n]|$|\s(?:a|afin|dans|pour|sur|en vue|qui)\s))`
  return (
    premier(textes, /(?:^|\n)\s*(?:client|ma[iî]tre d['’]ouvrage|donneur d['’]ordres?|demandeur|commanditaire)\s*:\s*([^\n]{2,70})/i) ??
    premier(textes, new RegExp(String.raw`(?:pour le compte de|[àa] la demande de|mandat[ée]e? par|missionn[ée]e? par)\s+(?:la soci[ée]t[ée]\s+|la commune de\s+|l['’]|la\s+|le\s+|les\s+)?([A-ZÉÈ0-9][\wÀ-ÿ&'’.\- ]{1,60}?)${fin}`))
  )
}

function siteNom(pages: string[]): string | undefined {
  const textes = pages.slice(0, 8)
  const etiquete = premier(textes, /(?:^|\n)\s*(?:nom du site|site [ée]tudi[ée]|d[ée]nomination du site|site)\s*:\s*([^\n;]{3,70})/i)
  if (etiquete) return `le site « ${etiquete.replace(/[.,;:]+$/, '')} »`
  const ancien = premier(
    textes,
    /(?<![\p{L}])((?:l['’])?[Aa]ncienne?\s+(?:usine|station[- ]service|garage|d[ée]charge|blanchisserie|teinturerie|pressing|imprimerie|fonderie|tannerie|friche|d[ée]p[ôo]t p[ée]trolier|usine [àa] gaz|site industriel)(?:\s+[A-ZÉ][\wÀ-ÿ&'’-]*){0,3})/u,
  )
  if (!ancien) return undefined
  return /^l['’]/i.test(ancien) ? ancien.replace(/^L/, 'l') : `l’${ancien.charAt(0).toLowerCase()}${ancien.slice(1)}`
}

/** "S1 à S12", or a short list when the numbering has gaps. */
function plage(prefixe: string, nums: number[]): string {
  const n = [...new Set(nums)].sort((a, b) => a - b)
  if (n.length === 1) return `${prefixe}${n[0]}`
  const continu = n[n.length - 1] - n[0] + 1 === n.length
  if (continu) return `${prefixe}${n[0]} à ${prefixe}${n[n.length - 1]}`
  const liste = n.slice(0, 5).map((x) => `${prefixe}${x}`)
  return n.length > 5 ? `${liste.join(', ')}, etc.` : `${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]}`
}

/** Sampling points named in the text, grouped by kind. */
function ouvrages(pages: string[]) {
  const tout = pages.join('\n')
  const par = new Map<string, number[]>()
  for (const m of tout.matchAll(/\b(SC|SP|TP|PZR|PGS|PZ|Pz|PG|PA|S|T|F)\s?-?(\d{1,3})\b(?![.,]\d|\s?(?:m\b|%|mg|°))/g)) {
    const p = m[1] === 'Pz' ? 'PZ' : m[1]
    par.set(p, [...(par.get(p) ?? []), Number(m[2])])
  }
  const meilleur = (prefixes: string[]) => {
    let r: [string, number[]] | undefined
    for (const p of prefixes) {
      const n = par.get(p)
      if (n && new Set(n).size >= 2 && (!r || new Set(n).size > new Set(r[1]).size)) r = [p, n]
    }
    return r
  }
  const s = meilleur(['S', 'SC', 'SP', 'T', 'TP', 'F'])
  const pz = meilleur(['PZ', 'PZR'])
  const g = meilleur(['PG', 'PGS', 'PA'])
  // Ouvrages are written as found, but "Pz" reads better than "PZ".
  return {
    sondages: s ? plage(s[0], s[1]) : undefined,
    piezometres: pz ? plage(pz[0] === 'PZ' ? (/\bPz\s?-?\d/.test(tout) ? 'Pz' : 'PZ') : pz[0], pz[1]) : undefined,
    gaz: g ? plage(g[0], g[1]) : undefined,
  }
}

const MILIEUX: [string, RegExp, number][] = [
  ['sols', /\bsols?\b(?! (?:et|ou) (?:des )?gaz)|\bremblais\b/g, 3],
  ['eaux souterraines', /eaux souterraines|piezometres?\b|\bnappe\b/g, 3],
  ['gaz du sol', /gaz (?:du|des) sols?|piezairs?/g, 2],
  ['air intérieur', /air (?:interieur|ambiant)|qualite de l.air/g, 2],
  ['eaux superficielles', /eaux superficielles|eaux de surface|cours d.eau/g, 4],
  ['végétaux potagers', /vegetaux|legumes|potagers?|denrees/g, 4],
]

const SUBSTANCES: [string, RegExp][] = [
  ['hydrocarbures (HCT C10-C40)', /hydrocarbures(?! aromatiques polycycliques)|\bhct\b|c10[- ]c40/g],
  ['HAP', /\bhap\b|hydrocarbures aromatiques polycycliques/g],
  ['BTEX', /\bbtex\b|benzene|toluene|xylenes?/g],
  ['COHV', /\bcohv\b|organo-?halogen|trichloroethyl|tetrachloroethyl|chlorure de vinyle|\bpce\b|\btce\b/g],
  ['métaux', /metaux|elements traces|\bets?m\b|arsenic|plomb|mercure|cadmium/g],
  ['PCB', /\bpcb\b|polychlorobiphenyl/g],
  ['PFAS', /\bpfas\b|perfluor|polyfluor/g],
  ['cyanures', /cyanures?/g],
  ['pesticides', /pesticides?|phytosanitaires?/g],
]

const compte = (t: string, re: RegExp) => [...t.matchAll(re)].length

const LABOS = /\b(Eurofins|Agrolab|Wessling|Synlab|SGS|ALS|Alcontrol|Analytico|Carso|Inovalys|Laboratoires? des Pyr[ée]n[ée]es|Bureau Veritas)\b/

const USAGES: Record<string, string> = {
  industriel: 'industriel',
  residentiel: 'résidentiel',
  tertiaire: 'tertiaire',
  commercial: 'commercial',
  sensible: 'sensible',
  agricole: 'agricole',
  recreatif: 'récréatif',
}

export function lireFaits(t: Texte): Faits {
  const { pages, plies } = t
  const plie = plies.join('\n')

  const milieux = MILIEUX.map(([n, re, min]) => [n, compte(plie, re), min] as const)
    .filter(([, c, min]) => c >= min)
    .map(([n]) => n)
  const substances = SUBSTANCES.map(([n, re]) => [n, compte(plie, re)] as const)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([n]) => n)

  const usages = new Map<string, number>()
  for (const m of plie.matchAll(/usages? (?:futur |actuel |projete |prevu |envisage )?(?:de type |a caractere )?(industriel|residentiel|tertiaire|commercial|sensible|agricole|recreatif)/g)) usages.set(m[1], (usages.get(m[1]) ?? 0) + 1)
  const usage = [...usages].sort((a, b) => b[1] - a[1])[0]?.[0]

  const nappe = /nappe[^.]{0,100}?\b(\d{1,2}(?:[.,]\d{1,2})?)\s?m(?:etres?)?\b(?! ?(?:3|²|ngf))/.exec(plie)?.[1]?.replace('.', ',')

  const debut = pages.slice(0, 3)
  const dateLongue = premier(debut, new RegExp(`\\b((?:\\d{1,2}(?:er)?\\s+)?(?:${MOIS})\\s+(?:19|20)\\d{2})\\b`, 'i'))
  const date = dateLongue ? dateLongue.replace(/^\p{L}/u, (c) => c.toLowerCase()) : premier(debut, /\b(\d{2}\/\d{2}\/(?:19|20)\d{2})\b/)
  const annee = date?.match(/(19|20)\d{2}/)?.[0]

  const codes = [...new Set([...pages.join('\n').matchAll(/\b([ABC]\d{3}[a-z]?)\b/g)].map((m) => m[1]))].sort().slice(0, 12)

  const parcelles = premier(pages, /\b(section\s+[A-Z]{1,2}\s*(?:n°|no|num[ée]ros?|parcelles?)?\s*\d{1,4}(?:\s*(?:,|et|à)\s*\d{1,4})*)/i)

  return {
    site: siteNom(pages),
    commune: commune(pages),
    adresse: adresse(pages),
    client: client(pages),
    date,
    annee,
    reference: premier(debut, /\b(?:r[ée]f(?:[ée]rence)?\.?(?: du (?:rapport|dossier))?|rapport n°)\s*:?\s*([A-Z0-9][\w\-/.]{3,30}\d[\w\-/.]*)/i),
    milieux,
    substances,
    ...ouvrages(pages),
    labo: LABOS.exec(pages.join('\n'))?.[1],
    usage: usage ? USAGES[usage] : undefined,
    nappe: nappe ? `${nappe} m` : undefined,
    codes,
    parcelles,
  }
}
