/**
 * Sheets of the "expert" export: dechlorination of chlorinated solvents and
 * chlorobenzenes, PAH sources and toxicity, petroleum hydrocarbons and BTEX,
 * ISDI admission of soils, and the references these rest on. Each sheet
 * leads with how to read it, colours what matters and ends with a figure.
 */

import type { Workbook, Worksheet } from 'exceljs'
import { dessinerBarres, dessinerComparaison, dessinerProfil, type Serie } from '../barres.ts'
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
import { analyseAmontAval, LECTURES, LIBELLES_POSITION, type Groupe, type Position } from './amontAval.ts'
import { admissibiliteISDI } from './isdi.ts'
import { analyseProfondeur, lireProfil, type SerieProfondeur, type Sondage } from './profondeur.ts'

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

// ---- Groundwater: upgradient versus downgradient ------------------------------------------

const COULEURS_POSITION: Record<Position, string> = { amont: '#2E75B6', droit: '#E69F00', aval: '#C0392B' }

function feuilleAmontAval(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  if (!opts.positions) return
  const a = analyseAmontAval(lecture, echantillonsRetenus(lecture, opts), opts.positions, opts.guides, opts.facteurAmontAval)
  if (!a) return
  const ws = wb.addWorksheet('Amont - aval', { views: [{ showGridLines: false }] })
  const f = virgule(a.facteur)
  ecrire(ws, 1, 1, `${opts.titre} — comparaison amont / aval hydraulique`, { gras: true, taille: 12, bord: false })
  let r = 3
  r = titre(ws, r, 'Comment lire cet onglet')
  r = texte(ws, r, "• Les ouvrages en amont hydraulique représentent la qualité des eaux qui arrivent sur le site, hors de son influence : c'est l'état de référence (milieu témoin) auquel la méthodologie nationale de gestion des sites et sols pollués (2017) compare l'état des milieux. Une contribution du site se traduit par des concentrations plus élevées au droit ou en aval du site qu'en amont.")
  r = texte(ws, r, "• Positions renseignées dans l'outil d'après le sens d'écoulement des eaux souterraines : à vérifier sur la carte piézométrique de la campagne, le sens pouvant varier selon les saisons.")
  r = texte(ws, r, `• Comparaison des maxima : rapport = maximum au droit ou en aval / maximum en amont. Un écart est retenu à partir d'un facteur ${f} (rapport ≥ ${f} : hausse ; ≤ 1/${f} : baisse) ; en deçà, il reste du même ordre que l'incertitude analytique (de l'ordre de 30 % par résultat) et que la variabilité du prélèvement. Ce facteur est une convention d'usage, réglable dans l'outil, pas un seuil réglementaire.`)
  r = texte(ws, r, `• Composé non quantifié en amont : rapport minorant (« > x »), calculé sur la limite de quantification amont ; la contribution du site n'est retenue que si la valeur au droit ou en aval dépasse ${f} fois cette LQ, sinon la lecture est non conclusive (LQ élevée par dilution ou effet de matrice). Même règle pour un composé quantifié en amont seulement. Seules les concentrations sont interprétées (pas le pH, la conductivité ni la température).`)
  r = texte(ws, r, "• Couleurs : rouge = absent en amont, présent au droit ou en aval ; orange = hausse vers l'aval ; violet = produit de dégradation en hausse alors que ses parents baissent ; gris = comparable ; bleu = plus élevé en amont ; gris clair = non conclusif. Valeur grasse sur fond gris : supérieure à la valeur de comparaison. Le nom de l'échantillon où le maximum est atteint figure en commentaire de la cellule.", { italique: true })
  r++

  r = titre(ws, r, 'Réseau de surveillance')
  for (const pos of ['amont', 'droit', 'aval'] as Position[]) {
    r = texte(ws, r, `• ${LIBELLES_POSITION[pos]} : ${a.ouvrages[pos].length ? a.ouvrages[pos].join(', ') : 'aucun'}.`)
  }
  if (a.ouvrages.aval.length < 2) {
    r = texte(ws, r, '• Moins de deux ouvrages en aval : le réseau est en deçà du schéma minimal de surveillance des installations classées (au moins un ouvrage en amont et deux en aval, non alignés — arrêté du 2 février 1998, art. 65). Lecture à conforter.', { gras: true })
  }
  r = texte(ws, r, "• Une campagne isolée donne un état ponctuel : le même écart retrouvé sur plusieurs campagnes, idéalement en hautes et basses eaux, est plus probant. La profondeur des crépines et l'aquifère capté doivent être comparables d'un ouvrage à l'autre.", { italique: true })
  r++

  r = titre(ws, r, 'Synthèse')
  const par = (v: keyof typeof LECTURES) => a.lignes.filter((l) => l.verdict === v)
  const noms = (ls: typeof a.lignes) => ls.map((l) => l.p.nom).join(', ')
  const site = [...par('site'), ...par('hausse')].filter((l) => !l.degradation)
  const filles = a.lignes.filter((l) => l.degradation)
  const pl = (n: number) => (n > 1 ? 's' : '')
  r = texte(ws, r, `• ${a.lignes.length} paramètre${pl(a.lignes.length)} quantifié${pl(a.lignes.length)} dans au moins un ouvrage positionné ; ${a.nonQuantifies} non quantifié${pl(a.nonQuantifies)} nulle part.`)
  if (site.length) r = texte(ws, r, `• Contribution du site probable (${site.length}) : ${noms(site)}.`, { gras: true, couleur: 'FFC0392B' })
  else r = texte(ws, r, '• Aucun paramètre ne montre de hausse marquée au droit ou en aval du site.', { gras: true })
  if (filles.length) r = texte(ws, r, `• Produits de dégradation en hausse alors que leurs composés parents baissent (${filles.length}) : ${noms(filles)}. Signature compatible avec la dégradation d'un panache venu de l'amont, plutôt qu'avec un apport du site ; à confirmer avec l'onglet « Dégradation COHV » et les conditions du milieu.`)
  if (par('comparable').length) r = texte(ws, r, `• Comparables en amont et en aval (${par('comparable').length}) : ${noms(par('comparable'))}.`)
  const ext = [...par('baisse'), ...par('amont-seul')]
  if (ext.length) r = texte(ws, r, `• Apport extérieur au site, depuis l'amont (${ext.length}) : ${noms(ext)}.`)
  if (par('non-conclusif').length) r = texte(ws, r, `• Non conclusifs, limite de quantification trop élevée d'un côté (${par('non-conclusif').length}) : ${noms(par('non-conclusif'))}.`, { couleur: GRIS_LQ })
  const apparait = a.lignes.filter((l) => l.depasseSite && !l.depasseAmont)
  const deja = a.lignes.filter((l) => l.depasseAmont)
  if (apparait.length) r = texte(ws, r, `• Dépassement de la valeur de comparaison apparaissant au droit ou en aval du site : ${noms(apparait)}.`, { gras: true })
  if (deja.length) r = texte(ws, r, `• Valeur de comparaison déjà dépassée en amont (qualité dégradée avant le site) : ${noms(deja)}.`)
  r++

  const colonnes: [string, number][] = [
    ['Paramètre', 30],
    ['Unité', 8],
    [opts.libelleGuide, 13],
    ['Amont : maximum', 11],
    ['Amont : quantifiés / analysés', 11],
    ['Au droit : maximum', 11],
    ['Au droit : quantifiés / analysés', 11],
    ['Aval : maximum', 11],
    ['Aval : quantifiés / analysés', 11],
    ['Rapport (droit ou aval) / amont', 13],
    ['Lecture', 64],
    ['Valeur de comparaison', 34],
  ]
  entete(ws, r, colonnes)
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: r, showGridLines: false }]
  r++
  const cellule = (c: number, g: Groupe, guide: number | null) => {
    if (!g.n) return ecrire(ws, r, c, '-', { h: 'center', couleur: GRIS_LQ })
    if (!g.max) return ecrire(ws, r, c, g.lq === null ? '<LQ' : `<${virgule(Number(g.lq.toPrecision(2)))}`, { h: 'center', italique: true, couleur: GRIS_LQ })
    const depasse = guide !== null && g.max.valeur > guide
    ecrire(ws, r, c, Number(g.max.valeur.toPrecision(3)), { h: 'center', gras: depasse, fond: depasse ? GRIS_DEPASSEMENT : undefined })
    ws.getCell(r, c).note = `Maximum : ${g.max.echantillon}`
  }
  for (const l of a.lignes) {
    let c = 1
    ecrire(ws, r, c++, l.p.nom, { gras: true, taille: 9 })
    ecrire(ws, r, c++, l.p.unite, { h: 'center', taille: 9 })
    ecrire(ws, r, c++, l.guide === null ? '-' : l.guide, { h: 'center', taille: 9 })
    for (const g of [l.amont, l.droit, l.aval]) {
      cellule(c++, g, l.guide)
      ecrire(ws, r, c++, g.n ? `${g.quantifies} / ${g.n}` : '-', { h: 'center', taille: 9, couleur: GRIS_LQ })
    }
    ecrire(ws, r, c++, l.rapport ? `${l.rapport.borne ? '> ' : ''}${virgule(Number(l.rapport.valeur.toPrecision(2)))}` : '-', { h: 'center', gras: true })
    const lec = LECTURES[l.verdict]
    const remarque = l.degradation ? ` — mais ${l.degradation.join(', ')} ${l.degradation.length > 1 ? 'baissent' : 'baisse'} : dégradation d'un panache amont possible` : ''
    ecrire(ws, r, c++, `${lec.libelle}${remarque}`, { taille: 9, wrap: true, fond: eclaircir(l.degradation ? '#B07AA1' : lec.couleur, 0.72) })
    const vg =
      l.guide === null
        ? '-'
        : l.depasseSite && !l.depasseAmont
          ? 'Dépassement apparaissant au droit ou en aval'
          : l.depasseAmont && l.depasseSite
            ? 'Dépassée en amont comme au droit ou en aval'
            : l.depasseAmont
              ? 'Dépassée en amont seulement'
              : 'Respectée'
    ecrire(ws, r, c++, vg, { taille: 9, wrap: true, gras: l.depasseSite && !l.depasseAmont })
    ws.getRow(r).height = l.degradation ? 40 : 26
    r++
  }
  r++
  const representes = (['amont', 'droit', 'aval'] as Position[]).filter((pos) => a.ouvrages[pos].length)
  const enMicro = (g: Groupe, p: Parametre) =>
    !g.n ? null : g.max ? { valeur: g.max.valeur * p.versMicrogrammes, lq: false } : g.lq ? { valeur: g.lq * p.versMicrogrammes, lq: true } : null
  image(
    wb,
    ws,
    r,
    dessinerComparaison(
      'Maximum par position hydraulique (de la plus forte contribution du site à la plus faible)',
      representes.map((pos) => ({ nom: LIBELLES_POSITION[pos], couleur: COULEURS_POSITION[pos] })),
      a.lignes.slice(0, 30).map((l) => ({
        libelle: l.p.nom,
        valeurs: Object.fromEntries(representes.map((pos) => [LIBELLES_POSITION[pos], enMicro(l[pos], l.p)])),
        guide: l.guide === null ? null : l.guide * l.p.versMicrogrammes,
      })),
      'µg/l',
    ),
  )
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
  ["Ministère de la Transition écologique et solidaire, 2017, Méthodologie nationale de gestion des sites et sols pollués (interprétation de l'état des milieux, comparaison au milieu témoin)", 'https://ssp-infoterre.brgm.fr/fr/methodologie/methodologie-nationale-gestion-sites-sols-pollues'],
  ["Arrêté du 2 février 1998 relatif aux prélèvements et à la consommation d'eau ainsi qu'aux émissions de toute nature des installations classées, art. 65 (surveillance des eaux souterraines : au moins un ouvrage en amont et deux en aval)", 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000204891'],
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
  if (!opts.conversion && /eau/i.test(opts.libelleMatrice)) feuilleAmontAval(wb, lecture, opts)
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
  if (!opts.conversion && /sol/i.test(opts.libelleMatrice)) {
    feuilleProfondeur(wb, lecture, opts)
    feuilleISDI(wb, lecture, opts)
  }
  feuilleReferences(wb, opts)
}

