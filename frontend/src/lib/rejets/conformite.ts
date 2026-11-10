/**
 * Conformity of a treatment unit's discharge with the arrêté du 2 février
 * 1998 (prélèvements et consommation d'eau, émissions de toute nature des
 * ICPE soumises à autorisation), version consolidée :
 *
 * - air, canalised discharge: article 27 (limits by maximal hourly flux),
 *   article 24 (normal conditions, dry gas, reference oxygen), article 28;
 * - water: article 31 (pH, temperature), article 32 (discharge to the
 *   natural environment, limits by maximal daily flux), article 34
 *   (discharge to a collective treatment plant);
 * - both: article 21 III (24 h means; with permanent self-monitoring, 10 %
 *   of the results may exceed the limit, never twice it).
 *
 * The limits apply by the maximal flux authorised by the prefectoral
 * order; without it, the flux is the measured concentration times the flow
 * of the discharge. Results below the LQ give two bounds: the sum of the
 * quantified results, and the same with each LQ added. A limit is met when
 * the upper bound is within it, exceeded when the lower one is beyond it,
 * and the result is indeterminate in between (LQ too high).
 */

import { PAR_ID, type ClasseCov, type Substance } from './substances.ts'
import type { Milieu } from './unites.ts'
import { nombreFr } from '../format.ts'

export interface Resultat {
  /** In the reference unit (mg/m³, mg C/m³ for total VOC, mg/l). */
  valeur: number
  inferieur: boolean
}

export interface LigneEvaluee {
  libelle: string
  substance: Substance | null
  /** VOC of no listed substance: class and carbon share given by hand. */
  covLibre?: { classe: ClasseCov; fractionCarbone: number | null }
  /** One per measurement (column); null: not analysed. */
  valeurs: (Resultat | null)[]
}

export interface ContexteAir {
  /** Flow of the discharge, Nm³/h, dry gas. */
  debit: number | null
  oxydation: boolean
  /** Treatment efficiency of the oxidiser, %. */
  rendement: number | null
  /** Oxygen measured and of reference, % — concentrations brought to the reference. */
  o2Mesure: number | null
  o2Reference: number | null
}

export type Destination = 'milieu' | 'step-urbaine' | 'step-industrielle'

export interface ContexteEau {
  destination: Destination
  /** Daily flow of the discharge, m³/d. */
  debit: number | null
  /** Receiving waters of article D. 211-10 (salmonid, cyprinid, shellfish…). */
  d21110: boolean
  zoneSensible: boolean
  lagunage: boolean
  neutralisationAlcaline: boolean
  /** Connected discharge whose agreement allows up to 50 °C. */
  temperature50: boolean
}

export interface Donnees {
  milieu: Milieu
  air: ContexteAir
  eau: ContexteEau
  lignes: LigneEvaluee[]
  mesures: string[]
  /** Permanent self-monitoring (at least one representative measure a day). */
  permanente: boolean
  /** Authorised maximal flux per check, g/h (air) or g/d (water). */
  fluxAutorises: Record<string, number>
}

export type Statut = 'conforme' | 'depassement' | 'indetermine' | 'non-soumis' | 'ap' | 'sans-donnee'

export const LIBELLES_STATUT: Record<Statut, string> = {
  conforme: 'Conforme',
  depassement: 'Non conforme',
  indetermine: 'Indéterminé (LQ)',
  'non-soumis': 'Non soumis (flux sous le seuil)',
  ap: "Valeur limite à fixer par l'arrêté préfectoral",
  'sans-donnee': 'Non mesuré',
}

export interface Borne {
  bas: number
  haut: number
}

export interface Evaluation {
  concentration: Borne | null
  flux: Borne | null
  /** Flux the threshold was compared with: authorised, else measured. */
  fluxRetenu: Borne | null
  vle: number | null
  vleMin?: number
  statut: Statut
  notes: string[]
}

export interface Controle {
  id: string
  reference: string
  libelle: string
  unite: string
  uniteFlux: string
  /** Lab rows that make it up. */
  composantes: string[]
  vleTexte: string
  seuilTexte: string
  /** The flux threshold, in uniteFlux, for display. */
  mesures: Evaluation[]
  synthese: { statut: Statut; texte: string; ratioMax: number | null }
  /** Substance to be phased out (article 22-2-III, starred in 32 4°). */
  suppression?: boolean
}

// ---- Sums with the LQ -------------------------------------------------------------------

function sommer(rs: (Resultat | null)[], facteurs: number[] = []): Borne | null {
  let vu = false
  let bas = 0
  let haut = 0
  rs.forEach((r, i) => {
    if (!r) return
    vu = true
    const f = facteurs[i] ?? 1
    if (!r.inferieur) bas += r.valeur * f
    haut += r.valeur * f
  })
  return vu ? { bas, haut } : null
}

const fois = (b: Borne | null, f: number): Borne | null => (b ? { bas: b.bas * f, haut: b.haut * f } : null)
const fr = (x: number) => nombreFr(x, 6)

type Comparaison = 'gt' | 'ge'
const franchi = (x: number, seuil: number, c: Comparaison) => (c === 'gt' ? x > seuil : x >= seuil)

/** Limit against a concentration's bounds. */
function verdict(c: Borne, vle: number): Statut {
  if (c.haut <= vle) return 'conforme'
  if (c.bas > vle) return 'depassement'
  return 'indetermine'
}

// ---- Building blocks ----------------------------------------------------------------------

