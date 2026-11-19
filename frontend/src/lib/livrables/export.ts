/**
 * Excel report of a deliverable check: summary, every checkpoint with the
 * tool's reading, the reader's decision and comment, its sources as links.
 */

import type { Worksheet } from 'exceljs'
import { ETAT } from '../resultats/couleurs.ts'
import { ecrire, VERT_ENTETE } from '../resultats/export.ts'
import { GROUPE_MARQUE, nonConforme, portee, type Portee, type Referentiel, type Resultat, type Source, type Statut } from './controles.ts'
import type { Document } from './extraction.ts'
import { telechargerClasseurExcel } from '../fichiers.ts'

const LIBELLES: Record<Statut, string> = { present: 'Trouvé', absent: 'Absent', invalide: 'À corriger', 'a-verifier': 'À vérifier', 'sans-objet': 'Sans objet' }
const COULEURS: Record<Statut, { fond: string; texte: string }> = {
  present: ETAT.ok,
  absent: ETAT.alerte,
  invalide: ETAT.alerte,
  'a-verifier': ETAT.vigilance,
  'sans-objet': { fond: 'FFEDEDED', texte: 'FF555555' },
}

const PORTEES: Record<Portee, { libelle: string; nc: string; fond: string; texte: string }> = {
  exigence: { libelle: 'Exigence', nc: 'Exigences non satisfaites', ...ETAT.alerte },
  'bonne-pratique': { libelle: 'Bonne pratique', nc: 'Bonnes pratiques non suivies', ...ETAT.vigilance },
  marque: { libelle: 'Marque LNE SSP', nc: 'Points sur l’usage de la marque LNE SSP (moins critiques)', fond: 'FFEDEDED', texte: 'FF555555' },
}

export interface RapportVerification {
  referentiel: Referentiel
  documents: Document[]
  resultats: Resultat[]
  statut: (r: Resultat) => Statut
}

function lien(ws: Worksheet, r: number, c: number, s: Source) {
  if (!s.url) {
    ecrire(ws, r, c, s.libelle, { taille: 8, wrap: true })
    return
  }
  const cell = ecrire(ws, r, c, s.libelle, { taille: 8, wrap: true, couleur: 'FF1F4E79', souligne: true })
  cell.value = { text: s.libelle, hyperlink: s.url }
}

