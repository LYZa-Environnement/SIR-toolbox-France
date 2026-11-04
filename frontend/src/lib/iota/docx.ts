/**
 * The three Word documents of an IOTA declaration, laid out like the ERM
 * reports (Issoudun, 2025): cover page with the ERM logo, the project
 * director and manager, the Paris and Lyon offices and the "Références du
 * document" table; a running header with the document title and the current
 * chapter; a footer with client, report number, version, date and page;
 * table of contents, figures and appendices.
 *
 * - Étude d'incidence: the document d'incidences of R. 214-32 II, with the
 *   declarant, site and nomenclature pieces (1° to 3°), and a table matching
 *   each item of the article to its section.
 * - Évaluation des incidences Natura 2000 (R. 214-32 II 5° d, R. 414-23).
 * - Résumé non technique (R. 214-32 II 4°).
 *
 * Text conventions (see redaction.ts): blank line between paragraphs, "• "
 * bullets, **bold**, and "[À compléter : …]" highlighted in yellow.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
} from 'docx'
import { cardinalLabelFr, toLambert93 } from '../geo'
import { estNatura } from './contexte'
import { completude } from './completude'
import { LIBELLE_MAITRISE, LIBELLE_STATUT, LIBELLE_TYPE, syntheseDossier, type Dossier, type SectionId } from './modele'
import { LIBELLE_REGIME } from './nomenclature'
import { A_COMPLETER, departement, distance, sousTitre, texte } from './redaction'

const VERT = '009820'
const GRIS = '595959'
const ENTETE_TABLEAU = 'DCE6DA'
const LARGEUR = 9638 // A4 width minus 2 × 2 cm margins, in twips
const POLICE = 'Verdana'
const POLICE_TITRE = 'Cambria'

type Bloc = Paragraph | Table | TableOfContents

interface Logos {
  grand: Uint8Array | null
  petit: Uint8Array | null
}

interface Chapitre {
  titre: string
  blocs: Bloc[]
}

interface Meta {
  titre: string
  sousTitre: string
  client: string
  gms: string
  version: string
  date: string
  auteurs: string
  declarant: string
  directeur: [string, string]
  chef: [string, string]
}

// ---- Text --------------------------------------------------------------------------

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function dateLongue(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`
}

/** Inline runs: **bold** and highlighted placeholders. */
function runs(t: string, o: { gras?: boolean; taille?: number; couleur?: string; italique?: boolean } = {}): TextRun[] {
  const out: TextRun[] = []
  for (const morceau of t.split(/(\*\*[^*]+\*\*|\[À compléter[^\]]*\])/)) {
    if (!morceau) continue
    const gras = morceau.startsWith('**') && morceau.endsWith('**')
    const trou = morceau.startsWith('[À compléter')
    const s = gras ? morceau.slice(2, -2) : morceau
    const lignes = s.split('\n')
    lignes.forEach((l, i) =>
      out.push(
        new TextRun({
          text: l,
          break: i > 0 ? 1 : undefined,
          bold: o.gras || gras,
          italics: o.italique,
          size: o.taille,
          color: trou ? '7F6000' : o.couleur,
          highlight: trou ? 'yellow' : undefined,
        }),
      ),
    )
  }
  return out
}

function para(t: string, o: IParagraphOptions = {}, r: Parameters<typeof runs>[1] = {}): Paragraph {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 276 }, ...o, children: runs(t, r) })
}

/** A section text: paragraphs, bullets, numbered lines. */
function corps(t: string): Paragraph[] {
  const blocs = t
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  const puce = (b: string | undefined) => !!b && (b.startsWith('• ') || b.startsWith('- '))
  return blocs
    // The last bullet of a list closes the sentence.
    .map((b, i) => (puce(b) && !puce(blocs[i + 1]) ? b.replace(/\s*;$/, '.') : b))
    .map((b) => {
      if (b.startsWith('• ') || b.startsWith('- ')) return para(b.slice(2), { bullet: { level: 0 }, spacing: { after: 60, line: 276 } })
      if (/^\d+\.\s/.test(b)) return para(b, { indent: { left: 360 }, spacing: { after: 60, line: 276 } })
      return para(b)
    })
}

interface Entree {
  title: string
  level: number
}

class Titres {
  entrees: Entree[] = []
  h1(t: string): Paragraph {
    this.entrees.push({ title: t, level: 1 })
    return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 240 }, children: [new TextRun({ text: t.toUpperCase() })] })
  }
  h2(t: string): Paragraph {
    this.entrees.push({ title: t, level: 2 })
    return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, keepNext: true, children: [new TextRun({ text: t.toUpperCase() })] })
  }
  h3(t: string): Paragraph {
    this.entrees.push({ title: t, level: 3 })
    return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 100 }, keepNext: true, children: [new TextRun({ text: t.toUpperCase() })] })
  }
}

