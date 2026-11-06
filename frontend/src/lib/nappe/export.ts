/**
 * Excel report of the groundwater conditions: summary by well, the
 * USEPA (1998) screening criterion by criterion, the field parameters of
 * the sampling sheets, the data used, the BIOCHLOR transport inputs when
 * computed, and the method with its sources.
 */

import type { Workbook, Worksheet } from 'exceljs'
import { BANDEAU, ETAT } from '../resultats/couleurs.ts'
import { ecrire, GRIS_FAMILLE, VERT_ENTETE } from '../resultats/export.ts'
import { ETHENES, type Aquifere, type Ethene, type Taux } from './biochlor.ts'
import type { Jeu } from './donnees.ts'
import { BAREME_CLASSES, COMPOSES_FILIATION, LIBELLES_CLASSE, type Classe, type Evaluation, type Options } from './evaluation.ts'
import { PARAMS_TERRAIN } from './fiches.ts'
import { formatValeur, LIBELLES_GROUPE, PARAMS, type Groupe } from './parametres.ts'
import { SOURCES } from './sources.ts'

export interface Rapport {
  titre: string
  contexte: [string, string][]
  jeu: Jeu
  evaluations: Evaluation[]
  options: Options
  transport?: { aquifere: Aquifere; koc: Record<Ethene, number>; amont: string; aval: string; distance: number; normaliser: boolean; vx: number; facteur: number | null; taux: Taux[] }
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

function feuilleSynthese(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Synthèse', { views: [{ showGridLines: false }] })
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
    ['Processus redox (USGS)', 22],
    ['Score USEPA 1998', 9],
    ['Points non évalués', 9],
    ['Interprétation', 22],
    ['Interprétation si données complètes au mieux', 22],
    ['COHV (µmol/l)', 9],
    ['Devenir du chlorure de vinyle', 40],
    ['Points de vigilance', 70],
  ])
  ws.views = [{ state: 'frozen', ySplit: r - 1, xSplit: 1, showGridLines: false }]
  for (const e of rp.evaluations) {
    const t = rp.jeu.valeurs[e.ouvrage.cle] ?? {}
    const c = COULEUR_CLASSE[e.score.classe]
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
      `${e.redox.categorie}${e.redox.processus && e.redox.processus !== '—' ? ` — ${e.redox.processus}` : ''}`,
      e.score.total,
      e.score.potentiel,
      LIBELLES_CLASSE[e.score.classe],
      LIBELLES_CLASSE[e.score.classeMax],
      nb(e.cohvMolaire),
      e.devenirCV.join(' ; ') || '-',
      e.alertes.map((a) => a.texte).join(' ; ') || '-',
    ]
    ligne.forEach((v, j) => {
      const enClasse = j === 10 || j === 12
      ecrire(ws, r, j + 1, typeof v === 'number' ? v : String(v).replace(/^(-?\d+)\.(\d+)$/, '$1,$2'), {
        taille: 9,
        h: j >= 2 && j <= 8 ? 'center' : j === 10 || j === 11 || j === 14 ? 'center' : 'left',
        wrap: j >= 9,
        gras: j === 0 || j === 10,
        fond: enClasse ? c.fond : undefined,
        couleur: enClasse ? c.texte : undefined,
      })
    })
    ws.getRow(r).height = Math.max(15, Math.ceil(Math.max(String(ligne[16]).length / 95, String(ligne[15]).length / 55, 1)) * 12)
    r++
  }
  r++
  r = bandeau(ws, r, 'Interprétation du score (USEPA, 1998, tableau 2.4)', 8)
  for (const b of BAREME_CLASSES) {
    const c = COULEUR_CLASSE[b.classe]
    ecrire(ws, r, 1, b.bornes, { gras: true, taille: 9, h: 'center', fond: c.fond, couleur: c.texte })
    ws.mergeCells(r, 2, r, 8)
    ecrire(ws, r++, 2, b.texte, { taille: 9 })
  }
  r = texte(ws, r + 1, "Le score est calculé ouvrage par ouvrage ; le protocole l'applique à la zone la plus contaminée. Un critère sans donnée ne rapporte aucun point : le score est alors un minorant, la colonne « Points non évalués » donnant ce que ces critères pourraient ajouter.", { italique: true })
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
  ws.getColumn(1).width = 40
  ws.getColumn(2).width = 16
  const lignes: [string, string | number][] = [
    ['Conductivité hydraulique K (m/s)', t.aquifere.K],
    ['Gradient hydraulique i (m/m)', t.aquifere.i],
    ['Porosité efficace ne', t.aquifere.ne],
    ['Porosité totale n', t.aquifere.n],
    ['Masse volumique apparente ρb (kg/l)', t.aquifere.rhob],
    ['Fraction de carbone organique foc (g/g)', t.aquifere.foc],
    ['Vitesse réelle vx = K·i/ne (m/an)', nb(t.vx)],
    ['Ouvrage amont (A)', t.amont],
    ['Ouvrage aval (B)', t.aval],
    ['Distance A → B le long de l’écoulement (m)', t.distance],
    ['Normalisation par les chlorures + chlore organique', t.normaliser ? `oui (TA/TB = ${t.facteur === null ? 'non calculable' : String(nb(t.facteur)).replace('.', ',')})` : 'non'],
  ]
  for (const [k, v] of lignes) {
    ecrire(ws, r, 1, k, { taille: 9, fond: GRIS_FAMILLE, gras: true })
    ecrire(ws, r++, 2, v, { taille: 9, h: 'center' })
  }
  r++
  r = entetes(ws, r, [
    ['Composé', 0],
    ['Koc (l/kg)', 0],
    ['Retard R', 12],
    ['Temps de transit (an)', 12],
    ['CA (µg/l)', 11],
    ['CB (µg/l)', 11],
    ['CB corrigée (µg/l)', 12],
    ['λ (1/an)', 10],
    ['Littérature (USEPA 1998)', 18],
    ['Remarque', 60],
  ])
  for (const x of t.taux) {
    const e = ETHENES.find((y) => y.id === x.compose)!
    const v: (string | number)[] = [e.libelle, nb(t.koc[x.compose]), nb(x.retard), nb(x.temps), nb(x.cA), nb(x.cB), nb(x.cBcorr), nb(x.lambda), e.litterature, x.note ?? '-']
    v.forEach((y, j) => ecrire(ws, r, j + 1, y, { taille: 9, h: j === v.length - 1 ? 'left' : 'center', wrap: j === v.length - 1, gras: j === 0 || j === 7 }))
    r++
  }
  r++
  r = texte(ws, r, 'λ = −ln(CB,corr / CA) / t ; t = distance / (vx / R) ; R = 1 + ρb·Koc·foc / n ; CB,corr = CB·TA/TB, T = Cl⁻ + 0,86 PCE + 0,81 TCE + 0,73 DCE + 0,57 CV (mg/l).', { italique: true })
  texte(ws, r, 'Ces constantes et la vitesse renseignent les champs « Biotransformation » et « Advection » de BIOCHLOR ; les deux ouvrages doivent être sur une même ligne d’écoulement, dans le panache.', { italique: true })
}

