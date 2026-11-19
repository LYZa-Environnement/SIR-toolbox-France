/**
 * What to add to the deliverable for a point found missing: the paragraph
 * that should hold it — an existing one of the document, or one to create
 * next to its neighbours — and an example sentence written with the
 * document's own facts (site, commune, client, media, substances,
 * sampling points…). What the text does not tell is left in [brackets]
 * for the writer to fill in.
 */

import type { Point } from './controles.ts'
import { EXEMPLES } from './exemples.ts'
import type { Faits } from './faits.ts'
import { nommer, type Section } from './structure.ts'

export interface Proposition {
  /** Where to add it, in words: "Compléter le § 7 « Conclusions » (p. 28)." */
  paragraphe: string
  /** The sentence to adapt; [brackets] mark what is left to fill in. */
  phrase: string
  /** The sentence is the regulatory model's wording, not an example. */
  modele: boolean
}

interface Rubrique {
  titre: string
  /** Headings of the document that hold it. */
  motif: RegExp
  /** Place in a usual report, to set a new paragraph among the others. */
  ordre: number
  /** Where a new paragraph goes when no neighbour is found. */
  defaut: string
}

const RUBRIQUES = {
  garde: { titre: 'Fiche signalétique', motif: /fiche signaletique|page de garde|identification du (document|rapport)|historique des (versions|revisions|indices|modifications)|suivi des (versions|modifications)|visas?|diffusion/, ordre: 0, defaut: 'en page de garde ou dans la fiche signalétique' },
  admin: { titre: 'Présentation de la société', motif: /presentation (de (la societe|l.entreprise|notre societe)|du prestataire)|partie administrative|references|assurances?|certifications?|qualifications?/, ordre: 0.5, defaut: 'dans la partie administrative de l’offre' },
  resume: { titre: 'Résumé technique et résumé non technique', motif: /resume|synthese (technique|non technique|generale)|executive summary|note de synthese/, ordre: 1, defaut: 'en tête du rapport' },
  intro: { titre: 'Contexte et objectifs', motif: /introduction|contexte|objectifs?|objet (de la|du)|cadre (de la mission|de l.etude|de l.intervention|reglementaire)|preambule|perimetre|mission/, ordre: 2, defaut: 'en introduction' },
  documents: { titre: 'Documents de référence', motif: /documents?|references? (documentaires|bibliographiques)|bibliographie|data room|sources d.information|etudes? (anterieures|existantes|precedentes)|donnees d.entree/, ordre: 3, defaut: 'en introduction' },
  site: { titre: 'Présentation du site', motif: /presentation du site|description du site|localisation|situation (geographique|du site)|environnement du site|identification du site/, ordre: 4, defaut: 'dans la présentation du site' },
  visite: { titre: 'Visite du site', motif: /visite/, ordre: 5, defaut: 'après la présentation du site' },
  historique: { titre: 'Étude historique et documentaire', motif: /historique|documentaire|memorielle|activites|archives|situation administrative|icpe|sources (potentielles|de pollution)/, ordre: 6, defaut: 'après la présentation du site' },
  vulnerabilite: { titre: 'Vulnérabilité des milieux', motif: /vulnerabilite|geolog|hydrogeolog|hydrolog|contexte (environnemental|naturel)|milieux|enjeux|usages/, ordre: 7, defaut: 'après l’étude historique' },
  programme: { titre: 'Programme d’investigations', motif: /programme|strategie|investigations? (prevues|programmees)/, ordre: 8, defaut: 'avant la description des investigations' },
  investigations: { titre: 'Investigations réalisées', motif: /investigations?|travaux de terrain|prelevements?|campagne|sondages?|ouvrages|methodologie|moyens mis en oeuvre|mesures|essais?/, ordre: 9, defaut: 'dans la description des investigations' },
  resultats: { titre: 'Résultats et interprétation', motif: /resultats|interpretation|analyses?|qualite des|synthese des|constats?/, ordre: 10, defaut: 'dans le chapitre des résultats' },
  schema: { titre: 'Schéma conceptuel', motif: /schema conceptuel/, ordre: 11, defaut: 'après l’interprétation des résultats' },
  risques: { titre: 'Évaluation des risques sanitaires', motif: /risques? sanitaires?|evaluation (quantitative )?des risques|eqrs|enjeux sanitaires|risques residuels|\barr\b|analyse des risques/, ordre: 12, defaut: 'après le schéma conceptuel' },
  gestion: { titre: 'Scénarios de gestion', motif: /plan de gestion|scenarios?|bilan couts|couts?.avantages|mesures de gestion|options de gestion|objectifs de depollution/, ordre: 13, defaut: 'après l’évaluation des risques' },
  organisation: { titre: 'Organisation de la mission', motif: /organisation|planning|delais?|equipe|moyens|deroulement|phasage|qualite/, ordre: 14, defaut: 'dans la partie organisation' },
  securite: { titre: 'Hygiène, santé, sécurité et environnement', motif: /securite|hygiene|\bhse\b|\bhss\b|ppsps|prevention|environnement du chantier|nuisances/, ordre: 14.5, defaut: 'dans la partie organisation' },
  travaux: { titre: 'Travaux', motif: /travaux|chantier|mise en oeuvre|traitement|terrassements?|excavation|confinement|recolement/, ordre: 15, defaut: 'dans la description des travaux' },
  controles: { titre: 'Contrôles', motif: /controles?|reception|surveillance|suivi/, ordre: 16, defaut: 'après la description des travaux' },
  incertitudes: { titre: 'Limites et incertitudes', motif: /limites|incertitudes|reserves|ecarts/, ordre: 17, defaut: 'avant les conclusions' },
  conclusions: { titre: 'Conclusions et recommandations', motif: /conclusions?|recommandations|preconisations|suites a donner|avis|bilan/, ordre: 18, defaut: 'en fin de rapport, avant les annexes' },
  financier: { titre: 'Proposition financière', motif: /financier|financiere|commerciale|prix|devis|bordereau|conditions (generales|particulieres|de vente)/, ordre: 19, defaut: 'dans la proposition financière' },
  annexes: { titre: 'Annexes', motif: /^annexe|annexes/, ordre: 20, defaut: 'en annexe' },
} satisfies Record<string, Rubrique>