// ---- Tables ------------------------------------------------------------------------

const BORD = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }
const BORDS = { top: BORD, bottom: BORD, left: BORD, right: BORD, insideHorizontal: BORD, insideVertical: BORD }
const SANS = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const SANS_BORDS = { top: SANS, bottom: SANS, left: SANS, right: SANS, insideHorizontal: SANS, insideVertical: SANS }

function cellule(t: string, o: { entete?: boolean; largeur: number; gras?: boolean; fond?: string; taille?: number }): TableCell {
  return new TableCell({
    width: { size: o.largeur, type: WidthType.DXA },
    shading: o.entete || o.fond ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fond ?? ENTETE_TABLEAU } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    verticalAlign: VerticalAlign.CENTER,
    children: t
      .split('\n')
      .map((l) => new Paragraph({ spacing: { after: 0, line: 252 }, children: runs(l, { gras: o.entete || o.gras, taille: o.taille ?? 16 }) })),
  })
}

/** Widths in fractions of the text width. */
function tableau(entetes: string[] | null, lignes: string[][], parts: number[]): Table {
  const total = parts.reduce((a, b) => a + b, 0)
  const largeurs = parts.map((p) => Math.round((p / total) * LARGEUR))
  const rows: TableRow[] = []
  if (entetes) rows.push(new TableRow({ tableHeader: true, children: entetes.map((e, j) => cellule(e, { entete: true, largeur: largeurs[j] })) }))
  for (const l of lignes) rows.push(new TableRow({ cantSplit: true, children: l.map((c, j) => cellule(c, { largeur: largeurs[j] })) }))
  return new Table({ rows, width: { size: LARGEUR, type: WidthType.DXA }, columnWidths: largeurs, borders: BORDS })
}

/** Two-column label / value table, labels shaded. */
function fiche(lignes: [string, string][]): Table {
  const l = [Math.round(LARGEUR * 0.32), LARGEUR - Math.round(LARGEUR * 0.32)]
  return new Table({
    width: { size: LARGEUR, type: WidthType.DXA },
    columnWidths: l,
    borders: BORDS,
    rows: lignes.map(([k, v]) => new TableRow({ cantSplit: true, children: [cellule(k, { largeur: l[0], fond: 'F2F2F2', gras: true }), cellule(v || '-', { largeur: l[1] })] })),
  })
}

const espace = () => new Paragraph({ spacing: { after: 120 }, children: [] })

// ---- Page furniture ------------------------------------------------------------------

function entete(meta: Meta, chapitre: string): Header {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: LARGEUR }],
        spacing: { after: 360 },
        children: [
          new TextRun({ text: meta.titre.toUpperCase(), size: 14, color: GRIS }),
          new TextRun({ text: '\t' }),
          new TextRun({ text: chapitre.toUpperCase(), size: 14, color: GRIS }),
        ],
      }),
    ],
  })
}

function pied(meta: Meta, logos: Logos): Footer {
  const logo = logos.petit
    ? [new ImageRun({ type: 'jpg', data: logos.petit, transformation: { width: 50, height: 20 } }), new TextRun({ text: '\t' })]
    : [new TextRun({ text: 'ERM', bold: true, color: VERT, size: 22 }), new TextRun({ text: '\t' })]
  const p = (children: (TextRun | ImageRun)[]) =>
    new Paragraph({
      tabStops: [
        { type: TabStopType.LEFT, position: 1000 },
        { type: TabStopType.LEFT, position: 6000 },
        { type: TabStopType.RIGHT, position: LARGEUR },
      ],
      spacing: { after: 0 },
      children,
    })
  return new Footer({
    children: [
      p([...logo, new TextRun({ text: `CLIENT : ${meta.client.toUpperCase()}`, size: 12, color: GRIS })]),
      p([
        new TextRun({ text: '\t', size: 12 }),
        new TextRun({ text: `RAPPORT N° : ${meta.gms || '…'}, VERSION : ${meta.version}`, size: 12, color: GRIS }),
        new TextRun({ text: `\tDATE : ${dateLongue(meta.date)}`, size: 12, color: GRIS }),
        new TextRun({ children: ['\tPage ', PageNumber.CURRENT], size: 12, color: GRIS }),
      ]),
    ],
  })
}

