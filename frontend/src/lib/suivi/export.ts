/**
 * Exports of the time-series reading: the review workbook (summary, trend
 * statistics, coloured matrix, chronicles by well and by compound, charts
 * as images, water levels, upgradient / downgradient, dechlorination,
 * monitoring prompts, data quality, method, consolidated data), the charts
 * as an archive (PNG and SVG), and the consolidated data alone — in the
 * history table layout, so it can be loaded again for the next review.
 */

import type { Workbook, Worksheet } from 'exceljs'
import { LIBELLES_POSITION } from '../resultats/expert/amontAval.ts'
import { argb, BANDEAU, eclaircir, ETAT } from '../resultats/couleurs.ts'
import { ecrire, VERT_ENTETE, type Style } from '../resultats/export.ts'
import { CLASSES, direction, fr, LIBELLES_CENSURE, LIBELLES_PISTE, LIBELLES_STATUT_GRILLE, ORDRE_CLASSES, pTexte, type Analyse, type AnalyseSerie, type NiveauFait } from './analyse.ts'
import { formatDate } from './dates.ts'
import { figureCompose, figureDegradation, figureEcoulement, figureNiveaux, figureOuvrage, figureSerie } from './figures.ts'
import { barresSvg, svgEnPng } from './graphique.ts'
import { COLONNES_NIVEAUX, COLONNES_OUVRAGES, COLONNES_RESULTATS } from './historique.ts'
import type { Compose } from './modele.ts'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function telecharger(nom: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

const nomFichier = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _.,()+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

/** A number rounded to 3 significant digits, as a number for Excel. */
const n3 = (x: number | null | undefined, chiffres = 3) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toPrecision(chiffres)))
const dateExcel = (iso: string) => (iso ? new Date(`${iso}T00:00:00Z`) : null)
const FMT_DATE = 'dd/mm/yyyy'

const COULEUR_NIVEAU: Record<NiveauFait, { fond: string; texte: string }> = {
  alerte: ETAT.alerte,
  vigilance: ETAT.vigilance,
  favorable: ETAT.ok,
  info: { fond: 'FFE9EDF1', texte: 'FF3B4856' },
}
const LIBELLE_NIVEAU: Record<NiveauFait, string> = { alerte: 'Alerte', vigilance: 'Vigilance', favorable: 'Favorable', info: 'À noter' }

function bandeau(ws: Worksheet, r: number, t: string, largeur: number): number {
  ws.mergeCells(r, 1, r, largeur)
  ecrire(ws, r, 1, t, { gras: true, fond: BANDEAU.fond, couleur: BANDEAU.texte })
  ws.getRow(r).height = 18
  return r + 1
}

function texte(ws: Worksheet, r: number, t: string, largeur = 12, s: Style = {}): number {
  ws.mergeCells(r, 1, r, largeur)
  ecrire(ws, r, 1, t, { taille: 9, bord: false, wrap: true, ...s })
  ws.getRow(r).height = Math.max(13, Math.ceil(t.length / (largeur * 11)) * 12.5)
  return r + 1
}

function entete(ws: Worksheet, r: number, cols: string[], c0 = 1) {
  cols.forEach((t, i) => ecrire(ws, r, c0 + i, t, { gras: true, fond: VERT_ENTETE, wrap: true, taille: 9, h: 'center' }))
  ws.getRow(r).height = 30
}

const styleClasse = (s: AnalyseSerie): Style => {
  const k = CLASSES[s.classe]
  return { fond: argb(k.fond), couleur: argb(k.texte), gras: s.classe === 'hausse' || s.classe === 'baisse', h: 'center', taille: 9 }
}

const titrePeriode = (a: Analyse) => `du ${formatDate(a.debut)} au ${formatDate(a.fin)} (${a.campagnes.length} campagnes)`

// ---- Images -------------------------------------------------------------------------------------

interface Image {
  titre: string
  png: string
  largeur: number
  hauteur: number
}

async function image(titre: string, svg: string, largeur: number, hauteur: number): Promise<Image> {
  return { titre, png: await svgEnPng(svg, largeur, hauteur, 2), largeur, hauteur }
}

/** Images one under the other in a sheet, at 75 % of their drawn size. */
function placerImages(wb: Workbook, ws: Worksheet, r: number, images: Image[]): number {
  for (const im of images) {
    ecrire(ws, r, 1, im.titre, { gras: true, bord: false })
    r++
    const id = wb.addImage({ base64: im.png, extension: 'png' })
    const w = im.largeur * 0.75
    const h = im.hauteur * 0.75
    ws.addImage(id, { tl: { col: 0, row: r - 1 }, ext: { width: w, height: h } })
    r += Math.ceil(h / 20) + 2
  }
  return r
}

// ---- Sheets -------------------------------------------------------------------------------------