interface Definition {
  id: string
  reference: string
  libelle: string
  /** Which rows: by substance id, or a predicate. */
  ids?: string[]
  filtre?: (l: LigneEvaluee) => boolean
  /** Factor applied to each row (carbon share for total VOC). */
  facteur?: (l: LigneEvaluee) => number | null
  unite?: string
  /** Flux threshold (g/h or g/d); null: none. */
  seuil: number | null
  comparaison?: Comparaison
  /** Rows whose flux is compared with the threshold, when not the same. */
  idsFlux?: string[]
  filtreFlux?: (l: LigneEvaluee) => boolean
  /** Limit by flux tier: [flux upper bound, limit] in increasing flux. */
  vle: number | null | ((flux: number | null) => number | null)
  vleTexte: string
  seuilTexte: string
  /** Over the threshold, the limit is the prefect's to set. */
  ap?: boolean
  suppression?: boolean
  notes?: string[]
  /** No flux: a physical parameter (temperature). */
  sansFlux?: boolean
}

function lignesDe(d: Donnees, def: { ids?: string[]; filtre?: (l: LigneEvaluee) => boolean }): LigneEvaluee[] {
  const ls = d.lignes.filter((l) => (def.filtre ? def.filtre(l) : !!l.substance && def.ids!.includes(l.substance.id)))
  // A xylene total and its isomers: the isomers only.
  const isomeres = ls.some((l) => l.substance?.id === 'oxylene' || l.substance?.id === 'mpxylene')
  return isomeres ? ls.filter((l) => l.substance?.id !== 'xylenes') : ls
}

/** Brings air concentrations to the reference oxygen (article 24). */
function correctionO2(d: Donnees): number {
  const { o2Mesure, o2Reference, oxydation } = d.air
  if (d.milieu !== 'air' || oxydation || o2Mesure === null || o2Reference === null || o2Mesure >= 21) return 1
  return (21 - o2Reference) / (21 - o2Mesure)
}

function evaluer(d: Donnees, def: Definition): Controle {
  const lignes = lignesDe(d, def)
  const lignesFlux = def.filtreFlux ? lignesDe(d, { filtre: def.filtreFlux }) : def.idsFlux ? lignesDe(d, { ids: def.idsFlux }) : lignes
  const air = d.milieu === 'air'
  const debit = air ? d.air.debit : d.eau.debit
  const autorise = d.fluxAutorises[def.id]
  const o2 = correctionO2(d)
  const uniteFlux = air ? 'g/h' : 'g/j'
  const mesures = d.mesures.map((_, j): Evaluation => {
    const notes: string[] = []
    const facteurs = lignes.map((l) => def.facteur?.(l) ?? 1)
    const brute = sommer(
      lignes.map((l) => l.valeurs[j]),
      facteurs,
    )
    const pourFlux = sommer(lignesFlux.map((l) => l.valeurs[j]))
    // mg/m³ × Nm³/h = mg/h → g/h ; mg/l × m³/d = g/d.
    const flux = pourFlux && debit !== null && !def.sansFlux ? fois(pourFlux, air ? debit / 1000 : debit) : null
    const fluxRetenu = autorise !== undefined ? { bas: autorise, haut: autorise } : flux
    const concentration = brute ? fois(brute, o2) : null
    if (!concentration) return { concentration: null, flux, fluxRetenu, vle: null, statut: 'sans-donnee', notes }
    if (o2 !== 1) notes.push(`Concentration ramenée à ${fr(d.air.o2Reference!)} % d'O2 (mesuré : ${fr(d.air.o2Mesure!)} %).`)
    if (autorise !== undefined) notes.push(`Seuil comparé au flux maximal autorisé saisi (${fr(autorise)} ${uniteFlux}).`)
    else if (!flux && def.seuil !== null) notes.push('Débit non renseigné : flux non calculé, la valeur limite est appliquée par défaut.')
    else if (!flux && typeof def.vle === 'function') notes.push('Débit non renseigné : flux non calculé, la valeur limite la plus stricte est retenue.')

    // Over the threshold? On the lower bound; when only the upper one
    // crosses it (LQ), the stricter reading is kept.
    let soumis = true
    if (def.seuil !== null && fluxRetenu) {
      const c = def.comparaison ?? 'gt'
      soumis = franchi(fluxRetenu.bas, def.seuil, c)
      if (!soumis && franchi(fluxRetenu.haut, def.seuil, c)) {
        soumis = true
        notes.push('Le seuil de flux n’est franchi qu’en comptant les LQ : la valeur limite est appliquée par prudence.')
      }
    }
    const fluxVle = fluxRetenu ? (fluxRetenu.bas === fluxRetenu.haut ? fluxRetenu.bas : fluxRetenu.haut) : null
    const vle = typeof def.vle === 'function' ? def.vle(fluxVle) : def.vle
    if (!soumis) return { concentration, flux, fluxRetenu, vle, statut: 'non-soumis', notes }
    if (def.ap) return { concentration, flux, fluxRetenu, vle: null, statut: 'ap', notes }
    if (vle === null) return { concentration, flux, fluxRetenu, vle: null, statut: 'ap', notes }
    return { concentration, flux, fluxRetenu, vle, statut: verdict(concentration, vle), notes }
  })
  return {
    id: def.id,
    reference: def.reference,
    libelle: def.libelle,
    unite: def.unite ?? (air ? 'mg/m³' : 'mg/l'),
    uniteFlux,
    composantes: lignes.map((l) => l.libelle),
    vleTexte: def.vleTexte,
    seuilTexte: def.seuilTexte,
    mesures: mesures.map((m) => (def.notes?.length && m.statut !== 'sans-donnee' ? { ...m, notes: [...def.notes, ...m.notes] } : m)),
    synthese: synthese(d, mesures),
    suppression: def.suppression,
  }
}