// ---- Soil profiles against depth ----------------------------------------------------------

const COULEURS_SONDAGES = ['#1F3864', '#C0392B', '#00A37E', '#E69F00', '#7C3F8F', '#2E75B6', '#8C564B', '#17BECF', '#6B8E23', '#E377C2']

const virgule = (x: number | string) => String(x).replace(/(\d)\.(\d)/g, '$1,$2')
const intervalle = (p: { haut: number; bas: number }) => virgule(p.haut === p.bas ? `${p.haut}` : `${p.haut}-${p.bas}`)

function pointsProfil(serie: SerieProfondeur, sondage: Sondage) {
  return sondage.echantillons.flatMap(({ echantillon, profondeur }) => {
    const v = serie.valeurs[echantillon]
    return v && v.valeur > 0 ? [{ haut: profondeur.haut, bas: profondeur.bas, valeur: v.valeur, lq: v.inferieur }] : []
  })
}

function lectureSerie(serie: SerieProfondeur, sondage: Sondage, guide: number | null) {
  return lireProfil(
    sondage.echantillons.flatMap(({ echantillon, profondeur }) => {
      const v = serie.valeurs[echantillon]
      return v ? [{ echantillon, profondeur, v }] : []
    }),
    guide,
    serie.unite,
  )
}

