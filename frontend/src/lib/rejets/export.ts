/**
 * Excel report of the discharge conformity: summary of the checks, detail
 * measurement by measurement, the data as entered, and the provisions of
 * the arrêté du 2 février 1998 applied.
 */

import type { Workbook, Worksheet } from 'exceljs'
import { BANDEAU, ETAT } from '../resultats/couleurs.ts'
import { ecrire, VERT_ENTETE } from '../resultats/export.ts'
import { LIBELLES_STATUT, type Borne, type Controle, type Donnees, type Statut } from './conformite.ts'
import type { Colonne, Ligne } from './grille.ts'
import { PAR_ID } from './substances.ts'

export interface Rapport {
  titre: string
  donnees: Donnees
  controles: Controle[]
  colonnes: Colonne[]
  lignes: Ligne[]
  /** Context lines, as shown on screen. */
  contexte: [string, string][]
  nonVisees: string[]
  problemes: string[]
}

const COULEURS: Record<Statut, { fond: string; texte: string }> = {
  conforme: ETAT.ok,
  depassement: ETAT.alerte,
  indetermine: ETAT.vigilance,
  'non-soumis': { fond: 'FFEDEDED', texte: 'FF555555' },
  ap: { fond: 'FFE4DCF0', texte: 'FF4B367A' },
  'sans-donnee': { fond: 'FFFFFFFF', texte: 'FF808080' },
}

const nb = (x: number) => Number(x.toPrecision(3))
function borne(b: Borne | null): string | number {
  if (!b) return '-'
  if (b.bas === b.haut || nb(b.bas) === nb(b.haut)) return nb(b.bas)
  return b.bas === 0 ? `<${String(nb(b.haut)).replace('.', ',')}` : `${String(nb(b.bas)).replace('.', ',')} à ${String(nb(b.haut)).replace('.', ',')}`
}

const virgule = (x: string | number) => (typeof x === 'number' ? String(x).replace('.', ',') : x)

function texte(ws: Worksheet, r: number, t: string, o: Parameters<typeof ecrire>[4] = {}) {
  ecrire(ws, r, 1, t, { taille: 9, bord: false, ...o })
  return r + 1
}

function bandeau(ws: Worksheet, r: number, t: string, largeur: number) {
  ws.mergeCells(r, 1, r, largeur)
  ecrire(ws, r, 1, t, { gras: true, fond: BANDEAU.fond, couleur: BANDEAU.texte })
  return r + 1
}