function feuilleSynthese(wb: Workbook, a: Analyse, site: string) {
  const ws = wb.addWorksheet('Synthèse', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 48
  ws.getColumn(3).width = 90
  let r = 1
  ecrire(ws, r++, 1, /eaux souterraines/i.test(site) ? `${site} — suivi temporel` : `${site} — suivi temporel des eaux souterraines`, { gras: true, taille: 14, bord: false })
  ecrire(ws, r++, 1, `Période analysée ${titrePeriode(a)} · ${a.ouvrages.length} ouvrages · ${a.composesQuantifies.filter((c) => !c.terrain && !c.calcule).length} composés quantifiés`, { taille: 10, bord: false })
  ecrire(
    ws,
    r++,
    1,
    `Réglages : résultats < LQ — ${LIBELLES_CENSURE[a.reglages.censure].court} ; seuil de signification ${fr(a.reglages.alpha * 100)} % (bilatéral) ; test dès ${a.reglages.nMin} résultats ; vigilance à ${Math.round(a.reglages.vigilance * 100)} % de la valeur de référence.`,
    { taille: 9, bord: false, couleur: 'FF4F625F' },
  )
  r++
  r = bandeau(ws, r, 'Tendances des séries (ouvrage × composé, hors sommes calculées et paramètres de terrain)', 3)
  entete(ws, r++, ['Classe', 'Libellé', 'Nombre de séries'])
  for (const c of ORDRE_CLASSES) {
    const k = CLASSES[c]
    const n = a.series.filter((s) => s.n > 0 && !s.compose.terrain && !s.compose.calcule && s.classe === c).length
    ecrire(ws, r, 1, `${k.symbole} ${k.court}`, { fond: argb(k.fond), couleur: argb(k.texte), gras: true })
    ecrire(ws, r, 2, k.libelle)
    ecrire(ws, r, 3, n, { h: 'left' })
    r++
  }
  r++
  r = bandeau(ws, r, 'Faits marquants (du plus important au moins important)', 3)
  entete(ws, r++, ['Niveau', 'Constat', 'Détail'])
  for (const f of a.faits) {
    const c = COULEUR_NIVEAU[f.niveau]
    ecrire(ws, r, 1, LIBELLE_NIVEAU[f.niveau], { fond: c.fond, couleur: c.texte, gras: true, taille: 9 })
    ecrire(ws, r, 2, f.titre, { gras: true, wrap: true, taille: 9 })
    ecrire(ws, r, 3, f.detail, { wrap: true, taille: 9 })
    ws.getRow(r).height = Math.max(15, Math.ceil(f.detail.length / 105) * 12.5)
    r++
  }
  r++
  r = bandeau(ws, r, 'Pistes pour le programme de surveillance (détail : onglet « Pistes surveillance »)', 3)
  for (const t of ['renforcer', 'maintenir', 'completer', 'alleger', 'retirer'] as const) {
    const ps = a.pistes.filter((p) => p.type === t)
    if (!ps.length) continue
    ecrire(ws, r, 1, LIBELLES_PISTE[t].libelle, { gras: true, couleur: argb(LIBELLES_PISTE[t].couleur), taille: 9 })
    ecrire(ws, r, 2, ps.map((p) => p.cible).join(', '), { taille: 9, wrap: true })
    ws.mergeCells(r, 2, r, 3)
    r++
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
}

function feuilleGrille(ws: Worksheet, a: Analyse) {
  ;[8, 46, 14, 100, 7].forEach((l, i) => (ws.getColumn(i + 1).width = l))
  let r = 1
  ecrire(ws, r++, 1, 'Grille de lecture du guide « Évolution et arrêt de la surveillance des eaux souterraines »', { gras: true, taille: 12, bord: false })
  r = texte(
    ws,
    r,
    "BRGM / INERIS pour le ministère de la Transition écologique, décembre 2022. Points que les données chargées permettent de juger, évalués automatiquement ; les autres sont à vérifier dans le dossier. L'étape 1 (recevabilité) suppose un bilan quadriennal conforme au guide « Surveillance de la qualité des eaux souterraines ». L'exigence de justification est plus forte pour un arrêt total que pour une évolution (p. 17).",
    5,
  )
  const titres: Record<number, string> = { 2: 'Étape 2 — Éligibilité de la demande', 3: 'Étape 3 — Respect des exigences techniques', 4: "Étape 4 — Justification de l'argumentation" }
  for (const e of [2, 3, 4] as const) {
    r++
    r = bandeau(ws, r, titres[e], 5)
    entete(ws, r++, ['Point', 'Exigence', 'Statut', 'Constat sur les données', 'Page'])
    for (const g of a.grille.filter((x) => x.etape === e)) {
      const st = LIBELLES_STATUT_GRILLE[g.statut]
      ecrire(ws, r, 1, g.code, { taille: 9, gras: true, h: 'center' })
      ecrire(ws, r, 2, g.intitule, { taille: 9, wrap: true })
      ecrire(ws, r, 3, st.libelle, { taille: 9, gras: true, fond: argb(st.fond), couleur: argb(st.couleur), h: 'center' })
      ecrire(ws, r, 4, g.constat, { taille: 9, wrap: true })
      ecrire(ws, r, 5, g.page, { taille: 9, h: 'center' })
      ws.getRow(r).height = Math.max(15, Math.ceil(g.constat.length / 110) * 12.5, Math.ceil(g.intitule.length / 50) * 12.5)
      r++
    }
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
}

function feuilleTendances(ws: Worksheet, a: Analyse) {
  const cols = [
    'Ouvrage',
    'Position',
    'Famille',
    'Composé',
    'Unité',
    'Début',
    'Fin',
    'n',
    'n quantifiés',
    'Fréquence de quantification',
    'Minimum quantifié',
    'Maximum',
    'Date du maximum',
    'Moyenne (< LQ = LQ/2)',
    'Médiane (< LQ = LQ/2)',
    'Coefficient de variation',
    'LQ min',
    'LQ max',
    'Valeur de référence',
    'Source',
    'Dernier résultat',
    'Date du dernier',
    'Dernier / référence',
    'Dépassements',
    'Dépassements consécutifs (fin)',
    'Tendance',
    'S (Mann-Kendall)',
    'Var(S)',
    'Z',
    'tau de Kendall',
    'p bilatéral',
    'p exact',
    'Pente de Sen (/an)',
    `IC ${Math.round((1 - a.reglages.alpha) * 100)} % bas`,
    `IC ${Math.round((1 - a.reglages.alpha) * 100)} % haut`,
    'Pente relative (%/an)',
    'Kendall saisonnier p',
    'Rupture (Pettitt) entre',
    'Rupture p',
    'Médiane avant',
    'Médiane après',
    'Demi-vie (ans)',
    'Horizon valeur de réf. (année)',
    'Horizon : au plus tôt',
    'Horizon : au plus tard',
    'Résultats atypiques',
    'Remarques',
  ]
  entete(ws, 1, cols)
  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }]
  const largeurs = [9, 10, 14, 30, 8, 11, 11, 5, 8, 10, 10, 10, 11, 10, 10, 9, 8, 8, 10, 8, 10, 11, 9, 9, 10, 16, 8, 9, 8, 8, 9, 7, 11, 10, 10, 10, 10, 22, 8, 9, 9, 9, 11, 10, 10, 18, 40]
  largeurs.forEach((l, i) => (ws.getColumn(i + 1).width = l))
  let r = 2
  const series = a.series
    .filter((s) => s.n > 0)
    .sort((x, y) => Number(!!x.compose.terrain) - Number(!!y.compose.terrain) || a.ouvrages.indexOf(x.ouvrage) - a.ouvrages.indexOf(y.ouvrage) || a.base.composes.indexOf(x.compose) - a.base.composes.indexOf(y.compose))
  for (const s of series) {
    const t = s.statut === 'teste'
    const v: (string | number | Date | null)[] = [
      s.ouvrage.nom,
      LIBELLES_POSITION[s.ouvrage.position],
      s.compose.famille,
      s.compose.nom,
      s.compose.unite,
      dateExcel(s.premiere?.date ?? ''),
      dateExcel(s.derniere?.date ?? ''),
      s.n,
      s.nQ,
      n3(s.frequence),
      n3(s.min),
      n3(s.max),
      dateExcel(s.maxPoint?.date ?? ''),
      n3(s.moyenne),
      n3(s.mediane),
      n3(s.cov),
      n3(s.lqMin),
      n3(s.lqMax),
      s.reference?.valeur ?? null,
      s.reference ? (s.reference.saisie ? 'saisie' : s.reference.source) : '',
      s.derniere ? s.derniere.resultat.brut : '',
      dateExcel(s.derniere?.date ?? ''),
      n3(s.ratioDernier),
      s.reference ? s.depassements : null,
      s.reference ? s.depassementsConsecutifs : null,
      `${CLASSES[s.classe].symbole} ${CLASSES[s.classe].libelle}`,
      t ? (s.mk?.S ?? null) : null,
      t ? n3(s.mk?.varS, 5) : null,
      t ? n3(s.mk?.Z) : null,
      t ? n3(s.mk?.tau) : null,
      t ? n3(s.mk?.pBilateral) : null,
      t && s.mk ? (s.mk.exact ? 'oui' : 'non') : '',
      t ? n3(s.sen?.pente) : null,
      t ? n3(s.sen?.basse) : null,
      t ? n3(s.sen?.haute) : null,
      t ? n3(s.senRelatif) : null,
      n3(s.saisonnier?.pBilateral),
      s.rupture ? `${formatDate(s.rupture.entre[0])} – ${formatDate(s.rupture.entre[1])}` : '',
      n3(s.rupture?.p),
      n3(s.rupture?.avant),
      n3(s.rupture?.apres),
      n3(s.decroissance?.demiVie),
      s.horizon ? Math.floor(s.horizon.annee) : null,
      s.horizon?.plusTot ? Math.floor(s.horizon.plusTot) : null,
      s.horizon?.plusTard ? Math.floor(s.horizon.plusTard) : null,
      s.points
        .filter((p) => p.atypique && !p.exclu)
        .map((p) => formatDate(p.date))
        .join(', '),
      [...s.avertissements, ...(s.points.some((p) => p.exclu) ? [`${s.points.filter((p) => p.exclu).length} résultat(s) écarté(s)`] : [])].join(' '),
    ]
    v.forEach((x, i) => {
      const st: Style = { taille: 9 }
      if (x instanceof Date) st.fmt = FMT_DATE
      if (i === 9) st.fmt = '0%'
      ecrire(ws, r, i + 1, x as never, st)
    })
    ecrire(ws, r, 26, v[25] as string, styleClasse(s))
    if (s.ratioDernier !== null && s.ratioDernier > 1) ecrire(ws, r, 23, v[22] as number, { taille: 9, fond: ETAT.alerte.fond, couleur: ETAT.alerte.texte, gras: true })
    if (s.compose.terrain) ws.getRow(r).font = { name: 'Verdana', size: 9, italic: true, color: { argb: 'FF6B7480' } }
    r++
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: r - 1, column: cols.length } }
}

