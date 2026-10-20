/**
 * Sheets comparing several groundwater campaigns: results side by side,
 * well by well; evolution and high-water / low-water contrast; charts of
 * the key compounds and of the organic family sums.
 */

import type { Workbook, Worksheet } from 'exceljs'
import {
  composes,
  contrasteRegimes,
  evolution,
  famillesPresentes,
  libelleCampagne,
  libelleCourt,
  LIBELLES_EVOLUTION,
  LIBELLES_FAMILLE,
  LIBELLES_REGIME,
  mesure,
  ordreChronologique,
  somme,
  type Campagne,
  type Compose,
  type Evolution,
  type Ouvrage,
} from './campagnes.ts'
import { argb, BANDEAU, barre, eclaircir, ETAT, GROUPES } from './couleurs.ts'
import { ecrire, GRIS_LQ, VERT_ENTETE } from './export.ts'
import { couleursCampagnes, dessinerEvolution, type Point } from './graphiqueEvolution.ts'
import type { Mesure } from './parse.ts'
import { statistiques, type StatsCompose, type Valeur } from './stats.ts'

export interface DonneesCampagnes {
  /** The campaign of the main file first. */
  campagnes: Campagne[]
  ouvrages: Ouvrage[]
  /** Factor from which a gap is retained. */
  facteur: number
  /** Comparison value of each compound, by its cross-file key. */
  guides: Record<string, { valeur: number; source: string } | null>
}

const nombre = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : Number(x.toPrecision(3)))
const virgule = (x: number) => String(Number(x.toPrecision(3))).replace('.', ',')
const estConcentration = (c: Compose) => /g\s*\/\s*l/i.test(c.unite)

function texte(ws: Worksheet, r: number, t: string, s: Parameters<typeof ecrire>[4] = {}): number {
  ecrire(ws, r, 1, t, { taille: 9, bord: false, ...s })
  return r + 1
}

function bandeau(ws: Worksheet, r: number, t: string, largeur: number): number {
  ws.mergeCells(r, 1, r, largeur)
  ecrire(ws, r, 1, t, { gras: true, fond: BANDEAU.fond, couleur: BANDEAU.texte })
  return r + 1
}

const styleEvolution = (e: Evolution | null) =>
  e ? { fond: eclaircir(LIBELLES_EVOLUTION[e].couleur, 0.78), couleur: argb(LIBELLES_EVOLUTION[e].couleur), gras: e === 'hausse' || e === 'apparition' } : {}

/** First and last result in time, when there are two at least. */
function bornes<T>(xs: (T | null)[]): [T, T] | null {
  const v = xs.filter((x): x is T => x !== null)
  return v.length >= 2 ? [v[0], v[v.length - 1]] : null
}

const evolutionBornes = (ms: (Mesure | null)[], facteur: number) => {
  const b = bornes(ms)
  return b && evolution(b[0], b[1], facteur)
}

/** Wells sampled at two campaigns at least: the only ones compared. */
const suivi = (o: Ouvrage) => o.echantillons.filter(Boolean).length >= 2

/** Compounds with at least one result in a matched well. */
function composesMesures(d: DonneesCampagnes): Compose[] {
  return composes(d.campagnes).filter((c) => d.ouvrages.some((o) => o.echantillons.some((e, i) => mesure(d.campagnes[i], c, i, e))))
}

function enTeteCampagnes(ws: Worksheet, r: number, d: DonneesCampagnes, ordre: number[], ecartes?: string[]): number {
  for (const i of ordre) {
    const c = d.campagnes[i]
    const n = d.ouvrages.filter((o) => o.echantillons[i]).length
    r = texte(ws, r, `• ${libelleCampagne(c, i)} : ${c.fichier} (${n} ouvrage${n > 1 ? 's' : ''})${i === 0 ? ' — campagne des onglets de mise en forme' : ''}.`)
  }
  if (ecartes?.length)
    r = texte(
      ws,
      r,
      `Ouvrages échantillonnés lors d'une seule campagne, non comparés ici (ils figurent dans l'onglet « Statistiques campagnes ») : ${ecartes.join(', ')}.`,
      { italique: true },
    )
  return r
}

// ---- Side by side ----------------------------------------------------------------------

