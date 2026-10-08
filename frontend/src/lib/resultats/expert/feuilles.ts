/**
 * Sheets of the "expert" export: dechlorination of chlorinated solvents and
 * chlorobenzenes, PAH sources and toxicity, petroleum hydrocarbons and BTEX,
 * ISDI admission of soils, and the references these rest on. Each sheet
 * leads with how to read it, colours what matters and ends with a figure.
 */

import type { Workbook, Worksheet } from 'exceljs'
import { dessinerBarres, type Serie } from '../barres.ts'
import { convertir, volumeLitres } from '../calc.ts'
import { ecrire, GRIS_DEPASSEMENT, GRIS_FAMILLE, GRIS_LQ, VERT_ENTETE, type OptionsExport, type Style } from '../export.ts'
import type { Lecture, Mesure, Parametre } from '../parse.ts'
import { estControle } from '../qualite.ts'
import {
  CLASSES_CYCLES,
  CLASSES_HCT,
  degradations,
  diagnosticBTEX,
  diagnosticHAP,
  diagnosticHCT,
  FET_INERIS,
  RATIOS_HAP,
  type Degradation,
  type Origine,
} from './diagnostics.ts'
import { admissibiliteISDI } from './isdi.ts'

const nombre = (x: number | null | undefined, chiffres = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : Number(x.toPrecision(chiffres)))

/** Hex colour mixed with white: t = 0 the colour, t = 1 white. */
function eclaircir(hex: string, t: number): string {
  const v = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => Math.round(parseInt(v.slice(i, i + 2), 16) * (1 - t) + 255 * t))
  return `FF${c.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`

function entete(ws: Worksheet, r: number, colonnes: [string, number][], c0 = 1) {
  ws.getRow(r).height = 46
  colonnes.forEach(([libelle, largeur], j) => {
    ws.getColumn(c0 + j).width = Math.max(ws.getColumn(c0 + j).width ?? 0, largeur)
    ecrire(ws, r, c0 + j, libelle, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  })
}

function texte(ws: Worksheet, r: number, t: string, s: Style = {}): number {
  ecrire(ws, r, 1, t, { taille: 9, bord: false, ...s })
  return r + 1
}

function titre(ws: Worksheet, r: number, t: string): number {
  return texte(ws, r, t, { gras: true, taille: 10 })
}

function bandeau(ws: Worksheet, r: number, t: string, largeur: number): number {
  ws.mergeCells(r, 1, r, largeur)
  ecrire(ws, r, 1, t.toUpperCase(), { gras: true, fond: GRIS_FAMILLE })
  return r + 1
}

/** Excel colour scale white → colour on a column of shares (0–1). */
function echelle(ws: Worksheet, r1: number, r2: number, c: number, hex: string) {
  if (r2 < r1) return
  const l = ws.getColumn(c).letter
  ws.addConditionalFormatting({
    ref: `${l}${r1}:${l}${r2}`,
    rules: [
      {
        type: 'colorScale',
        priority: 1,
        cfvo: [
          { type: 'num', value: 0 },
          { type: 'num', value: 1 },
        ],
        color: [{ argb: 'FFFFFFFF' }, { argb: eclaircir(hex, 0.35) }],
      },
    ],
  })
}

/** Excel data bar on a column. */
function barre(ws: Worksheet, r1: number, r2: number, c: number, hex: string, max?: number) {
  if (r2 < r1) return
  const l = ws.getColumn(c).letter
  ws.addConditionalFormatting({
    ref: `${l}${r1}:${l}${r2}`,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        gradient: false,
        cfvo: [{ type: 'num', value: 0 }, max === undefined ? { type: 'max' } : { type: 'num', value: max }],
        color: { argb: eclaircir(hex, 0.3) },
      } as never,
    ],
  })
}

function image(wb: Workbook, ws: Worksheet, r: number, dessin: ReturnType<typeof dessinerBarres>): number {
  if (!dessin) return r
  const id = wb.addImage({ base64: dessin.image, extension: 'png' })
  ws.addImage(id, { tl: { col: 0, row: r - 1 }, ext: { width: dessin.largeur, height: dessin.hauteur } })
  return r + Math.ceil(dessin.hauteur / 20) + 1
}

function echantillonsRetenus(lecture: Lecture, opts: OptionsExport): string[] {
  return lecture.points.filter((p) => !estControle(opts.qualifications[p.nom])).map((p) => p.nom)
}