/** Over the series of measurements (article 21 III). */
function synthese(d: Donnees, ms: Evaluation[], moyenne?: { vle: number }): Controle['synthese'] {
  const evalues = ms.filter((m) => m.statut === 'conforme' || m.statut === 'depassement' || m.statut === 'indetermine')
  const ratios = evalues.filter((m) => m.vle).map((m) => m.concentration!.bas / m.vle!)
  const ratioMax = ratios.length ? Math.max(...ratios) : null
  if (!evalues.length) {
    const s: Statut = ms.some((m) => m.statut === 'ap') ? 'ap' : ms.some((m) => m.statut === 'non-soumis') ? 'non-soumis' : 'sans-donnee'
    return { statut: s, texte: LIBELLES_STATUT[s], ratioMax }
  }
  const n = evalues.length
  const dep = evalues.filter((m) => m.statut === 'depassement').length
  const ind = evalues.filter((m) => m.statut === 'indetermine').length
  if (moyenne) {
    // Nitrogen and phosphorus: monthly mean within the limit, each 24 h
    // sample within twice it.
    const bas = evalues.reduce((s, m) => s + m.concentration!.bas, 0) / n
    const haut = evalues.reduce((s, m) => s + m.concentration!.haut, 0) / n
    const st = verdict({ bas, haut }, moyenne.vle)
    const s: Statut = dep ? 'depassement' : st
    return { statut: s, texte: `Moyenne des ${n} mesure${n > 1 ? 's' : ''} : ${fr(bas)}${haut > bas ? ` à ${fr(haut)}` : ''} pour ${fr(moyenne.vle)} — ${LIBELLES_STATUT[s].toLowerCase()}`, ratioMax }
  }
  if (d.permanente && n > 1) {
    const toleres = Math.floor(n * 0.1)
    const double = evalues.some((m) => m.vle !== null && m.concentration!.bas > 2 * m.vle)
    const s: Statut = double || dep > toleres ? 'depassement' : ind ? 'indetermine' : 'conforme'
    return {
      statut: s,
      texte: `${dep} dépassement${dep > 1 ? 's' : ''} sur ${n} mesures (${toleres} toléré${toleres > 1 ? 's' : ''} : 10 %, sans dépasser le double de la valeur limite)${double ? ' ; au moins une mesure au-delà du double' : ''}`,
      ratioMax,
    }
  }
  const s: Statut = dep ? 'depassement' : ind ? 'indetermine' : 'conforme'
  return { statut: s, texte: n > 1 ? `${dep} dépassement${dep > 1 ? 's' : ''} sur ${n} mesures` : LIBELLES_STATUT[s], ratioMax }
}

// ---- Air: article 27 ----------------------------------------------------------------------

const classeDe = (l: LigneEvaluee): ClasseCov | null => l.covLibre?.classe ?? l.substance?.cov?.classe ?? null
const estCov = (l: LigneEvaluee) => !!(l.covLibre || l.substance?.cov)