function feuilleMethode(wb: Workbook) {
  const ws = wb.addWorksheet('Méthode et sources', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 130
  let r = 1
  ecrire(ws, r++, 1, 'Méthode', { gras: true, taille: 11, bord: false })
  const textes = [
    "Démarche par lignes de preuve de l'atténuation naturelle (USEPA, 1998 ; reprise par le programme MACAOH, ADEME) : 1) baisse des concentrations et des masses dans le temps et le long de l'écoulement ; 2) processus identifiés et quantifiés — indicateurs géochimiques, produits de dégradation, constantes de biodégradation ; 3) études microbiologiques ou en microcosmes. Cet outil documente la deuxième ligne de preuve ; la première se lit sur l'évolution des campagnes (outil Résultats labo), la troisième demande des analyses spécifiques (Dehalococcoides, qPCR, isotopie).",
    'Criblage USEPA (1998), tableau 2.3 : points attribués par critère, total interprété selon le tableau 2.4. Le potentiel redox est celui mesuré contre l’électrode Ag/AgCl, comme le demande le protocole (et non Eh). Le seuil des nitrates (1 mg/l) est appliqué aux nitrates exprimés en NO3⁻, le protocole ne précisant pas la forme (1 mg NO3⁻/l = 0,23 mg N/l).',
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

export async function telechargerRapport(rp: Rapport, nomFichier: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ERM SIR Toolbox France'
  feuilleSynthese(wb, rp)
  feuilleScore(wb, rp)
  feuilleTerrain(wb, rp)
  feuilleDonnees(wb, rp)
  feuilleTransport(wb, rp)
  feuilleMethode(wb)
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