type Cle = keyof typeof RUBRIQUES

/** The usual paragraph of a point, from its id (then its group and title). */
const AFFECTATION: [RegExp, Cle][] = [
  [/^(resumes|pct-resumes|rnt)$/, 'resume'],
  [/certif-complet/, 'annexes'],
  [/nf1-r-(norme|codes|cp|sup|visas|verif-tiers|version)|^lne-m-|^(modele|produit|certificat|mentions|siret|signature)$/, 'garde'],
  [/nf1-o-(ident|assur)/, 'admin'],
  [/nf1-o-(prix|validite)/, 'financier'],
  [/nf1-o-(planning|cp-sup|moyens|st|qualite|livrables|client)|amo-cr|det-(presence|reunions|situations|information)/, 'organisation'],
  [/nf1-o-(hss|env)|ppsps|plan-prevention|resp-securite|-hs$|-hse$|suivi-nuisances|ap-emissions|pro-sante/, 'securite'],
  [/schema|-sc-/, 'schema'],
  [/incertitude|ecart-normes|-ecarts$|ecart-contenu|nf1-r-ecarts/, 'incertitudes'],
  [/conclusion|preco|suites|decision|compatibilite|recommand|bq-diag|adequation|nouvelle-etude|faisabilite|argumentaire|leve-perimetre|passif|methodo-nationale|acquisition|amo-conseil|xper-impact|observations|rfc-suivi-futur|ap-complements|-memoire$|^sis$|^destinataires$|^sensible$|^conclusion$/, 'conclusions'],
  [/bulletins|coupe|questionnaire|photos|calculs|notes-calcul|^rfc-(bsd|emissions|controles-internes|notice|plans-recolement|releve-geometre)|aor-(pv|prelevements)|det-(dechets|prelevements|pv-os)|plans-(implantation|execution)|certif-complet|^plans$|journal/, 'annexes'],
  [/visite|rayon|questionnaire/, 'visite'],
  [/^a110|^historique|administratif|activites|^verif-sources|pyrotechnie|restrictions$|^(exploitant|regime|aiot|installations|declaration)$/, 'historique'],
  [/^a120|vulnerab|enjeux|-usages$|^usages$|sdage|pgri|sage|natura|zre/, 'vulnerabilite'],
  [/^a320|vtr|additiv|-arr$|^arr$|grille|non-additivite|risques-residuels|objectifs-sanitaires/, 'risques'],
  [/^a330|^pg-(objectifs|mesures|couts|bilan|sources|delimitation|isoconcentrations)|scenario|^bca$|^mesures$|sources-concentrees|derogation|pct-maj-pg/, 'gestion'],
  [/a130|programme|nf1-o-(quantit|codes|orient)|diag-synthese/, 'programme'],
  [/^a2[0-6]|^prel-|^a210|^a230|^a260|^essai-|^pct-essais|^suivi-(conditions|parametres|prelevement|milieux)|^iem-milieux|^cont-(moyens|ouvrages)|^tech-|^rej-|forage|compteur|debits|consistance|rubriques|cumul/, 'investigations'],
  [/^a270|^iem-(referentiels|temoin|usages|vtr)|resultats|tableaux|cartes|piezo|referentiels|coherence|^bq-(graphiques|historique|analyse|tableaux)|^suivi-(historique|analyse|amont|comparaison|bilan|analyse-critique|taux)|^cont-(residuels|materiaux|liste|mesures)|^rfc-(interpretation|masse|bilan|bords|terres|tracabilite|remblais)|a250|verifs-ponctuelles|xper-(analyse|remarques)|^alur-(analyse|verifications|bilan|incidences|evolutions)/, 'resultats'],
  [/contexte|cadre|mission|champ|questions|objectifs|perimetre|intro|periode|nf1-o-conflit|amo-conflit|independance|xper-textes|^verif-presentation|^projet$|maitre-ouvrage|^parcelles$|emplacement|declarant|mandat|droit|^usage$/, 'intro'],
  [/documents|references|etudes-existantes|synthese-etudes|synthese-pg|p2-synthese|liste-docs|prerequis|^etude$|^note$|^memoire$|^secur$|precedentes|travaux-(anterieurs|realises)|ap-donnees/, 'documents'],
  [/^(ap|pro|dce|det|aor|org|rfc|suivi|tech)-|^(evacuation|acces|incendie|surveillance|ecarts|bilan|residuelle|recolement|objectifs)$/, 'travaux'],
  [/^(cont|xper)-/, 'controles'],
]