function controlesAir(d: Donnees): Controle[] {
  const ox = d.air.oxydation
  const vleCov = ox ? (d.air.rendement !== null && d.air.rendement > 98 ? 50 : 20) : 110
  const covt = d.lignes.some((l) => l.substance?.id === 'covt')
  const fraction = (l: LigneEvaluee) => l.covLibre?.fractionCarbone ?? l.substance?.cov?.fractionCarbone ?? null
  const sansCarbone = d.lignes.filter((l) => estCov(l) && fraction(l) === null).map((l) => l.libelle)
  const defs: Definition[] = [
    {
      id: 'poussieres', reference: 'Art. 27 1°', libelle: 'Poussières totales', ids: ['poussieres'], seuil: null,
      vle: (f) => (f !== null && f <= 1000 ? 100 : 40),
      vleTexte: '100 mg/m³ si flux ≤ 1 kg/h ; 40 mg/m³ au-delà', seuilTexte: 'Toujours applicable',
    },
    { id: 'so2', reference: 'Art. 27 3°', libelle: 'Oxydes de soufre (en SO2)', ids: ['so2'], seuil: 25000, vle: 300, vleTexte: '300 mg/m³', seuilTexte: '> 25 kg/h' },
    { id: 'nox', reference: 'Art. 27 4° a', libelle: "Oxydes d'azote hors N2O (en NO2)", ids: ['nox'], seuil: 25000, vle: 500, vleTexte: '500 mg/m³', seuilTexte: '> 25 kg/h' },
    { id: 'hcl', reference: 'Art. 27 5°', libelle: 'Chlorure d’hydrogène et composés inorganiques gazeux du chlore (en HCl)', ids: ['hcl'], seuil: 1000, vle: 50, vleTexte: '50 mg/m³', seuilTexte: '> 1 kg/h' },
    { id: 'hf', reference: 'Art. 27 6°', libelle: 'Fluor et composés inorganiques gazeux (en HF)', ids: ['hf'], idsFlux: ['hf', 'hf-part'], seuil: 500, vle: 5, vleTexte: '5 mg/m³', seuilTexte: '> 500 g/h (fluor total)' },
    { id: 'hf-part', reference: 'Art. 27 6°', libelle: 'Fluor : vésicules et particules (en HF)', ids: ['hf-part'], idsFlux: ['hf', 'hf-part'], seuil: 500, vle: 5, vleTexte: '5 mg/m³', seuilTexte: '> 500 g/h (fluor total)' },
    {
      id: 'cov', reference: 'Art. 27 7° a', libelle: covt ? 'COV totaux hors méthane (mesure en carbone total)' : 'COV hors méthane, en carbone total (somme des composés analysés)',
      filtre: covt ? (l) => l.substance?.id === 'covt' : (l) => estCov(l) && fraction(l) !== null,
      facteur: covt ? undefined : (l) => fraction(l),
      unite: 'mg C/m³',
      // The threshold on the mass flux of the compounds when analysed one by
      // one (larger than their carbon), else on the measured total.
      filtreFlux: covt ? undefined : estCov,
      seuil: 2000, vle: vleCov,
      vleTexte: ox ? `Oxydation : ${vleCov} mg C/m³ (${vleCov === 50 ? 'rendement > 98 %' : 'rendement ≤ 98 % ou non renseigné'})` : '110 mg C/m³',
      seuilTexte: '> 2 kg/h',
      notes: covt
        ? []
        : [
            'Somme des composés analysés, chacun converti en carbone (masse × part de carbone) : borne basse du COV total, une mesure par FID (NF EN 12619) reste la référence. Seuil de flux comparé à la masse des COV.',
            ...(sansCarbone.length ? [`Sans part de carbone connue, hors somme en carbone : ${sansCarbone.join(', ')}.`] : []),
          ],
    },
    {
      id: 'cov-annexe3', reference: 'Art. 27 7° b', libelle: "COV de l'annexe III (somme)", filtre: (l) => !!l.substance?.cov?.annexeIII,
      seuil: 100, vle: 20, vleTexte: '20 mg/m³ (somme des composés)', seuilTexte: '> 0,1 kg/h (somme)',
    },
    {
      id: 'cov-cmr', reference: 'Art. 27 7° c', libelle: 'COV CMR : H340, H350, H350i, H360D, H360F (somme massique)', filtre: (l) => classeDe(l) === 'cmr',
      seuil: 10, comparaison: 'ge', vle: 2, vleTexte: '2 mg/m³ (somme massique)', seuilTexte: '≥ 10 g/h (ensemble de l’installation)',
      notes: ['Substances à remplacer autant que possible par des substances moins nocives ; le préfet peut déroger (MTD, absence de risque significatif).'],
    },
    {
      id: 'cov-halogenes', reference: 'Art. 27 7° c', libelle: 'COV halogénés H341 / H351 (somme massique)', filtre: (l) => classeDe(l) === 'halogene',
      seuil: 100, comparaison: 'ge', vle: 20, vleTexte: '20 mg/m³ (somme massique)', seuilTexte: '≥ 100 g/h (ensemble de l’installation)',
    },
    { id: 'metaux-a', reference: 'Art. 27 8° a', libelle: 'Cd + Hg + Tl (somme)', ids: ['cd', 'hg', 'tl'], seuil: 1, vle: 0.1, vleTexte: '0,1 mg/m³ (somme)', seuilTexte: '> 1 g/h (Cd + Hg + Tl)' },
    ...(['cd', 'hg', 'tl'] as const).map((m) => ({
      id: `metaux-a-${m}`, reference: 'Art. 27 8° a', libelle: `${PAR_ID.get(m)!.nom} (par métal)`, ids: [m], idsFlux: ['cd', 'hg', 'tl'],
      seuil: 1, vle: 0.05, vleTexte: '0,05 mg/m³ par métal', seuilTexte: '> 1 g/h (Cd + Hg + Tl)',
    })),
    { id: 'metaux-b', reference: 'Art. 27 8° b', libelle: 'As + Se + Te (somme)', ids: ['as', 'se', 'te'], seuil: 5, vle: 1, vleTexte: '1 mg/m³ (somme)', seuilTexte: '> 5 g/h', notes: ['Hors composés de l’arsenic visés au 12° (annexe IV b).'] },
    { id: 'metaux-c', reference: 'Art. 27 8° c', libelle: 'Plomb', ids: ['pb'], seuil: 10, vle: 1, vleTexte: '1 mg/m³', seuilTexte: '> 10 g/h' },
    {
      id: 'metaux-d', reference: 'Art. 27 8° d', libelle: 'Sb + Cr + Co + Cu + Sn + Mn + Ni + V + Zn (somme)', ids: ['sb', 'cr', 'cobalt', 'cu', 'sn', 'mn', 'ni', 'v', 'zn'],
      seuil: 25, vle: 5, vleTexte: '5 mg/m³ (somme)', seuilTexte: '> 25 g/h', notes: ['Hors composés du nickel visés au 12° (annexe IV c).'],
    },
    ...(['phosphine', 'phosgene'] as const).map((s) => ({ id: s, reference: 'Art. 27 9° a', libelle: PAR_ID.get(s)!.nom, ids: [s], seuil: 10, vle: 1, vleTexte: '1 mg/m³', seuilTexte: '> 10 g/h' })),
    ...(['hcn', 'hbr', 'chlore', 'h2s'] as const).map((s) => ({ id: s, reference: 'Art. 27 9° b', libelle: PAR_ID.get(s)!.nom, ids: [s], seuil: 50, vle: 5, vleTexte: '5 mg/m³', seuilTexte: '> 50 g/h' })),
    { id: 'nh3', reference: 'Art. 27 9° c', libelle: 'Ammoniac', ids: ['nh3'], seuil: 100, vle: 50, vleTexte: '50 mg/m³', seuilTexte: '> 100 g/h' },
    { id: 'co', reference: ox ? 'Art. 27 7° a (oxydation)' : 'Art. 27 2°', libelle: 'Monoxyde de carbone', ids: ['co'], seuil: null, vle: ox ? 100 : null, ap: !ox, vleTexte: ox ? '100 mg/m³ en sortie d’oxydation' : "Fixée le cas échéant par l'arrêté préfectoral", seuilTexte: '-' },
    { id: 'n2o', reference: 'Art. 27 4° b', libelle: "Protoxyde d'azote", ids: ['n2o'], seuil: null, vle: null, ap: true, vleTexte: "Fixée par l'arrêté préfectoral", seuilTexte: '-' },
  ]
  if (ox) {
    defs.push(
      { id: 'ox-nox', reference: 'Art. 27 7° a (oxydation)', libelle: "Oxydes d'azote en sortie d'oxydation (en NO2)", ids: ['nox'], seuil: null, vle: 100, vleTexte: '100 mg/m³', seuilTexte: 'Équipement d’oxydation', notes: ['Dérogation possible si les effluents contiennent des composés azotés (amines, amides…).'] },
      { id: 'ox-ch4', reference: 'Art. 27 7° a (oxydation)', libelle: "Méthane en sortie d'oxydation", ids: ['ch4'], seuil: null, vle: 50, vleTexte: '50 mg/m³', seuilTexte: 'Équipement d’oxydation' },
    )
  }
  // 12°: carcinogens of annexe IV, one by one: over the flux, the prefect sets the limit.
  const seuils12 = { a: 0.5, b: 2, c: 5, d: 25 }
  const vus12 = new Set<string>()
  for (const l of d.lignes) {
    const s = l.substance
    if (!s?.annexeIV || vus12.has(s.id)) continue
    vus12.add(s.id)
    defs.push({
      id: `cancerogene-${s.id}`, reference: `Art. 27 12° (annexe IV ${s.annexeIV})`, libelle: s.nom, ids: [s.id],
      seuil: seuils12[s.annexeIV], vle: null, ap: true, vleTexte: "Fixée par l'arrêté préfectoral", seuilTexte: `> ${fr(seuils12[s.annexeIV])} g/h`,
    })
  }
  return defs.map((def) => evaluer(d, def)).filter((c) => c.mesures.some((m) => m.statut !== 'sans-donnee'))
}