// ---- Dechlorination (COHV, chlorobenzenes) ---------------------------------------------

const CONFIRMATION = [
  'Éthène et éthane : produits finaux de la déchloration des chloroéthènes ; leur présence confirme une déchloration complète.',
  'Conditions du milieu favorables à la déchloration réductrice, valeurs indicatives du tableau de criblage du protocole USEPA 1998 : oxygène dissous < 0,5 mg/l, nitrates < 1 mg/l, fer ferreux > 1 mg/l, sulfates < 20 mg/l, méthane > 0,5 mg/l, potentiel redox < −100 mV (Ag/AgCl).',
  "Carbone organique dissous : donneur d'électrons nécessaire à la déchloration.",
  'Biologie moléculaire : dénombrement de Dehalococcoides (qPCR, gènes vcrA / bvcA), seules bactéries connues pour réduire complètement le chlorure de vinyle en éthène.',
  "Position des ouvrages par rapport à la source et évolution dans le temps : une dégradation se lit le long de l'écoulement.",
]

function blocDechloration(wb: Workbook, ws: Worksheet, r: number, d: Degradation): number {
  const especes = d.especes
  const chloroethenes = d.chaine.nom === 'Chloroéthènes'
  const colonnes: [string, number][] = [
    ['Échantillon', 18],
    ['Stade de dégradation (composé dominant en moles)', 54],
    ['Nombre de chlore moyen', 10],
    ['Part des produits de dégradation', 12],
    ...especes.map((e): [string, number] => [`${e.code} (% molaire)`, 10]),
    ...(chloroethenes ? [['cis / (cis + trans) DCE', 10] as [string, number]] : []),
    ...especes.map((e): [string, number] => [`${e.code} (${d.uniteMolaire})`, 11]),
    [`Total (${d.uniteMolaire})`, 11],
  ]
  r = bandeau(ws, r, `${d.chaine.nom} — ${especes.map((e) => e.code).join(' → ')}`, colonnes.length)
  entete(ws, r, colonnes)
  r++
  const r1 = r
  for (const l of d.echantillons) {
    let c = 1
    ecrire(ws, r, c++, l.echantillon, { gras: true })
    ecrire(ws, r, c++, l.dominant.stade, { taille: 9, wrap: true, fond: eclaircir(l.dominant.couleur, 0.78) })
    ecrire(ws, r, c++, nombre(l.nombreChlore), { h: 'center', gras: true })
    ecrire(ws, r, c++, l.partFilles, { h: 'center', fmt: '0%' })
    for (const e of especes) ecrire(ws, r, c++, l.fractions[e.code] ?? 0, { h: 'center', fmt: '0%' })
    if (chloroethenes) ecrire(ws, r, c++, l.cisSurDCE ?? '-', { h: 'center', fmt: l.cisSurDCE === null ? undefined : '0%' })
    for (const e of especes) ecrire(ws, r, c++, nombre(l.molaire[e.code]), { h: 'center', taille: 9, couleur: GRIS_LQ })
    ecrire(ws, r, c++, nombre(l.total), { h: 'center', taille: 9, couleur: GRIS_LQ })
    ws.getRow(r).height = 26
    r++
  }
  const r2 = r - 1
  barre(ws, r1, r2, 4, '#00A37E', 1)
  especes.forEach((e, i) => echelle(ws, r1, r2, 5 + i, e.couleur))

  // Plain-language synthesis.
  r++
  r = titre(ws, r, 'Synthèse')
  const n = d.echantillons.length
  const parDominant = especes
    .map((e) => ({ e, ouvrages: d.echantillons.filter((l) => l.dominant.code === e.code) }))
    .filter((x) => x.ouvrages.length)
  for (const { e, ouvrages } of parDominant) {
    r = texte(ws, r, `• ${ouvrages.length} ouvrage${ouvrages.length > 1 ? 's' : ''} sur ${n} — ${e.stade} : ${ouvrages.map((o) => o.echantillon).join(', ')}.`)
  }
  const cl = d.echantillons.map((l) => l.nombreChlore).sort((a, b) => a - b)
  const mediane = cl.length % 2 ? cl[(cl.length - 1) / 2] : (cl[cl.length / 2 - 1] + cl[cl.length / 2]) / 2
  r = texte(
    ws,
    r,
    `• Nombre de chlore moyen : de ${String(nombre(cl[cl.length - 1])).replace('.', ',')} (ouvrage le moins dégradé) à ${String(nombre(cl[0])).replace('.', ',')} (le plus dégradé), médiane ${String(nombre(mediane)).replace('.', ',')} — sur une échelle de ${d.chaine.chloresMax} (composé parent seul) à 1 (dernier produit chloré).`,
  )
  if (chloroethenes) {
    const cv = d.echantillons.filter((l) => l.dominant.code === 'CV')
    if (cv.length) r = texte(ws, r, `• Chlorure de vinyle dominant en ${cv.length} ouvrage${cv.length > 1 ? 's' : ''} : déchloration avancée mais produit le plus toxique de la chaîne ; rechercher l'éthène pour savoir si la réaction va à son terme.`)
    const trans = d.echantillons.filter((l) => l.cisSurDCE !== null && l.cisSurDCE < 0.5)
    if (trans.length) r = texte(ws, r, `• trans-DCE supérieur au cis-DCE en ${trans.map((l) => l.echantillon).join(', ')} : DCE d'une autre origine que la déchloration biologique possible.`)
    else if (d.echantillons.some((l) => l.cisSurDCE !== null)) r = texte(ws, r, "• Le cis-DCE domine le DCE dans tous les ouvrages où il est mesuré, signature attendue d'une déchloration biologique.")
  }
  r++
  const series: Serie[] = especes.map((e) => ({ nom: e.code, couleur: e.couleur }))
  r = image(
    wb,
    ws,
    r,
    dessinerBarres(
      `${d.chaine.nom} — composition molaire par ouvrage (du moins au plus dégradé)`,
      series,
      d.echantillons.map((l) => ({ libelle: l.echantillon, parts: Object.fromEntries(especes.map((e) => [e.code, l.fractions[e.code] ?? 0])) })),
    ),
  )
  return r + 1
}