function rubrique(p: Point, base: string): Cle {
  for (const [re, cle] of AFFECTATION) if (re.test(base)) return cle
  const t = plierTexte(`${p.groupe} ${p.intitule}`)
  for (const [cle, r] of Object.entries(RUBRIQUES) as [Cle, Rubrique][]) if (r.motif.test(t)) return cle
  return 'resultats'
}

function plierTexte(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .toLowerCase()
}

const VIDES = new Set(['dans', 'avec', 'pour', 'selon', 'leurs', 'entre', 'avant', 'apres', 'chaque', 'toutes', 'autres', 'ainsi', 'compris', 'cette', 'sont', 'etre', 'identifies', 'identifie', 'indiques', 'decrits', 'presentes', 'rappeles', 'realises', 'realisee'])

/** Significant words of a point, cut to their stem. */
function mots(s: string): string[] {
  return [...new Set(plierTexte(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !VIDES.has(w)).map((w) => w.slice(0, 6)))]
}

function proximite(section: Section, ms: string[]): number {
  const titre = section.plie.split(/[^a-z0-9]+/).map((w) => w.slice(0, 6))
  return ms.filter((m) => titre.includes(m)).length
}

/** Classify a heading of the document, to place a new paragraph after it. */
function classer(s: Section): Cle | null {
  if (/^annexe/i.test(s.numero)) return 'annexes'
  for (const [cle, r] of Object.entries(RUBRIQUES) as [Cle, Rubrique][]) if (r.motif.test(s.plie)) return cle
  return null
}

