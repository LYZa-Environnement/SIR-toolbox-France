/**
 * Sheets of the "expert" export: statistics on censored data, chlorinated
 * solvent degradation, PAH source ratios and BaP equivalent, ISDI admission
 * of soils, and the references they rest on.
 */

import type { Workbook, Worksheet } from 'exceljs'
import { convertir, volumeLitres } from '../calc.ts'
import { ecrire, GRIS_DEPASSEMENT, GRIS_FAMILLE, GRIS_LQ, ligneFamille, VERT_ENTETE, type OptionsExport } from '../export.ts'
import type { Lecture, Mesure, Parametre } from '../parse.ts'
import { estControle } from '../qualite.ts'
import { valeursCompose } from '../stats.ts'
import { degradationCOHV, diagnosticHAP, FET_INERIS, RATIOS_HAP } from './diagnostics.ts'
import { admissibiliteISDI } from './isdi.ts'
import { statsExpertes } from './statistique.ts'

const nombre = (x: number | null | undefined, chiffres = 4) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : Number(x.toPrecision(chiffres)))
const pourcent = (x: number | null | undefined) => (x === null || x === undefined ? '-' : x)

function entete(ws: Worksheet, r: number, colonnes: [string, number][]) {
  ws.getRow(r).height = 48
  colonnes.forEach(([titre, largeur], j) => {
    ws.getColumn(j + 1).width = largeur
    ecrire(ws, r, j + 1, titre, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  })
}

function note(ws: Worksheet, r: number, texte: string): number {
  ecrire(ws, r, 1, texte, { italique: true, taille: 9, bord: false })
  return r + 1
}

function echantillonsRetenus(lecture: Lecture, opts: OptionsExport): string[] {
  return lecture.points.filter((p) => !estControle(opts.qualifications[p.nom])).map((p) => p.nom)
}

// ---- 1. Statistics on censored data ------------------------------------------------

function feuilleStatistiques(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const ws = wb.addWorksheet('Statistiques expertes', { views: [{ state: 'frozen', xSplit: 1, ySplit: 6, showGridLines: false }] })
  const echantillons = echantillonsRetenus(lecture, opts)
  const unite = (pa: Parametre) => (opts.conversion ? (opts.unite === 'µg/m³' ? 'µg/m3' : 'mg/m3') : pa.unite)
  ecrire(ws, 1, 1, `${opts.titre} — statistiques sur données censurées (<LQ)`, { gras: true, taille: 12, bord: false })
  let r = 2
  r = note(ws, r, `Méthode de Kaplan-Meier (USEPA ProUCL) : estimateur non paramétrique adapté aux résultats <LQ, y compris avec plusieurs LQ, recommandé tant que moins de 70 % environ des résultats sont <LQ. Erreur type de la moyenne : formule de Greenwood.`)
  r = note(ws, r, `UCL95 : limite supérieure de confiance à 95 % sur la moyenne, KM-t et KM-Chebyshev (ProUCL 5.1 privilégiait Chebyshev pour les données très asymétriques ; ProUCL 5.2 retient l'UCL-t si n < 28 ou si l'écart-type des log > 1,5). Non calculée sous 8 résultats quantifiés.`)
  r = note(ws, r, `Valeurs atypiques potentielles : test de Dixon (3 à 25 valeurs) ou de Rosner (au-delà), à 5 %, sur le logarithme des résultats quantifiés. À examiner, jamais à écarter sans justification de terrain ou de laboratoire. Échantillons de contrôle qualité exclus.`)
  r++
  const colonnes: [string, number][] = [
    ['Composé', 32],
    ['Unité', 10],
    ['n', 6],
    ['n > LQ', 7],
    ['% <LQ', 8],
    ['Moyenne KM', 11],
    ['Écart-type KM', 11],
    ['Erreur type KM', 11],
    ['UCL95 KM-t', 11],
    ['UCL95 KM-Chebyshev', 12],
    ['Coefficient de variation (quantifiés)', 13],
    ['Asymétrie (quantifiés)', 11],
    ['Écart-type des ln (quantifiés)', 12],
    ['Test de valeurs atypiques', 11],
    ['Valeurs atypiques potentielles', 24],
    ['Remarque', 46],
  ]
  entete(ws, r, colonnes)
  r++
  const conversion = opts.conversion ? { prelevements: opts.prelevements, unite: opts.unite } : null
  let famille: string | null = null
  for (const pa of lecture.parametres.CM) {
    if (!/g\s*\//i.test(pa.unite) && !opts.conversion) continue
    if (pa.famille && pa.famille !== famille) {
      famille = pa.famille
      ligneFamille(ws, r++, famille, colonnes.length)
    }
    const s = statsExpertes(valeursCompose(lecture, pa, echantillons, conversion))
    const valeurs: (string | number)[] = [
      pa.nom,
      unite(pa),
      s.n,
      s.detectes,
      nombre(s.partCensuree, 3),
      nombre(s.km?.moyenne),
      nombre(s.km?.ecartType),
      nombre(s.km?.erreurType),
      nombre(s.uclT),
      nombre(s.uclChebyshev),
      nombre(s.coefVariation, 3),
      nombre(s.asymetrie, 3),
      nombre(s.ecartTypeLog, 3),
      s.atypiques.test ?? '-',
      s.atypiques.echantillons.join(', ') || '-',
      s.avertissement ?? '',
    ]
    valeurs.forEach((v, j) =>
      ecrire(ws, r, j + 1, v, {
        h: j === 0 || j >= 14 ? 'left' : 'center',
        indent: j === 0 ? 1 : undefined,
        italique: (j === 0 && pa.somme) || j === 15,
        taille: j === 15 ? 9 : undefined,
        wrap: j >= 14,
        gras: j === 14 && s.atypiques.echantillons.length > 0,
        fond: j === 14 && s.atypiques.echantillons.length > 0 ? GRIS_DEPASSEMENT : undefined,
      }),
    )
    r++
  }
}

// ---- 2. Chlorinated solvents degradation ---------------------------------------------

function feuilleDegradation(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const echantillons = echantillonsRetenus(lecture, opts)
  const concentration = opts.conversion
    ? (p: Parametre, m: Mesure, ech: string) => {
        const c = convertir(m, p, volumeLitres(opts.prelevements[ech] ?? { debitDebut: null, debitFin: null, duree: null }), 'µg/m³')
        return c && !c.inferieur ? c.valeur : null
      }
    : undefined
  const chaines = degradationCOHV(lecture, echantillons, concentration)
  if (!chaines.length) return
  const ws = wb.addWorksheet('Dégradation COHV', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, `${opts.titre} — indicateurs de dégradation des COHV`, { gras: true, taille: 12, bord: false })
  let r = 2
  r = note(ws, r, "Concentrations converties en moles, base de comparaison correcte entre composé parent et produits de dégradation (une mole de PCE donne au plus une mole de chlorure de vinyle). Séquence de déchloration réductrice : PCE → TCE → DCE → chlorure de vinyle → éthène ; 1,1,1-TCA → 1,1-DCA → chloroéthane (USEPA, 1998, EPA/600/R-98/128).")
  r = note(ws, r, "Nombre de chlore moyen : 4 pour du PCE seul, 1 pour du chlorure de vinyle seul ; plus il est bas, plus la déchloration est avancée. Part des produits de dégradation : moles des composés autres que le parent / total. cis / (cis + trans) DCE : la déchloration biologique produit majoritairement le cis-1,2-DCE, le DCE d'origine industrielle étant surtout trans ou 1,1.")
  r = note(ws, r, "Les résultats <LQ comptent pour zéro ; l'éthène et l'éthane, produits finaux, ne sont pas analysés dans ces fichiers. Indicateurs à interpréter avec les conditions du milieu (potentiel redox, accepteurs d'électrons, carbone organique).")
  r++
  for (const c of chaines) {
    const largeur = 1 + 2 * c.especes.length + 3
    ws.mergeCells(r, 1, r, largeur)
    ecrire(ws, r++, 1, `COHV — ${c.chaine.toUpperCase()}`, { gras: true, fond: GRIS_FAMILLE })
    const colonnes: [string, number][] = [
      ['Échantillon', 20],
      ...c.especes.map((e): [string, number] => [`${e} (${c.uniteMolaire})`, 11]),
      ...c.especes.map((e): [string, number] => [`${e} (% molaire)`, 10]),
      ['Nombre de chlore moyen', 11],
      ['Part des produits de dégradation', 12],
      ['cis / (cis + trans) DCE', 11],
    ]
    entete(ws, r, colonnes)
    r++
    for (const e of c.echantillons) {
      const valeurs: (string | number)[] = [
        e.echantillon,
        ...c.especes.map((k) => nombre(e.molaire[k], 3)),
        ...c.especes.map((k) => pourcent(e.fractions[k])),
        nombre(e.nombreChlore, 3),
        pourcent(e.partFilles),
        c.chaine === 'Chloroéthènes' ? pourcent(e.cisSurDCE) : '-',
      ]
      valeurs.forEach((v, j) => {
        const pct = (j > c.especes.length && j <= 2 * c.especes.length) || j === largeur - 2 || j === largeur - 1
        ecrire(ws, r, j + 1, v, { h: j ? 'center' : 'left', fmt: pct && typeof v === 'number' ? '0%' : undefined })
      })
      r++
    }
    r += 2
  }
}

// ---- 3. PAH ----------------------------------------------------------------------------

function feuilleHAP(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const d = diagnosticHAP(lecture, echantillonsRetenus(lecture, opts))
  if (!d) return
  const ws = wb.addWorksheet('HAP — origine et BaP-éq', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, `${opts.titre} — HAP : ratios d'origine et équivalent benzo(a)pyrène`, { gras: true, taille: 12, bord: false })
  let r = 2
  r = note(ws, r, "Ratios de diagnostic d'origine (Yunker et al., 2002, Organic Geochemistry 33, 489-515), calculés lorsque les deux composés sont quantifiés. Ils sont empiriques et se recouvrent entre sources : à lire ensemble, jamais un seul isolément.")
  for (const ratio of RATIOS_HAP) {
    const bornes = ratio.seuils.map((s) => String(s).replace('.', ','))
    const lecture_ = ratio.lectures.map((l, i) => (i === 0 ? `< ${bornes[0]} ${l}` : i === bornes.length ? `> ${bornes[i - 1]} ${l}` : `${bornes[i - 1]}–${bornes[i]} ${l}`)).join(' ; ')
    r = note(ws, r, `• ${ratio.code} : ${lecture_}.`)
  }
  r = note(ws, r, `Équivalent benzo(a)pyrène = Σ FET × concentration, facteurs d'équivalence toxique proposés par l'INERIS (2003, rapport INERIS-DRC-03-47026, table de Nisbet et LaGoy 1992 avec le dibenzo(a,h)anthracène à 1) : ${Object.entries(FET_INERIS).map(([k, v]) => `${k} ${String(v).replace('.', ',')}`).join(', ')}. Borne basse : <LQ = 0 ; borne haute : <LQ = LQ.`)
  const baa = d.echantillons.map((e) => e.ratios['BaA/(BaA+Chr)']?.valeur).filter((v): v is number => v !== undefined)
  if (baa.length > 1 && baa.every((v) => Math.abs(v - 0.5) < 1e-9)) {
    r = note(ws, r, "Benzo(a)anthracène et chrysène ont la même valeur dans tous les échantillons : dosage probablement conjoint (co-élution), le ratio BaA/(BaA+Chr) n'est pas interprétable.")
  }
  r++
  const colonnes: [string, number][] = [
    ['Échantillon', 20],
    ...RATIOS_HAP.flatMap((x): [string, number][] => [
      [x.code, 10],
      [`Lecture ${x.code}`, 20],
    ]),
    [`BaP-éq, <LQ = 0 (${d.unite})`, 13],
    [`BaP-éq, <LQ = LQ (${d.unite})`, 13],
    ['HAP quantifiés', 9],
  ]
  entete(ws, r, colonnes)
  r++
  for (const e of d.echantillons) {
    const valeurs: (string | number)[] = [
      e.echantillon,
      ...RATIOS_HAP.flatMap((x) => {
        const v = e.ratios[x.code]
        return v ? [Number(v.valeur.toFixed(2)), v.lecture] : ['-', '-']
      }),
      nombre(e.bapEqMin, 3),
      nombre(e.bapEqMax, 3),
      e.nbQuantifies,
    ]
    valeurs.forEach((v, j) => ecrire(ws, r, j + 1, v, { h: j ? 'center' : 'left', taille: typeof v === 'string' && j ? 9 : undefined, wrap: j > 0 }))
    r++
  }
}

// ---- 4. ISDI (soils) ---------------------------------------------------------------------

function feuilleISDI(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const res = admissibiliteISDI(lecture, echantillonsRetenus(lecture, opts))
  if (!res) return
  const ws = wb.addWorksheet('Admissibilité ISDI', { views: [{ state: 'frozen', xSplit: 1, ySplit: 7, showGridLines: false }] })
  ecrire(ws, 1, 1, `${opts.titre} — admissibilité en installation de stockage de déchets inertes`, { gras: true, taille: 12, bord: false })
  let r = 2
  r = note(ws, r, 'Arrêté du 12 décembre 2014, annexe II : test de lixiviation NF EN 12457-2 (mg/kg MS, L/S = 10 l/kg) et contenu total (mg/kg MS). Notes du tableau appliquées : compensation chlorures / sulfates / fraction soluble (1), sulfates par essai de percolation (2), COT sur éluat à pH 7,5–8 (3), COT total supérieur admis pour un sol si le COT sur éluat est conforme.')
  r = note(ws, r, "Verdict « Incomplet » : un ou plusieurs critères n'ont pas été analysés. L'admissibilité suppose aussi l'absence d'autre contamination (amiante, odeurs, déchets non inertes) et les conditions de l'annexe I et de l'acceptation préalable.")
  r++
  const criteres = res.criteres
  ecrire(ws, r, 1, 'Valeur limite (mg/kg MS)', { gras: true, taille: 9, fond: GRIS_FAMILLE })
  criteres.forEach((c, j) => ecrire(ws, r, j + 2, c.valeur, { gras: true, taille: 9, fond: GRIS_FAMILLE, h: 'center' }))
  r++
  const colonnes: [string, number][] = [['Échantillon', 22], ...criteres.map((c): [string, number] => [c.libelle, 10]), ['Verdict', 17], ['Paramètres déclassants', 30], ['Non analysés', 30], ['Remarques', 60]]
  entete(ws, r, colonnes)
  r++
  for (const v of res.verdicts) {
    ecrire(ws, r, 1, v.echantillon, {})
    criteres.forEach((c, j) => {
      const x = v.resultats[c.code]
      const depasse = x.statut === 'depassement'
      ecrire(ws, r, j + 2, x.mesure && !x.mesure.inferieur ? Number(x.affichage.replace(',', '.')) : x.affichage, {
        h: 'center',
        gras: depasse,
        fond: depasse ? GRIS_DEPASSEMENT : undefined,
        italique: x.mesure?.inferieur || !x.mesure,
        couleur: x.mesure?.inferieur || !x.mesure ? GRIS_LQ : undefined,
      })
    })
    const c0 = criteres.length + 2
    const verdict = v.admissible === true ? 'Admissible' : v.admissible === false ? 'Non admissible' : 'Incomplet'
    ecrire(ws, r, c0, verdict, { gras: true, h: 'center', fond: v.admissible === false ? GRIS_DEPASSEMENT : undefined })
    ecrire(ws, r, c0 + 1, v.declassants.join(', ') || '-', { wrap: true, taille: 9 })
    ecrire(ws, r, c0 + 2, v.manquants.join(', ') || '-', { wrap: true, taille: 9 })
    ecrire(ws, r, c0 + 3, v.remarques.join(' ') || '-', { wrap: true, taille: 9 })
    r++
  }
}

// ---- 5. References -------------------------------------------------------------------------

const REFERENCES: [string, string][] = [
  ['USEPA, ProUCL Version 5.2 — Technical Guide (statistiques sur données censurées, UCL, valeurs atypiques)', 'https://www.epa.gov/land-research/proucl-software'],
  ['Helsel D.R., 2012, Statistics for Censored Environmental Data Using Minitab and R, 2e éd., Wiley (méthode de Kaplan-Meier par inversion)', ''],
  ['USEPA, 1998, Technical Protocol for Evaluating Natural Attenuation of Chlorinated Solvents in Ground Water, EPA/600/R-98/128', 'https://pubs.usgs.gov/publication/70207678'],
  ['Yunker M.B. et al., 2002, PAHs in the Fraser River basin: a critical appraisal of PAH ratios as indicators of PAH source and composition, Organic Geochemistry 33, 489-515', ''],
  ['INERIS, 2003, HAP — Évaluation de la relation dose-réponse pour des effets cancérigènes (rapport INERIS-DRC-03-47026), facteurs d\'équivalence toxique', 'https://www.ineris.fr/sites/default/files/contribution/Documents/HAP_4.pdf'],
  ["Arrêté du 12 décembre 2014 relatif aux conditions d'admission des déchets inertes dans les installations relevant des rubriques 2515, 2516, 2517 et 2760, annexe II", 'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000029895647'],
  ["BRGM / INERIS, 2016, Guide pratique pour la caractérisation des gaz du sol et de l'air intérieur (BRGM RP-65870-FR) — percée des tubes, blancs", 'http://infoterre.brgm.fr/rapports/RP-65870-FR.pdf'],
]

function feuilleReferences(wb: Workbook, opts: OptionsExport) {
  const ws = wb.addWorksheet('Références', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 120
  ws.getColumn(2).width = 70
  ecrire(ws, 1, 1, `${opts.titre} — références des analyses expertes`, { gras: true, taille: 12, bord: false })
  REFERENCES.forEach(([texte, url], i) => {
    ecrire(ws, 3 + i, 1, texte, { bord: false, wrap: true })
    if (url) {
      const c = ws.getCell(3 + i, 2)
      c.value = { text: url, hyperlink: url }
      c.font = { name: 'Verdana', size: 9, color: { argb: 'FF00756A' }, underline: true }
    }
  })
}

export function ajouterFeuillesExpert(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  feuilleStatistiques(wb, lecture, opts)
  feuilleDegradation(wb, lecture, opts)
  feuilleHAP(wb, lecture, opts)
  if (!opts.conversion && /sol/i.test(opts.libelleMatrice)) feuilleISDI(wb, lecture, opts)
  feuilleReferences(wb, opts)
}