// ---- Water: articles 31, 32, 34 ------------------------------------------------------------

interface Substance4 {
  ids: string[]
  libelle: string
  /** µg/l. */
  vle: number
  /** g/d; null: none. */
  seuil: number | null
  suppression?: boolean
}

/** Article 32 4°, as consolidated (arrêté du 24 août 2017 and later). */
const TABLEAU_4: Substance4[] = [
  { ids: ['alachlore'], libelle: 'Alachlore', vle: 25, seuil: 1 },
  { ids: ['anthracene'], libelle: 'Anthracène', vle: 25, seuil: null, suppression: true },
  { ids: ['atrazine'], libelle: 'Atrazine', vle: 25, seuil: 1 },
  { ids: ['benzene'], libelle: 'Benzène', vle: 50, seuil: 1 },
  { ids: ['bde47', 'bde99', 'bde100', 'bde153', 'bde154', 'bde183', 'bde209'], libelle: 'Diphényléthers bromés (somme)', vle: 50, seuil: null },
  ...(['bde47', 'bde99', 'bde153', 'bde183'] as const).map((b) => ({ ids: [b], libelle: PAR_ID.get(b)!.nom, vle: 25, seuil: null, suppression: true })),
  { ids: ['cd'], libelle: 'Cadmium et ses composés', vle: 25, seuil: null, suppression: true },
  { ids: ['chloroalcanes'], libelle: 'Chloroalcanes C10-13', vle: 25, seuil: null, suppression: true },
  { ids: ['chlorfenvinphos'], libelle: 'Chlorfenvinphos', vle: 25, seuil: 1 },
  { ids: ['chlorpyrifos'], libelle: 'Chlorpyrifos', vle: 25, seuil: 1 },
  { ids: ['aldrine', 'dieldrine', 'endrine', 'isodrine'], libelle: 'Pesticides cyclodiènes (somme des 4 drines)', vle: 25, seuil: null },
  { ids: ['ddt'], libelle: 'DDT total', vle: 25, seuil: null },
  { ids: ['12dca'], libelle: '1,2-Dichloroéthane', vle: 25, seuil: 1 },
  { ids: ['dcm'], libelle: 'Dichlorométhane', vle: 50, seuil: 2 },
  { ids: ['diuron'], libelle: 'Diuron', vle: 25, seuil: 1 },
  { ids: ['endosulfan'], libelle: 'Endosulfan (somme des isomères)', vle: 25, seuil: null, suppression: true },
  { ids: ['fluoranthene'], libelle: 'Fluoranthène', vle: 25, seuil: 1 },
  { ids: ['naphtalene'], libelle: 'Naphtalène', vle: 130, seuil: 1 },
  { ids: ['hcb'], libelle: 'Hexachlorobenzène', vle: 25, seuil: null, suppression: true },
  { ids: ['hcbd'], libelle: 'Hexachlorobutadiène', vle: 25, seuil: null, suppression: true },
  { ids: ['hch'], libelle: 'Hexachlorocyclohexane (somme des isomères)', vle: 25, seuil: null, suppression: true },
  { ids: ['isoproturon'], libelle: 'Isoproturon', vle: 25, seuil: 1 },
  { ids: ['hg'], libelle: 'Mercure et ses composés', vle: 25, seuil: null, suppression: true },
  { ids: ['nonylphenols'], libelle: 'Nonylphénols', vle: 25, seuil: null, suppression: true },
  { ids: ['octylphenols'], libelle: 'Octylphénols', vle: 25, seuil: 1 },
  { ids: ['pecb'], libelle: 'Pentachlorobenzène', vle: 25, seuil: null, suppression: true },
  { ids: ['pcp'], libelle: 'Pentachlorophénol', vle: 25, seuil: 1 },
  { ids: ['bap', 'bbf', 'bkf', 'bghip', 'ip'], libelle: 'HAP (somme des 5 composés visés)', vle: 25, seuil: null, suppression: true },
  { ids: ['simazine'], libelle: 'Simazine', vle: 25, seuil: 1 },
  { ids: ['pce'], libelle: 'Tétrachloroéthylène', vle: 25, seuil: 1 },
  { ids: ['ccl4'], libelle: 'Tétrachlorure de carbone', vle: 25, seuil: 1 },
  { ids: ['tce'], libelle: 'Trichloroéthylène', vle: 25, seuil: 1 },
  { ids: ['tbt'], libelle: 'Composés du tributylétain', vle: 25, seuil: null, suppression: true },
  { ids: ['tcb'], libelle: 'Trichlorobenzènes', vle: 25, seuil: 1 },
  { ids: ['chloroforme'], libelle: 'Trichlorométhane (chloroforme)', vle: 50, seuil: 2 },
  { ids: ['dehp'], libelle: 'DEHP', vle: 25, seuil: null, suppression: true },
  { ids: ['trifluraline'], libelle: 'Trifluraline', vle: 25, seuil: null, suppression: true },
  { ids: ['pfos'], libelle: 'PFOS et dérivés', vle: 25, seuil: null, suppression: true },
  { ids: ['quinoxyfene'], libelle: 'Quinoxyfène', vle: 25, seuil: null, suppression: true },
  { ids: ['aclonifene'], libelle: 'Aclonifène', vle: 25, seuil: 1 },
  { ids: ['bifenox'], libelle: 'Bifénox', vle: 25, seuil: 1 },
  { ids: ['cybutryne'], libelle: 'Cybutryne', vle: 25, seuil: 1 },
  { ids: ['cypermethrine'], libelle: 'Cyperméthrine', vle: 25, seuil: 1 },
  { ids: ['hbcdd'], libelle: 'HBCDD', vle: 25, seuil: null, suppression: true },
  { ids: ['heptachlore'], libelle: "Heptachlore et époxyde d'heptachlore", vle: 25, seuil: null, suppression: true },
  { ids: ['as'], libelle: 'Arsenic et ses composés', vle: 25, seuil: 0.5 },
  { ids: ['ampa'], libelle: 'AMPA', vle: 450, seuil: 1 },
  { ids: ['glyphosate'], libelle: 'Glyphosate', vle: 28, seuil: 1 },
  { ids: ['toluene'], libelle: 'Toluène', vle: 74, seuil: 2 },
  { ids: ['tbp'], libelle: 'Tributylphosphate', vle: 82, seuil: 2 },
  { ids: ['biphenyle'], libelle: 'Biphényle', vle: 25, seuil: 1 },
  { ids: ['xylenes', 'oxylene', 'mpxylene'], libelle: 'Xylènes (somme o, m, p)', vle: 50, seuil: 2 },
]