function localiser(p: Point, cle: Cle, sections: Section[], estAttes: boolean): string {
  const r: Rubrique = RUBRIQUES[cle]
  const ms = mots(`${p.intitule} ${p.groupe}`)
  const corps = sections.filter((s) => !/^annexe/i.test(s.numero))

  if (cle === 'annexes') {
    const annexes = sections.filter((s) => /^annexe/i.test(s.numero) || /^annexes?$/.test(s.plie))
    const proche = annexes.map((s) => [s, proximite(s, ms)] as const).sort((a, b) => b[1] - a[1])[0]
    if (proche && proche[1] > 0) return `Compléter ${nommer(proche[0])}, et y renvoyer dans le texte du rapport.`
    if (annexes.length) return `Ajouter une annexe à la suite de ${nommer(annexes[annexes.length - 1])}, et y renvoyer dans le texte du rapport.`
    return 'Ajouter une annexe en fin de document, et y renvoyer dans le texte du rapport.'
  }

  const candidats = corps.filter((s) => r.motif.test(s.plie))
  if (candidats.length) {
    // The closest in words; the last one for conclusions (a "Conclusion"
    // closing an early chapter is less likely the place).
    const notes = candidats.map((s, i) => [s, proximite(s, ms) * 100 + (cle === 'conclusions' ? i : -i)] as const)
    const choisi = notes.sort((a, b) => b[1] - a[1])[0][0]
    return `Compléter le ${nommer(choisi)}.`
  }

  // No paragraph of that kind: one named like the point, if any.
  const voisin = corps.map((s) => [s, proximite(s, ms)] as const).sort((a, b) => b[1] - a[1])[0]
  if (voisin && voisin[1] >= 2) return `Compléter le ${nommer(voisin[0])}.`

  if (estAttes) return `Compléter la rubrique « ${p.groupe} » du modèle de l’arrêté du 9 février 2022.`

  // A paragraph to create, after the last heading that comes before it in a
  // usual report, or before the first that comes after.
  const chapitres = corps.filter((s) => s.niveau === 1)
  const liste = chapitres.length >= 2 ? chapitres : corps
  const classes = liste.map((s) => [s, classer(s)] as const).filter(([, c]) => c !== null) as [Section, Cle][]
  const avant = classes.filter(([, c]) => RUBRIQUES[c].ordre <= r.ordre).pop()
  const apres = classes.find(([, c]) => RUBRIQUES[c].ordre > r.ordre)
  const nouveau = `Créer un paragraphe « ${r.titre} »`
  // Identification of the document: on its cover, not in a paragraph of its own.
  if (cle === 'garde') return `Ajouter ${r.defaut}${liste.length ? `, avant le ${nommer(liste[0])}` : ''}.`
  if (cle === 'resume' && liste.length) return `${nouveau} en tête du rapport, avant le ${nommer(liste[0])}.`
  if (avant) return `${nouveau} après le ${nommer(avant[0])}.`
  if (apres) return `${nouveau} avant le ${nommer(apres[0])}.`
  return `${nouveau} ${r.defaut}.`
}