function couverture(meta: Meta, logos: Logos): Bloc[] {
  const moitie = LARGEUR / 2
  const colonnes = (g: Paragraph[], d: Paragraph[], bord = false) =>
    new Table({
      width: { size: LARGEUR, type: WidthType.DXA },
      columnWidths: [moitie, moitie],
      borders: SANS_BORDS,
      rows: [
        new TableRow({
          children: [g, d].map(
            (children) =>
              new TableCell({
                width: { size: moitie, type: WidthType.DXA },
                borders: bord ? { top: { style: BorderStyle.SINGLE, size: 8, color: '000000' }, bottom: SANS, left: SANS, right: SANS } : undefined,
                margins: { top: 80, right: 300 },
                children,
              }),
          ),
        }),
      ],
    })
  const ligne = (t: string, gras = false, couleur?: string) => new Paragraph({ spacing: { after: 0, line: 252 }, children: [new TextRun({ text: t, bold: gras, size: 15, color: couleur })] })
  return [
    logos.grand
      ? new Paragraph({ spacing: { after: 600 }, children: [new ImageRun({ type: 'jpg', data: logos.grand, transformation: { width: 190, height: 74 } })] })
      : new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: 'ERM', bold: true, size: 72, color: VERT })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: meta.titre, font: POLICE_TITRE, size: 44 })] }),
    new Paragraph({ spacing: { after: 1400 }, children: [new TextRun({ text: meta.sousTitre, font: POLICE_TITRE, size: 22 })] }),
    colonnes([ligne(meta.directeur[0] || A_COMPLETER('directeur de projet'), true), ligne(meta.directeur[1])], [ligne(meta.chef[0] || A_COMPLETER('chef de projet'), true), ligne(meta.chef[1])], true),
    new Paragraph({ spacing: { before: 300, after: 200 }, children: [new TextRun({ text: 'ERM France', bold: true, size: 15, color: VERT })] }),
    colonnes(
      [ligne('ERM PARIS', true), ligne('13 rue Faidherbe'), ligne('75011 PARIS'), ligne('FRANCE'), ligne('T +33 1 53 24 10 30')],
      [ligne('ERM LYON', true), ligne('Immeuble Le Daytona'), ligne('4 chemin du Tronchon'), ligne('69410 CHAMPAGNE AU MONT D’OR'), ligne('FRANCE'), ligne('T +33 1 78 96 41 00')],
    ),
    new Paragraph({ spacing: { before: 900, after: 120 }, children: [new TextRun({ text: 'RÉFÉRENCES DU DOCUMENT', size: 16, color: VERT })] }),
    new Table({
      width: { size: LARGEUR, type: WidthType.DXA },
      columnWidths: [Math.round(LARGEUR * 0.32), LARGEUR - Math.round(LARGEUR * 0.32)],
      borders: BORDS,
      rows: (
        [
          ['TITRE DU DOCUMENT', meta.titre, true],
          ['SOUS-TITRE DU DOCUMENT', meta.sousTitre, false],
          ['GMS', meta.gms || A_COMPLETER('numéro de projet'), false],
          ['Date', dateLongue(meta.date), false],
          ['Version', meta.version, false],
          ['Auteur', meta.auteurs || A_COMPLETER('auteurs'), false],
          ['Nom du Déclarant', meta.declarant, false],
        ] as [string, string, boolean][]
      ).map(
        ([k, v, tete]) =>
          new TableRow({
            children: [
              cellule(k, { largeur: Math.round(LARGEUR * 0.32), fond: tete ? ENTETE_TABLEAU : undefined, gras: tete }),
              cellule(v, { largeur: LARGEUR - Math.round(LARGEUR * 0.32), fond: tete ? ENTETE_TABLEAU : undefined, gras: tete }),
            ],
          }),
      ),
    }),
    new Paragraph({
      spacing: { before: 60 },
      children: [
        new TextRun({ text: `Copyright ${meta.date.slice(0, 4)} by ERM Worldwide Group Ltd and / or its affiliates (“ERM”).`, size: 10, color: GRIS }),
        new TextRun({ text: 'All rights reserved. No part of this work may be reproduced or transmitted in any form, or by any means, without the prior written permission of ERM', size: 10, color: GRIS, break: 1 }),
      ],
    }),
  ]
}

function derniere(): Bloc[] {
  const l = (t: string, gras = false) => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: t, bold: gras, size: 16 })] })
  return [
    new Paragraph({ spacing: { before: 4000, after: 240 }, children: [new TextRun({ text: 'ERM POSSÈDE PLUS DE 160 BUREAUX RÉPARTIS DANS LE MONDE', bold: true, size: 16, color: VERT })] }),
    l('ERM PARIS - FRANCE', true),
    l('13 rue Faidherbe, 75011 PARIS'),
    l('T : 01.53.24.10.30'),
    espace(),
    l('ERM LYON - FRANCE', true),
    l('Immeuble Le Daytona, 4 chemin du Tronchon, 69410 CHAMPAGNE AU MONT D’OR'),
    l('T : 01.78.96.41.00'),
    espace(),
    l('www.erm.com'),
  ]
}