function imageA(wb: Workbook, ws: Worksheet, r: number, col: number, dessin: ReturnType<typeof dessinerProfil>): number {
  if (!dessin) return 0
  const id = wb.addImage({ base64: dessin.image, extension: 'png' })
  ws.addImage(id, { tl: { col, row: r - 1 }, ext: { width: dessin.largeur, height: dessin.hauteur } })
  return Math.ceil(dessin.hauteur / 20) + 1
}

function feuilleProfondeur(wb: Workbook, lecture: Lecture, opts: OptionsExport) {
  const a = analyseProfondeur(lecture, echantillonsRetenus(lecture, opts), opts.guides)
  if (!a) return
  const ws = wb.addWorksheet('Profils en profondeur', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 16
  for (let c = 2; c <= 24; c++) ws.getColumn(c).width = 12
  ecrire(ws, 1, 1, `${opts.titre} — évolution des concentrations avec la profondeur`, { gras: true, taille: 12, bord: false })
  let r = 3
  r = titre(ws, r, 'Comment lire cet onglet')
  r = texte(
    ws,
    r,
    `• Sondage et profondeur lus dans le nom des échantillons, par exemple « MW6 (4-4,5) » : sondage MW6, prélevé de 4 à 4,5 m. ${a.sondages.length} sondage${a.sondages.length > 1 ? 's' : ''} avec au moins deux profondeurs : ${a.sondages.map((s) => `${s.nom} (${s.echantillons.length} échantillons)`).join(', ')}.`,
  )
  r = texte(ws, r, '• Graphiques : profondeur vers le bas, concentration en échelle logarithmique (les résultats couvrent plusieurs ordres de grandeur). Point plein : résultat quantifié ; point creux : inférieur à la LQ, placé à la LQ ; trait vertical : intervalle prélevé.')
  r = texte(ws, r, "• Familles : total du laboratoire lorsqu'il est fourni (BTEX totaux, hydrocarbures C10-C40…), sinon somme des composés quantifiés. Tendance : corrélation de rang de Spearman entre profondeur et concentration (|ρ| ≥ 0,5 retenu comme tendance).")
  r = texte(ws, r, "• Extension verticale : un composé encore quantifié, ou encore au-dessus de la valeur de comparaison, au fond d'un sondage n'est pas délimité en profondeur.", { gras: true })
  r++

  // 1. Key compound, all boreholes together, reading on the right.
  if (a.cle) {
    const cle = a.cle
    r = bandeau(ws, r, `Composé clé : ${cle.parametre.nom}`, 16)
    r = texte(ws, r, `Retenu comme composé clé pour son ${virgule(cle.raison)}.`)
    if (a.suivants.length) r = texte(ws, r, `Autres composés marqués : ${a.suivants.map((s) => `${s.nom} (${s.score})`).join(' ; ')}.`, { italique: true })
    r++
    const hauteurImage = imageA(
      wb,
      ws,
      r,
      0,
      dessinerProfil(
        `${cle.parametre.nom} — profil par sondage`,
        a.sondages.map((s, i) => ({ nom: s.nom, couleur: COULEURS_SONDAGES[i % COULEURS_SONDAGES.length], points: pointsProfil(cle.serie, s) })),
        cle.serie.unite,
        cle.guide !== null ? { valeur: cle.guide, libelle: `Valeur de comparaison ${virgule(Number(cle.guide.toPrecision(3)))}` } : null,
      ),
    )
    let rt = r
    for (const s of a.sondages) {
      const l = lectureSerie(cle.serie, s, cle.guide)
      ecrire(ws, rt++, 9, `Sondage ${s.nom}`, { gras: true, bord: false })
      if (l.max) ecrire(ws, rt++, 9, `• Maximum : ${virgule(Number(l.max.valeur.toPrecision(3)))} ${cle.serie.unite} à ${intervalle(l.max.profondeur)} m.`, { taille: 9, bord: false })
      for (const t of [l.tendance, l.extension, l.depassement]) if (t) ecrire(ws, rt++, 9, `• ${t}`, { taille: 9, bord: false })
      rt++
    }
    r += Math.max(hauteurImage, rt - r) + 1
  }

  // 2. Per borehole: families and key compound, chart, table, reading.
  for (const s of a.sondages) {
    r = bandeau(ws, r, `Sondage ${s.nom} — profil par famille`, 16)
    const series = [...a.familles, ...(a.cle ? [a.cle.serie] : [])]
    const hauteurImage = imageA(
      wb,
      ws,
      r,
      0,
      dessinerProfil(
        `${s.nom} — familles de composés et composé clé`,
        series.map((x) => ({ nom: x.nom, couleur: x.couleur, points: pointsProfil(x, s) })).filter((x) => x.points.length),
        'mg/kg MS',
      ),
    )
    const c0 = 9
    const colonnes: [string, number][] = [['Profondeur (m)', 12], ...series.map((x): [string, number] => [`${x.nom} (mg/kg MS)`, 12])]
    entete(ws, r, colonnes, c0)
    let rt = r + 1
    const r1 = rt
    for (const { echantillon, profondeur } of s.echantillons) {
      ecrire(ws, rt, c0, intervalle(profondeur).replace('-', ' – '), { h: 'center', gras: true })
      series.forEach((x, j) => {
        const v = x.valeurs[echantillon]
        ecrire(ws, rt, c0 + 1 + j, !v ? '-' : v.inferieur ? `<${virgule(Number(v.valeur.toPrecision(2)))}` : Number(v.valeur.toPrecision(3)), {
          h: 'center',
          italique: !!v?.inferieur,
          couleur: v?.inferieur ? GRIS_LQ : undefined,
        })
      })
      rt++
    }
    series.forEach((x, j) => {
      const l = ws.getColumn(c0 + 1 + j).letter
      ws.addConditionalFormatting({
        ref: `${l}${r1}:${l}${rt - 1}`,
        rules: [
          {
            type: 'colorScale',
            priority: 1,
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: [{ argb: 'FFFFFFFF' }, { argb: eclaircir(x.couleur, 0.35) }],
          },
        ],
      })
    })
    rt++
    ecrire(ws, rt++, c0, 'Lecture', { gras: true, bord: false })
    for (const x of series) {
      const l = lectureSerie(x, s, x === a.cle?.serie ? a.cle.guide : null)
      const morceaux = [l.max ? `Maximum à ${intervalle(l.max.profondeur)} m.` : null, l.tendance, l.extension, l.depassement].filter(Boolean).join(' ')
      ecrire(ws, rt++, c0, `• ${x.nom} : ${morceaux}`, { taille: 9, bord: false })
    }
    r += Math.max(hauteurImage, rt - r) + 2
  }
}
