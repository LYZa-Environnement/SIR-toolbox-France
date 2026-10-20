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
  mesure,
  ordreChronologique,
  somme,
  type Campagne,
  type Compose,
  type Evolution,
  type Ouvrage,
} from './campagnes.ts'
import { argb, BANDEAU, eclaircir, ETAT, GROUPES } from './couleurs.ts'
import { ecrire, GRIS_LQ, VERT_ENTETE } from './export.ts'
import { couleursCampagnes, dessinerEvolution, type Point } from './graphiqueEvolution.ts'

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

/** Compounds with at least one result in a matched well. */
function composesMesures(d: DonneesCampagnes): Compose[] {
  return composes(d.campagnes).filter((c) => d.ouvrages.some((o) => o.echantillons.some((e, i) => mesure(d.campagnes[i], c, i, e))))
}

function enTeteCampagnes(ws: Worksheet, r: number, d: DonneesCampagnes, ordre: number[]): number {
  for (const i of ordre) {
    const c = d.campagnes[i]
    const n = d.ouvrages.filter((o) => o.echantillons[i]).length
    r = texte(ws, r, `• ${libelleCampagne(c, i)} : ${c.fichier} (${n} ouvrage${n > 1 ? 's' : ''})${i === 0 ? ' — campagne des onglets de mise en forme' : ''}.`)
  }
  return r
}

// ---- Side by side ----------------------------------------------------------------------

function feuilleComparaison(wb: Workbook, d: DonneesCampagnes, titre: string, ordre: number[]) {
  const ws = wb.addWorksheet('Comparaison campagnes', { views: [{ showGridLines: false }] })
  const n = ordre.length
  const premiere = ordre[0]
  const derniere = ordre[n - 1]
  ecrire(ws, 1, 1, `${titre} — comparaison des campagnes`, { gras: true, taille: 12, bord: false })
  let r = enTeteCampagnes(ws, 3, d, ordre)
  r = texte(
    ws,
    r,
    `Évolution : de la campagne du ${libelleCourt(d.campagnes[premiere], premiere)} à celle du ${libelleCourt(d.campagnes[derniere], derniere)}. Un écart est retenu à partir d'un facteur ${virgule(d.facteur)} (au-delà de l'incertitude analytique, de l'ordre de 30 % par résultat) ; un composé qui apparaît ou disparaît doit dépasser ${virgule(d.facteur)} fois la limite de quantification de l'autre campagne.`,
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
      const e = evolution(ms[0], ms[n - 1], d.facteur)
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

function feuilleTendances(wb: Workbook, d: DonneesCampagnes, titre: string, ordre: number[]) {
  const ws = wb.addWorksheet('Évolutions et tendances', { views: [{ showGridLines: false }] })
  const n = ordre.length
  const premiere = ordre[0]
  const derniere = ordre[n - 1]
  ws.getColumn(1).width = 34
  for (let c = 2; c <= 30; c++) ws.getColumn(c).width = 13
  ecrire(ws, 1, 1, `${titre} — évolutions et tendances`, { gras: true, taille: 12, bord: false })
  let r = enTeteCampagnes(ws, 3, d, ordre)
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
        const a = ss[0]
        const b = ss[n - 1]
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
  r = bandeau(ws, r, `Évolution par composé, du ${libelleCourt(d.campagnes[premiere], premiere)} au ${libelleCourt(d.campagnes[derniere], derniere)}`, 7)
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
      const e = evolution(
        mesure(d.campagnes[premiere], comp, premiere, o.echantillons[premiere]),
        mesure(d.campagnes[derniere], comp, derniere, o.echantillons[derniere]),
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
    .filter((c) => estConcentration(c) && !c.somme)
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
    "Une barre par campagne, de la plus ancienne à la plus récente : bleu pour les hautes eaux, orange pour les basses eaux, vert si le régime n'est pas renseigné. Barre en pointillés : résultat inférieur à la LQ, tracé à la hauteur de la LQ. Ligne rouge pointillée : valeur de comparaison. Échelle logarithmique lorsque les valeurs s'étendent sur plus de deux ordres de grandeur.",
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
    const avec = d.ouvrages.filter((o) => o.echantillons.some((e, i) => e && somme(d.campagnes[i].lecture, f, e)))
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
    const avec = d.ouvrages.filter((o) => o.echantillons.some((e, i) => mesure(d.campagnes[i], c, i, e)))
    const valeurs: Point[][] = ordre.map((i) =>
      avec.map((o) => {
        const m = mesure(d.campagnes[i], c, i, o.echantillons[i])
        return m && m.valeur !== null ? { valeur: m.valeur, inferieur: m.inferieur } : null
      }),
    )
    placer(dessinerEvolution(c.nom, c.unite, avec.map((o) => o.nom), series, valeurs, d.guides[c.cle]?.valeur ?? null))
  }
}

export function ajouterFeuillesCampagnes(wb: Workbook, d: DonneesCampagnes, titre: string) {
  if (d.campagnes.length < 2 || !d.ouvrages.length) return
  const ordre = ordreChronologique(d.campagnes)
  feuilleComparaison(wb, d, titre, ordre)
  feuilleTendances(wb, d, titre, ordre)
  feuilleGraphiques(wb, d, titre, ordre)
}