function feuilleMatrice(ws: Worksheet, a: Analyse) {
  const composes = a.base.composes.filter((c) => !c.terrain && a.composesQuantifies.includes(c))
  ws.getColumn(1).width = 34
  ws.getColumn(2).width = 12
  a.ouvrages.forEach((_, i) => (ws.getColumn(3 + i).width = 13))
  let r = 1
  ecrire(ws, r++, 1, `Matrice des tendances — ${titrePeriode(a)}`, { gras: true, taille: 12, bord: false })
  ecrire(ws, r++, 1, 'Chaque case : tendance de la série (symbole et libellé), puis le dernier résultat rapporté à la valeur de référence (×n) ; trait rouge épais : dernier résultat au-dessus de la valeur de référence.', {
    taille: 9,
    bord: false,
  })
  r++
  entete(ws, r, ['Composé', 'Valeur de réf.', ...a.ouvrages.map((o) => `${o.nom}\n${LIBELLES_POSITION[o.position]}`)])
  ws.getRow(r).height = 32
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: r }]
  r++
  let famille: string | null = null
  for (const c of composes) {
    if (c.famille !== famille) {
      famille = c.famille
      ws.mergeCells(r, 1, r, 2 + a.ouvrages.length)
      ecrire(ws, r++, 1, famille || 'Sans famille', { gras: true, fond: 'FFF2F2F2', taille: 9 })
    }
    const ref = a.references.get(c.cle)
    ecrire(ws, r, 1, c.nom, { taille: 9 })
    ecrire(ws, r, 2, ref ? `${fr(ref.valeur)} ${c.unite}` : '–', { taille: 9, h: 'center' })
    a.ouvrages.forEach((o, i) => {
      const s = a.parCle.get(`${o.cle}|${c.cle}`)
      if (!s || !s.n) {
        ecrire(ws, r, 3 + i, '', { fond: 'FFFAFAFA' })
        return
      }
      const k = CLASSES[s.classe]
      const ratio = s.ratioDernier && s.ratioDernier > 0 ? ` ×${fr(s.ratioDernier, 2)}` : ''
      const cell = ecrire(ws, r, 3 + i, `${k.symbole} ${k.court}${ratio}`, styleClasse(s))
      if (s.ratioDernier !== null && s.ratioDernier > 1) {
        const rouge = { style: 'medium' as const, color: { argb: 'FFC0392B' } }
        cell.border = { top: rouge, bottom: rouge, left: rouge, right: rouge }
      }
    })
    r++
  }
  r++
  for (const c of ORDRE_CLASSES) {
    const k = CLASSES[c]
    ecrire(ws, r, 1, `${k.symbole} ${k.libelle}`, { fond: argb(k.fond), couleur: argb(k.texte), taille: 9 })
    r++
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
}

function cellule(ws: Worksheet, r: number, c: number, s: AnalyseSerie | undefined, campagne: string) {
  const p = s?.points.find((x) => x.resultat.campagne === campagne)
  if (!p) {
    ecrire(ws, r, c, '', { taille: 9 })
    return
  }
  const ref = s!.reference?.valeur
  const depasse = ref !== undefined && !p.inferieur && p.valeur > ref
  const st: Style = { taille: 9, h: 'center' }
  if (p.inferieur) st.couleur = 'FF808080'
  if (depasse) {
    st.fond = ETAT.alerte.fond
    st.couleur = ETAT.alerte.texte
    st.gras = true
  }
  if (p.exclu) {
    st.italique = true
    st.couleur = 'FF9AA1A8'
  }
  ecrire(ws, r, c, p.inferieur ? p.resultat.brut.replace('.', ',') : (n3(p.valeur, 4) as number), st)
}

