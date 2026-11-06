/**
 * Excel report of the groundwater conditions: summary by well, the
 * USEPA (1998) screening criterion by criterion, the field parameters of
 * the sampling sheets, the data used, the BIOCHLOR transport inputs when
 * computed, and the method with its sources.
 */

import type { Workbook, Worksheet } from 'exceljs'
import { BANDEAU, ETAT } from '../resultats/couleurs.ts'
import { ecrire, GRIS_FAMILLE, VERT_ENTETE } from '../resultats/export.ts'
import { ETHENES } from './biochlor.ts'
import type { Jeu } from './donnees.ts'
import { BAREME_CLASSES, COMPOSES_FILIATION, LIBELLES_CLASSE, LIBELLES_FAVORABILITE, type Classe, type Evaluation, type Favorabilite, type Options } from './evaluation.ts'
import { PARAMS_TERRAIN } from './fiches.ts'
import { formatValeur, LIBELLES_GROUPE, PARAMS, type Groupe } from './parametres.ts'
import { formatExtreme, formatMoyenne, type Recap } from './recap.ts'
import { SOURCES } from './sources.ts'
import type { Synthese } from './synthese.ts'
import type { Transport } from './transport.ts'

export interface Rapport {
  titre: string
  contexte: [string, string][]
  jeu: Jeu
  evaluations: Evaluation[]
  options: Options
  /** Limits shared by most wells. */
  limites: string[]
  synthese: Synthese
  transport?: Transport
  /** Summary of the field parameters and its reading. */
  recap?: RecapTerrain
}

export interface RecapTerrain {
  recap: Recap
  synthese: string[]
}

const COULEUR_CONDITIONS: Record<Favorabilite, { fond: string; texte: string }> = {
  favorable: ETAT.ok,
  possible: ETAT.ok,
  limite: ETAT.vigilance,
  defavorable: ETAT.alerte,
  indetermine: { fond: 'FFEDEDED', texte: 'FF555555' },
}

const COULEUR_CLASSE: Record<Classe, { fond: string; texte: string }> = {
  forte: ETAT.ok,
  suffisante: ETAT.ok,
  limitee: ETAT.vigilance,
  insuffisante: { fond: 'FFEDEDED', texte: 'FF555555' },
}

const nb = (x: number | null | undefined, chiffres = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : Number(x.toPrecision(chiffres)))

function bandeau(ws: Worksheet, r: number, t: string, largeur: number) {
  ws.mergeCells(r, 1, r, largeur)
  ecrire(ws, r, 1, t, { gras: true, fond: BANDEAU.fond, couleur: BANDEAU.texte })
  return r + 1
}