function feuilleComparaison(wb: Workbook, d: DonneesCampagnes, titre: string, ordre: number[], ecartes: string[]) {
  const ws = wb.addWorksheet('Comparaison campagnes', { views: [{ showGridLines: false }] })
  const n = ordre.length
  ecrire(ws, 1, 1, `${titre} — comparaison des campagnes`, { gras: true, taille: 12, bord: false })
  let r = enTeteCampagnes(ws, 3, d, ordre, ecartes)
  r = texte(
    ws,
    r,
    `Évolution : de la première à la dernière campagne où le composé est analysé dans l'ouvrage, dans l'ordre chronologique. Un écart est retenu à partir d'un facteur ${virgule(d.facteur)} (au-delà de l'incertitude analytique, de l'ordre de 30 % par résultat) ; un composé qui apparaît ou disparaît doit dépasser ${virgule(d.facteur)} fois la limite de quantification de l'autre campagne.`,
    { italique: true },
  )
  r = texte(ws, r, 'Valeur grasse sur fond rouge : supérieure à la valeur de comparaison. Valeur grise : inférieure à la limite de quantification. Ouvrage non échantillonné : « - ».', {
    italique: true,
  })
  r++

  const colonnesParOuvrage = n + 1
  const c0 = 4
  const largeur = c0 - 1 + d.ouvrages.length * colonnesParOuvrage
  ws.getColumn(1).width = 34
  ws.getColumn(2).width = 9
  ws.getColumn(3).width = 12
  const couleurs = couleursCampagnes(ordre.map((i) => d.campagnes[i].regime))
  const h1 = r
  const h2 = r + 1
  ws.getRow(h2).height = 30
  for (const [c, t] of [
    [1, 'Composé'],
    [2, 'Unité'],
    [3, 'Valeur de comparaison'],
  ] as const) {
    ws.mergeCells(h1, c, h2, c)
    ecrire(ws, h1, c, t, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  }
  d.ouvrages.forEach((o, j) => {
    const c = c0 + j * colonnesParOuvrage
    ws.mergeCells(h1, c, h1, c + n)
    ecrire(ws, h1, c, o.nom, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
    ordre.forEach((i, k) => {
      ws.getColumn(c + k).width = 11
      ecrire(ws, h2, c + k, libelleCourt(d.campagnes[i], i), { gras: true, taille: 8, fond: eclaircir(couleurs[k], 0.6), h: 'center', wrap: true })
    })
    ws.getColumn(c + n).width = 11
    ecrire(ws, h2, c + n, 'Évolution', { gras: true, taille: 8, fond: GROUPES.comparaison.clair, h: 'center' })
  })
  r = h2 + 1
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: h2, showGridLines: false }]

  let famille: string | null = null
  for (const comp of composesMesures(d)) {
    if (comp.famille && comp.famille !== famille) {
      famille = comp.famille
      r = bandeau(ws, r, famille, largeur)
    }
    const g = d.guides[comp.cle]
    ecrire(ws, r, 1, comp.nom, { indent: 1, italique: comp.somme })
    ecrire(ws, r, 2, comp.unite, { h: 'center', taille: 9 })
    ecrire(ws, r, 3, g ? g.valeur : '-', { h: 'center' })
    d.ouvrages.forEach((o, j) => {
      const c = c0 + j * colonnesParOuvrage
      const ms = ordre.map((i) => mesure(d.campagnes[i], comp, i, o.echantillons[i]))
      ms.forEach((m, k) => {
        const depasse = !!g && !!m && !m.inferieur && m.valeur! > g.valeur
        ecrire(ws, r, c + k, m ? m.brut : '-', {
          h: 'center',
          gras: depasse,
          fond: depasse ? ETAT.alerte.fond : undefined,
          couleur: depasse ? ETAT.alerte.texte : m?.inferieur ? GRIS_LQ : undefined,
        })
      })
      const e = evolutionBornes(ms, d.facteur)
      ecrire(ws, r, c + n, e ? LIBELLES_EVOLUTION[e].court : '-', { h: 'center', taille: 8, ...styleEvolution(e) })
    })
    r++
  }
  r++
  r = texte(ws, r, 'Lecture des évolutions', { gras: true })
  for (const e of ['hausse', 'apparition', 'stable', 'baisse', 'disparition', 'non-conclusif'] as Evolution[]) {
    ecrire(ws, r, 1, LIBELLES_EVOLUTION[e].court, { taille: 9, h: 'center', ...styleEvolution(e) })
    ecrire(ws, r++, 2, LIBELLES_EVOLUTION[e].long, { taille: 9, bord: false })
  }
}

// ---- Evolution and seasonal contrast ---------------------------------------------------