function feuilleChroniquesOuvrages(ws: Worksheet, a: Analyse) {
  const camps = a.base.campagnes
  const largeur = 5 + camps.length
  ws.getColumn(1).width = 32
  ws.getColumn(2).width = 9
  ws.getColumn(3).width = 10
  camps.forEach((_, i) => (ws.getColumn(4 + i).width = 10.5))
  ws.getColumn(4 + camps.length).width = 18
  ws.getColumn(5 + camps.length).width = 20
  let r = 1
  ecrire(ws, r++, 1, 'Chroniques par ouvrage — tous les résultats, toutes campagnes', { gras: true, taille: 12, bord: false })
  ecrire(ws, r++, 1, 'Rouge : au-dessus de la valeur de référence ; gris : < LQ ; italique : écarté par l’utilisateur ; colonnes grisées : hors période analysée.', { taille: 9, bord: false })
  r++
  for (const o of a.ouvrages) {
    const ss = a.base.composes.map((c) => a.parCle.get(`${o.cle}|${c.cle}`)).filter((s): s is AnalyseSerie => !!s && s.points.length > 0)
    if (!ss.length) continue
    r = bandeau(ws, r, `${o.nom} — ${LIBELLES_POSITION[o.position]}`, largeur)
    entete(ws, r, ['Composé', 'Unité', 'Valeur de réf.', ...camps.map((c) => `${formatDate(c.date)}${c.regime ? `\n${c.regime}` : ''}`), 'Tendance (période)', 'Pente de Sen'])
    camps.forEach((c, i) => {
      if (!a.campagnes.includes(c)) ws.getCell(r, 4 + i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3E6E8' } }
    })
    r++
    let famille: string | null = null
    for (const s of ss) {
      if (s.compose.famille !== famille) {
        famille = s.compose.famille
        ws.mergeCells(r, 1, r, largeur)
        ecrire(ws, r++, 1, famille || '—', { gras: true, fond: 'FFF2F2F2', taille: 9 })
      }
      ecrire(ws, r, 1, s.compose.nom, { taille: 9 })
      ecrire(ws, r, 2, s.compose.unite, { taille: 9, h: 'center' })
      ecrire(ws, r, 3, s.reference?.valeur ?? '–', { taille: 9, h: 'center' })
      camps.forEach((c, i) => cellule(ws, r, 4 + i, s, c.id))
      ecrire(ws, r, 4 + camps.length, `${CLASSES[s.classe].symbole} ${CLASSES[s.classe].court}`, styleClasse(s))
      ecrire(ws, r, 5 + camps.length, s.statut === 'teste' && s.sen ? `${s.sen.pente > 0 ? '+' : ''}${fr(s.sen.pente)} ${s.compose.unite}/an` : '–', { taille: 9 })
      r++
    }
    r++
  }
  ws.views = [{ state: 'frozen', xSplit: 1 }]
}

function feuilleChroniquesComposes(ws: Worksheet, a: Analyse) {
  const camps = a.base.campagnes
  const largeur = 4 + camps.length
  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 12
  camps.forEach((_, i) => (ws.getColumn(3 + i).width = 10.5))
  ws.getColumn(3 + camps.length).width = 18
  ws.getColumn(4 + camps.length).width = 20
  let r = 1
  ecrire(ws, r++, 1, 'Chroniques par composé — composés quantifiés au moins une fois', { gras: true, taille: 12, bord: false })
  r++
  for (const c of a.composesQuantifies.filter((x) => !x.terrain)) {
    const ss = a.ouvrages.map((o) => a.parCle.get(`${o.cle}|${c.cle}`)).filter((s): s is AnalyseSerie => !!s && s.points.length > 0)
    if (!ss.length) continue
    const ref = a.references.get(c.cle)
    r = bandeau(ws, r, `${c.nom} (${c.unite})${ref ? ` — valeur de référence ${fr(ref.valeur)} ${c.unite}` : ''}`, largeur)
    entete(ws, r, ['Ouvrage', 'Position', ...camps.map((k) => `${formatDate(k.date)}${k.regime ? `\n${k.regime}` : ''}`), 'Tendance (période)', 'Pente de Sen'])
    r++
    for (const s of ss) {
      ecrire(ws, r, 1, s.ouvrage.nom, { taille: 9, gras: true })
      ecrire(ws, r, 2, LIBELLES_POSITION[s.ouvrage.position], { taille: 9 })
      camps.forEach((k, i) => cellule(ws, r, 3 + i, s, k.id))
      ecrire(ws, r, 3 + camps.length, `${CLASSES[s.classe].symbole} ${CLASSES[s.classe].court}`, styleClasse(s))
      ecrire(ws, r, 4 + camps.length, s.statut === 'teste' && s.sen ? `${s.sen.pente > 0 ? '+' : ''}${fr(s.sen.pente)} ${c.unite}/an` : '–', { taille: 9 })
      r++
    }
    r++
  }
  ws.views = [{ state: 'frozen', xSplit: 1 }]
}

function feuillePiezo(wb: Workbook, ws: Worksheet, a: Analyse, images: Image[]) {
  ws.getColumn(1).width = 14
  let r = 1
  ecrire(ws, r++, 1, 'Piézométrie', { gras: true, taille: 12, bord: false })
  if (!a.piezo.length) {
    ecrire(ws, r, 1, 'Aucun niveau d’eau chargé.', { bord: false })
    return
  }
  const dates = [...new Set(a.piezo.flatMap((p) => p.serie.map((x) => x.date)))].sort()
  ws.getColumn(2).width = 13
  dates.forEach((_, i) => (ws.getColumn(3 + i).width = 10.5))
  r = bandeau(
    ws,
    r,
    a.piezo.every((p) => p.enCharge)
      ? 'Cote piézométrique (m NGF)'
      : a.piezo.every((p) => !p.enCharge)
        ? "Profondeur de l'eau sous le repère (m) — repères sans cote NGF : chaque ouvrage se lit seul, pas de comparaison entre ouvrages"
        : "Cote piézométrique (m NGF) ou, à défaut de cote du repère, profondeur de l'eau sous le repère (m)",
    2 + dates.length,
  )
  entete(ws, r++, ['Ouvrage', 'Mesure', ...dates.map(formatDate)])
  for (const p of a.piezo) {
    ecrire(ws, r, 1, p.ouvrage.nom, { gras: true, taille: 9 })
    ecrire(ws, r, 2, p.enCharge ? 'cote m NGF' : 'profondeur m', { taille: 9 })
    dates.forEach((d, i) => {
      const x = p.serie.find((y) => y.date === d)
      ecrire(ws, r, 3 + i, x ? n3(p.enCharge ? x.v : -x.v, 5) : '', { taille: 9, h: 'center' })
    })
    r++
  }
  r++
  r = bandeau(ws, r, 'Statistiques et liens avec les concentrations', 8)
  entete(ws, r++, ['Ouvrage', 'Relevés', 'Amplitude (m)', 'Tendance du niveau (p)', 'Pente (m/an)', 'Composé', 'tau de Kendall', 'p'])
  ws.getColumn(6).width = Math.max(ws.getColumn(6).width ?? 10, 30)
  for (const p of a.piezo) {
    const liens = p.correlations.length ? p.correlations : [null]
    for (const l of liens) {
      ecrire(ws, r, 1, p.ouvrage.nom, { taille: 9 })
      ecrire(ws, r, 2, p.serie.length, { taille: 9 })
      ecrire(ws, r, 3, n3(p.amplitude), { taille: 9 })
      ecrire(ws, r, 4, n3(p.mk?.pBilateral), { taille: 9 })
      ecrire(ws, r, 5, n3(p.sen?.pente), { taille: 9 })
      ecrire(ws, r, 6, l ? l.compose.nom : '–', { taille: 9 })
      ecrire(ws, r, 7, l ? n3(l.c.tau) : null, { taille: 9 })
      ecrire(ws, r, 8, l ? n3(l.c.p) : null, l && l.c.p <= a.reglages.alpha ? { taille: 9, gras: true, fond: ETAT.vigilance.fond } : { taille: 9 })
      r++
    }
  }
  r++
  const e = a.ecoulement
  if (e) {
    r = bandeau(ws, r, `Sens d'écoulement — vers le ${direction(e.azimutMoyen)}, gradient médian ${fr(e.gradientMedian * 1000, 2)} ‰, écart circulaire ${Math.round(e.dispersion)}°`, 8)
    r = texte(ws, r, `Plan ajusté par moindres carrés sur les cotes de la nappe (h = a·x + b·y + c) des ouvrages dont les coordonnées sont connues ; de l'amont vers l'aval le long de l'écoulement moyen : ${e.ordre.map((x) => x.ouvrage.nom).join(' → ')}.`, 8)
    for (const x of e.incoherences)
      r = texte(ws, r, `${x.ouvrage.nom} : déclaré ${x.declaree === 'amont' ? 'en amont' : 'en aval'}, situé ${x.attendue === 'amont' ? 'en amont' : 'en aval'} le long de l'écoulement — position à vérifier.`, 8, { couleur: ETAT.alerte.texte, gras: true })
    entete(ws, r++, ['Campagne', 'Régime', 'Ouvrages', 'Direction', 'Azimut (°)', 'Gradient (‰)', 'R²'])
    for (const c of e.campagnes) {
      ecrire(ws, r, 1, dateExcel(c.campagne.date), { taille: 9, fmt: FMT_DATE })
      ecrire(ws, r, 2, c.campagne.regime ?? '–', { taille: 9 })
      ecrire(ws, r, 3, c.n, { taille: 9 })
      ecrire(ws, r, 4, direction(c.azimut), { taille: 9 })
      ecrire(ws, r, 5, Math.round(c.azimut), { taille: 9 })
      ecrire(ws, r, 6, n3(c.gradient * 1000), { taille: 9 })
      ecrire(ws, r, 7, n3(c.r2, 2), { taille: 9 })
      r++
    }
    r++
  }
  placerImages(wb, ws, r, images)
}

function feuilleAmontAval(ws: Worksheet, a: Analyse) {
  ws.getColumn(1).width = 14
  for (let i = 2; i <= 5; i++) ws.getColumn(i).width = 22
  let r = 1
  ecrire(ws, r++, 1, 'Amont / aval — maximum de chaque groupe d’ouvrages par campagne', { gras: true, taille: 12, bord: false })
  if (!a.amontAval.length) {
    ecrire(ws, r, 1, 'Positions amont / aval non renseignées.', { bord: false })
    return
  }
  r++
  const v = (p: { valeur: number; inferieur: boolean; ouvrage: string } | null) => (p ? `${p.inferieur ? '<' : ''}${fr(p.valeur)} (${p.ouvrage})` : '–')
  for (const x of a.amontAval.filter((y) => !y.compose.calcule)) {
    r = bandeau(ws, r, `${x.compose.nom} (${x.compose.unite}) — quantifié à l'amont à ${Math.round(x.frequenceAmont * 100)} % des campagnes`, 4)
    entete(ws, r++, ['Campagne', 'Amont', 'Au droit du site', 'Aval'])
    for (const l of x.campagnes) {
      ecrire(ws, r, 1, dateExcel(l.campagne.date), { taille: 9, fmt: FMT_DATE })
      ecrire(ws, r, 2, v(l.amont), { taille: 9 })
      ecrire(ws, r, 3, v(l.droit), { taille: 9 })
      ecrire(ws, r, 4, v(l.aval), { taille: 9 })
      r++
    }
    r++
  }
}

function feuilleDechloration(wb: Workbook, ws: Worksheet, a: Analyse, images: Image[]) {
  ws.getColumn(1).width = 12
  let r = 1
  ecrire(ws, r++, 1, 'Dégradation des chloroéthènes — concentrations molaires (µmol/l) et parts', { gras: true, taille: 12, bord: false })
  for (const d of a.degradation) {
    const n = d.especes.length
    for (let i = 0; i < 2 * n + 3; i++) ws.getColumn(2 + i).width = Math.max(ws.getColumn(2 + i).width ?? 9, 9)
    r++
    r = bandeau(ws, r, `${d.ouvrage.nom}${d.tendanceChlores ? ` — nombre moyen de Cl : ${d.tendanceChlores.pBilateral > a.reglages.alpha ? 'pas de tendance significative' : d.tendanceChlores.S < 0 ? 'en baisse' : 'en hausse'} (${pTexte(d.tendanceChlores.pBilateral)})` : ''}`, 2 * n + 3)
    for (const t of d.lecture) r = texte(ws, r, t, 2 * n + 3)
    entete(ws, r++, ['Campagne', ...d.especes.map((e) => `${e.code} µmol/l`), 'Total µmol/l', ...d.especes.map((e) => `${e.code} %`), 'Cl moyen'])
    for (const c of d.campagnes) {
      ecrire(ws, r, 1, dateExcel(c.campagne.date), { taille: 9, fmt: FMT_DATE })
      c.moles.forEach((m, i) => ecrire(ws, r, 2 + i, n3(m), { taille: 9 }))
      ecrire(ws, r, 2 + n, n3(c.total), { taille: 9, gras: true })
      c.moles.forEach((m, i) => ecrire(ws, r, 3 + n + i, c.total ? n3(m / c.total) : null, { taille: 9, fmt: '0%', fond: c.total && m / c.total > 0.5 ? eclaircir(d.especes[i].couleur, 0.75) : undefined }))
      ecrire(ws, r, 3 + 2 * n, n3(c.chlores), { taille: 9, gras: true })
      r++
    }
  }
  r += 2
  placerImages(wb, ws, r, images)
}

function feuilleIndicateurs(wb: Workbook, ws: Worksheet, a: Analyse, images: Image[]) {
  ws.getColumn(1).width = 12
  ;[10, 14, 14, 16, 40].forEach((l, i) => (ws.getColumn(2 + i).width = l))
  let r = 1
  ecrire(ws, r++, 1, 'Évolution d’ensemble par campagne', { gras: true, taille: 12, bord: false })
  r++
  entete(ws, r++, ['Campagne', 'Régime', 'Ouvrages prélevés', 'Résultats quantifiés', 'Résultats > valeur de réf.', 'Ouvrages concernés'])
  for (const x of a.indicateurs) {
    ecrire(ws, r, 1, dateExcel(x.campagne.date), { taille: 9, fmt: FMT_DATE })
    ecrire(ws, r, 2, x.campagne.regime ?? '–', { taille: 9 })
    ecrire(ws, r, 3, x.prelevements, { taille: 9 })
    ecrire(ws, r, 4, x.quantifies, { taille: 9 })
    ecrire(ws, r, 5, x.depassements, x.depassements ? { taille: 9, fond: ETAT.alerte.fond, couleur: ETAT.alerte.texte, gras: true } : { taille: 9 })
    ecrire(ws, r, 6, x.ouvragesDepassement.map((k) => a.ouvrages.find((o) => o.cle === k)?.nom ?? k).join(', '), { taille: 9 })
    r++
  }
  r += 2
  placerImages(wb, ws, r, images)
}

function feuillePistes(ws: Worksheet, a: Analyse) {
  ;[22, 12, 26, 90, 60].forEach((l, i) => (ws.getColumn(1 + i).width = l))
  let r = 1
  ecrire(ws, r++, 1, 'Pistes pour le programme de surveillance', { gras: true, taille: 12, bord: false })
  r = texte(
    ws,
    r,
    "Critères simples et explicites appliqués aux résultats de la période ; ils ne remplacent pas le jugement de l'ingénieur ni la démarche du guide BRGM/INERIS « Évolution et arrêt de la surveillance des eaux souterraines » (2022) — état de la source, usages et enjeux en aval, représentativité des ouvrages, prescriptions de l'arrêté préfectoral.",
    5,
  )
  r++
  entete(ws, r++, ['Proposition', 'Portée', 'Cible', 'Constat et piste', 'Critère appliqué'])
  for (const p of a.pistes) {
    ecrire(ws, r, 1, LIBELLES_PISTE[p.type].libelle, { taille: 9, gras: true, couleur: argb(LIBELLES_PISTE[p.type].couleur) })
    ecrire(ws, r, 2, p.portee === 'compose' ? 'composé' : p.portee === 'ouvrage' ? 'ouvrage' : 'réseau', { taille: 9 })
    ecrire(ws, r, 3, p.cible, { taille: 9, gras: true })
    ecrire(ws, r, 4, p.texte, { taille: 9, wrap: true })
    ecrire(ws, r, 5, p.critere, { taille: 9, wrap: true, couleur: 'FF4F625F' })
    ws.getRow(r).height = Math.max(15, Math.ceil(p.texte.length / 95) * 12.5)
    r++
  }
}

function feuilleQualite(ws: Worksheet, a: Analyse) {
  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 130
  let r = 1
  ecrire(ws, r++, 1, 'Qualité et comparabilité des données', { gras: true, taille: 12, bord: false })
  r++
  for (const n of a.qualite) {
    const c = n.niveau === 'alerte' ? ETAT.alerte : n.niveau === 'vigilance' ? ETAT.vigilance : { fond: 'FFE9EDF1', texte: 'FF3B4856' }
    ecrire(ws, r, 1, n.niveau === 'info' ? 'Info' : n.niveau === 'alerte' ? 'Alerte' : 'Vigilance', { taille: 9, fond: c.fond, couleur: c.texte, gras: true })
    ecrire(ws, r, 2, n.texte, { taille: 9, wrap: true })
    ws.getRow(r).height = Math.max(15, Math.ceil(n.texte.length / 140) * 12.5)
    r++
  }
}

function feuilleMethode(ws: Worksheet, a: Analyse) {
  const r0 = a.reglages
  ws.getColumn(1).width = 150
  const lignes: [string, boolean][] = [
    ['Méthode', true],
    [`Période analysée ${titrePeriode(a)}. Les tableaux et graphiques montrent toute la chronique ; les statistiques portent sur la période et les résultats non écartés.`, false],
    [
      `Test de Mann-Kendall (Mann, 1945 ; Kendall, 1975) : statistique S, variance corrigée des ex aequo, p bilatéral — loi exacte de S pour 10 résultats au plus sans ex aequo, approximation normale avec correction de continuité sinon. Test retenu par l'outil HYPE du BRGM (BRGM/RP-63066-FR) et par le guide européen CIS n° 18 sur les tendances des eaux souterraines.`,
      false,
    ],
    [`Pente de Theil-Sen (Theil, 1950 ; Sen, 1968) en unité par an, sur les dates réelles ; intervalle de confiance à ${Math.round((1 - r0.alpha) * 100)} % selon Gilbert (1987).`, false],
    [
      `Classes de tendance inspirées de MAROS (AFCEE, 2004) : hausse / baisse significative si p ≤ ${fr(r0.alpha)}, probable si p ≤ ${fr(2 * r0.alpha)} ; sinon stable (coefficient de variation < ${fr(r0.covStable)}) ou sans tendance nette. Test dès ${r0.nMin} résultats ; série signalée comme courte en dessous de ${r0.nRobuste} (minimum de l'outil HYPE).`,
      false,
    ],
    [`Résultats < LQ dans les tests : ${LIBELLES_CENSURE[r0.censure].long}`, false],
    ['Moyennes et médianes : résultats < LQ comptés à LQ/2 (directive 2009/90/CE, art. 5). Sommes par famille : composés quantifiés seuls.', false],
    ['Kendall saisonnier (Hirsch, Slack et Smith, 1982) quand hautes et basses eaux comptent au moins 3 résultats chacune ; test de Pettitt (1979) pour un changement de niveau (8 résultats et plus) ; lissage LOWESS (Cleveland, 1979).', false],
    [
      "Décroissance du premier ordre : pente de Theil-Sen sur ln C, demi-vie apparente ln 2 / k ; année à laquelle la tendance ajustée atteindrait la valeur de référence (projection indicative, qui suppose le rythme observé maintenu ; l'intervalle reprend celui de la pente).",
      false,
    ],
    ['Résultats atypiques : écart au droit de Theil-Sen ajusté sur log C de plus de 4 écarts-types robustes (MAD) et d’un facteur 3 ; signalés, jamais écartés automatiquement.', false],
    [
      `Seuil de vigilance à ${Math.round(r0.vigilance * 100)} % de la valeur de référence : repris de l'arrêté du 17 décembre 2008 (art. 9), qui fixe à 75 % de la norme de qualité ou de la valeur seuil le point de départ de l'inversion d'une tendance à la hausse (directive 2006/118/CE).`,
      false,
    ],
    ['Dégradation des chloroéthènes : parts molaires (PCE, TCE, DCE, chlorure de vinyle) et nombre moyen d’atomes de chlore par campagne, tendance de ce nombre (USEPA, 1998, EPA/600/R-98/128).', false],
    ['Lien concentration – niveau de la nappe : tau-b de Kendall entre les deux, campagne par campagne (6 paires au moins).', false],
    [
      "Niveaux d'eau : niveau statique initial des fiches de prélèvement, ramené en cote NGF par la cote du repère (fiche, tableau des ouvrages ou saisie). Régime d'une campagne non renseigné : hautes eaux si les ouvrages sont en moyenne au-dessus de leur niveau médian, basses eaux sinon (4 relevés au moins par ouvrage), à défaut d'après le mois.",
      false,
    ],
    ["Sans cote NGF du repère, seule la profondeur de l'eau sous le repère est connue : chaque ouvrage se lit seul (battement, tendance, lien avec les concentrations, régime), sans comparaison entre ouvrages ni sens d'écoulement ; les écarts au niveau médian de chaque ouvrage mettent les battements côte à côte.", false],
    ["Sens d'écoulement : plan ajusté par moindres carrés sur les cotes de la nappe d'au moins trois ouvrages non alignés ; direction de la plus forte pente et gradient, moyenne circulaire des directions sur la période.", false],
    ["Chlore moyen : nombre moyen d'atomes de chlore des chloroéthènes pondéré par les moles (PCE 4, TCE 3, DCE 2, CV 1, éthène et éthane 0), lu avec la tendance du total en moles (transformation ou dilution) et la composition des trois dernières campagnes (blocage au stade DCE : DCE ≥ 60 % et CV < 10 % des moles ; accumulation de CV : CV ≥ 30 %).", false],
    ['', false],
    ['Cadre', true],
    ['Méthodologie nationale de gestion des sites et sols pollués (MTES, avril 2017) : bilan des résultats de la surveillance, par exemple tous les quatre ans, qui valide la surveillance en place ou propose son évolution.', false],
    ['NF X31-620-2, prestation globale BQ — bilan quadriennal : interprétation (A270) de l’ensemble des données des quatre dernières années de suivi, mise à jour des enjeux (A300, A310, A320).', false],
    [
      'Guides BRGM/INERIS pour le ministère : « Surveillance de la qualité des eaux souterraines appropriée aux installations classées et sites pollués » (déc. 2022) et « Évolution et arrêt de la surveillance des eaux souterraines » (déc. 2022).',
      false,
    ],
    [
      "Pistes et grille : questions et critères du guide « Évolution et arrêt de la surveillance des eaux souterraines » (2022) — réseau résiduel d'au moins 3 ouvrages dont 1 amont et 2 aval, 5 si le sens d'écoulement varie (p. 12 et 19) ; ouvrage amont jamais abandonné (p. 30) ; substance au-dessus d'un critère de gestion, même stable, jamais abandonnée (p. 9 et 39) ; produits de dégradation, physico-chimie, LQ sous les valeurs de référence (p. 15) ; piézométrie en m NGF (p. 14 et 16) ; augmentation d'amont en aval sur plusieurs campagnes = flux continu (p. 18) ; baisse concomitante d'une nappe basse (p. 17) ; effets rebonds (p. 12 et 17). Ouvrages redondants : tau de Kendall ≥ 0,6 et médianes à un facteur 2 près pour chaque composé quantifié, à confirmer par la cartographie du panache (p. 19 et 46).",
      false,
    ],
    ['Valeurs de comparaison : tableau ERM des valeurs indicatives pour les eaux souterraines (arrêté du 11 janvier 2007 modifié, arrêté du 17 décembre 2008 modifié, valeurs locales), sauf valeur saisie.', false],
  ]
  let r = 1
  for (const [t, titre] of lignes) {
    ecrire(ws, r, 1, t, titre ? { gras: true, fond: BANDEAU.fond, couleur: BANDEAU.texte } : { taille: 9, wrap: true, bord: false })
    if (!titre) ws.getRow(r).height = Math.max(13, Math.ceil(t.length / 175) * 12.5)
    r++
  }
}

// ---- Consolidated data ----------------------------------------------------------------------------

function feuillesDonnees(wb: Workbook, a: Analyse) {
  const b = a.base
  const parCampagne = new Map(b.campagnes.map((c) => [c.id, c]))
  const parCompose = new Map(b.composes.map((c) => [c.cle, c]))
  const parOuvrage = new Map(b.ouvrages.map((o) => [o.cle, o]))
  const ws = wb.addWorksheet('Données consolidées')
  entete(ws, 1, [...COLONNES_RESULTATS, 'Écarté'])
  ;[12, 12, 14, 8, 18, 34, 12, 9, 11, 26, 8].forEach((l, i) => (ws.getColumn(i + 1).width = l))
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  let r = 2
  for (const x of b.resultats) {
    const c = parCompose.get(x.compose) as Compose
    if (!c || c.calcule || c.terrain) continue
    const k = parCampagne.get(x.campagne)
    const o = parOuvrage.get(x.ouvrage)
    const v = [
      o?.nom ?? x.ouvrage,
      dateExcel(x.date),
      k?.libelle || (k ? formatDate(k.date) : ''),
      k?.regime ?? '',
      c.famille,
      c.nom,
      c.cas,
      c.unite,
      x.inferieur ? `<${String(n3(x.valeur, 4)).replace('.', ',')}` : n3(x.valeur, 6),
      x.fichier,
      x.exclu ? 'oui' : '',
    ]
    v.forEach((y, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = y as never
      if (i === 1) cell.numFmt = FMT_DATE
    })
    r++
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: r - 1, column: COLONNES_RESULTATS.length + 1 } }

  const wo = wb.addWorksheet('Données ouvrages')
  entete(wo, 1, COLONNES_OUVRAGES)
  ;[12, 22, 12, 12, 16, 30].forEach((l, i) => (wo.getColumn(i + 1).width = l))
  b.ouvrages.forEach((o, i) => {
    const pos = o.position === 'droit' ? 'droit' : o.position === 'autre' ? '' : o.position
    wo.getRow(2 + i).values = [o.nom, pos, o.x ?? '', o.y ?? '', o.repere ?? '', o.exclu ? 'écarté de l’analyse' : o.noms.length > 1 ? `noms rencontrés : ${o.noms.join(', ')}` : '']
  })

  const wn = wb.addWorksheet('Données niveaux')
  entete(wn, 1, COLONNES_NIVEAUX)
  ;[12, 12, 22, 22].forEach((l, i) => (wn.getColumn(i + 1).width = l))
  b.niveaux.forEach((n, i) => {
    wn.getRow(2 + i).values = [parOuvrage.get(n.ouvrage)?.nom ?? n.ouvrage, dateExcel(n.date), n.profondeur ?? '', n.charge ?? '']
    wn.getCell(2 + i, 2).numFmt = FMT_DATE
  })
}