export async function telechargerVerification(rp: RapportVerification, nomFichier: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ERM SIR Toolbox France'
  const ws = wb.addWorksheet('Vérification', { views: [{ showGridLines: false }] })
  ecrire(ws, 1, 1, `Vérification ${rp.referentiel.titre} — ${rp.documents.map((d) => d.nom).join(' + ')}`, { gras: true, taille: 12, bord: false })
  ecrire(ws, 2, 1, `${rp.referentiel.description} Vérifié le ${new Date().toLocaleDateString('fr-FR')} avec SIR Toolbox France.`, { italique: true, taille: 9, bord: false })
  let r = 4
  const comptes = new Map<Statut, number>()
  for (const x of rp.resultats) comptes.set(rp.statut(x), (comptes.get(rp.statut(x)) ?? 0) + 1)
  for (const po of ['exigence', 'bonne-pratique', 'marque'] as Portee[]) {
    const n = rp.resultats.filter((x) => portee(x.point) === po && nonConforme(rp.statut(x))).length
    ecrire(ws, r, 1, PORTEES[po].nc, { gras: true, taille: 9, fond: PORTEES[po].fond, couleur: PORTEES[po].texte })
    ecrire(ws, r++, 2, n, { h: 'center', gras: true })
  }
  r++
  for (const s of ['invalide', 'absent', 'a-verifier', 'present', 'sans-objet'] as Statut[]) {
    ecrire(ws, r, 1, LIBELLES[s], { gras: true, taille: 9, fond: COULEURS[s].fond, couleur: COULEURS[s].texte })
    ecrire(ws, r++, 2, comptes.get(s) ?? 0, { h: 'center', gras: true })
  }
  r++
  const titres: [string, number][] = [
    ['Rubrique', 22],
    ['Point de contrôle', 40],
    ['Niveau', 12],
    ['Lecture de l’outil', 13],
    ['Décision du vérificateur', 13],
    ['Statut retenu', 13],
    ['Exigence', 55],
    ['Constat', 45],
    ['Passages trouvés', 55],
    ['Comment trouver ou corriger', 50],
    ['Proposition d’ajout : paragraphe', 40],
    ['Proposition d’ajout : exemple de phrase ([…] à compléter)', 60],
    ['Commentaire', 35],
    ['Sources', 45],
  ]
  titres.forEach(([t, l], j) => {
    ws.getColumn(j + 1).width = l
    ecrire(ws, r, j + 1, t, { gras: true, taille: 9, fond: VERT_ENTETE, h: 'center', wrap: true })
  })
  ws.views = [{ state: 'frozen', ySplit: r, showGridLines: false }]
  r++
  // The points on the LNE mark, the least critical, gathered at the end.
  const lignes = [...rp.resultats].sort((a, b) => Number(portee(a.point) === 'marque') - Number(portee(b.point) === 'marque'))
  for (const x of lignes) {
    const st = rp.statut(x)
    const po = portee(x.point)
    const ajout = nonConforme(st) && x.proposition
    const vals: (string | number)[] = [
      po === 'marque' ? GROUPE_MARQUE : x.point.groupe,
      x.point.intitule,
      PORTEES[po].libelle,
      LIBELLES[x.verdict.statut],
      x.decision === 'conforme' ? 'Conforme' : x.decision === 'non-conforme' ? 'Non conforme' : x.decision === 'sans-objet' ? 'Sans objet' : '-',
      LIBELLES[st],
      x.point.exigence,
      x.verdict.detail ?? '',
      (x.verdict.extraits ?? []).map((e) => `${e.document ? `${e.document}, ` : ''}p. ${e.page} : « ${e.texte} »`).join('\n'),
      st === 'present' || st === 'sans-objet' ? '' : x.point.aide,
      ajout ? x.proposition!.paragraphe : '',
      ajout ? `${x.proposition!.modele ? 'Formulation du modèle : ' : ''}« ${x.proposition!.phrase} »` : '',
      x.commentaire,
    ]
    // A gap takes the colour of what it fails: requirement, good practice, mark.
    const teinte = nonConforme(st) ? PORTEES[po] : { fond: COULEURS[st].fond, texte: COULEURS[st].texte }
    vals.forEach((v, j) =>
      ecrire(ws, r, j + 1, v, {
        taille: 8,
        wrap: true,
        gras: j === 1 || j === 5 || (j === 2 && po === 'exigence'),
        fond: j === 5 ? teinte.fond : j === 2 && nonConforme(st) ? PORTEES[po].fond : undefined,
        couleur: j === 5 ? teinte.texte : j === 2 && nonConforme(st) ? PORTEES[po].texte : undefined,
        h: j >= 2 && j <= 5 ? 'center' : undefined,
      }),
    )
    // One source per line in the last column; the first as a link.
    const [premiere, ...autres] = x.point.sources
    if (premiere) lien(ws, r, 14, premiere)
    if (autres.length) ws.getCell(r, 14).note = autres.map((s) => (s.url ? `${s.libelle} : ${s.url}` : s.libelle)).join('\n')
    r++
  }
  r++
  ecrire(ws, r++, 1, 'Limites', { gras: true, taille: 9, bord: false })
  for (const l of rp.referentiel.limites) ecrire(ws, r++, 1, `• ${l}`, { taille: 8, bord: false })

  const wsS = wb.addWorksheet('Sources', { views: [{ showGridLines: false }] })
  wsS.getColumn(1).width = 80
  wsS.getColumn(2).width = 90
  ecrire(wsS, 1, 1, 'Sources officielles citées', { gras: true, taille: 12, bord: false })
  const vues = new Map<string, Source>()
  for (const s of [...rp.referentiel.cadre, ...rp.resultats.flatMap((x) => x.point.sources)]) vues.set(s.url || s.libelle, s)
  let k = 3
  for (const s of vues.values()) {
    ecrire(wsS, k, 1, s.libelle, { taille: 9 })
    if (!s.url) {
      ecrire(wsS, k++, 2, 'Pas de page publique (norme AFNOR)', { taille: 9, italique: true })
      continue
    }
    const c = ecrire(wsS, k++, 2, s.url, { taille: 9, couleur: 'FF1F4E79', souligne: true })
    c.value = { text: s.url, hyperlink: s.url }
  }

  await telechargerClasseurExcel(wb, nomFichier)
}