function entetes(ws: Worksheet, r: number, titres: [string, number][]) {
  titres.forEach(([t, l], j) => {
    ws.getColumn(j + 1).width = l
    ecrire(ws, r, j + 1, t, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  })
  ws.getRow(r).height = 32
  return r + 1
}

function feuilleSynthese(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Synthèse', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, rp.titre, { gras: true, taille: 12, bord: false })
  let r = texte(ws, 2, "Conformité au regard de l'arrêté du 2 février 1998 modifié (version consolidée) — valeurs limites générales, hors prescriptions de l'arrêté préfectoral.", { italique: true })
  r++
  for (const [k, v] of rp.contexte) {
    ecrire(ws, r, 1, k, { gras: true, taille: 9, fond: 'FFF2F2F2' })
    ws.mergeCells(r, 2, r, 6)
    ecrire(ws, r++, 2, v, { taille: 9 })
  }
  r++
  const comptes = new Map<Statut, number>()
  for (const c of rp.controles) comptes.set(c.synthese.statut, (comptes.get(c.synthese.statut) ?? 0) + 1)
  r = bandeau(ws, r, 'Bilan', 8)
  for (const s of ['depassement', 'indetermine', 'conforme', 'ap', 'non-soumis'] as Statut[]) {
    ecrire(ws, r, 1, LIBELLES_STATUT[s], { gras: true, taille: 9, fond: COULEURS[s].fond, couleur: COULEURS[s].texte })
    ecrire(ws, r++, 2, comptes.get(s) ?? 0, { h: 'center', gras: true })
  }
  r++
  r = bandeau(ws, r, 'Contrôles', 8)
  r = entetes(ws, r, [
    ['Paramètre', 46],
    ['Référence', 20],
    ['Seuil de flux', 22],
    ['Valeur limite', 30],
    ['Concentration maximale', 16],
    ['Flux maximal', 14],
    ['Conformité', 24],
    ['Commentaire', 60],
  ])
  ws.views = [{ state: 'frozen', ySplit: r - 1, showGridLines: false }]
  const ordre: Statut[] = ['depassement', 'indetermine', 'ap', 'conforme', 'non-soumis', 'sans-donnee']
  for (const c of [...rp.controles].sort((a, b) => ordre.indexOf(a.synthese.statut) - ordre.indexOf(b.synthese.statut))) {
    const evalues = c.mesures.filter((m) => m.concentration)
    const cmax = evalues.length ? { bas: Math.max(...evalues.map((m) => m.concentration!.bas)), haut: Math.max(...evalues.map((m) => m.concentration!.haut)) } : null
    const fs = c.mesures.filter((m) => m.flux)
    const fmax = fs.length ? { bas: Math.max(...fs.map((m) => m.flux!.bas)), haut: Math.max(...fs.map((m) => m.flux!.haut)) } : null
    const col = COULEURS[c.synthese.statut]
    const notes = [...new Set(c.mesures.flatMap((m) => m.notes))]
    ecrire(ws, r, 1, c.libelle, { gras: c.synthese.statut === 'depassement', wrap: true })
    ecrire(ws, r, 2, c.reference, { taille: 9 })
    ecrire(ws, r, 3, c.seuilTexte, { taille: 9, wrap: true })
    ecrire(ws, r, 4, c.vleTexte, { taille: 9, wrap: true })
    ecrire(ws, r, 5, cmax ? `${virgule(borne(cmax))} ${c.unite}` : '-', { h: 'center', taille: 9 })
    ecrire(ws, r, 6, fmax ? `${virgule(borne(fmax))} ${c.uniteFlux}` : '-', { h: 'center', taille: 9 })
    ecrire(ws, r, 7, LIBELLES_STATUT[c.synthese.statut], { gras: true, taille: 9, h: 'center', wrap: true, fond: col.fond, couleur: col.texte })
    ecrire(ws, r, 8, [c.synthese.texte !== LIBELLES_STATUT[c.synthese.statut] ? c.synthese.texte : '', ...notes].filter(Boolean).join(' '), { taille: 8, wrap: true })
    r++
  }
  r++
  if (rp.nonVisees.length) r = texte(ws, r, `Paramètres analysés sans valeur limite générale dans l'arrêté : ${rp.nonVisees.join(', ')}.`, { italique: true })
  if (rp.problemes.length) r = texte(ws, r, `Points à vérifier : ${rp.problemes.join(' ; ')}.`, { italique: true, couleur: ETAT.alerte.texte })
  texte(
    ws,
    r,
    "Cette vérification ne remplace pas l'arrêté préfectoral d'autorisation (ou l'arrêté de prescriptions, l'autorisation de déversement), dont les valeurs, plus strictes le cas échéant, prévalent.",
    { italique: true },
  )
}

function feuilleDetail(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Détail par mesure', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] })
  ecrire(ws, 1, 1, `${rp.titre} — détail par mesure`, { gras: true, taille: 12, bord: false })
  let r = entetes(ws, 3, [
    ['Paramètre', 42],
    ['Référence', 18],
    ['Mesure', 18],
    ['Composantes', 40],
    ['Concentration', 16],
    ['Unité', 9],
    ['Flux mesuré', 14],
    ['Flux retenu pour le seuil', 14],
    ['Unité du flux', 9],
    ['Valeur limite applicable', 12],
    ['Rapport à la valeur limite', 12],
    ['Conformité', 22],
    ['Notes', 60],
  ])
  for (const c of rp.controles) {
    c.mesures.forEach((m, j) => {
      if (m.statut === 'sans-donnee') return
      const col = COULEURS[m.statut]
      const vle = m.vleMin !== undefined && m.vle !== null ? `${m.vleMin} à ${m.vle}` : m.vle !== null ? nb(m.vle) : '-'
      const cellules: (string | number)[] = [
        c.libelle,
        c.reference,
        rp.donnees.mesures[j],
        c.composantes.join(', '),
        borne(m.concentration),
        c.unite,
        borne(m.flux),
        borne(m.fluxRetenu),
        c.uniteFlux,
        vle,
        m.vle && m.concentration && m.vleMin === undefined ? nb(m.concentration.bas / m.vle) : '-',
        LIBELLES_STATUT[m.statut],
        m.notes.join(' '),
      ]
      cellules.forEach((v, k) =>
        ecrire(ws, r, k + 1, v, {
          taille: k === 3 || k === 12 ? 8 : 9,
          wrap: k === 0 || k === 3 || k === 12,
          h: k >= 4 && k <= 11 ? 'center' : undefined,
          fond: k === 11 ? col.fond : undefined,
          couleur: k === 11 ? col.texte : undefined,
          gras: k === 11,
        }),
      )
      r++
    })
  }
}

function feuilleDonnees(wb: Workbook, rp: Rapport) {
  const ws = wb.addWorksheet('Données', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }] })
  ecrire(ws, 1, 1, `${rp.titre} — résultats saisis`, { gras: true, taille: 12, bord: false })
  const titres: [string, number][] = [
    ['Paramètre (laboratoire)', 40],
    ['N° CAS', 12],
    ['Unité', 12],
    ["Substance de l'arrêté", 36],
    ...rp.colonnes.map((c): [string, number] => [c.nom || 'Mesure', 14]),
  ]
  let r = 3
  rp.colonnes.forEach((c, j) => {
    const infos = [c.date && `Date : ${c.date}`, c.volume && `Volume : ${c.volume} l`].filter(Boolean).join(' — ')
    if (infos) ecrire(ws, r, 5 + j, infos, { taille: 8, wrap: true, h: 'center' })
  })
  r = entetes(ws, 4, titres)
  for (const l of rp.lignes) {
    const s = l.substance ? PAR_ID.get(l.substance) : null
    ecrire(ws, r, 1, l.libelle)
    ecrire(ws, r, 2, l.cas || '-', { h: 'center', taille: 9 })
    ecrire(ws, r, 3, l.unite, { h: 'center', taille: 9 })
    ecrire(ws, r, 4, s ? s.nom : l.classe ? `COV non listé (${l.classe})` : '—', { taille: 9, couleur: s ? undefined : 'FF808080' })
    l.valeurs.forEach((v, j) => ecrire(ws, r, 5 + j, v || '-', { h: 'center' }))
    r++
  }
}