// ---- Charts --------------------------------------------------------------------------------------

interface Figures {
  composes: { nom: string; svg: string; largeur: number; hauteur: number }[]
  ouvrages: { nom: string; svg: string; largeur: number; hauteur: number }[]
  series: { nom: string; svg: string; largeur: number; hauteur: number }[]
  niveaux: { nom: string; svg: string; largeur: number; hauteur: number } | null
  ecoulement: { nom: string; svg: string; largeur: number; hauteur: number } | null
  battement: { nom: string; svg: string; largeur: number; hauteur: number } | null
  degradation: { nom: string; svg: string; largeur: number; hauteur: number }[]
  indicateurs: { nom: string; svg: string; largeur: number; hauteur: number }
}

function figures(a: Analyse): Figures {
  const composes = a.composesQuantifies
    .filter((c) => !c.terrain)
    .flatMap((c) => {
      const r = figureCompose(a, c, a.ouvrages, { niveaux: false })
      return r ? [{ nom: c.nom, svg: r.svg, largeur: r.largeur, hauteur: r.hauteur }] : []
    })
  const ouvrages: Figures['ouvrages'] = []
  for (const o of a.ouvrages) {
    const familles = new Map<string, Compose[]>()
    for (const c of a.composesQuantifies) {
      if (c.terrain || c.calcule) continue
      if (!a.parCle.get(`${o.cle}|${c.cle}`)?.nQ) continue
      const f = c.famille || 'Autres'
      ;(familles.get(f) ?? familles.set(f, []).get(f)!).push(c)
    }
    for (const [f, cs] of familles) {
      const r = figureOuvrage(a, o, cs, { titre: `${o.nom} — ${f}`, niveaux: a.piezo.some((p) => p.ouvrage === o) })
      if (r) ouvrages.push({ nom: `${o.nom} - ${f}`, svg: r.svg, largeur: r.largeur, hauteur: r.hauteur })
    }
  }
  const remarquables = a.series.filter(
    (s) => !s.compose.terrain && !s.compose.calcule && s.statut === 'teste' && (s.classe === 'hausse' || s.classe === 'hausse-probable' || (s.ratioDernier ?? 0) > 1 || s.classe === 'baisse'),
  )
  const series = remarquables.map((s) => {
    const r = figureSerie(a, s, { lissage: true, niveaux: a.piezo.some((p) => p.ouvrage === s.ouvrage) })
    return { nom: `${s.ouvrage.nom} - ${s.compose.nom}`, svg: r.svg, largeur: r.largeur, hauteur: r.hauteur }
  })
  const rn = figureNiveaux(a, { mode: 'niveau' })
  const rb = a.piezo.length > 1 ? figureNiveaux(a, { mode: 'ecart' }) : null
  const degradation = a.degradation.map((d, i) => ({ nom: `Dechloration ${d.ouvrage.nom}`, svg: figureDegradation(a, i)!, largeur: 820, hauteur: 340 }))
  const indicateurs = {
    nom: 'Depassements par campagne',
    svg: barresSvg({
      titre: 'Résultats au-dessus de la valeur de référence, par campagne',
      unite: 'nombre',
      categories: a.indicateurs.map((x) => `${formatDate(x.campagne.date).slice(3)}${x.campagne.regime ? ` ${x.campagne.regime}` : ''}`),
      series: [
        { nom: 'résultats > valeur de référence', couleur: '#c0392b', valeurs: a.indicateurs.map((x) => x.depassements) },
        { nom: 'ouvrages concernés', couleur: '#e08e0b', valeurs: a.indicateurs.map((x) => x.ouvragesDepassement.length) },
      ],
    }),
    largeur: 820,
    hauteur: 300,
  }
  const re = figureEcoulement(a)
  return {
    composes,
    ouvrages,
    series,
    niveaux: rn ? { nom: 'Niveaux de la nappe', svg: rn.svg, largeur: rn.largeur, hauteur: rn.hauteur } : null,
    battement: rb ? { nom: 'Battement de la nappe', svg: rb.svg, largeur: rb.largeur, hauteur: rb.hauteur } : null,
    ecoulement: re ? { nom: 'Ecoulement de la nappe', svg: re.svg, largeur: 620, hauteur: 460 } : null,
    degradation,
    indicateurs,
  }
}