/** Article 32 3°: [id(s), label, limit mg/l, threshold g/d]. */
const TABLEAU_3: [string[], string, number, number][] = [
  [['phenols'], 'Indice phénols', 0.3, 3],
  [['cyanures'], 'Indice cyanures totaux', 0.1, 1],
  [['cr6'], 'Chrome hexavalent (en Cr6+)', 0.05, 1],
  [['pb'], 'Plomb et ses composés', 0.1, 5],
  [['cu'], 'Cuivre et ses composés', 0.15, 5],
  [['cr'], 'Chrome et ses composés', 0.1, 5],
  [['ni'], 'Nickel et ses composés', 0.2, 5],
  [['zn'], 'Zinc et ses composés', 0.8, 20],
  [['mn'], 'Manganèse et composés', 1, 10],
  [['sn'], 'Étain et ses composés', 2, 20],
  [['fe', 'al'], 'Fer, aluminium et composés (Fe + Al)', 5, 20],
  [['aox'], 'Composés organiques halogénés (AOX ou EOX)', 1, 30],
  [['hct'], 'Hydrocarbures totaux', 10, 100],
  [['fluorures'], 'Ion fluorure (en F-)', 15, 150],
]

/** Global nitrogen from Kjeldahl, nitrates and nitrites when not given. */
function azoteGlobal(d: Donnees): LigneEvaluee | null {
  if (d.lignes.some((l) => l.substance?.id === 'ngl')) return null
  const de = (id: string) => d.lignes.find((l) => l.substance?.id === id)
  const ntk = de('ntk')
  if (!ntk) return null
  const parts = [ntk, de('nitrates'), de('nitrites')].filter((l): l is LigneEvaluee => !!l)
  return {
    libelle: `Azote global calculé (${parts.map((l) => l.libelle).join(' + ')})`,
    substance: PAR_ID.get('ngl')!,
    valeurs: d.mesures.map((_, j) => {
      const b = sommer(parts.map((l) => l.valeurs[j]))
      if (!b || !ntk.valeurs[j]) return null
      return b.bas > 0 ? { valeur: b.bas, inferieur: false } : { valeur: b.haut, inferieur: true }
    }),
  }
}