const REFERENCES: [string, string][] = [
  [
    'Article 21 III',
    "Effluents aqueux : valeurs limites sur prélèvements moyens de 24 h. Effluents gazeux : mesures d'une durée voisine d'une demi-heure. Autosurveillance permanente (au moins une mesure par jour) : 10 % des résultats peuvent dépasser la valeur limite sans dépasser son double (base mensuelle pour l'eau, 24 h pour l'air). La dilution des effluents est interdite.",
  ],
  ['Article 24', 'Débits et concentrations rapportés à 273 K, 101,3 kPa, gaz secs ; teneur en oxygène de référence fixée par l’arrêté d’autorisation.'],
  ['Article 25', "Rejets dans les sols interdits sauf autorisation ; ne s'applique pas aux eaux issues des traitements d'eaux souterraines polluées encadrés par arrêté préfectoral."],
  [
    'Article 27',
    "Valeurs limites des effluents gazeux selon le flux horaire maximal autorisé : poussières (100 mg/m³ ≤ 1 kg/h, 40 mg/m³ au-delà), SO2 (300 mg/m³ > 25 kg/h), NOx (500 mg/m³ > 25 kg/h), HCl (50 mg/m³ > 1 kg/h), HF (5 mg/m³ > 500 g/h), COV hors méthane (110 mg C/m³ > 2 kg/h ; oxydation : 20 mg C/m³, 50 si rendement > 98 %, et NOx 100, CH4 50, CO 100 mg/m³), COV de l'annexe III (20 mg/m³ > 0,1 kg/h), COV CMR H340/H350/H350i/H360D/H360F (2 mg/m³ ≥ 10 g/h), COV halogénés H341/H351 (20 mg/m³ ≥ 100 g/h), métaux (Cd, Hg, Tl : 0,05 mg/m³ par métal et 0,1 en somme > 1 g/h ; As + Se + Te : 1 mg/m³ > 5 g/h ; Pb : 1 mg/m³ > 10 g/h ; Sb + Cr + Co + Cu + Sn + Mn + Ni + V + Zn : 5 mg/m³ > 25 g/h), phosphine et phosgène (1 mg/m³ > 10 g/h), HCN, HBr, Cl2, H2S (5 mg/m³ > 50 g/h), NH3 (50 mg/m³ > 100 g/h), cancérigènes de l'annexe IV (valeur fixée par l'arrêté préfectoral au-delà de 0,5, 2, 5 ou 25 g/h).",
  ],
  ['Article 28', "Un même polluant rejeté par plusieurs conduits : l'article 27 s'applique à chacun dès que le flux total des rejets canalisés et diffus dépasse le seuil."],
  ['Article 31', 'Température < 30 °C (50 °C pour un raccordement prévu par l’autorisation) ; pH entre 5,5 et 8,5 (9,5 en cas de neutralisation alcaline) ; modification de couleur du milieu ≤ 100 mg Pt/l.'],
  [
    'Article 32',
    "Rejet au milieu naturel selon le flux journalier maximal autorisé : MES (100 mg/l ≤ 15 kg/j, 35 mg/l au-delà, 150 mg/l en lagunage), DBO5 (100 mg/l ≤ 30 kg/j, 15 kg/j pour les eaux de l'article D. 211-10 ; 30 mg/l au-delà), DCO (300 mg/l ≤ 100 kg/j, 50 kg/j pour les eaux de l'article D. 211-10 ; 125 mg/l au-delà), azote global (30 mg/l ≥ 50 kg/j ; zone sensible 15 mg/l ≥ 150 kg/j, 10 mg/l ≥ 300 kg/j), phosphore total (10 mg/l ≥ 15 kg/j ; zone sensible 2 mg/l ≥ 40 kg/j, 1 mg/l > 80 kg/j), en moyenne mensuelle avec 24 h ≤ 2 × VLE ; substances du 3° (indice phénols, cyanures, métaux, AOX, hydrocarbures totaux 10 mg/l > 100 g/j, fluorures) et du 4° (substances de l'état chimique et polluants spécifiques de l'état écologique, 25 à 450 µg/l). Rejet dans le milieu de prélèvement : concentration nette admise sous conditions.",
  ],
  [
    'Article 34',
    "Raccordement à une station d'épuration collective : si le flux peut dépasser 15 kg/j de DBO5 ou 45 kg/j de DCO, MES 600 mg/l, DBO5 800 mg/l, DCO 2 000 mg/l, azote global 150 mg/l, phosphore total 50 mg/l avant raccordement ; station urbaine : autres polluants aux valeurs du rejet au milieu naturel. Sans préjudice de l'autorisation de déversement (article L. 1331-10 du code de la santé publique).",
  ],
  ['Articles 58 à 60', "Programme de surveillance des émissions ; mesures dans l'air au moins annuelles par un organisme agréé ; fréquences de surveillance de l'eau selon les flux."],
]