// ---- Workbooks -------------------------------------------------------------------------------------

export async function construireClasseurSuivi(a: Analyse, site: string): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SIR Toolbox — suivi temporel'
  const f = figures(a)
  const img = (x: { nom: string; svg: string; largeur: number; hauteur: number }, titre = x.nom) => image(titre, x.svg, x.largeur, x.hauteur)

  feuilleSynthese(wb, a, site)
  feuilleGrille(wb.addWorksheet('Grille guide 2022', { views: [{ showGridLines: false }] }), a)
  feuilleTendances(wb.addWorksheet('Tendances'), a)
  feuilleMatrice(wb.addWorksheet('Matrice tendances', { views: [{ showGridLines: false }] }), a)
  feuilleChroniquesOuvrages(wb.addWorksheet('Chroniques par ouvrage'), a)
  feuilleChroniquesComposes(wb.addWorksheet('Chroniques par composé'), a)

  const wsG = wb.addWorksheet('Graphiques composés', { views: [{ showGridLines: false }] })
  ecrire(wsG, 1, 1, 'Chaque composé quantifié sur tous les ouvrages (période hors analyse en grisé)', { gras: true, taille: 12, bord: false })
  placerImages(wb, wsG, 3, await Promise.all(f.composes.map((x) => img(x))))

  const wsO = wb.addWorksheet('Graphiques ouvrages', { views: [{ showGridLines: false }] })
  ecrire(wsO, 1, 1, 'Les composés quantifiés de chaque ouvrage, par famille (niveau de la nappe en pointillé quand il est connu)', { gras: true, taille: 12, bord: false })
  placerImages(wb, wsO, 3, await Promise.all(f.ouvrages.map((x) => img(x))))

  if (f.series.length) {
    const wsS = wb.addWorksheet('Graphiques séries clés', { views: [{ showGridLines: false }] })
    ecrire(wsS, 1, 1, 'Séries en hausse, en baisse significative ou au-dessus de la valeur de référence : pente de Sen et lissage', { gras: true, taille: 12, bord: false })
    placerImages(wb, wsS, 3, await Promise.all(f.series.map((x) => img(x))))
  }

  feuilleIndicateurs(wb, wb.addWorksheet('Évolution d’ensemble', { views: [{ showGridLines: false }] }), a, [await img(f.indicateurs, 'Dépassements par campagne')])
  feuillePiezo(wb, wb.addWorksheet('Piézométrie', { views: [{ showGridLines: false }] }), a, [...(f.niveaux ? [await img(f.niveaux)] : []), ...(f.battement ? [await img(f.battement, 'Battement de la nappe — écart au niveau médian de chaque ouvrage')] : []), ...(f.ecoulement ? [await img(f.ecoulement, 'Écoulement de la nappe')] : [])])
  feuilleAmontAval(wb.addWorksheet('Amont-aval', { views: [{ showGridLines: false }] }), a)
  if (a.degradation.length) feuilleDechloration(wb, wb.addWorksheet('Déchloration', { views: [{ showGridLines: false }] }), a, await Promise.all(f.degradation.map((x) => img(x))))
  feuillePistes(wb.addWorksheet('Pistes surveillance', { views: [{ showGridLines: false }] }), a)
  feuilleQualite(wb.addWorksheet('Qualité des données', { views: [{ showGridLines: false }] }), a)
  feuilleMethode(wb.addWorksheet('Méthode', { views: [{ showGridLines: false }] }), a)
  feuillesDonnees(wb, a)
  return wb
}