function controlesEau(d: Donnees): Controle[] {
  const e = d.eau
  const milieu = e.destination === 'milieu'
  const ngl = azoteGlobal(d)
  const dd: Donnees = ngl ? { ...d, lignes: [...d.lignes, ngl] } : d
  const defs: Definition[] = []
  const out: Controle[] = []

  // pH and temperature (article 31).
  const pH = dd.lignes.find((l) => l.substance?.id === 'ph')
  if (pH) {
    const max = e.neutralisationAlcaline ? 9.5 : 8.5
    const mesures = dd.mesures.map((_, j): Evaluation => {
      const r = pH.valeurs[j]
      if (!r) return { concentration: null, flux: null, fluxRetenu: null, vle: null, statut: 'sans-donnee', notes: [] }
      return { concentration: { bas: r.valeur, haut: r.valeur }, flux: null, fluxRetenu: null, vle: max, vleMin: 5.5, statut: r.valeur >= 5.5 && r.valeur <= max ? 'conforme' : 'depassement', notes: [] }
    })
    out.push({
      id: 'ph', reference: 'Art. 31', libelle: 'pH', unite: 'u. pH', uniteFlux: '', composantes: [pH.libelle],
      vleTexte: `Entre 5,5 et ${fr(max)}${e.neutralisationAlcaline ? ' (neutralisation alcaline)' : ''}`, seuilTexte: 'Toujours applicable',
      mesures, synthese: synthese(dd, mesures),
    })
  }
  const tMax = !milieu && e.temperature50 ? 50 : 30
  defs.push({
    id: 'temperature', reference: 'Art. 31', libelle: 'Température', ids: ['temperature'], unite: '°C', seuil: null, vle: tMax, sansFlux: true,
    vleTexte: tMax === 50 ? '< 50 °C (raccordement prévu par l’autorisation ou la convention)' : '< 30 °C (sauf eaux amont plus chaudes)', seuilTexte: 'Toujours applicable',
  })

  if (milieu) {
    const sDbo = e.d21110 ? 15000 : 30000
    const sDco = e.d21110 ? 50000 : 100000
    defs.push(
      {
        id: 'mes', reference: 'Art. 32 1°', libelle: 'Matières en suspension (MES)', ids: ['mes'], seuil: null,
        vle: (f) => (e.lagunage ? 150 : f !== null && f <= 15000 ? 100 : 35),
        vleTexte: e.lagunage ? '150 mg/l (lagunage)' : '100 mg/l si flux ≤ 15 kg/j ; 35 mg/l au-delà', seuilTexte: 'Toujours applicable',
      },
      {
        id: 'dbo5', reference: 'Art. 32 1°', libelle: 'DBO5 (effluent non décanté)', ids: ['dbo5'], seuil: null,
        vle: (f) => (f !== null && f <= sDbo ? 100 : 30),
        vleTexte: `100 mg/l si flux ≤ ${sDbo / 1000} kg/j ; 30 mg/l au-delà`, seuilTexte: 'Toujours applicable',
      },
      {
        id: 'dco', reference: 'Art. 32 1°', libelle: 'DCO (effluent non décanté)', ids: ['dco'], seuil: null,
        vle: (f) => (f !== null && f <= sDco ? 300 : 125),
        vleTexte: `300 mg/l si flux ≤ ${sDco / 1000} kg/j ; 125 mg/l au-delà`, seuilTexte: 'Toujours applicable',
      },
    )
  } else {
    // Article 34: macropollutants before the collective plant, when the flux
    // may exceed 15 kg/d of BOD5 or 45 kg/d of COD.
    const flux = (id: string, j: number) => {
      const l = dd.lignes.find((x) => x.substance?.id === id)
      const r = l?.valeurs[j]
      return r && e.debit !== null ? r.valeur * e.debit : null
    }
    const autorise = (id: string) => d.fluxAutorises[id]
    const soumis = d.mesures.some((_, j) => (autorise('dbo5') ?? flux('dbo5', j) ?? 0) > 15000 || (autorise('dco') ?? flux('dco', j) ?? 0) > 45000)
    const inconnu = d.mesures.every((_, j) => flux('dbo5', j) === null && flux('dco', j) === null) && autorise('dbo5') === undefined && autorise('dco') === undefined
    const note = inconnu
      ? ['Flux de DBO5 et de DCO non calculables : valeurs de l’article 34 appliquées par défaut.']
      : soumis
        ? ['Flux de DBO5 > 15 kg/j ou de DCO > 45 kg/j : valeurs de l’article 34 applicables.']
        : []
    const applicable = soumis || inconnu
    for (const [id, libelle, vle] of [
      ['mes', 'Matières en suspension (MES)', 600],
      ['dbo5', 'DBO5', 800],
      ['dco', 'DCO', 2000],
      ['ngl', 'Azote global (en N)', 150],
      ['pt', 'Phosphore total (en P)', 50],
    ] as const) {
      defs.push({
        id, reference: 'Art. 34', libelle, ids: [id], seuil: null, vle: applicable ? vle : null, ap: !applicable,
        vleTexte: applicable ? `${vle} mg/l avant raccordement` : "Flux DBO5 ≤ 15 kg/j et DCO ≤ 45 kg/j : valeur fixée par l'autorisation de déversement",
        seuilTexte: 'DBO5 > 15 kg/j ou DCO > 45 kg/j', notes: note,
      })
    }
  }

  const controles = [...out, ...defs.map((def) => evaluer(dd, def))]

  // Nitrogen and phosphorus, natural environment: monthly means.
  if (milieu) {
    const nutriment = (id: 'ngl' | 'pt') => {
      const zs = e.zoneSensible
      const vle = (f: number | null): number | null => {
        if (f === null) return id === 'ngl' ? (zs ? 10 : 30) : zs ? 1 : 10
        if (id === 'ngl') return zs && f >= 300000 ? 10 : zs && f >= 150000 ? 15 : f >= 50000 ? 30 : null
        return zs && f > 80000 ? 1 : zs && f >= 40000 ? 2 : f >= 15000 ? 10 : null
      }
      const def: Definition = {
        id, reference: zs ? 'Art. 32 2° a et b (zone sensible)' : 'Art. 32 2° a', libelle: id === 'ngl' ? 'Azote global (en N)' : 'Phosphore total (en P)', ids: [id],
        seuil: id === 'ngl' ? 50000 : 15000, comparaison: 'ge', vle,
        vleTexte:
          id === 'ngl'
            ? `30 mg/l (moyenne mensuelle)${zs ? ' ; zone sensible : 15 mg/l si ≥ 150 kg/j, 10 mg/l si ≥ 300 kg/j' : ''} ; 24 h ≤ 2 × VLE`
            : `10 mg/l (moyenne mensuelle)${zs ? ' ; zone sensible : 2 mg/l si ≥ 40 kg/j, 1 mg/l si > 80 kg/j' : ''} ; 24 h ≤ 2 × VLE`,
        seuilTexte: id === 'ngl' ? '≥ 50 kg/j' : '≥ 15 kg/j',
      }
      const c = evaluer(dd, def)
      // Each 24 h sample against twice the limit; the mean against the limit.
      const mesures = c.mesures.map((m) =>
        m.vle !== null && m.concentration && (m.statut === 'conforme' || m.statut === 'depassement' || m.statut === 'indetermine')
          ? { ...m, statut: verdict(m.concentration, 2 * m.vle), notes: [...m.notes, `Prélèvement 24 h comparé au double de la valeur limite (${fr(2 * m.vle)} mg/l).`] }
          : m,
      )
      const vleMoy = mesures.find((m) => m.vle !== null)?.vle
      return { ...c, mesures, synthese: vleMoy ? synthese(dd, mesures, { vle: vleMoy }) : synthese(dd, mesures) }
    }
    controles.push(nutriment('ngl'), nutriment('pt'))
  }

  // Micropollutants: natural environment, or a municipal plant (same
  // values); an industrial or mixed plant sets its own.
  const micro = e.destination !== 'step-industrielle'
  const noteMicro = micro ? [] : ["Station industrielle ou mixte : valeurs fixées par l'arrêté préfectoral ou la convention ; celles de l'article 32 sont données pour information."]
  for (const [ids, libelle, vle, seuil] of TABLEAU_3) {
    controles.push(
      evaluer(dd, { id: `t3-${ids.join('-')}`, reference: 'Art. 32 3°', libelle, ids, seuil, vle: micro ? vle : null, ap: !micro, vleTexte: `${fr(vle)} mg/l`, seuilTexte: `> ${fr(seuil)} g/j`, notes: noteMicro }),
    )
  }
  for (const s of TABLEAU_4) {
    controles.push(
      evaluer(dd, {
        id: `t4-${s.ids.join('-')}`, reference: 'Art. 32 4°', libelle: s.libelle, ids: s.ids, seuil: s.seuil, vle: micro ? s.vle / 1000 : null, ap: !micro,
        vleTexte: `${fr(s.vle)} µg/l`, seuilTexte: s.seuil === null ? 'Toujours applicable' : `> ${fr(s.seuil)} g/j`, suppression: s.suppression,
        notes: [...noteMicro, ...(s.suppression ? ["Substance visée par un objectif de suppression des émissions : réduction maximale à rechercher (art. 22-2-III)."] : [])],
      }),
    )
  }
  return controles.filter((c) => c.mesures.some((m) => m.statut !== 'sans-donnee'))
}