function entetes(ws: Worksheet, r: number, titres: [string, number][], c0 = 1) {
  titres.forEach(([t, l], j) => {
    if (l) ws.getColumn(c0 + j).width = l
    ecrire(ws, r, c0 + j, t, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  })
  ws.getRow(r).height = 36
  return r + 1
}

const texte = (ws: Worksheet, r: number, t: string, o: Parameters<typeof ecrire>[4] = {}) => {
  ecrire(ws, r, 1, t, { taille: 9, bord: false, ...o })
  return r + 1
}

function feuilleGenerale(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Synthèse générale', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 7
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 16
  ws.getColumn(4).width = 100
  ws.getColumn(5).width = 40
  ecrire(ws, 1, 1, rp.titre, { gras: true, taille: 12, bord: false })
  ecrire(ws, 2, 1, 'Synthèse générale des conditions physico-chimiques (mesures de terrain en fin de purge)', { italique: true, taille: 9, bord: false })
  let r = 4
  const paragraphe = (t: string) => {
    ws.mergeCells(r, 1, r, 5)
    ecrire(ws, r, 1, t, { taille: 9, wrap: true, bord: false })
    ws.getRow(r).height = Math.ceil(t.length / 170) * 13 + 3
    r++
  }
  r = bandeau(ws, r, 'Le site', 5)
  rp.synthese.site.forEach(paragraphe)
  r++
  if (rp.synthese.profils.length) {
    r = bandeau(ws, r, 'Profils verticaux (ouvrages multi-niveaux)', 5)
    rp.synthese.profils.forEach((p) => paragraphe(`• ${p.texte}`))
    r++
  }
  if (rp.synthese.singularites.length) {
    r = bandeau(ws, r, 'Ouvrages singuliers', 5)
    rp.synthese.singularites.forEach((p) => paragraphe(`• ${p}`))
    r++
  }
  r = bandeau(ws, r, 'Classement des ouvrages, du plus réducteur au plus oxygéné', 5)
  r = entetes(ws, r, [
    ['Rang', 0],
    ['Ouvrage', 0],
    ['Conditions (déchloration)', 0],
    ['Conditions physico-chimiques', 0],
    ['Réserve sur la mesure', 0],
  ])
  for (const c of rp.synthese.classement) {
    const cc = COULEUR_CONDITIONS[c.conditions]
    ecrire(ws, r, 1, c.rang, { taille: 9, h: 'center' })
    ecrire(ws, r, 2, c.nom, { taille: 9, gras: true })
    ecrire(ws, r, 3, LIBELLES_FAVORABILITE[c.conditions], { taille: 9, gras: true, h: 'center', fond: cc.fond, couleur: cc.texte })
    ecrire(ws, r, 4, c.description, { taille: 9, wrap: true })
    ecrire(ws, r, 5, c.reserve ?? '-', { taille: 9, wrap: true, couleur: c.reserve ? ETAT.vigilance.texte : undefined })
    ws.getRow(r).height = Math.max(15, Math.ceil(c.description.length / 120) * 12 + 2)
    r++
  }
  r++
  paragraphe(
    'Classement : conditions pour la déchloration réductrice (seuils USEPA 1998 sur O2 et redox), puis redox croissant, puis oxygène croissant. Qualificatifs : pH neutre de 6,5 à 7,5 ; oxygène anoxique < 0,5 mg/l, faiblement oxygénée 0,5 à 2, oxygénée 2 à 5, bien oxygénée > 5 ; redox contre Ag/AgCl réducteur < −100 mV, faiblement réducteur jusqu’à 50 mV, modérément oxydant jusqu’à 200 mV, oxydant au-delà ; minéralisation d’après la conductivité, classes de Rodier (< 100 très faible, 100-200 faible, 200-333 moyenne accentuée, 333-666 moyenne, 666-1 000 importante, > 1 000 µS/cm élevée).',
  )
}

function feuilleSynthese(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Synthèse par ouvrage', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, rp.titre, { gras: true, taille: 12, bord: false })
  let r = texte(ws, 2, 'Évaluation des conditions de la nappe — criblage USEPA (1998), processus redox USGS (McMahon et Chapelle, 2008), contrôles des mesures de terrain.', { italique: true })
  r++
  for (const [k, v] of rp.contexte) {
    ecrire(ws, r, 1, k, { gras: true, taille: 9, fond: GRIS_FAMILLE })
    ws.mergeCells(r, 2, r, 8)
    ecrire(ws, r++, 2, v, { taille: 9, wrap: true })
  }
  r++
  r = bandeau(ws, r, 'Par ouvrage', 17)
  r = entetes(ws, r, [
    ['Ouvrage', 18],
    ['Date', 11],
    ['pH', 7],
    ['Redox mesuré (mV, Ag/AgCl)', 11],
    ['Eh (mV, ENH)', 9],
    ['O2 dissous (mg/l)', 9],
    ['Saturation O2 (%)', 9],
    ['Conductivité (µS/cm)', 11],
    ['T (°C)', 7],
    ['Conditions pour la déchloration réductrice', 14],
    ['Motif (O2, redox)', 34],
    ['Indices de dégradation', 40],
    ['Sources de carbone', 30],
    ['Lecture', 50],
    ['Processus redox (USGS)', 22],
    ['Score USEPA 1998', 9],
    ['Interprétation du score', 26],
    ['COHV (µmol/l)', 9],
    ['Devenir du chlorure de vinyle', 40],
    ['Points de vigilance', 70],
  ])
  ws.views = [{ state: 'frozen', ySplit: r - 1, xSplit: 1, showGridLines: false }]
  for (const e of rp.evaluations) {
    const t = rp.jeu.valeurs[e.ouvrage.cle] ?? {}
    const c = e.score.complet ? COULEUR_CLASSE[e.score.classe] : COULEUR_CLASSE.insuffisante
    const cc = COULEUR_CONDITIONS[e.lecture.conditions]
    const ligne: (string | number)[] = [
      e.ouvrage.nom,
      e.ouvrage.date || '-',
      nb(t.ph?.valeur),
      nb(t.orp?.valeur),
      nb(e.eh),
      t.od ? (t.od.inferieur ? formatValeur(t.od) : nb(t.od.valeur)) : '-',
      nb(e.saturationO2, 2),
      nb(t.ce?.valeur, 4),
      nb(t.t?.valeur),
      LIBELLES_FAVORABILITE[e.lecture.conditions],
      e.lecture.motifConditions,
      e.lecture.indices.join(' ; ') || '-',
      e.lecture.carbone.join(' ; ') || '-',
      e.lecture.conclusion,
      `${e.redox.categorie}${e.redox.processus && e.redox.processus !== '—' ? ` — ${e.redox.processus}` : ''}`,
      e.score.complet ? e.score.total : `${e.score.total} / ${e.score.accessible}`,
      e.score.complet
        ? `${LIBELLES_CLASSE[e.score.classe]}${e.score.potentiel ? ` (${e.score.potentiel} points non évalués)` : ''}`
        : `Partiel (${e.score.geochimieManquante.join(', ')} manquants) : non comparable au tableau 2.4`,
      nb(e.cohvMolaire),
      e.devenirCV.join(' ; ') || '-',
      e.alertes.map((a) => a.texte).join(' ; ') || '-',
    ]
    ligne.forEach((v, j) => {
      const enClasse = j === 15 || j === 16
      const enConditions = j === 9
      ecrire(ws, r, j + 1, typeof v === 'number' ? v : String(v).replace(/^(-?\d+)\.(\d+)$/, '$1,$2'), {
        taille: 9,
        h: (j >= 2 && j <= 8) || j === 15 || j === 17 ? 'center' : 'left',
        wrap: j >= 9,
        gras: j === 0 || j === 9 || j === 15,
        fond: enClasse ? c.fond : enConditions ? cc.fond : undefined,
        couleur: enClasse ? c.texte : enConditions ? cc.texte : undefined,
      })
    })
    ws.getRow(r).height = Math.max(15, Math.ceil(Math.max(String(ligne[19]).length / 95, String(ligne[13]).length / 70, String(ligne[11]).length / 55, 1)) * 12)
    r++
  }
  r++
  if (rp.limites.length) {
    r = bandeau(ws, r, 'Limites de l’interprétation', 8)
    for (const l of rp.limites) {
      ws.mergeCells(r, 1, r, 12)
      ecrire(ws, r, 1, `• ${l}`, { taille: 9, wrap: true, bord: false })
      ws.getRow(r).height = Math.ceil(l.length / 160) * 13 + 2
      r++
    }
    r++
  }
  r = bandeau(ws, r, 'Conditions (seuils USEPA 1998 sur O2 et redox mesuré contre Ag/AgCl)', 8)
  for (const [k, v] of [
    ['Favorables', 'O2 < 0,5 mg/l et redox < −100 mV'],
    ['Possibles', 'O2 < 0,5 mg/l et redox < 50 mV (ou redox non mesuré, ou O2 non mesuré avec redox < 50 mV)'],
    ['Peu favorables', 'O2 entre 0,5 et 5 mg/l, ou redox ≥ 50 mV'],
    ['Défavorables', 'O2 > 5 mg/l'],
  ] as [string, string][]) {
    ecrire(ws, r, 1, k, { gras: true, taille: 9 })
    ws.mergeCells(r, 2, r, 8)
    ecrire(ws, r++, 2, v, { taille: 9 })
  }
  r++
  r = bandeau(ws, r, 'Interprétation du score (USEPA, 1998, tableau 2.4) — jeu complet de paramètres uniquement', 8)
  for (const b of BAREME_CLASSES) {
    const c = COULEUR_CLASSE[b.classe]
    ecrire(ws, r, 1, b.bornes, { gras: true, taille: 9, h: 'center', fond: c.fond, couleur: c.texte })
    ws.mergeCells(r, 2, r, 8)
    ecrire(ws, r++, 2, b.texte, { taille: 9 })
  }
  r = texte(ws, r + 1, "Le score est calculé ouvrage par ouvrage ; le protocole l'applique à la zone la plus contaminée. « x / y » : score partiel, x points sur les y accessibles avec les données disponibles ; sans nitrates, fer, sulfates et méthane, il ne se lit pas avec ce barème.", { italique: true })
}

function feuilleScore(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Score USEPA 1998', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, 'Criblage de la biodégradation anaérobie (déchloration réductrice) — USEPA (1998), EPA/600/R-98/128, tableau 2.3', { gras: true, taille: 11, bord: false })
  let r = texte(ws, 2, 'Points par critère et par ouvrage ; « n.é. » : non évalué (non analysé, LQ trop élevée ou pas de valeur de fond). * : analyse requise par le protocole.', { italique: true })
  r++
  const evals = rp.evaluations
  const criteres = evals[0]?.score.criteres ?? []
  r = entetes(ws, r, [
    ['Critère', 34],
    ['Seuil (points)', 30],
    ...evals.map((e) => [e.ouvrage.nom, 11] as [string, number]),
  ])
  ws.views = [{ state: 'frozen', ySplit: r - 1, xSplit: 2, showGridLines: false }]
  criteres.forEach((c, k) => {
    ecrire(ws, r, 1, `${c.analyse}${c.requis ? ' *' : ''}`, { taille: 9, gras: true })
    ecrire(ws, r, 2, c.critere, { taille: 8, wrap: true })
    evals.forEach((e, j) => {
      const x = e.score.criteres[k]
      const p = x?.points
      ecrire(ws, r, 3 + j, p === null || p === undefined ? 'n.é.' : p, {
        taille: 9,
        h: 'center',
        fond: p === null || p === undefined ? 'FFF7F7F7' : p > 0 ? ETAT.ok.fond : p < 0 ? ETAT.alerte.fond : undefined,
        couleur: p === null || p === undefined ? 'FF999999' : p > 0 ? ETAT.ok.texte : p < 0 ? ETAT.alerte.texte : undefined,
      })
      const cell = ws.getCell(r, 3 + j)
      if (x) cell.note = `${x.valeur}\n${x.interpretation}${x.note ? `\n${x.note}` : ''}`
    })
    r++
  })
  ecrire(ws, r, 1, 'Score total', { gras: true, fond: GRIS_FAMILLE })
  ecrire(ws, r, 2, '', { fond: GRIS_FAMILLE })
  evals.forEach((e, j) => {
    const c = COULEUR_CLASSE[e.score.classe]
    ecrire(ws, r, 3 + j, e.score.total, { gras: true, h: 'center', fond: c.fond, couleur: c.texte })
  })
  r++
  ecrire(ws, r, 1, 'Interprétation', { gras: true, fond: GRIS_FAMILLE })
  ecrire(ws, r, 2, '', { fond: GRIS_FAMILLE })
  evals.forEach((e, j) => ecrire(ws, r, 3 + j, LIBELLES_CLASSE[e.score.classe], { taille: 8, h: 'center', wrap: true }))
  ws.getRow(r).height = 30
  r++
  ecrire(ws, r, 1, 'Points non évalués (au plus)', { gras: true, fond: GRIS_FAMILLE })
  ecrire(ws, r, 2, '', { fond: GRIS_FAMILLE })
  evals.forEach((e, j) => ecrire(ws, r, 3 + j, e.score.potentiel, { h: 'center', taille: 9 }))
  r += 2
  r = texte(ws, r, 'Composés filles (note a/ du tableau 2.3 : points accordés seulement si le composé est un produit de dégradation et non un constituant du produit rejeté) :', { gras: true })
  for (const c of COMPOSES_FILIATION) {
    const s = rp.options.statuts[c.id]
    r = texte(ws, r, `• ${c.libelle} : ${s === 'auto' ? `règle automatique — ${c.regle}` : s === 'filiation' ? 'déclaré produit de dégradation' : 'déclaré présent dans le produit rejeté (0 point)'}`)
  }
  r = texte(ws, r + 1, 'Le détail (valeur, interprétation, justification) figure en commentaire de chaque cellule.', { italique: true })
}

function feuilleTerrain(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Paramètres terrain', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, 'Paramètres de terrain en fin de purge (fiches de prélèvement)', { gras: true, taille: 11, bord: false })
  let r = 3
  const fiches = rp.evaluations.map((e) => e.ouvrage.fiche).filter((f): f is NonNullable<typeof f> => !!f)
  r = entetes(ws, r, [
    ['Ouvrage', 18],
    ['Onglet', 14],
    ['Date', 11],
    ['Lectures', 8],
    ['Durée de purge (min)', 9],
    ['Volume purgé (l)', 9],
    ...PARAMS_TERRAIN.flatMap((p) => [[`${p.libelle} (${p.unite})`, 11] as [string, number], [`Stabilisation ${p.libelle.toLowerCase()}`, 11] as [string, number]]),
    ['Écart redox corrigé − mesuré (mV)', 10],
    ['Sonde', 10],
    ['Observations', 60],
  ])
  ws.views = [{ state: 'frozen', ySplit: r - 1, xSplit: 1, showGridLines: false }]
  const LIB = { stable: 'stable', instable: 'non stabilisé', insuffisant: '< 3 lectures' }
  for (const f of fiches) {
    const fin = f.lectures[f.ligneFinale]
    const v: (string | number)[] = [f.ouvrage, f.onglet, f.date || '-', f.lectures.filter((l) => l.ph !== null || l.orp !== null || l.od !== null).length, nb(fin?.duree), nb(fin?.volume)]
    for (const p of PARAMS_TERRAIN) {
      const x = f.finale[p.id]
      v.push(x ? (x.anterieure ? `${String(x.valeur).replace('.', ',')} (antérieure)` : x.valeur) : '-')
      const s = f.stabilite[p.id]
      v.push(s ? LIB[s] : '-')
    }
    v.push(nb(f.decalage), f.sonde || '-', f.observations.join(' ; ') || '-')
    v.forEach((x, j) => {
      const stab = j >= 6 && j < 16 && (j - 6) % 2 === 1
      const instable = stab && x === 'non stabilisé'
      ecrire(ws, r, j + 1, x, {
        taille: 9,
        h: j === 0 || j === 1 || j === v.length - 1 ? 'left' : 'center',
        wrap: j === v.length - 1,
        gras: j === 0,
        fond: instable ? ETAT.vigilance.fond : undefined,
        couleur: instable ? ETAT.vigilance.texte : undefined,
      })
    })
    r++
  }
  r++
  const tol = fiches[0]?.tolerances
  if (tol) {
    texte(
      ws,
      r,
      `Stabilisation : écart entre lectures successives, sur les trois dernières, au plus de ± ${tol.ph} (pH), ± ${tol.orp} mV (redox), ± ${tol.od} mg/l (O2), ± ${tol.ce} % (± ${tol.ceFaible} % sous 500 µS/cm) pour la conductivité et ± ${tol.t} °C, critères de la fiche.`,
      { italique: true },
    )
  }
}

function feuilleDonnees(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Données', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, 'Données utilisées (unités de l’outil ; « < » : inférieur à la LQ)', { gras: true, taille: 11, bord: false })
  let r = 3
  const evals = rp.evaluations
  r = entetes(ws, r, [['Paramètre', 36], ['Unité', 11], ...evals.map((e) => [e.ouvrage.nom, 11] as [string, number])])
  ws.views = [{ state: 'frozen', ySplit: r - 1, xSplit: 2, showGridLines: false }]
  let groupe: Groupe | null = null
  for (const p of PARAMS) {
    if (p.groupe !== groupe) {
      groupe = p.groupe
      ws.mergeCells(r, 1, r, 2 + evals.length)
      ecrire(ws, r++, 1, LIBELLES_GROUPE[groupe], { gras: true, fond: GRIS_FAMILLE, taille: 9 })
    }
    ecrire(ws, r, 1, p.libelle, { taille: 9 })
    ecrire(ws, r, 2, p.unite, { taille: 9, h: 'center' })
    evals.forEach((e, j) => {
      const v = rp.jeu.valeurs[e.ouvrage.cle]?.[p.id]
      const cell = ecrire(ws, r, 3 + j, v ? (v.inferieur ? formatValeur(v) : Number(v.valeur.toPrecision(4))) : '-', {
        taille: 9,
        h: 'center',
        italique: !!v?.inferieur,
        couleur: v?.source === 'Saisie' ? 'FF2E75B6' : undefined,
      })
      if (v) cell.note = `${v.source}${v.note ? `\n${v.note}` : ''}`
    })
    r++
  }
  r++
  texte(ws, r, 'En bleu : valeurs saisies ou corrigées dans l’outil. La provenance de chaque valeur figure en commentaire.', { italique: true })
}

function feuilleTransport(wb: Workbook, rp: Rapport) {
  const t = rp.transport
  if (!t) return
  const ws = wb.addWorksheet('Transport BIOCHLOR', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, 'Données d’entrée BIOCHLOR et constantes de biodégradation de terrain (USEPA, 1998, annexe C)', { gras: true, taille: 11, bord: false })
  let r = 3
  ws.getColumn(1).width = 44
  ws.getColumn(2).width = 30
  ws.getColumn(3).width = 28
  ws.getColumn(4).width = 24
  r = bandeau(ws, r, 'Paramètres saisis et calculés', 4)
  for (const [k, v] of t.parametres) {
    ecrire(ws, r, 1, k, { taille: 9, fond: GRIS_FAMILLE, gras: true })
    ws.mergeCells(r, 2, r, 4)
    ecrire(ws, r++, 2, v, { taille: 9 })
  }
  r++
  if (t.saisies.length) {
    r = bandeau(ws, r, 'Valeurs à saisir dans BIOCHLOR', 4)
    r = entetes(ws, r, [
      ['Section', 0],
      ['Champ', 0],
      ['Valeur (SI)', 0],
      ['Dans BIOCHLOR (unités US)', 0],
    ])
    for (const x of t.saisies) {
      ;[x.section, x.champ, x.si, x.biochlor].forEach((v, j) => ecrire(ws, r, j + 1, v, { taille: 9, gras: j === 3 }))
      r++
    }
    r++
  }
  if (t.taux) {
    r = bandeau(ws, r, 'Constantes de biodégradation entre les deux ouvrages', 10)
    r = entetes(ws, r, [
      ['Composé', 0],
      ['Koc (l/kg)', 0],
      ['Retard R', 0],
      ['Temps de transit (an)', 0],
      ['CA (µg/l)', 11],
      ['CB (µg/l)', 11],
      ['CB corrigée (µg/l)', 12],
      ['λ (1/an)', 10],
      ['Littérature (USEPA 1998)', 18],
      ['Remarque', 60],
    ])
    for (const x of t.taux) {
      const e = ETHENES.find((y) => y.id === x.compose)!
      const v: (string | number)[] = [e.libelle, nb(t.kocs[x.compose]), nb(x.retard), nb(x.temps), nb(x.cA), nb(x.cB), nb(x.cBcorr), nb(x.lambda), e.litterature, x.note ?? '-']
      v.forEach((y, j) => ecrire(ws, r, j + 1, y, { taille: 9, h: j === v.length - 1 ? 'left' : 'center', wrap: j === v.length - 1, gras: j === 0 || j === 7 }))
      r++
    }
    r++
  }
  r = texte(ws, r, 'q = K·i ; vx = q / ne ; R = 1 + ρb·Koc·foc / n ; t = distance / (vx / R) ; λ = −ln(CB,corr / CA) / t ; CB,corr = CB·TA/TB, T = Cl⁻ + 0,86 PCE + 0,81 TCE + 0,73 DCE + 0,57 CV (mg/l) ; αx = 0,83 (log10 L)^2,414 m.', { italique: true })
  texte(ws, r, 'Les deux ouvrages doivent être sur une même ligne d’écoulement, dans le panache. Les valeurs types par lithologie (USEPA 1998, tableaux C.3.1 et C.3.2) sont à remplacer par des mesures dès que possible.', { italique: true })
}

/** Min, max (well in brackets) and mean of each field parameter, then a short reading. */
function feuilleRecap(wb: Workbook, titre: string, { recap, synthese }: RecapTerrain) {
  const ws = wb.addWorksheet('Récapitulatif terrain', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, titre, { gras: true, taille: 12, bord: false })
  let r = texte(ws, 2, `Paramètres physico-chimiques mesurés sur le terrain en fin de purge — ${recap.ouvrages} ouvrage${recap.ouvrages > 1 ? 's' : ''}. Entre parenthèses : ouvrage où la valeur est relevée.`, { italique: true })
  r++
  r = entetes(ws, r, [
    ['Paramètre', 34],
    ['Unité', 10],
    ["Nombre d'ouvrages", 10],
    ['Minimum (ouvrage)', 24],
    ['Maximum (ouvrage)', 24],
    ['Moyenne', 12],
  ])
  for (const l of recap.lignes) {
    const v: (string | number)[] = [l.libelle, l.unite, l.n, formatExtreme(l.min, l.id), formatExtreme(l.max, l.id), formatMoyenne(l)]
    v.forEach((x, j) => ecrire(ws, r, j + 1, x, { taille: 9, h: j === 0 ? 'left' : 'center', gras: j === 0, wrap: j === 3 || j === 4 }))
    r++
  }
  r++
  r = bandeau(ws, r, 'Synthèse des conditions physico-chimiques de la nappe', 6)
  for (const p of synthese) {
    ws.mergeCells(r, 1, r, 6)
    ecrire(ws, r, 1, p, { taille: 9, wrap: true, bord: false })
    ws.getRow(r).height = Math.ceil(p.length / 120) * 13 + 3
    r++
  }
  r++
  const notes = [
    'Valeurs retenues : dernière lecture complète de la purge (fiches de prélèvement) ou valeur saisie dans l’outil. Moyenne arithmétique des ouvrages.',
    'pH : acide < 5,5, légèrement acide 5,5 à 6,5, proche de la neutralité 6,5 à 7,5, légèrement basique 7,5 à 8,5, basique au-delà. Minéralisation d’après la conductivité (Rodier) : < 100 µS/cm très faible, 100–200 faible, 200–333 moyenne accentuée, 333–666 moyenne, 666–1 000 importante, > 1 000 élevée. Conditions redox (USEPA, 1998 ; redox mesuré contre Ag/AgCl) : réductrices si O₂ < 0,5 mg/l et redox < −100 mV, anoxiques faiblement réductrices si O₂ < 0,5 mg/l et redox < 50 mV, peu réductrices si O₂ de 0,5 à 5 mg/l ou redox ≥ 50 mV, oxydantes si O₂ > 5 mg/l.',
  ]
  if (recap.lignes.some((l) => l.avecInferieurs)) notes.push('« ≤ » : moyenne comptant les valeurs inférieures à la limite de quantification à cette limite.')
  if (recap.exclus.length) notes.push(`Mesures du laboratoire non prises en compte (paramètres de terrain) : ${recap.exclus.join(', ')}.`)
  for (const n of notes) {
    ws.mergeCells(r, 1, r, 6)
    ecrire(ws, r, 1, n, { taille: 8, italique: true, wrap: true, bord: false })
    ws.getRow(r).height = Math.ceil(n.length / 130) * 12 + 2
    r++
  }
}

function feuilleMethode(wb: Workbook) {
  const ws = wb.addWorksheet('Méthode et sources', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 130
  let r = 1
  ecrire(ws, r++, 1, 'Méthode', { gras: true, taille: 11, bord: false })
  const textes = [
    "Démarche par lignes de preuve de l'atténuation naturelle (USEPA, 1998 ; reprise par le programme MACAOH, ADEME) : 1) baisse des concentrations et des masses dans le temps et le long de l'écoulement ; 2) processus identifiés et quantifiés — indicateurs géochimiques, produits de dégradation, constantes de biodégradation ; 3) études microbiologiques ou en microcosmes. Cet outil documente la deuxième ligne de preuve ; la première se lit sur l'évolution des campagnes (outil Résultats labo), la troisième demande des analyses spécifiques (Dehalococcoides, qPCR, isotopie).",
    'Criblage USEPA (1998), tableau 2.3 : points attribués par critère, total interprété selon le tableau 2.4. Le potentiel redox est celui mesuré contre l’électrode Ag/AgCl, comme le demande le protocole (et non Eh). Le seuil des nitrates (1 mg/l) est appliqué aux nitrates exprimés en NO3⁻, le protocole ne précisant pas la forme (1 mg NO3⁻/l = 0,23 mg N/l).',
    'Lecture simplifiée (données usuelles : paramètres de terrain, COHV, BTEX, hydrocarbures) : conditions pour la déchloration réductrice d’après l’oxygène dissous et le redox mesuré (seuils du tableau 2.3 : O2 < 0,5 mg/l, > 5 mg/l ; redox < 50 et < −100 mV contre Ag/AgCl), indices de dégradation (part molaire des produits de dégradation, cis-DCE > 80 % du DCE, CV, éthène), sources de carbone (BTEX > 0,1 mg/l, hydrocarbures, COT > 20 mg/l). C’est un faisceau d’indices : sans nitrates, fer, sulfates ni méthane, le processus redox n’est pas identifiable (le redox de terrain sépare oxique et anoxique mais pas les zones anaérobies entre elles, USEPA 1998 § 2.3.2.9) et le score USEPA, partiel, ne se compare pas au tableau 2.4.',
    'Processus redox prédominant : cadre de McMahon et Chapelle (2008) mis en œuvre dans le classeur USGS de Jurgens et al. (2009) — seuils O2 0,5 mg/l, NO3-N 0,5 mg/l, Mn 0,05 mg/l, Fe 0,1 mg/l, SO4 0,5 mg/l — et rapport massique Fe(II)/H2S de Chapelle et al. (2009) : > 10 réduction du fer, < 0,3 sulfato-réduction. Le fer dissous (échantillon filtré) est l’indicateur usuel du Fe(II) ; le fer total majore le Fe(II).',
    'Eh (électrode normale à hydrogène) = redox mesuré + écart de l’électrode de référence (lu sur les fiches, corrigé − mesuré). Saturation en oxygène : solubilité de l’eau douce à 1 atm (APHA 4500-O, Benson et Krause).',
    'Paramètres de terrain : valeur de la dernière lecture complète de la purge ; paramètre non mesuré à cette lecture : dernière valeur relevée avant, signalée. Stabilisation jugée sur les trois dernières lectures, avec les critères de la fiche.',
    'Ces résultats sont une aide à l’interprétation : ils ne remplacent ni le modèle conceptuel du site, ni l’examen des chromatogrammes et des conditions de prélèvement.',
  ]
  for (const t of textes) {
    ecrire(ws, r, 1, t, { taille: 9, wrap: true, bord: false })
    ws.getRow(r).height = Math.ceil(t.length / 150) * 13 + 4
    r++
  }
  r++
  ecrire(ws, r++, 1, 'Sources', { gras: true, taille: 11, bord: false })
  for (const s of SOURCES) {
    ecrire(ws, r++, 1, s.url ? { text: s.texte, hyperlink: s.url } : s.texte, { taille: 9, wrap: true, bord: false, couleur: s.url ? 'FF2E75B6' : undefined, souligne: !!s.url })
  }
}

async function classeur(): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ERM SIR Toolbox France'
  return wb
}

/** The summary table of the field parameters on its own. */
export async function telechargerRecap(titre: string, rt: RecapTerrain, nomFichier: string) {
  const wb = await classeur()
  feuilleRecap(wb, titre, rt)
  await telecharger(wb, nomFichier)
}

export async function telechargerRapport(rp: Rapport, nomFichier: string) {
  const wb = await classeur()
  feuilleGenerale(wb, rp)
  if (rp.recap) feuilleRecap(wb, `${rp.titre} — récapitulatif des paramètres de terrain`, rp.recap)
  feuilleSynthese(wb, rp)
  feuilleScore(wb, rp)
  feuilleTerrain(wb, rp)
  feuilleDonnees(wb, rp)
  feuilleTransport(wb, rp)
  feuilleMethode(wb)
  await telecharger(wb, nomFichier)
}

async function telecharger(wb: Workbook, nomFichier: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