/** "les sols, les eaux souterraines et les gaz du sol". */
function liste(xs: string[], article = true): string {
  const a = xs.map((x) => (article ? `${/^(eaux|gaz|métaux|hydrocarbures|HAP|BTEX|COHV|PCB|PFAS|cyanures|pesticides|sols|végétaux)/.test(x) ? 'les' : 'l’'} ${x}`.replace('l’ ', 'l’') : x))
  return a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}`
}

/** What a placeholder becomes, or what is left to fill in. */
function valeurs(f: Faits, rapport: string, livrable: string): Record<string, string> {
  const site = f.site ?? (f.commune ? `le site de ${f.commune}` : 'le site [nom du site]')
  const ouvrages = [f.sondages && `les sondages ${f.sondages}`, f.piezometres && `les piézomètres ${f.piezometres}`, f.gaz && `les ouvrages de gaz du sol ${f.gaz}`].filter(Boolean) as string[]
  return {
    site,
    commune: f.commune ?? '[commune]',
    adresse: f.adresse ?? '[adresse du site]',
    client: f.client ?? '[maître d’ouvrage]',
    date: f.date ?? '[date]',
    annee: f.annee ?? '[année]',
    reference: f.reference ?? '[référence du dossier]',
    milieux: f.milieux.length ? liste(f.milieux) : '[milieux investigués]',
    substances: f.substances.length ? liste(f.substances, false) : '[substances recherchées]',
    sondages: f.sondages ?? '[sondages]',
    piezometres: f.piezometres ?? '[piézomètres]',
    gaz: f.gaz ?? '[ouvrages de gaz du sol]',
    ouvrages: ouvrages.length ? liste(ouvrages, false) : '[points de prélèvement]',
    labo: f.labo ?? '[laboratoire]',
    usage: f.usage ?? '[usage]',
    nappe: f.nappe ? `vers ${f.nappe} de profondeur` : 'à [profondeur] m de profondeur',
    codes: f.codes.length ? f.codes.join(', ') : '[codes des prestations]',
    parcelles: f.parcelles ?? '[section et n° de parcelle]',
    rapport,
    livrable,
  }
}

export function remplir(modele: string, f: Faits, rapport = 'le présent rapport', livrable = ''): string {
  const v = valeurs(f, rapport, livrable)
  const texte = modele.replace(/\{(\w+)\}/g, (m, k: string) => {
    const x = v[k.toLowerCase()]
    if (x === undefined) return m
    return /^[A-Z]/.test(k) ? x.charAt(0).toUpperCase() + x.slice(1) : x
  })
  return contracter(texte)
}

/** "de le site" → "du site", "à les abords" → "aux abords". */
function contracter(t: string): string {
  return t
    .replace(/\b([Dd])e le\b/g, '$1u')
    .replace(/\b([Dd])e les\b/g, '$1es')
    .replace(/(^|[\s(])à le\b/g, '$1au')
    .replace(/(^|[\s(])à les\b/g, '$1aux')
}

/** How the deliverable names itself, from the checklist chosen. */
const RAPPORTS: [RegExp, string][] = [
  [/^attes/, 'la présente attestation'],
  [/^iota$/, 'le présent dossier de déclaration'],
  [/^offre$/, 'la présente offre'],
  [/-leve$/, 'la présente levée de doute'],
  [/-infos$/, 'la présente étude historique, documentaire et de vulnérabilité'],
  [/-diag$/, 'le présent diagnostic'],
  [/-pg$/, 'le présent plan de gestion'],
  [/-iem$/, 'la présente interprétation de l’état des milieux'],
  [/-suivi$/, 'le présent rapport de surveillance'],
  [/-bq$/, 'le présent bilan quadriennal'],
  [/-cont$/, 'le présent rapport de contrôle'],
  [/-xper$/, 'la présente expertise'],
  [/-verif$/, 'le présent audit environnemental'],
  [/-amo$/, 'le présent rapport d’assistance à maîtrise d’ouvrage'],
  [/-PCT$/, 'le présent plan de conception des travaux'],
]

export interface Contexte {
  faits: Faits
  sections: Section[]
  /** The checklist chosen (its id and title). */
  referentiel: { id: string; titre: string }
}

/** The template of a point: the model's wording, or the example written for it. */
export function modeleDe(p: Point, referentielId: string): { texte: string; modele: boolean } | null {
  if (p.correction) return { texte: p.correction, modele: true }
  const complement = p.id.includes(':')
  const base = p.id.split(':').pop()!
  const famille = referentielId.startsWith('attes') ? 'attes' : referentielId === 'iota' ? 'iota' : ''
  const texte = (!complement && famille && EXEMPLES[`${famille}:${base}`]) || EXEMPLES[base]
  return texte ? { texte, modele: false } : null
}

export function proposer(p: Point, ctx: Contexte): Proposition {
  const base = p.id.split(':').pop()!
  const estAttes = ctx.referentiel.id.startsWith('attes') && !p.id.includes(':')
  const rapport = RAPPORTS.find(([re]) => re.test(ctx.referentiel.id))?.[1] ?? 'le présent rapport'
  const m = modeleDe(p, ctx.referentiel.id)
  return {
    paragraphe: localiser(p, rubrique(p, base), ctx.sections, estAttes),
    phrase: m ? remplir(m.texte, ctx.faits, rapport, ctx.referentiel.titre) : `[Rédiger : ${p.aide}]`,
    modele: m?.modele ?? false,
  }
}