function feuilleReferences(wb: Workbook) {
  const ws = wb.addWorksheet('Références', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 18
  ws.getColumn(2).width = 120
  ecrire(ws, 1, 1, "Arrêté du 2 février 1998 relatif aux prélèvements et à la consommation d'eau ainsi qu'aux émissions de toute nature des ICPE soumises à autorisation", { gras: true, taille: 11, bord: false })
  ecrire(ws, 2, 1, 'Version consolidée (AIDA, INERIS ; dernières modifications prises en compte : arrêtés du 7 juillet 2023 et du 4 novembre 2024).', { italique: true, taille: 9, bord: false })
  let r = 4
  for (const [a, t] of REFERENCES) {
    ecrire(ws, r, 1, a, { gras: true, taille: 9, fond: VERT_ENTETE })
    ecrire(ws, r, 2, t, { taille: 9, wrap: true })
    ws.getRow(r).height = Math.max(15, Math.ceil(t.length / 150) * 13)
    r++
  }
  r++
  ecrire(ws, r++, 1, 'Méthode de l’outil', { gras: true, taille: 10, bord: false })
  for (const t of [
    "Flux : concentration × débit du rejet (Nm³/h gaz secs pour l'air, m³/j pour l'eau), sauf flux maximal autorisé saisi, auquel les seuils sont alors comparés.",
    'Résultats inférieurs à la LQ : borne basse (LQ comptées 0) et borne haute (LQ comptées pleinement). Conforme si la borne haute respecte la valeur limite, non conforme si la borne basse la dépasse, indéterminé entre les deux.',
    'COV en carbone total : mesure FID si elle est fournie, sinon somme des composés analysés convertis en carbone (borne basse). COV CMR, halogénés H341/H351 et de l’annexe III d’après la classification harmonisée CLP et l’annexe III ; un COV non listé se classe à la main.',
    "Tubes adsorbants : masse totale (zone de mesure + zone de contrôle) rapportée au volume prélevé, saisi en litres aux conditions normales.",
    "Azote global : valeur du laboratoire, sinon azote Kjeldahl + nitrates + nitrites exprimés en N.",
  ])
    r = texte(ws, r, `• ${t}`, { wrap: false })
}

export async function telechargerRapport(rp: Rapport, nomFichier: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ERM SIR Toolbox France'
  feuilleSynthese(wb, rp)
  feuilleDetail(wb, rp)
  feuilleDonnees(wb, rp)
  feuilleReferences(wb)
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