function feuilleDechloration(wb: Workbook, nom: string, intitule: string, lignesLecture: string[], confirmation: string[], ds: Degradation[], opts: OptionsExport) {
  const ws = wb.addWorksheet(nom, { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, `${opts.titre} — ${intitule}`, { gras: true, taille: 12, bord: false })
  let r = 3
  r = titre(ws, r, 'Comment lire cet onglet')
  for (const l of lignesLecture) r = texte(ws, r, `• ${l}`)
  r++
  for (const d of ds) r = blocDechloration(wb, ws, r, d)
  if (confirmation.length) {
    r = titre(ws, r, 'Pour confirmer une dégradation biologique')
    for (const l of confirmation) r = texte(ws, r, `• ${l}`)
  }
}

// ---- PAH --------------------------------------------------------------------------------

const COULEUR_ORIGINE: Record<Origine, string> = { pétrogénique: '#F4B183', pyrolytique: '#9DC3E6', mixte: '#D9D9D9' }

function feuilleHAP(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const d = diagnosticHAP(lecture, echantillonsRetenus(lecture, opts))
  if (!d) return
  const ws = wb.addWorksheet('HAP', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, `${opts.titre} — HAP : profil, origine et toxicité`, { gras: true, taille: 12, bord: false })
  let r = 3
  r = titre(ws, r, 'Comment lire cet onglet')
  r = texte(ws, r, '• Profil par nombre de cycles : les HAP légers (2-3 cycles) dominent dans les produits pétroliers (origine pétrogénique), les HAP lourds (4-6 cycles) dans les résidus de combustion (origine pyrolytique : mâchefers, suies, goudrons, brais). LMW/HMW > 1 : pétrogénique ; < 1 : pyrolytique (Wang et al., 1999).')
  r = texte(ws, r, "• Ratios de diagnostic (Yunker et al., 2002), calculés lorsque les deux composés sont quantifiés. Ils sont empiriques et se recouvrent entre sources : la synthèse retient l'origine indiquée par la majorité des indicateurs, sans jamais s'appuyer sur un seul.")
  for (const ratio of RATIOS_HAP) {
    const b = ratio.seuils.map((s) => String(s).replace('.', ','))
    r = texte(ws, r, `     ${ratio.code} : ${ratio.lectures.map((l, i) => (i === 0 ? `< ${b[0]} ${l}` : i === b.length ? `> ${b[i - 1]} ${l}` : `${b[i - 1]}–${b[i]} ${l}`)).join(' ; ')}`)
  }
  r = texte(ws, r, "• Part des 7 HAP classés cancérogènes probables par l'US EPA (groupe B2 : benzo(a)anthracène, chrysène, benzo(b)- et benzo(k)fluoranthène, benzo(a)pyrène, dibenzo(a,h)anthracène, indéno(1,2,3-cd)pyrène).")
  r = texte(
    ws,
    r,
    `• Équivalent benzo(a)pyrène = Σ FET × concentration, FET proposés par l'INERIS (2003) : ${Object.entries(FET_INERIS)
      .map(([k, v]) => `${k} ${String(v).replace('.', ',')}`)
      .join(', ')}. Borne basse : <LQ = 0 ; borne haute : <LQ = LQ.`,
  )
  if (d.coelution) r = texte(ws, r, '• Benzo(a)anthracène et chrysène ont la même valeur partout : dosage probablement conjoint (co-élution) ; leur ratio est affiché en gris mais exclu de la synthèse.', { italique: true })
  r = texte(ws, r, '• Échantillons rangés par somme des HAP quantifiés décroissante. Couleurs : orange = pétrogénique, bleu = pyrolytique, gris = mixte.', { italique: true })
  r++
  const colonnes: [string, number][] = [
    ['Échantillon', 18],
    [`Σ HAP quantifiés (${d.unite})`, 11],
    ['% 2-3 cycles', 9],
    ['% 4 cycles', 9],
    ['% 5-6 cycles', 9],
    ['LMW / HMW', 9],
    ...RATIOS_HAP.map((x): [string, number] => [x.code, 15]),
    ['Origine indiquée', 30],
    ['% HAP cancérogènes (B2)', 11],
    [`BaP-éq, <LQ = 0 (${d.unite})`, 11],
    [`BaP-éq, <LQ = LQ (${d.unite})`, 11],
    ['Principal contributeur au BaP-éq', 18],
  ]
  entete(ws, r, colonnes)
  r++
  const r1 = r
  for (const l of d.echantillons) {
    let c = 1
    const s = l.somme || 1
    ecrire(ws, r, c++, l.echantillon, { gras: true })
    ecrire(ws, r, c++, nombre(l.somme), { h: 'center' })
    ecrire(ws, r, c++, (l.parCycles['2 cycles'] + l.parCycles['3 cycles']) / s, { h: 'center', fmt: '0%' })
    ecrire(ws, r, c++, l.parCycles['4 cycles'] / s, { h: 'center', fmt: '0%' })
    ecrire(ws, r, c++, (l.parCycles['5 cycles'] + l.parCycles['6 cycles']) / s, { h: 'center', fmt: '0%' })
    ecrire(ws, r, c++, nombre(l.lmwHmw, 2), {
      h: 'center',
      fond: l.lmwHmw === null ? undefined : argb(COULEUR_ORIGINE[l.lmwHmw > 1 ? 'pétrogénique' : 'pyrolytique']),
    })
    for (const ratio of RATIOS_HAP) {
      const v = l.ratios[ratio.code]
      const exclu = d.coelution && ratio.code === 'BaA/(BaA+Chr)'
      ecrire(ws, r, c++, v ? `${String(Number(v.valeur.toFixed(2))).replace('.', ',')} — ${v.lecture}` : '-', {
        h: 'center',
        taille: 8,
        wrap: true,
        fond: v && !exclu ? argb(COULEUR_ORIGINE[v.origine]) : undefined,
        couleur: exclu ? GRIS_LQ : undefined,
      })
    }
    const origine: Origine | null = /pyrolytique/.test(l.synthese) ? 'pyrolytique' : /pétrogénique/.test(l.synthese) ? 'pétrogénique' : /Mixte/.test(l.synthese) ? 'mixte' : null
    ecrire(ws, r, c++, l.synthese, { gras: true, taille: 9, wrap: true, fond: origine ? argb(COULEUR_ORIGINE[origine]) : undefined })
    ecrire(ws, r, c++, l.partCancerogenes ?? '-', { h: 'center', fmt: l.partCancerogenes === null ? undefined : '0%' })
    ecrire(ws, r, c++, nombre(l.bapEqMin), { h: 'center' })
    ecrire(ws, r, c++, nombre(l.bapEqMax), { h: 'center', couleur: GRIS_LQ })
    ecrire(ws, r, c++, l.contributeur ?? '-', { h: 'center', taille: 9 })
    ws.getRow(r).height = 30
    r++
  }
  barre(ws, r1, r - 1, 2, '#1F3864')
  echelle(ws, r1, r - 1, 12, '#C0392B')
  barre(ws, r1, r - 1, 13, '#C0392B')
  r++
  r = titre(ws, r, 'Synthèse')
  const pyro = d.echantillons.filter((l) => /pyrolytique/.test(l.synthese)).length
  const petro = d.echantillons.filter((l) => /pétrogénique/.test(l.synthese)).length
  r = texte(ws, r, `• ${d.echantillons.length} échantillon${d.echantillons.length > 1 ? 's' : ''} : ${pyro} d'origine plutôt pyrolytique, ${petro} plutôt pétrogénique, ${d.echantillons.length - pyro - petro} mixte ou indéterminée.`)
  const max = d.echantillons[0]
  r = texte(ws, r, `• Somme la plus élevée : ${max.echantillon} (${String(nombre(max.somme)).replace('.', ',')} ${d.unite}), BaP-éq ${String(nombre(max.bapEqMin)).replace('.', ',')} à ${String(nombre(max.bapEqMax)).replace('.', ',')} ${d.unite}.`)
  r++
  const series: Serie[] = [
    { nom: '2 cycles', couleur: '#F4B183' },
    { nom: '3 cycles', couleur: '#E69F00' },
    { nom: '4 cycles', couleur: '#9DC3E6' },
    { nom: '5 cycles', couleur: '#2E75B6' },
    { nom: '6 cycles', couleur: '#1F3864' },
  ]
  image(
    wb,
    ws,
    r,
    dessinerBarres(
      'HAP — répartition par nombre de cycles (légers : pétrogéniques ; lourds : pyrolytiques)',
      series,
      d.echantillons.map((l) => ({ libelle: l.echantillon, parts: Object.fromEntries(CLASSES_CYCLES.map((k) => [k, l.somme ? l.parCycles[k] / l.somme : 0])) })),
    ),
  )
}

// ---- Petroleum hydrocarbons and BTEX ----------------------------------------------------

function feuilleHydrocarbures(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const ech = echantillonsRetenus(lecture, opts)
  const hct = diagnosticHCT(lecture, ech)
  const btex = diagnosticBTEX(lecture, ech)
  if (!hct && !btex) return
  const ws = wb.addWorksheet('Hydrocarbures et BTEX', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, `${opts.titre} — hydrocarbures pétroliers et BTEX`, { gras: true, taille: 12, bord: false })
  let r = 3
  if (hct) {
    r = titre(ws, r, 'Hydrocarbures : répartition par classes de carbone')
    r = texte(ws, r, "• Les fractions du laboratoire sont regroupées en quatre classes. Chaque produit pétrolier occupe une plage de nombres de carbone : la classe dominante oriente vers un type de produit, que seul l'examen du chromatogramme par le laboratoire permet de confirmer (les plages se recouvrent).")
    for (const c of CLASSES_HCT) r = texte(ws, r, `     ${c.code} : ${c.produits}`)
    r = texte(ws, r, "• La fraction C5–C10 englobe les BTEX : une remarque signale les échantillons où le benzène en constitue l'essentiel.", { italique: true })
    r = texte(ws, r, `• Fractions retenues : ${hct.fractions.map((f) => `${f.p.nom} → ${f.classe}`).join(' ; ')}. Résultats <LQ comptés pour zéro ; échantillons rangés par total décroissant.`, { italique: true })
    r++
    const colonnes: [string, number][] = [
      ['Échantillon', 18],
      [`Σ fractions quantifiées (${hct.unite})`, 12],
      ...CLASSES_HCT.map((c): [string, number] => [`% ${c.code}`, 10]),
      ['Classe dominante', 12],
      ['Produits typiquement associés', 44],
      ['Remarque', 46],
    ]
    entete(ws, r, colonnes)
    r++
    const r1 = r
    for (const l of hct.echantillons) {
      let c = 1
      ecrire(ws, r, c++, l.echantillon, { gras: true })
      ecrire(ws, r, c++, nombre(l.total), { h: 'center' })
      for (const k of CLASSES_HCT) ecrire(ws, r, c++, l.parClasse[k.code] / l.total, { h: 'center', fmt: '0%' })
      ecrire(ws, r, c++, l.dominante.code, { h: 'center', gras: true, fond: eclaircir(l.dominante.couleur, 0.7) })
      ecrire(ws, r, c++, l.dominante.produits, { taille: 9, wrap: true })
      // The C5–C10 range includes the BTEX: a light fraction that is mostly
      // benzene is not necessarily a gasoline.
      const b = btex?.echantillons.find((x) => x.echantillon === l.echantillon)?.B ?? 0
      const leger = l.parClasse['C5–C10']
      const remarque = l.dominante.code === 'C5–C10' && leger > 0 && b / leger > 0.5 ? `Fraction C5–C10 constituée pour ${Math.round(Math.min(1, b / leger) * 100)} % de benzène : pas nécessairement une essence (autre source de benzène possible).` : ''
      ecrire(ws, r, c++, remarque, { taille: 9, wrap: true, italique: true })
      r++
    }
    barre(ws, r1, r - 1, 2, '#1F3864')
    CLASSES_HCT.forEach((k, i) => barre(ws, r1, r - 1, 3 + i, k.couleur, 1))
    r++
    r = image(
      wb,
      ws,
      r,
      dessinerBarres(
        'Hydrocarbures — répartition par classes de carbone',
        CLASSES_HCT.map((c) => ({ nom: c.code, couleur: c.couleur })),
        hct.echantillons.map((l) => ({ libelle: l.echantillon, parts: Object.fromEntries(CLASSES_HCT.map((k) => [k.code, l.parClasse[k.code] / l.total])) })),
      ),
    )
    r++
  }
  if (btex) {
    r = titre(ws, r, "BTEX : indicateurs d'altération")
    r = texte(ws, r, "• Le benzène et le toluène, plus solubles et plus facilement biodégradés, disparaissent les premiers lorsqu'un produit vieillit dans le milieu. Des rapports B/T et (B+T)/(E+X) élevés traduisent un produit peu altéré (récent ou en zone source) ; des rapports faibles, un produit altéré (dissolution, biodégradation).")
    r = texte(ws, r, "• Indicateurs relatifs, à comparer entre ouvrages d'un même site plutôt qu'à des seuils ; résultats <LQ comptés pour zéro (rapport non calculé si un terme est nul). Une part de benzène élevée signale aussi le composé le plus toxique des BTEX.", { italique: true })
    r++
    const colonnes: [string, number][] = [
      ['Échantillon', 18],
      [`Benzène (${btex.unite})`, 11],
      [`Toluène (${btex.unite})`, 11],
      [`Éthylbenzène (${btex.unite})`, 12],
      [`Xylènes (${btex.unite})`, 11],
      ['B / T', 9],
      ['(B+T) / (E+X)', 10],
      ['Part du benzène dans les BTEX', 12],
    ]
    entete(ws, r, colonnes)
    r++
    const r1 = r
    for (const l of btex.echantillons) {
      const v = (x: number | null) => (x === null ? 'n.a.' : x === 0 ? '<LQ' : nombre(x))
      const cells: (string | number)[] = [l.echantillon, v(l.B), v(l.T), v(l.E), v(l.X), nombre(l.bSurT, 2), nombre(l.btSurEx, 2), l.partBenzene ?? '-']
      cells.forEach((x, j) =>
        ecrire(ws, r, j + 1, x, {
          h: j ? 'center' : 'left',
          gras: j === 0,
          fmt: j === 7 && typeof x === 'number' ? '0%' : undefined,
          couleur: x === '<LQ' ? GRIS_LQ : undefined,
          italique: x === '<LQ',
        }),
      )
      r++
    }
    barre(ws, r1, r - 1, 8, '#C0392B', 1)
  }
}

// ---- ISDI (soils) -------------------------------------------------------------------------

function feuilleISDI(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const res = admissibiliteISDI(lecture, echantillonsRetenus(lecture, opts))
  if (!res) return
  const ws = wb.addWorksheet('Admissibilité ISDI', { views: [{ state: 'frozen', xSplit: 1, ySplit: 7, showGridLines: false }] })
  ecrire(ws, 1, 1, `${opts.titre} — admissibilité en installation de stockage de déchets inertes`, { gras: true, taille: 12, bord: false })
  let r = 2
  r = texte(ws, r, 'Arrêté du 12 décembre 2014, annexe II : test de lixiviation NF EN 12457-2 (mg/kg MS, L/S = 10 l/kg) et contenu total (mg/kg MS). Notes du tableau appliquées : compensation chlorures / sulfates / fraction soluble (1), sulfates par essai de percolation (2), COT sur éluat à pH 7,5–8 (3), COT total supérieur admis pour un sol si le COT sur éluat est conforme.', { italique: true })
  r = texte(ws, r, "Verdict « Incomplet » : un ou plusieurs critères n'ont pas été analysés. L'admissibilité suppose aussi l'absence d'autre contamination (amiante, odeurs, déchets non inertes) et les conditions de l'annexe I et de l'acceptation préalable.", { italique: true })
  r++
  const criteres = res.criteres
  ecrire(ws, r, 1, 'Valeur limite (mg/kg MS)', { gras: true, taille: 9, fond: GRIS_FAMILLE })
  criteres.forEach((c, j) => ecrire(ws, r, j + 2, c.valeur, { gras: true, taille: 9, fond: GRIS_FAMILLE, h: 'center' }))
  r++
  const colonnes: [string, number][] = [['Échantillon', 22], ...criteres.map((c): [string, number] => [c.libelle, 10]), ['Verdict', 17], ['Paramètres déclassants', 30], ['Non analysés', 30], ['Remarques', 60]]
  entete(ws, r, colonnes)
  r++
  for (const v of res.verdicts) {
    ecrire(ws, r, 1, v.echantillon, { gras: true })
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
    ecrire(ws, r, c0, verdict, {
      gras: true,
      h: 'center',
      fond: v.admissible === true ? eclaircir('#00A37E', 0.6) : v.admissible === false ? eclaircir('#C0392B', 0.6) : GRIS_FAMILLE,
    })
    ecrire(ws, r, c0 + 1, v.declassants.join(', ') || '-', { wrap: true, taille: 9 })
    ecrire(ws, r, c0 + 2, v.manquants.join(', ') || '-', { wrap: true, taille: 9 })
    ecrire(ws, r, c0 + 3, v.remarques.join(' ') || '-', { wrap: true, taille: 9 })
    r++
  }
}

// ---- References -----------------------------------------------------------------------------

const REFERENCES: [string, string][] = [
  ['USEPA, 1998, Technical Protocol for Evaluating Natural Attenuation of Chlorinated Solvents in Ground Water, EPA/600/R-98/128 (Wiedemeier et al.)', 'https://pubs.usgs.gov/publication/70207678'],
  ['Bosma T.N.P. et al., 1988, Reductive dechlorination of all trichloro- and dichlorobenzene isomers, FEMS Microbiology Ecology 53', ''],
  ['Yunker M.B. et al., 2002, PAHs in the Fraser River basin: a critical appraisal of PAH ratios as indicators of PAH source and composition, Organic Geochemistry 33, 489-515', ''],
  ['Wang Z., Fingas M., Page D.S., 1999, Oil spill identification, Journal of Chromatography A 843, 369-411 (rapport HAP légers / lourds)', ''],
  ['US EPA, 1993, Provisional Guidance for Quantitative Risk Assessment of Polycyclic Aromatic Hydrocarbons, EPA/600/R-93/089 (HAP du groupe B2)', ''],
  ["INERIS, 2003, HAP — évaluation de la relation dose-réponse pour des effets cancérigènes (rapport INERIS-DRC-03-47026), facteurs d'équivalence toxique", 'https://www.ineris.fr/sites/default/files/contribution/Documents/HAP_4.pdf'],
  ['TPH Criteria Working Group, 1998, Volume 2 — Composition of Petroleum Mixtures (plages de carbone des produits pétroliers)', 'https://www.aehsfoundation.org/tph-working-group-series'],
  ["Arrêté du 12 décembre 2014 relatif aux conditions d'admission des déchets inertes dans les installations relevant des rubriques 2515, 2516, 2517 et 2760, annexe II", 'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000029895647'],
  ["BRGM / INERIS, 2016, Guide pratique pour la caractérisation des gaz du sol et de l'air intérieur (BRGM RP-65870-FR)", 'http://infoterre.brgm.fr/rapports/RP-65870-FR.pdf'],
]

function feuilleReferences(wb: Workbook, opts: OptionsExport) {
  const ws = wb.addWorksheet('Références', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 120
  ws.getColumn(2).width = 70
  ecrire(ws, 1, 1, `${opts.titre} — références des analyses expertes`, { gras: true, taille: 12, bord: false })
  REFERENCES.forEach(([t, url], i) => {
    ecrire(ws, 3 + i, 1, t, { bord: false, wrap: true })
    if (url) {
      const c = ws.getCell(3 + i, 2)
      c.value = { text: url, hyperlink: url }
      c.font = { name: 'Verdana', size: 9, color: { argb: 'FF00756A' }, underline: true }
    }
  })
}

export function ajouterFeuillesExpert(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const echantillons = echantillonsRetenus(lecture, opts)
  const versMicrogrammesM3 = opts.conversion
    ? (p: Parametre, m: Mesure, ech: string) => {
        const c = convertir(m, p, volumeLitres(opts.prelevements[ech] ?? { debitDebut: null, debitFin: null, duree: null }), 'µg/m³')
        return c && !c.inferieur ? c.valeur : null
      }
    : undefined
  const ds = degradations(lecture, echantillons, versMicrogrammesM3)
  const cohv = ds.filter((d) => d.chaine.nom !== 'Chlorobenzènes')
  const cb = ds.filter((d) => d.chaine.nom === 'Chlorobenzènes')
  if (cohv.length) {
    feuilleDechloration(
      wb,
      'Dégradation COHV',
      'état de dégradation des COHV',
      [
        'Les COHV se dégradent par déchloration réductrice, en perdant un chlore à chaque étape : PCE → TCE → DCE → chlorure de vinyle → éthène (et 1,1,1-TCA → 1,1-DCA → chloroéthane). Les concentrations sont converties en moles, base correcte pour comparer un composé à ses produits de dégradation.',
        "Stade de dégradation : lu sur le composé dominant en moles. Couleurs : chaque composé a la sienne ; plus une case de % molaire est foncée, plus le composé pèse dans l'ouvrage.",
        'Nombre de chlore moyen : 4 pour du PCE seul, 1 pour du chlorure de vinyle seul. Plus il baisse, plus la déchloration est avancée. Les ouvrages sont rangés du moins au plus dégradé.',
        "Part des produits de dégradation : moles de tout ce qui n'est pas le composé parent, sur le total.",
        'cis / (cis + trans) DCE : la déchloration biologique produit surtout le cis-1,2-DCE ; une forte part de trans-DCE suggère une autre origine.',
        "Limites : résultats <LQ comptés pour zéro ; l'éthène et l'éthane, produits finaux, ne figurent pas dans le fichier du laboratoire.",
      ],
      CONFIRMATION,
      cohv,
      opts,
    )
  }
  if (cb.length) {
    feuilleDechloration(
      wb,
      'Chlorobenzènes',
      'état de dégradation des chlorobenzènes',
      [
        "Les chlorobenzènes se déchlorent en anaérobie un chlore après l'autre : tri- → dichloro- → monochlorobenzène. Le monochlorobenzène tend à s'accumuler en anaérobie et se dégrade surtout en présence d'oxygène (Bosma et al., 1988).",
        'Concentrations converties en moles ; isomères regroupés (somme des dichlorobenzènes, des trichlorobenzènes). Stade lu sur le groupe dominant en moles ; ouvrages rangés du moins au plus dégradé.',
        "Nombre de chlore moyen : 3 pour des trichlorobenzènes seuls, 1 pour du monochlorobenzène seul. Le benzène, dont la formation par cette voie n'est pas établie, n'est pas compté.",
      ],
      ['Conditions du milieu (oxygène dissous, potentiel redox) : la déchloration des chlorobenzènes très chlorés demande un milieu anaérobie, la dégradation du monochlorobenzène et des dichlorobenzènes est surtout aérobie.'],
      cb,
      opts,
    )
  }
  feuilleHAP(wb, lecture, opts)
  feuilleHydrocarbures(wb, lecture, opts)
  if (!opts.conversion && /sol/i.test(opts.libelleMatrice)) feuilleISDI(wb, lecture, opts)
  feuilleReferences(wb, opts)
}