export async function telechargerClasseurSuivi(a: Analyse, site: string) {
  const wb = await construireClasseurSuivi(a, site)
  telecharger(`${nomFichier(site)} - suivi temporel.xlsx`, new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }))
}

export async function telechargerDonnees(a: Analyse, site: string) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  feuillesDonnees(wb, a)
  const n = wb.addWorksheet('Notice')
  n.getColumn(1).width = 120
  for (const t of [
    `${site} — données consolidées du suivi (${a.base.campagnes.length} campagnes, ${a.base.ouvrages.length} ouvrages), exportées le ${new Date().toLocaleDateString('fr-FR')}.`,
    'Une ligne par résultat, ouvrages et composés harmonisés ; résultats < LQ écrits « <LQ ». Les sommes calculées et les paramètres de terrain ne sont pas repris (ils sont recalculés).',
    'Ce classeur se recharge tel quel dans l’outil « Suivi temporel » de la SIR Toolbox, seul ou avec les rapports des nouvelles campagnes.',
  ])
    n.addRow([t])
  telecharger(`${nomFichier(site)} - donnees consolidees.xlsx`, new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }))
}

export async function telechargerGraphiques(a: Analyse, site: string) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const f = figures(a)
  const ajouter = async (dossier: string, x: { nom: string; svg: string; largeur: number; hauteur: number }) => {
    const base = `${dossier}/${nomFichier(x.nom)}`
    zip.file(`${base}.svg`, x.svg)
    const png = await svgEnPng(x.svg, x.largeur, x.hauteur, 2.5)
    zip.file(`${base}.png`, png.split(',')[1], { base64: true })
  }
  for (const x of f.composes) await ajouter('1 - Par composé', x)
  for (const x of f.ouvrages) await ajouter('2 - Par ouvrage', x)
  for (const x of f.series) await ajouter('3 - Séries clés', x)
  if (f.niveaux) await ajouter('4 - Piézométrie', f.niveaux)
  if (f.battement) await ajouter('4 - Piézométrie', f.battement)
  if (f.ecoulement) await ajouter('4 - Piézométrie', f.ecoulement)
  for (const x of f.degradation) await ajouter('5 - Déchloration', x)
  await ajouter('6 - Ensemble', f.indicateurs)
  zip.file(
    'LISEZMOI.txt',
    `${site} — graphiques du suivi temporel, période ${titrePeriode(a)}.\r\nChaque graphique en PNG (haute définition, pour Word) et en SVG (vectoriel, modifiable).\r\nSymboles vides : résultats < LQ placés à la LQ ; ronds : hautes eaux, losanges : basses eaux ; tirets rouges : valeur de référence ; pointillés orange : ${Math.round(a.reglages.vigilance * 100)} % de la valeur de référence ; tirets-points : pente de Sen.\r\nGénéré le ${new Date().toLocaleDateString('fr-FR')}.\r\n`,
  )
  const blob = await zip.generateAsync({ type: 'blob' })
  telecharger(`${nomFichier(site)} - graphiques.zip`, blob)
}