export function evaluerConformite(d: Donnees): Controle[] {
  return d.milieu === 'air' ? controlesAir(d) : controlesEau(d)
}

export function bilan(controles: Controle[]): Record<Statut, number> {
  const r: Record<Statut, number> = { conforme: 0, depassement: 0, indetermine: 0, 'non-soumis': 0, ap: 0, 'sans-donnee': 0 }
  for (const c of controles) r[c.synthese.statut]++
  return r
}

export interface BilanEchantillon {
  comptes: Record<Statut, number>
  /** Limits exceeded: check and ratio to the limit. */
  depassements: { libelle: string; reference: string; ratio: number | null }[]
  indetermines: string[]
  /** The prefect's to set: over the flux threshold of annexe IV, N2O, CO. */
  ap: string[]
  statut: Statut
}

/** Sample by sample (column by column), every check together. */
export function bilanParEchantillon(controles: Controle[], n: number): BilanEchantillon[] {
  return Array.from({ length: n }, (_, j) => {
    const comptes: Record<Statut, number> = { conforme: 0, depassement: 0, indetermine: 0, 'non-soumis': 0, ap: 0, 'sans-donnee': 0 }
    const depassements: BilanEchantillon['depassements'] = []
    const indetermines: string[] = []
    const ap: string[] = []
    for (const c of controles) {
      const m = c.mesures[j]
      if (!m) continue
      comptes[m.statut]++
      if (m.statut === 'depassement') {
        const ratio = m.vle && m.concentration && m.vleMin === undefined ? m.concentration.bas / m.vle : null
        depassements.push({ libelle: c.libelle, reference: c.reference, ratio })
      }
      if (m.statut === 'indetermine') indetermines.push(c.libelle)
      if (m.statut === 'ap') ap.push(c.libelle)
    }
    depassements.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
    const statut: Statut = comptes.depassement
      ? 'depassement'
      : comptes.indetermine
        ? 'indetermine'
        : comptes.conforme
          ? 'conforme'
          : comptes.ap
            ? 'ap'
            : comptes['non-soumis']
              ? 'non-soumis'
              : 'sans-donnee'
    return { comptes, depassements, indetermines, ap, statut }
  })
}