function listes(figures: string[], annexes: string[]): Bloc[] {
  const b: Bloc[] = []
  if (figures.length) {
    b.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [new TextRun({ text: 'FIGURES', bold: true, color: VERT })] }))
    figures.forEach((f, i) => b.push(new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 1400 }], spacing: { after: 40 }, children: [new TextRun({ text: `Figure ${i + 1}\t${f}`, size: 17 })] })))
  }
  if (annexes.length) {
    b.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [new TextRun({ text: 'ANNEXES', bold: true, color: VERT })] }))
    annexes.forEach((a, i) => b.push(new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 1400 }], spacing: { after: 40 }, children: [new TextRun({ text: `Annexe ${String.fromCharCode(65 + i)}\t${a}`, size: 17 })] })))
  }
  return b
}

/** One page per figure, with a frame where the cartographer's figure goes. */
function pagesFigures(figures: string[], nomDoc: string): Bloc[] {
  const b: Bloc[] = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'FIGURES' })] })]
  figures.forEach((f, i) => {
    b.push(new Paragraph({ children: i ? [new PageBreak()] : [] }))
    b.push(
      new Table({
        width: { size: LARGEUR, type: WidthType.DXA },
        columnWidths: [LARGEUR],
        borders: BORDS,
        rows: [
          new TableRow({
            height: { value: 9000, rule: 'atLeast' },
            children: [
              new TableCell({
                width: { size: LARGEUR, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: runs(`Figure ${i + 1} : ${f}`, { gras: true }) }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: runs(`${A_COMPLETER('insérer la figure')}`) }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${nomDoc}`, size: 14, color: GRIS })] }),
                ],
              }),
            ],
          }),
        ],
      }),
    )
  })
  return b
}

function pagesAnnexes(annexes: string[]): Bloc[] {
  const b: Bloc[] = []
  annexes.forEach((a, i) => {
    b.push(new Paragraph({ children: i ? [new PageBreak()] : [] }))
    b.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 4000 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `ANNEXE ${String.fromCharCode(65 + i)}` })] }))
    b.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: a.toUpperCase(), size: 22 })] }))
  })
  return b
}

function assembler(meta: Meta, logos: Logos, chapitres: Chapitre[], titres: Titres, figures: string[], annexes: string[], nomDoc: string): Document {
  const marges = { top: 1300, bottom: 1300, left: 1134, right: 1134, header: 567, footer: 450 }
  const page = { size: { width: 11906, height: 16838 }, margin: marges }
  const premier = chapitres[0]?.titre ?? ''
  const sections = [
    { properties: { page }, footers: { default: pied(meta, logos) }, children: couverture(meta, logos) },
    {
      properties: { page },
      headers: { default: entete(meta, premier) },
      footers: { default: pied(meta, logos) },
      children: [
        new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: 'TABLE DES MATIÈRES', bold: true, color: VERT })] }),
        new TableOfContents('Table des matières', { hyperlink: true, headingStyleRange: '1-3', cachedEntries: titres.entrees }),
        ...listes(figures, annexes),
      ],
    },
    ...chapitres.map((c) => ({ properties: { page }, headers: { default: entete(meta, c.titre) }, footers: { default: pied(meta, logos) }, children: c.blocs })),
  ]
  if (figures.length) sections.push({ properties: { page }, headers: { default: entete(meta, 'Figures') }, footers: { default: pied(meta, logos) }, children: pagesFigures(figures, nomDoc) })
  if (annexes.length) sections.push({ properties: { page }, headers: { default: entete(meta, 'Annexes') }, footers: { default: pied(meta, logos) }, children: pagesAnnexes(annexes) })
  sections.push({ properties: { page }, footers: { default: pied(meta, logos) }, children: derniere() })
  return new Document({
    creator: 'ERM — SIR Toolbox France',
    title: meta.titre,
    description: meta.sousTitre,
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: POLICE, size: 19 }, paragraph: { spacing: { after: 120 } } },
        heading1: { run: { font: POLICE, size: 30, color: '404040' }, paragraph: { spacing: { after: 240 } } },
        heading2: { run: { font: POLICE, size: 22, color: VERT }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading3: { run: { font: POLICE, size: 19, bold: true, color: '404040' }, paragraph: { spacing: { before: 180, after: 100 } } },
      },
    },
    sections,
  })
}

// ---- Shared pieces ---------------------------------------------------------------------

function meta(d: Dossier, type: string): Meta {
  const titreProjet = d.document.titreProjet || A_COMPLETER('titre du projet')
  return {
    titre: `${titreProjet} – déclaration IOTA – ${type}`,
    sousTitre: sousTitre(d) || A_COMPLETER('déclarant et commune'),
    client: d.declarant.nom || '…',
    gms: d.document.gms,
    version: d.document.version || '1',
    date: d.document.date,
    auteurs: d.document.auteurs,
    declarant: d.declarant.nom || A_COMPLETER('déclarant'),
    directeur: [d.document.directeurNom, d.document.directeurFonction],
    chef: [d.document.chefNom, d.document.chefFonction],
  }
}

const PHRASE_OBJET = /Le présent document constitue l[’']étude d[’']incidence.*?code de l[’']environnement\./i

/** The "contexte de la demande" text with its closing sentence adapted. */
function contexteAdapte(d: Dossier, objet: string): string {
  const t = texte('contexteDemande', d)
  return PHRASE_OBJET.test(t) ? t.replace(PHRASE_OBJET, objet) : `${t}\n\n${objet}`
}

function figuresDe(d: Dossier, ids: string[] | null): string[] {
  return d.figures.filter((f) => f.prevue && (ids === null || ids.includes(f.id))).map((f) => f.titre)
}

function lambert(d: Dossier): string {
  if (d.site.lat === null || d.site.lon === null) return A_COMPLETER('coordonnées')
  const [x, y] = toLambert93(d.site.lat, d.site.lon)
  return `X = ${Math.round(x).toLocaleString('fr-FR')} m, Y = ${Math.round(y).toLocaleString('fr-FR')} m (RGF93 / Lambert 93)`
}

// ---- Étude d'incidence ---------------------------------------------------------------------

export function etudeIncidence(d: Dossier, logos: Logos): Document {
  const m = meta(d, 'Etude d’incidence')
  const t = new Titres()
  const s = syntheseDossier(d)
  const T = (id: SectionId) => corps(texte(id, d))
  const ch: Chapitre[] = []
  const dep = d.site.departement || departement(d.site.codeInsee)

  ch.push({
    titre: 'Contexte de la demande',
    blocs: [
      t.h1('1. Contexte de la demande'),
      ...corps(contexteAdapte(d, 'Le présent document constitue l’étude d’incidence du projet au titre de l’article R. 214-32 du code de l’environnement.')),
      t.h2('1.1 Identification du déclarant'),
      fiche([
        ['Déclarant', d.declarant.nom || A_COMPLETER('nom')],
        [d.declarant.morale ? 'Numéro SIRET' : 'Date de naissance', (d.declarant.morale ? d.declarant.siret : d.declarant.dateNaissance) || A_COMPLETER(d.declarant.morale ? 'SIRET' : 'date de naissance')],
        ['Adresse', d.declarant.adresse || A_COMPLETER('adresse')],
        ['Représentant', d.declarant.representant || '-'],
      ]),
      t.h2('1.2 Localisation du projet'),
      fiche([
        ['Adresse du site', d.site.adresse || '-'],
        ['Commune', `${d.site.commune || A_COMPLETER('commune')}${d.site.codeInsee ? ` (INSEE ${d.site.codeInsee})` : ''}`],
        ['Département', `${dep || A_COMPLETER('département')}${d.site.autresDepartements ? ` ; autres départements concernés : ${d.site.autresDepartements}` : ''}`],
        ['Parcelles cadastrales', d.site.parcelles || A_COMPLETER('références cadastrales')],
        ['Coordonnées', lambert(d)],
        ['Maîtrise foncière', `${LIBELLE_MAITRISE[d.site.maitrise]}${d.site.pieceMaitrise ? ` — ${d.site.pieceMaitrise}` : ` — ${A_COMPLETER('pièce justificative jointe en annexe')}`}`],
      ]),
      para('La Figure 1 présente la localisation générale du site.', { spacing: { before: 120 } }),
    ],
  })

  ch.push({
    titre: 'Contexte environnemental',
    blocs: [
      t.h1('2. Contexte environnemental'),
      t.h2('2.1 Topographie'),
      ...T('topographie'),
      t.h2('2.2 Géologie régionale'),
      ...T('geologieRegionale'),
      t.h2('2.3 Géologie locale'),
      ...T('geologieLocale'),
      t.h2('2.4 Hydrologie'),
      ...T('hydrologie'),
      t.h2('2.5 Hydrogéologie'),
      ...T('hydrogeologie'),
      t.h2('2.6 Usages des eaux souterraines'),
      ...T('usages'),
      t.h2('2.7 Zones protégées'),
      ...T('zonesProtegees'),
      t.h2('2.8 Documents de planification et zonages réglementaires'),
      ...T('zonagesEau'),
    ],
  })

  const lignesRubriques = s.retenues.map((r) => [r.rubrique.code, r.rubrique.intitule, r.classement.motif, r.classement.regime ? LIBELLE_REGIME[r.classement.regime] : 'À préciser'])
  const apg = [...new Set(s.retenues.flatMap((r) => r.apg))]
  ch.push({
    titre: 'Rubriques de la nomenclature',
    blocs: [
      t.h1('3. Rubriques de la nomenclature concernées'),
      para('Le tableau suivant présente les rubriques de la nomenclature annexée à l’article R. 214-1 du code de l’environnement dont relève le projet, au regard de ses caractéristiques.'),
      lignesRubriques.length
        ? tableau(['Rubrique', 'Intitulé', 'Caractéristiques du projet', 'Régime'], lignesRubriques, [1.1, 3, 3.6, 1.4])
        : para(A_COMPLETER('rubriques de la nomenclature')),
      espace(),
      para(
        s.regime === 'A'
          ? `**${A_COMPLETER('au moins une rubrique relève de l’autorisation : le projet relève de l’autorisation environnementale (article L. 181-1) et non de la déclaration')}**`
          : s.regime === 'D'
            ? '**Le projet est soumis à déclaration au titre des articles L. 214-1 à L. 214-6 du code de l’environnement.**'
            : A_COMPLETER('régime du projet'),
      ),
      para(
        d.evalEnv === 'etude-impact'
          ? 'Le projet est soumis à évaluation environnementale : l’étude d’impact, jointe au dossier, tient lieu de document d’incidences (II de l’article R. 214-32).'
          : d.evalEnv === 'dispense'
            ? 'Le projet a été dispensé d’évaluation environnementale après examen au cas par cas (décision jointe en annexe).'
            : 'Le projet ne relève d’aucune rubrique du tableau annexé à l’article R. 122-2 du code de l’environnement : il n’est pas soumis à évaluation environnementale.',
      ),
      ...(apg.length ? [para('Les prescriptions générales applicables au projet sont fixées par :'), ...apg.map((a) => para(a, { bullet: { level: 0 }, spacing: { after: 60 } }))] : []),
    ],
  })

  const projet: Bloc[] = [t.h1('4. Descriptif du projet soumis à déclaration'), t.h2('4.1 Description des ouvrages et travaux'), ...T('descriptionProjet')]
  if (d.ouvrages.length)
    projet.push(
      tableau(
        ['Ouvrage', 'Type', 'Statut', 'Prof. (m)', 'Ø forage (mm)', 'Équipement', 'Crépine (m)', 'Niveau d’eau (m/sol)'],
        d.ouvrages.map((o) => [o.nom, LIBELLE_TYPE[o.type], LIBELLE_STATUT[o.statut], o.profondeur || '-', o.diametreForage || '-', o.tube || '-', o.crepineDe && o.crepineA ? `${o.crepineDe} à ${o.crepineA}` : '-', o.niveauEau || '-']),
        [1, 1.2, 1.3, 0.8, 0.9, 1.3, 1, 1],
      ),
      espace(),
    )
  projet.push(t.h2('4.2 Modalités de réalisation des travaux'), ...T('modalitesTravaux'))
  if (d.ouvrages.length || d.rubriques.actives.includes('1.1.1.0'))
    projet.push(t.h2('4.3 Modalités de suivi'), t.h3('4.3.1 Programme de suivi'), ...T('programmeSuivi'), t.h3('4.3.2 Procédure de prélèvement'), ...T('procedurePrelevement'), t.h3('4.3.3 Gestion des eaux de purge'), ...T('gestionEaux'))
  ch.push({ titre: 'Descriptif du projet soumis à déclaration', blocs: projet })

  ch.push({ titre: 'Raisons du choix du projet', blocs: [t.h1('5. Raisons du choix du projet'), ...T('choixProjet')] })

  ch.push({
    titre: 'Incidences du projet',
    blocs: [
      t.h1('6. Incidences du projet'),
      para('Les incidences directes et indirectes, temporaires et permanentes, du projet sont analysées ci-après au regard des procédés mis en œuvre, des modalités d’exécution des travaux, du fonctionnement des ouvrages, et de la nature, de l’origine et du volume des eaux utilisées ou affectées.'),
      t.h2('6.1 Incidences sur la ressource en eau'),
      ...T('incidencesQuantitatives'),
      t.h2('6.2 Incidences sur la qualité des eaux'),
      ...T('incidencesQualitatives'),
      t.h2('6.3 Incidences sur le milieu aquatique, l’écoulement et le ruissellement'),
      ...T('incidencesMilieux'),
      t.h2('6.4 Incidences en phase travaux'),
      ...T('incidencesChantier'),
      t.h2('6.5 Variations saisonnières et climatiques'),
      ...T('variations'),
      t.h2('6.6 Incidences sur les sites Natura 2000'),
      ...corps(texte('naturaAnalyse', d).split('\n\n')[0]),
      ...T('naturaConclusion'),
      para(`L’évaluation des incidences Natura 2000 fait l’objet d’un document séparé (« ${m.titre.replace('Etude d’incidence', 'Evaluation d’incidence Natura 2000')} »).`),
    ],
  })

  ch.push({
    titre: 'Compatibilité avec les documents de planification',
    blocs: [
      t.h1('7. Compatibilité avec les documents de planification'),
      t.h2('7.1 Schéma directeur d’aménagement et de gestion des eaux (SDAGE)'),
      ...T('compatibiliteSdage'),
      t.h2('7.2 Schéma d’aménagement et de gestion des eaux (SAGE)'),
      ...T('compatibiliteSage'),
      t.h2('7.3 Plan de gestion des risques d’inondation (PGRI)'),
      ...T('compatibilitePgri'),
      t.h2('7.4 Objectifs de gestion équilibrée et de qualité des eaux'),
      ...T('objectifsQualite'),
    ],
  })

  ch.push({ titre: 'Mesures d’évitement, de réduction et de compensation', blocs: [t.h1('8. Mesures d’évitement, de réduction et de compensation'), ...T('mesuresErc')] })
  ch.push({ titre: 'Prescriptions applicables', blocs: [t.h1('9. Prescriptions générales et spécifiques'), ...T('prescriptionsSpecifiques')] })
  ch.push({
    titre: 'Moyens de surveillance et d’intervention',
    blocs: [t.h1('10. Moyens de surveillance et d’intervention'), t.h2('10.1 Moyens de surveillance'), ...T('moyensSurveillance'), t.h2('10.2 Moyens d’intervention en cas d’incident ou d’accident'), ...T('moyensIntervention')],
  })
  ch.push({ titre: 'Autres procédures', blocs: [t.h1('11. Autres procédures'), ...T('autresProcedures')] })
  ch.push({ titre: 'Conclusion', blocs: [t.h1('12. Conclusion'), ...T('conclusion')] })

  const pieces = completude(d)
  ch.push({
    titre: 'Correspondance avec l’article R. 214-32',
    blocs: [
      t.h1('13. Correspondance avec l’article R. 214-32'),
      para('Le tableau suivant indique où chacun des éléments exigés par l’article R. 214-32 du code de l’environnement figure dans le dossier de déclaration.'),
      tableau(
        ['Article', 'Élément exigé', 'Emplacement dans le dossier'],
        pieces.filter((p) => p.etat !== 'sans-objet' || p.ref.includes('f)')).map((p) => [p.ref, p.libelle, p.etat === 'sans-objet' ? 'Sans objet (aucune prescription spécifique sollicitée)' : p.ou]),
        [1.3, 5, 2.4],
      ),
    ],
  })

  return assembler(m, logos, ch, t, figuresDe(d, ['loc', 'geol', 'ouvrages', 'captages', 'nature']), d.annexes.filter(Boolean), 'Etude d’incidence')
}

// ---- Évaluation des incidences Natura 2000 ------------------------------------------------

export function evaluationNatura(d: Dossier, logos: Logos): Document {
  const m = meta(d, 'Evaluation d’incidence Natura 2000')
  const t = new Titres()
  const sites = (d.contexte?.zonages ?? []).filter(estNatura)
  const titreEi = `${d.document.titreProjet || '…'} – déclaration IOTA – Etude d’incidence${d.document.gms ? ` - projet ${d.document.gms}` : ''}`
  const ch: Chapitre[] = [
    {
      titre: 'Contexte de la demande',
      blocs: [
        t.h1('1. Contexte de la demande'),
        ...corps(contexteAdapte(d, 'Le présent document constitue l’évaluation d’incidence Natura 2000 du projet au titre des articles R. 214-32 et R. 414-23 du code de l’environnement.')),
      ],
    },
    {
      titre: 'Evaluation d’incidence Natura 2000',
      blocs: [
        t.h1('2. Evaluation d’incidence Natura 2000'),
        para(
          `Le lecteur est invité à se rapporter aux éléments de présentation du contexte environnemental de la zone du projet, ainsi qu’à la description technique du projet présentés dans le document d’étude d’incidence référencé « ${titreEi} » et daté du ${dateLongue(d.document.date)}.`,
        ),
        t.h2('2.1 Présentation simplifiée du projet'),
        ...corps(texte('rntProjet', d)),
        t.h2('2.2 Sites Natura 2000 dans le voisinage du site'),
        ...corps(texte('naturaAnalyse', d)),
        ...(sites.length
          ? [
              tableau(
                ['Site Natura 2000', 'Code', 'Directive', 'Distance au site', 'Direction', 'Superficie'],
                sites.slice(0, 10).map((z) => [
                  z.nom,
                  z.code ?? '-',
                  z.categorie.includes('Habitats') ? 'Habitats (ZSC / SIC)' : 'Oiseaux (ZPS)',
                  z.inclus ? 'Site inclus' : distance(z.distanceM),
                  z.direction ? cardinalLabelFr(z.direction) : '-',
                  z.surfaceHa !== null && z.surfaceHa >= 1 ? `${Math.round(z.surfaceHa).toLocaleString('fr-FR')} ha` : '-',
                ]),
                [3, 1.3, 1.6, 1.2, 1.1, 1.1],
              ),
              para(`Source : INPN / IGN API Carto, consultation du ${dateLongue(d.contexte?.date ?? d.document.date)}, recherche dans un rayon de 10 km.`, {}, { taille: 14, italique: true, couleur: GRIS }),
            ]
          : []),
        t.h2('2.3 Conclusion'),
        ...corps(texte('naturaConclusion', d)),
      ],
    },
  ]
  return assembler(m, logos, ch, t, figuresDe(d, ['n2000']), [], 'Evaluation d’incidence Natura 2000')
}

// ---- Résumé non technique ---------------------------------------------------------------------

export function resumeNonTechnique(d: Dossier, logos: Logos): Document {
  const m = meta(d, 'Résumé non technique')
  const t = new Titres()
  const conclusion = texte('conclusion', d)
    .split('\n\n')
    .filter((p) => p.startsWith('**'))
    .join('\n\n')
  const ch: Chapitre[] = [
    {
      titre: 'Contexte',
      blocs: [t.h1('1. Contexte'), ...corps(contexteAdapte(d, 'Le présent document constitue le résumé non technique de la déclaration au titre de l’article R. 214-32 du code de l’environnement.'))],
    },
    { titre: 'Projet soumis à déclaration', blocs: [t.h1('2. Projet soumis à déclaration'), ...corps(texte('rntProjet', d))] },
    { titre: 'Incidences du projet', blocs: [t.h1('3. Incidences du projet'), ...corps(texte('rntIncidences', d)), ...corps(conclusion)] },
    {
      titre: 'Incidence sur les zones Natura 2000',
      blocs: [t.h1('4. Incidence sur les zones Natura 2000'), ...corps(texte('naturaAnalyse', d).split('\n\n').filter((p) => !p.startsWith('•')).join('\n\n')), ...corps(texte('naturaConclusion', d))],
    },
  ]
  return assembler(m, logos, ch, t, figuresDe(d, ['n2000']), [], 'Résumé non technique')
}

// ---- Download ------------------------------------------------------------------------------------

async function image(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return new Uint8Array(await r.arrayBuffer())
  } catch {
    return null
  }
}

export async function logosErm(base: string): Promise<Logos> {
  const [grand, petit] = await Promise.all([image(`${base}iota/erm-logo.jpg`), image(`${base}iota/erm-logo-petit.jpg`)])
  return { grand, petit }
}

export type TypeDocument = 'etude' | 'natura' | 'rnt'

export const NOMS: Record<TypeDocument, string> = {
  etude: 'etude_d_incidence',
  natura: 'evaluation_d_incidence_Natura_2000',
  rnt: 'resume_non_technique',
}

export function construire(type: TypeDocument, d: Dossier, logos: Logos): Document {
  return type === 'etude' ? etudeIncidence(d, logos) : type === 'natura' ? evaluationNatura(d, logos) : resumeNonTechnique(d, logos)
}

export function nomFichier(type: TypeDocument, d: Dossier): string {
  const commune = (d.site.commune || 'site').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_')
  return `IOTA_${commune}_${NOMS[type]}.docx`
}

export async function telecharger(type: TypeDocument, d: Dossier, logos: Logos): Promise<void> {
  const blob = await Packer.toBlob(construire(type, d, logos))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier(type, d)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