function feuilleTendances(wb: Workbook, d: DonneesCampagnes, titre: string, ordre: number[], ecartes: string[]) {
  const ws = wb.addWorksheet('Évolutions et tendances', { views: [{ showGridLines: false }] })
  const n = ordre.length
  ws.getColumn(1).width = 34
  for (let c = 2; c <= 30; c++) ws.getColumn(c).width = 13
  ecrire(ws, 1, 1, `${titre} — évolutions et tendances`, { gras: true, taille: 12, bord: false })
  let r = enTeteCampagnes(ws, 3, d, ordre, ecartes)
  r++

  // Family sums, well by well.
  const familles = famillesPresentes(d.campagnes, d.ouvrages)
  const couleurs = couleursCampagnes(ordre.map((i) => d.campagnes[i].regime))
  if (familles.length) {
    r = bandeau(ws, r, 'Sommes par famille (µg/l)', 1 + familles.length * (n + 1))
    r = texte(
      ws,
      r,
      "Somme des composés quantifiés de chaque famille (les totaux du laboratoire ne sont pas additionnés) ; « <LQ » : aucun composé quantifié. Hydrocarbures : indice C10–C40 du laboratoire, à défaut somme de ses fractions carbonées.",
      { italique: true },
    )
    const h1 = r
    const h2 = r + 1
    ws.mergeCells(h1, 1, h2, 1)
    ecrire(ws, h1, 1, 'Ouvrage', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
    familles.forEach((f, j) => {
      const c = 2 + j * (n + 1)
      ws.mergeCells(h1, c, h1, c + n)
      ecrire(ws, h1, c, LIBELLES_FAMILLE[f], { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
      ordre.forEach((i, k) => ecrire(ws, h2, c + k, libelleCourt(d.campagnes[i], i), { gras: true, taille: 8, fond: eclaircir(couleurs[k], 0.6), h: 'center', wrap: true }))
      ecrire(ws, h2, c + n, 'Évolution', { gras: true, taille: 8, fond: GROUPES.comparaison.clair, h: 'center' })
    })
    ws.getRow(h2).height = 30
    r = h2 + 1
    for (const o of d.ouvrages) {
      ecrire(ws, r, 1, o.nom, { gras: true })
      familles.forEach((f, j) => {
        const c = 2 + j * (n + 1)
        const ss = ordre.map((i) => (o.echantillons[i] ? somme(d.campagnes[i].lecture, f, o.echantillons[i]!) : null))
        ss.forEach((s, k) =>
          ecrire(ws, r, c + k, s ? (s.nonQuantifie ? '<LQ' : nombre(s.valeur)) : '-', { h: 'center', couleur: s?.nonQuantifie ? GRIS_LQ : undefined }),
        )
        const [a, b] = bornes(ss) ?? [null, null]
        // Sums: a rise from nothing quantified counts as an appearance.
        const e: Evolution | null =
          !a || !b ? null : a.nonQuantifie && b.nonQuantifie ? 'non-quantifie' : a.nonQuantifie ? 'apparition' : b.nonQuantifie ? 'disparition' : evolution(
                { brut: '', valeur: a.valeur, inferieur: false },
                { brut: '', valeur: b.valeur, inferieur: false },
                d.facteur,
              )
        ecrire(ws, r, c + n, e ? LIBELLES_EVOLUTION[e].court : '-', { h: 'center', taille: 8, ...styleEvolution(e) })
      })
      r++
    }
    r++
  }

  // Evolution per compound, from the first to the last campaign.
  r = bandeau(ws, r, 'Évolution par composé, de la première à la dernière campagne de chaque ouvrage', 7)
  const classes: Evolution[] = ['hausse', 'apparition', 'stable', 'baisse', 'disparition']
  ecrire(ws, r, 1, 'Composé', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
  classes.forEach((e, k) => ecrire(ws, r, 2 + k, LIBELLES_EVOLUTION[e].court, { gras: true, taille: 9, h: 'center', ...styleEvolution(e) }))
  ecrire(ws, r, 7, 'Ouvrages comparés', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  ws.getRow(r).height = 28
  r++
  let enHausse = 0
  let enBaisse = 0
  for (const comp of composesMesures(d).filter(estConcentration)) {
    const par: Record<Evolution, string[]> = { hausse: [], apparition: [], stable: [], baisse: [], disparition: [], 'non-quantifie': [], 'non-conclusif': [] }
    let compares = 0
    for (const o of d.ouvrages) {
      const e = evolutionBornes(
        ordre.map((i) => mesure(d.campagnes[i], comp, i, o.echantillons[i])),
        d.facteur,
      )
      if (!e) continue
      compares++
      par[e].push(o.nom)
    }
    if (!classes.some((c) => par[c].length)) continue
    if (par.hausse.length + par.apparition.length > par.baisse.length + par.disparition.length) enHausse++
    else if (par.baisse.length + par.disparition.length > par.hausse.length + par.apparition.length) enBaisse++
    ecrire(ws, r, 1, comp.nom, { indent: 1 })
    classes.forEach((e, k) => ecrire(ws, r, 2 + k, par[e].join(', ') || '-', { taille: 8, wrap: true, h: 'center', ...(par[e].length ? styleEvolution(e) : {}) }))
    ecrire(ws, r, 7, compares, { h: 'center' })
    r++
  }
  r = texte(
    ws,
    r + 1,
    `• ${enHausse} composé${enHausse > 1 ? 's' : ''} en hausse dans une majorité des ouvrages où il évolue, ${enBaisse} en baisse. Deux campagnes donnent une indication de tendance, non une tendance établie : à confirmer sur les campagnes suivantes, à saison comparable.`,
  )
  r++

  // High water versus low water.
  const contrastes = contrasteRegimes(d.campagnes, d.ouvrages, composesMesures(d), d.facteur)
  r = bandeau(ws, r, 'Hautes eaux / basses eaux', 7)
  if (!contrastes) {
    const regimes = new Set(d.campagnes.map((c) => c.regime))
    texte(
      ws,
      r,
      regimes.has(null)
        ? "Régime hydrologique non renseigné pour au moins une campagne : indiquez « hautes eaux » ou « basses eaux » dans l'outil pour comparer les deux saisons."
        : 'Les campagnes sont de même régime hydrologique : la comparaison porte sur le temps, pas sur la saison.',
      { italique: true },
    )
    return
  }
  r = texte(
    ws,
    r,
    "Par ouvrage, plus haut résultat de hautes eaux face au plus haut de basses eaux, avec le même facteur. En hautes eaux, la remontée de la nappe peut remobiliser une pollution retenue dans la zone de battement ou lessiver la zone non saturée (hausse) ; elle peut aussi diluer (baisse). En basses eaux, la nappe moins alimentée peut concentrer les composés dissous.",
    { italique: true, wrap: false },
  )
  ecrire(ws, r, 1, 'Composé', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
  ecrire(ws, r, 2, 'Plus élevé en hautes eaux', { gras: true, taille: 9, fond: eclaircir('#2E75B6', 0.6), h: 'center', wrap: true })
  ecrire(ws, r, 3, 'Plus élevé en basses eaux', { gras: true, taille: 9, fond: eclaircir('#E69F00', 0.6), h: 'center', wrap: true })
  ecrire(ws, r, 4, 'Comparable', { gras: true, taille: 9, fond: eclaircir('#7F8C8D', 0.7), h: 'center' })
  ecrire(ws, r, 5, 'Rapport médian HE / BE', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  ws.mergeCells(r, 6, r, 7)
  ecrire(ws, r, 6, 'Lecture', { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center' })
  ws.getRow(r).height = 28
  r++
  let he = 0
  let be = 0
  for (const l of contrastes) {
    const nHE = l.plusHE.length
    const nBE = l.plusBE.length
    const lecture =
      nHE > nBE + l.comparable.length / 2
        ? 'Plus élevé en hautes eaux : remobilisation probable par la remontée de la nappe'
        : nBE > nHE + l.comparable.length / 2
          ? 'Plus élevé en basses eaux : moindre dilution probable'
          : 'Pas de contraste saisonnier marqué'
    if (lecture.startsWith('Plus élevé en hautes')) he++
    if (lecture.startsWith('Plus élevé en basses')) be++
    ecrire(ws, r, 1, l.compose.nom, { indent: 1 })
    ecrire(ws, r, 2, l.plusHE.join(', ') || '-', { taille: 8, wrap: true, h: 'center', fond: nHE ? eclaircir('#2E75B6', 0.8) : undefined })
    ecrire(ws, r, 3, l.plusBE.join(', ') || '-', { taille: 8, wrap: true, h: 'center', fond: nBE ? eclaircir('#E69F00', 0.8) : undefined })
    ecrire(ws, r, 4, l.comparable.join(', ') || '-', { taille: 8, wrap: true, h: 'center' })
    ecrire(ws, r, 5, nombre(l.rapportMedian), { h: 'center' })
    ws.mergeCells(r, 6, r, 7)
    ecrire(ws, r, 6, lecture, { taille: 8, wrap: true })
    r++
  }
  texte(
    ws,
    r + 1,
    `• ${he} composé${he > 1 ? 's' : ''} plus élevé${he > 1 ? 's' : ''} en hautes eaux, ${be} en basses eaux. Lecture à rapprocher des niveaux piézométriques mesurés et de la profondeur de la source : une seule paire de campagnes ne sépare pas l'effet de saison d'une évolution de fond.`,
  )
}

// ---- Charts ------------------------------------------------------------------------------

/** Compounds worth a chart: those over their comparison value at least
 *  once, by how far, then the most often quantified — twelve at most. */
function composesCles(d: DonneesCampagnes): Compose[] {
  const notes = composesMesures(d)
    .filter((c) => estConcentration(c) && !c.somme && d.ouvrages.some((o) => o.echantillons.filter((e, i) => mesure(d.campagnes[i], c, i, e)).length >= 2))
    .map((c) => {
      const ms = d.ouvrages.flatMap((o) => o.echantillons.map((e, i) => mesure(d.campagnes[i], c, i, e))).filter((m) => m && !m.inferieur)
      const g = d.guides[c.cle]?.valeur ?? null
      const max = Math.max(0, ...ms.map((m) => m!.valeur!))
      return { c, quantifies: ms.length, rapport: g ? max / g : 0 }
    })
    .filter((x) => x.quantifies > 0)
  notes.sort((a, b) => (b.rapport >= 1 ? 1 : 0) - (a.rapport >= 1 ? 1 : 0) || b.rapport - a.rapport || b.quantifies - a.quantifies)
  return notes.slice(0, 12).map((x) => x.c)
}

function feuilleGraphiques(wb: Workbook, d: DonneesCampagnes, titre: string, ordre: number[]) {
  const ws = wb.addWorksheet('Graphiques évolution', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, `${titre} — graphiques d'évolution`, { gras: true, taille: 12, bord: false })
  texte(
    ws,
    2,
    "Ouvrages ayant des résultats lors d'au moins deux campagnes. Une barre par campagne, de la plus ancienne à la plus récente : bleu pour les hautes eaux, orange pour les basses eaux, vert si le régime n'est pas renseigné. Barre en pointillés : résultat inférieur à la LQ, tracé à la hauteur de la LQ. Ligne rouge pointillée : valeur de comparaison. Échelle logarithmique lorsque les valeurs s'étendent sur plus de deux ordres de grandeur.",
    { italique: true },
  )
  const series = ordre.map((i, k) => ({ nom: libelleCourt(d.campagnes[i], i), couleur: couleursCampagnes(ordre.map((x) => d.campagnes[x].regime))[k] }))
  let r = 4
  const placer = (dessin: ReturnType<typeof dessinerEvolution>) => {
    if (!dessin) return
    const id = wb.addImage({ base64: dessin.image, extension: 'png' })
    ws.addImage(id, { tl: { col: 0, row: r - 1 }, ext: { width: dessin.largeur, height: dessin.hauteur } })
    r += Math.ceil(dessin.hauteur / 20) + 1
  }

  const familles = famillesPresentes(d.campagnes, d.ouvrages)
  if (familles.length) r = texte(ws, r, 'Sommes par famille', { gras: true, taille: 10 })
  for (const f of familles) {
    const avec = d.ouvrages.filter((o) => o.echantillons.filter((e, i) => e && somme(d.campagnes[i].lecture, f, e)).length >= 2)
    const valeurs: Point[][] = ordre.map((i) =>
      avec.map((o) => {
        const s = o.echantillons[i] ? somme(d.campagnes[i].lecture, f, o.echantillons[i]!) : null
        return s ? { valeur: s.valeur, inferieur: s.nonQuantifie } : null
      }),
    )
    // A sum with nothing quantified has no height: drawn as nothing.
    for (const ligne of valeurs) ligne.forEach((p, j) => p && p.inferieur && (ligne[j] = null))
    placer(dessinerEvolution(LIBELLES_FAMILLE[f], 'µg/l', avec.map((o) => o.nom), series, valeurs, null))
  }
  const cles = composesCles(d)
  if (cles.length) r = texte(ws, r, 'Composés clés (dépassant la valeur de comparaison, puis les plus souvent quantifiés)', { gras: true, taille: 10 })
  for (const c of cles) {
    const avec = d.ouvrages.filter((o) => o.echantillons.filter((e, i) => mesure(d.campagnes[i], c, i, e)).length >= 2)
    const valeurs: Point[][] = ordre.map((i) =>
      avec.map((o) => {
        const m = mesure(d.campagnes[i], c, i, o.echantillons[i])
        return m && m.valeur !== null ? { valeur: m.valeur, inferieur: m.inferieur } : null
      }),
    )
    placer(dessinerEvolution(c.nom, c.unite, avec.map((o) => o.nom), series, valeurs, d.guides[c.cle]?.valeur ?? null))
  }
}

// ---- Statistics over every campaign ------------------------------------------------------

type Groupe = keyof typeof GROUPES | null

const COLONNES_STATS: [string, number, Groupe][] = [
  ['Composé', 34, null],
  ['Unité', 9, null],
  ['Nb analyses', 10, 'quantification'],
  ['Nb quantifiés', 10, 'quantification'],
  ['Fréquence de quantification (%)', 13, 'quantification'],
  ['LQ min', 9, 'quantification'],
  ['LQ max', 9, 'quantification'],
  ['Minimum', 10, 'distribution'],
  ['Maximum', 10, 'distribution'],
  ['Ouvrage et campagne du maximum', 22, 'distribution'],
  ['Moyenne', 10, 'distribution'],
  ['Moyenne géométrique', 11, 'distribution'],
  ['Médiane', 10, 'distribution'],
  ['Percentile 90', 10, 'distribution'],
  ['Écart-type', 10, 'distribution'],
  ['Coefficient de variation (%)', 12, 'distribution'],
  ['Moyenne avec <LQ = LQ / 2', 12, 'distribution'],
  ['Valeur de comparaison', 12, 'comparaison'],
  ['Nb dépassements', 11, 'comparaison'],
  ['Fréquence de dépassement (%)', 12, 'comparaison'],
  ['Maximum / valeur de comparaison', 13, 'comparaison'],
  ['Ouvrages en dépassement', 30, 'comparaison'],
]

const LIBELLES_GROUPES: Record<keyof typeof GROUPES, string> = {
  quantification: 'Quantification',
  distribution: 'Distribution des résultats quantifiés',
  comparaison: 'Comparaison à la valeur de comparaison',
}

/** Maximum over the comparison value: below half, up to it, beyond. */
function etatRatio(ratio: number | null) {
  if (ratio === null) return null
  return ratio >= 1 ? ETAT.alerte : ratio >= 0.5 ? ETAT.vigilance : ETAT.ok
}

/** A compound's results in the given campaigns, wells by wells. */
function resultats(d: DonneesCampagnes, c: Compose, indices: number[]): (Valeur & { ouvrage: string })[] {
  const out: (Valeur & { ouvrage: string })[] = []
  for (const o of d.ouvrages)
    for (const i of indices) {
      const m = mesure(d.campagnes[i], c, i, o.echantillons[i])
      if (m && m.valeur !== null) out.push({ echantillon: `${o.nom} — ${libelleCourt(d.campagnes[i], i)}`, ouvrage: o.nom, valeur: m.valeur, inferieur: m.inferieur })
    }
  return out
}

/** What the shared statistics leave out: geometric mean, coefficient of
 *  variation, and the mean with results below the LQ taken at half of it. */
function complements(valeurs: Valeur[], s: StatsCompose) {
  const q = valeurs.filter((v) => !v.inferieur).map((v) => v.valeur)
  return {
    geometrique: q.length && q.every((x) => x > 0) ? Math.exp(q.reduce((a, x) => a + Math.log(x), 0) / q.length) : null,
    cv: s.ecartType !== null && s.moyenne ? (s.ecartType / s.moyenne) * 100 : null,
    demiLQ: valeurs.length ? valeurs.reduce((a, v) => a + (v.inferieur ? v.valeur / 2 : v.valeur), 0) / valeurs.length : null,
  }
}

/** Average ranks, ties sharing theirs. */
function rangs(x: number[]): number[] {
  const tries = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const r: number[] = []
  for (let k = 0; k < tries.length; ) {
    let l = k
    while (l + 1 < tries.length && tries[l + 1][0] === tries[k][0]) l++
    for (let m = k; m <= l; m++) r[tries[m][1]] = (k + l) / 2 + 1
    k = l + 1
  }
  return r
}

/** Spearman's rank correlation; null when either side does not vary. */
function spearman(a: number[], b: number[]): number | null {
  const x = rangs(a)
  const y = rangs(b)
  const mx = x.reduce((s, v) => s + v, 0) / x.length
  const my = y.reduce((s, v) => s + v, 0) / y.length
  let sxy = 0
  let sxx = 0
  let syy = 0
  x.forEach((v, i) => {
    sxy += (v - mx) * (y[i] - my)
    sxx += (v - mx) ** 2
    syy += (y[i] - my) ** 2
  })
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

function enTetes(ws: Worksheet, r: number, groupes: { titre: string; fond: string; colonnes: string[] }[], debut = 1): number {
  let c = debut
  for (const g of groupes) {
    if (g.titre) {
      if (g.colonnes.length > 1) ws.mergeCells(r, c, r, c + g.colonnes.length - 1)
      ecrire(ws, r, c, g.titre, { gras: true, taille: 9, h: 'center', fond: g.fond, couleur: 'FFFFFFFF', wrap: true })
    }
    g.colonnes.forEach((t, k) => ecrire(ws, r + 1, c + k, t, { gras: true, taille: 9, h: 'center', wrap: true, fond: g.titre ? eclaircir(`#${g.fond.slice(2)}`, 0.75) : VERT_ENTETE }))
    c += g.colonnes.length
  }
  ws.getRow(r + 1).height = 40
  return r + 2
}

function feuilleStatistiques(wb: Workbook, d: DonneesCampagnes, titre: string, ordre: number[]) {
  const ws = wb.addWorksheet('Statistiques campagnes', { views: [{ state: 'frozen', xSplit: 1, ySplit: 0, showGridLines: false }] })
  COLONNES_STATS.forEach(([, l], j) => (ws.getColumn(j + 1).width = l))
  const n = ordre.length
  const toutes = d.campagnes.map((_, i) => i)
  const liste = composesMesures(d)
  const familles = famillesPresentes(d.campagnes, d.ouvrages)
  const couleurs = couleursCampagnes(ordre.map((i) => d.campagnes[i].regime))
  const nb = d.campagnes.reduce((s, _, i) => s + d.ouvrages.filter((o) => o.echantillons[i]).length, 0)
  ecrire(ws, 1, 1, `${titre} — statistiques sur l'ensemble des campagnes`, { gras: true, taille: 12, bord: false })
  let r = enTeteCampagnes(ws, 3, d, ordre)
  r = texte(
    ws,
    r,
    `${d.ouvrages.length} ouvrage${d.ouvrages.length > 1 ? 's' : ''}, ${nb} échantillons au total (blancs et doublons exclus), y compris les ouvrages échantillonnés lors d'une seule campagne. Chaque résultat d'un ouvrage à une campagne compte pour une analyse.`,
  )
  r = texte(
    ws,
    r,
    "Minimum, maximum, moyennes, médiane, percentile 90, écart-type et coefficient de variation : sur les seuls résultats quantifiés. « Moyenne avec <LQ = LQ / 2 » : tous les résultats, ceux inférieurs à la LQ pris à la moitié de celle-ci (convention de substitution usuelle). Moyenne géométrique : adaptée aux concentrations, souvent log-normales.",
    { italique: true },
  )
  r++

  // 1. Every campaign together.
  r = bandeau(ws, r, '1. Toutes campagnes confondues', COLONNES_STATS.length)
  ws.getRow(r).height = 20
  for (const g of Object.keys(GROUPES) as (keyof typeof GROUPES)[]) {
    const cols = COLONNES_STATS.map((c, j) => (c[2] === g ? j + 1 : 0)).filter(Boolean)
    ws.mergeCells(r, cols[0], r, cols[cols.length - 1])
    ecrire(ws, r, cols[0], LIBELLES_GROUPES[g], { gras: true, taille: 9, h: 'center', fond: argb(GROUPES[g].fort), couleur: 'FFFFFFFF' })
  }
  r++
  ws.getRow(r).height = 45
  COLONNES_STATS.forEach(([t, , g], j) => ecrire(ws, r, j + 1, t, { gras: true, taille: 9, fond: g ? GROUPES[g].clair : VERT_ENTETE, h: 'center', wrap: true }))
  r++
  const debut = r
  const ligne = (nom: string, unite: string, valeurs: (Valeur & { ouvrage: string })[], guide: number | null, o: { italique?: boolean; sansLQ?: boolean } = {}) => {
    const s = statistiques(valeurs, guide)
    const x = complements(valeurs, s)
    const enDepassement = guide === null ? [] : [...new Set(valeurs.filter((v) => !v.inferieur && v.valeur > guide).map((v) => v.ouvrage))]
    const cellules: (string | number)[] = [
      nom,
      unite,
      s.analyses,
      s.quantifies,
      nombre(s.frequence),
      o.sansLQ ? '-' : nombre(s.lqMin),
      o.sansLQ ? '-' : nombre(s.lqMax),
      nombre(s.min),
      nombre(s.max),
      s.echantillonMax ?? '-',
      nombre(s.moyenne),
      nombre(x.geometrique),
      nombre(s.mediane),
      nombre(s.p90),
      nombre(s.ecartType),
      nombre(x.cv),
      nombre(x.demiLQ),
      guide ?? '-',
      guide !== null ? s.depassements : '-',
      nombre(s.frequenceDepassement),
      nombre(s.ratioMaxGuide),
      enDepassement.join(', ') || '-',
    ]
    const etats: Record<number, (typeof ETAT)[keyof typeof ETAT] | null> = {
      0: guide !== null && s.depassements > 0 ? ETAT.alerte : null,
      18: guide !== null ? (s.depassements > 0 ? ETAT.alerte : ETAT.ok) : null,
      20: etatRatio(s.ratioMaxGuide),
      21: enDepassement.length ? ETAT.alerte : null,
    }
    cellules.forEach((v, j) => {
      const e = etats[j]
      ecrire(ws, r, j + 1, v, {
        h: j === 0 || j === cellules.length - 1 ? 'left' : 'center',
        indent: j === 0 ? 1 : undefined,
        italique: j === 0 && o.italique,
        wrap: j === 9 || j === cellules.length - 1,
        taille: j === 9 ? 8 : undefined,
        gras: !!e && e !== ETAT.ok,
        fond: e?.fond,
        couleur: e?.texte,
      })
    })
    r++
  }
  if (familles.length) {
    ws.mergeCells(r, 1, r, COLONNES_STATS.length)
    ecrire(ws, r++, 1, 'Sommes par famille', { gras: true, fond: eclaircir(BANDEAU.fond.slice(2), 0.7) })
    for (const f of familles) {
      const valeurs: (Valeur & { ouvrage: string })[] = []
      for (const o of d.ouvrages)
        for (const i of toutes) {
          const e = o.echantillons[i]
          const sm = e ? somme(d.campagnes[i].lecture, f, e) : null
          if (sm) valeurs.push({ echantillon: `${o.nom} — ${libelleCourt(d.campagnes[i], i)}`, ouvrage: o.nom, valeur: sm.valeur, inferieur: sm.nonQuantifie })
        }
      ligne(LIBELLES_FAMILLE[f], 'µg/l', valeurs, null, { italique: true, sansLQ: true })
    }
  }
  let famille: string | null = null
  for (const c of liste) {
    if (c.famille && c.famille !== famille) {
      famille = c.famille
      r = bandeau(ws, r, famille, COLONNES_STATS.length)
    }
    ligne(c.nom, c.unite, resultats(d, c, toutes), d.guides[c.cle]?.valeur ?? null, { italique: c.somme })
  }
  barre(ws, debut, r - 1, 5, GROUPES.quantification.fort, 100)
  barre(ws, debut, r - 1, 20, GROUPES.comparaison.fort, 100)
  r++

  // 2. Campaign by campaign.
  const parCampagne = ['Quantifiés / analyses', 'Moyenne', 'Médiane', 'Maximum']
  r = bandeau(ws, r, '2. Par campagne', 2 + n * parCampagne.length)
  r = texte(ws, r, "Moyenne, médiane et maximum des résultats quantifiés de chaque campagne. Les ouvrages échantillonnés diffèrent parfois d'une campagne à l'autre : rapprocher les maxima de l'onglet « Comparaison campagnes ».", {
    italique: true,
  })
  r = enTetes(ws, r, [
    { titre: '', fond: '', colonnes: ['Composé', 'Unité'] },
    ...ordre.map((i, k) => ({ titre: libelleCourt(d.campagnes[i], i), fond: argb(couleurs[k]), colonnes: parCampagne })),
  ])
  famille = null
  for (const c of liste) {
    if (c.famille && c.famille !== famille) {
      famille = c.famille
      r = bandeau(ws, r, famille, 2 + n * parCampagne.length)
    }
    const g = d.guides[c.cle]?.valeur ?? null
    ecrire(ws, r, 1, c.nom, { indent: 1, italique: c.somme })
    ecrire(ws, r, 2, c.unite, { h: 'center', taille: 9 })
    ordre.forEach((i, k) => {
      const s = statistiques(resultats(d, c, [i]), g)
      const col = 3 + k * parCampagne.length
      const e = etatRatio(s.ratioMaxGuide)
      ecrire(ws, r, col, s.analyses ? `${s.quantifies} / ${s.analyses}` : '-', { h: 'center', couleur: s.analyses && !s.quantifies ? GRIS_LQ : undefined })
      ecrire(ws, r, col + 1, nombre(s.moyenne), { h: 'center' })
      ecrire(ws, r, col + 2, nombre(s.mediane), { h: 'center' })
      ecrire(ws, r, col + 3, nombre(s.max), { h: 'center', fond: e?.fond, couleur: e?.texte, gras: !!e && e !== ETAT.ok })
    })
    r++
  }
  r++

  // 3. High water / low water.
  const he = toutes.filter((i) => d.campagnes[i].regime === 'HE')
  const be = toutes.filter((i) => d.campagnes[i].regime === 'BE')
  const parRegime = ['Nb analyses', 'Fréquence de quantification (%)', 'Moyenne', 'Médiane', 'Maximum']
  r = bandeau(ws, r, '3. Par régime hydrologique', 2 + 2 * parRegime.length + 2)
  if (!he.length || !be.length) r = texte(ws, r, 'Au moins une campagne de hautes eaux et une de basses eaux sont nécessaires : renseignez le régime de chaque campagne dans l\'outil.', { italique: true })
  else {
    r = texte(ws, r, `Hautes eaux : ${he.map((i) => libelleCourt(d.campagnes[i], i)).join(', ')} ; basses eaux : ${be.map((i) => libelleCourt(d.campagnes[i], i)).join(', ')}. Rapports sur les résultats quantifiés ; > 1 : plus élevé en hautes eaux.`, {
      italique: true,
    })
    r = enTetes(ws, r, [
      { titre: '', fond: '', colonnes: ['Composé', 'Unité'] },
      { titre: LIBELLES_REGIME.HE, fond: argb('#2E75B6'), colonnes: parRegime },
      { titre: LIBELLES_REGIME.BE, fond: argb('#E69F00'), colonnes: parRegime },
      { titre: 'HE / BE', fond: argb('#6B4FA0'), colonnes: ['Rapport des médianes', 'Rapport des maxima'] },
    ])
    for (const c of liste.filter(estConcentration)) {
      const a = statistiques(resultats(d, c, he), null)
      const b = statistiques(resultats(d, c, be), null)
      if (!a.quantifies && !b.quantifies) continue
      ecrire(ws, r, 1, c.nom, { indent: 1, italique: c.somme })
      ecrire(ws, r, 2, c.unite, { h: 'center', taille: 9 })
      ;[a, b].forEach((s, k) =>
        [s.analyses, nombre(s.frequence), nombre(s.moyenne), nombre(s.mediane), nombre(s.max)].forEach((v, j) => ecrire(ws, r, 3 + k * parRegime.length + j, v, { h: 'center' })),
      )
      const rapports = [a.mediane && b.mediane ? a.mediane / b.mediane : null, a.max && b.max ? a.max / b.max : null]
      rapports.forEach((x, j) => {
        const fond = x === null ? undefined : x >= d.facteur ? eclaircir('#2E75B6', 0.75) : x <= 1 / d.facteur ? eclaircir('#E69F00', 0.7) : undefined
        ecrire(ws, r, 3 + 2 * parRegime.length + j, nombre(x), { h: 'center', fond, gras: !!fond })
      })
      r++
    }
    r = texte(ws, r, `Fond bleu : rapport ≥ ${virgule(d.facteur)} (plus élevé en hautes eaux) ; fond orange : rapport ≤ 1 / ${virgule(d.facteur)} (plus élevé en basses eaux).`, { italique: true })
  }
  r++

  // 4. Well by well.
  const parFamille = ['Minimum', 'Moyenne', 'Maximum']
  const fixes = ['Ouvrage', 'Campagnes échantillonnées', 'Résultats analysés', 'Résultats quantifiés', 'Fréquence de quantification (%)', 'Résultats en dépassement', 'Composés en dépassement (campagnes concernées)']
  r = bandeau(ws, r, '4. Par ouvrage', fixes.length + familles.length * parFamille.length)
  r = texte(ws, r, 'Sur toutes les campagnes de chaque ouvrage. Sommes par famille en µg/l, sur les campagnes où la famille est analysée ; « <LQ » : aucun composé quantifié.', { italique: true })
  r = enTetes(ws, r, [
    { titre: '', fond: '', colonnes: fixes },
    ...familles.map((f, k) => ({ titre: LIBELLES_FAMILLE[f], fond: argb(['#2F7EA8', '#C0392B', '#6B4FA0', '#E08E0B'][k % 4]), colonnes: parFamille })),
  ])
  const debutOuvrages = r
  for (const o of d.ouvrages) {
    const indices = toutes.filter((i) => o.echantillons[i])
    let analyses = 0
    let quantifies = 0
    let depassements = 0
    const enDepassement: string[] = []
    for (const c of liste) {
      const g = d.guides[c.cle]?.valeur ?? null
      const ms = indices.map((i) => mesure(d.campagnes[i], c, i, o.echantillons[i])).filter((m): m is Mesure => !!m && m.valeur !== null)
      analyses += ms.length
      quantifies += ms.filter((m) => !m.inferieur).length
      const k = g === null ? 0 : ms.filter((m) => !m.inferieur && m.valeur! > g).length
      depassements += k
      if (k) enDepassement.push(`${c.nom} (${k}/${ms.length})`)
    }
    const cellules: (string | number)[] = [o.nom, indices.length, analyses, quantifies, nombre(analyses ? (quantifies / analyses) * 100 : null), depassements, enDepassement.join(', ') || '-']
    cellules.forEach((v, j) =>
      ecrire(ws, r, j + 1, v, {
        gras: j === 0 || (j >= 5 && depassements > 0),
        h: j === 0 || j === 6 ? 'left' : 'center',
        wrap: j === 6,
        taille: j === 6 ? 8 : undefined,
        fond: j >= 5 && depassements ? ETAT.alerte.fond : j === 1 && indices.length < 2 ? ETAT.vigilance.fond : undefined,
        couleur: j >= 5 && depassements ? ETAT.alerte.texte : undefined,
      }),
    )
    familles.forEach((f, k) => {
      const ss = indices.map((i) => somme(d.campagnes[i].lecture, f, o.echantillons[i]!)).filter((x) => x !== null)
      const v = ss.map((x) => x!.valeur)
      const aff = (x: number | null) => (x === null ? '-' : x === 0 ? '<LQ' : nombre(x))
      ;[v.length ? Math.min(...v) : null, v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, v.length ? Math.max(...v) : null].forEach((x, j) =>
        ecrire(ws, r, fixes.length + 1 + k * parFamille.length + j, aff(x), { h: 'center', couleur: x === 0 ? GRIS_LQ : undefined }),
      )
    })
    r++
  }
  barre(ws, debutOuvrages, r - 1, 5, GROUPES.quantification.fort, 100)
  r = texte(ws, r, 'Fond orange sur le nombre de campagnes : ouvrage échantillonné une seule fois, absent des comparaisons entre campagnes.', { italique: true })
  r++

  // 5. Rank correlations between the sums and the key compounds.
  const variables: { nom: string; valeur: (o: Ouvrage, i: number) => number | null }[] = [
    ...familles.map((f) => ({
      nom: LIBELLES_FAMILLE[f],
      valeur: (o: Ouvrage, i: number) => (o.echantillons[i] ? somme(d.campagnes[i].lecture, f, o.echantillons[i]!)?.valeur ?? null : null),
    })),
    ...composesCles(d).map((c) => ({
      nom: c.nom,
      valeur: (o: Ouvrage, i: number) => {
        const m = mesure(d.campagnes[i], c, i, o.echantillons[i])
        return m && m.valeur !== null ? (m.inferieur ? m.valeur / 2 : m.valeur) : null
      },
    })),
  ]
  if (variables.length >= 2) {
    r = bandeau(ws, r, '5. Corrélations de rang (Spearman)', 1 + variables.length)
    r = texte(
      ws,
      r,
      "Sur tous les échantillons (ouvrage × campagne) où les deux grandeurs sont analysées, <LQ pris à LQ / 2 ; « - » : moins de 5 échantillons communs ou grandeur constante. ρ proche de 1 : les deux évoluent ensemble (même source, filiation de dégradation) ; proche de -1 : en sens inverse. Indicatif : une corrélation n'établit pas de lien de cause.",
      { italique: true },
    )
    ecrire(ws, r, 1, '', { fond: VERT_ENTETE })
    // Names upright: the columns are as narrow as the first table's.
    variables.forEach((v, j) => (ecrire(ws, r, 2 + j, v.nom, { gras: true, taille: 8, wrap: true, fond: VERT_ENTETE }).alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center', wrapText: true }))
    ws.getRow(r).height = 110
    r++
    const debutMatrice = r
    for (const a of variables) {
      ecrire(ws, r, 1, a.nom, { gras: true, taille: 9, fond: VERT_ENTETE })
      variables.forEach((b, j) => {
        const xs: number[] = []
        const ys: number[] = []
        for (const o of d.ouvrages)
          for (const i of toutes) {
            const x = a.valeur(o, i)
            const y = b.valeur(o, i)
            if (x !== null && y !== null) {
              xs.push(x)
              ys.push(y)
            }
          }
        const rho = a === b ? 1 : xs.length >= 5 ? spearman(xs, ys) : null
        ecrire(ws, r, 2 + j, rho === null ? '-' : Number(rho.toFixed(2)), { h: 'center', fmt: '0.00', gras: rho !== null && a !== b && Math.abs(rho) >= 0.7 })
      })
      r++
    }
    ws.addConditionalFormatting({
      ref: `${ws.getColumn(2).letter}${debutMatrice}:${ws.getColumn(1 + variables.length).letter}${r - 1}`,
      rules: [
        {
          type: 'colorScale',
          priority: 1,
          cfvo: [
            { type: 'num', value: -1 },
            { type: 'num', value: 0 },
            { type: 'num', value: 1 },
          ],
          color: [{ argb: eclaircir('#2E75B6', 0.3) }, { argb: 'FFFFFFFF' }, { argb: eclaircir('#C0392B', 0.3) }],
        },
      ],
    })
    texte(ws, r, 'Gras : liaison forte (|ρ| ≥ 0,7).', { italique: true })
  }
}

export function ajouterFeuillesCampagnes(wb: Workbook, d: DonneesCampagnes, titre: string) {
  if (d.campagnes.length < 2 || !d.ouvrages.length) return
  const ordre = ordreChronologique(d.campagnes)
  // Comparisons, evolution and charts: wells with two campaigns at least.
  const comparables = { ...d, ouvrages: d.ouvrages.filter(suivi) }
  const ecartes = d.ouvrages.filter((o) => !suivi(o)).map((o) => o.nom)
  if (comparables.ouvrages.length) {
    feuilleComparaison(wb, comparables, titre, ordre, ecartes)
    feuilleTendances(wb, comparables, titre, ordre, ecartes)
    feuilleGraphiques(wb, comparables, titre, ordre)
  }
  feuilleStatistiques(wb, d, titre, ordre)
}
