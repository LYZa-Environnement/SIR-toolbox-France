/**
 * Mandate for a third party (ERM, usually) to file the IOTA declaration on
 * Service-public.fr on the declarant's behalf. One page, laid out like the
 * mandate ERM uses: title, declaration on honour, the mandant's part (legal
 * or natural person), the mandataire's part, place and date, two signature
 * blocks.
 *
 * The blank model keeps only ERM France as mandataire: every other value is
 * a dotted line to fill by hand. Otherwise the values come from the dossier, and any still missing is
 * a dotted line too, so the printed mandate never reads "undefined".
 */

import { AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import { MANDATAIRE_ERM, type Dossier } from './modele'

const POLICE = 'Aptos'
const TAILLE = 21 // 10.5 pt
const LARGEUR = 9638
const POINTILLES = '……………………………………'

export interface ValeursMandat {
  personneMorale: boolean
  soussigne: string
  projet: string
  organisme: string
  siret: string
  adresse: string
  codePostalVille: string
  representantNom: string
  representantPrenom: string
  naissance: string
  lieuNaissance: string
  mandataireNom: string
  mandatairePrenom: string
  mandataireOrganisme: string
  mandataireSiret: string
  mandataireAdresse: string
  mandataireCodePostalVille: string
  faitA: string
  date: string
}

const jjmmaaaa = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** "2 rue X, 75015 Paris" → ["2 rue X", "75015 Paris"]. */
export function separerAdresse(adresse: string): [string, string] {
  const m = adresse.match(/^(.*?)[,\s]+(\d{5}\s+.+)$/)
  return m ? [m[1].trim(), m[2].trim()] : [adresse.trim(), '']
}

export function valeursMandat(d: Dossier): ValeursMandat {
  const m = d.mandat
  const [adresse, cpVille] = separerAdresse(d.declarant.adresse)
  const chef = d.document.chefNom.trim().split(/\s+/)
  const morale = d.declarant.morale
  const repPrenom = morale ? m.representantPrenom : ''
  const repNom = morale ? m.representantNom : ''
  return {
    personneMorale: morale,
    soussigne: morale ? [m.representantPrenom, m.representantNom].filter(Boolean).join(' ') : d.declarant.nom,
    projet: m.projet || [d.declarant.nom, d.site.commune.toUpperCase()].filter(Boolean).join(' '),
    organisme: morale ? d.declarant.nom : '',
    siret: morale ? d.declarant.siret : '',
    adresse,
    codePostalVille: m.mandantCodePostalVille || cpVille,
    representantNom: repNom,
    representantPrenom: repPrenom,
    naissance: morale ? m.representantNaissance : d.declarant.dateNaissance,
    lieuNaissance: m.representantLieuNaissance,
    mandataireNom: m.mandataireNom || (chef.length > 1 ? chef.slice(1).join(' ').toUpperCase() : ''),
    mandatairePrenom: m.mandatairePrenom || (chef.length > 1 ? chef[0] : ''),
    mandataireOrganisme: m.mandataireOrganisme,
    mandataireSiret: m.mandataireSiret,
    mandataireAdresse: m.mandataireAdresse,
    mandataireCodePostalVille: m.mandataireCodePostalVille,
    faitA: m.faitA,
    date: m.date,
  }
}

const vide = (): ValeursMandat => ({
  personneMorale: true,
  soussigne: '',
  projet: '',
  organisme: '',
  siret: '',
  adresse: '',
  codePostalVille: '',
  representantNom: '',
  representantPrenom: '',
  naissance: '',
  lieuNaissance: '',
  mandataireNom: '',
  mandatairePrenom: '',
  ...MANDATAIRE_ERM,
  faitA: '',
  date: '',
})

const r = (text: string, o: { gras?: boolean; italique?: boolean; souligne?: boolean } = {}) =>
  new TextRun({ text, bold: o.gras, italics: o.italique, underline: o.souligne ? {} : undefined, font: POLICE, size: TAILLE })

const ligne = (libelle: string, valeur: string, gras = false) =>
  new Paragraph({ spacing: { after: 160 }, children: [r(`${libelle} : `), r(valeur || POINTILLES, { gras: gras && !!valeur })] })

const titre = (t: string) => new Paragraph({ spacing: { before: 360, after: 160 }, children: [r(t, { gras: true })] })

export function documentMandat(v: ValeursMandat): Document {
  const date = v.date ? jjmmaaaa(v.date).split('/') : ['……', '……', '……']
  const sansBord = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const signatures = new Table({
    width: { size: LARGEUR, type: WidthType.DXA },
    columnWidths: [LARGEUR / 2, LARGEUR / 2],
    borders: { top: sansBord, bottom: sansBord, left: sansBord, right: sansBord, insideHorizontal: sansBord, insideVertical: sansBord },
    rows: [
      new TableRow({
        height: { value: 1800, rule: 'atLeast' },
        children: ['Signature du mandataire', 'Signature du mandant'].map(
          (t) => new TableCell({ width: { size: LARGEUR / 2, type: WidthType.DXA }, children: [new Paragraph({ children: [r(t)] })] }),
        ),
      }),
    ],
  })
  const mandant = v.personneMorale
    ? [
        titre('Partie réservée au MANDANT (personne morale) :'),
        ligne('Organisme', v.organisme),
        ligne('SIRET', v.siret),
        ligne('Adresse du siège social', v.adresse),
        ligne('Code postal et ville', v.codePostalVille),
        new Paragraph({ spacing: { after: 160 }, children: [r('Représentée par :', { souligne: true })] }),
        ligne('Nom', v.representantNom, true),
        ligne('Prénom', v.representantPrenom, true),
      ]
    : [titre('Partie réservée au MANDANT (personne physique) :'), ligne('Nom et prénom', v.soussigne, true), ligne('Adresse', v.adresse), ligne('Code postal et ville', v.codePostalVille)]
  return new Document({
    creator: 'ERM — SIR Toolbox France',
    title: 'Mandat de dépôt d’une déclaration IOTA',
    styles: { default: { document: { run: { font: POLICE, size: TAILLE } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1418, bottom: 1134, left: 1134, right: 1134 } } },
        children: [
          new Paragraph({ spacing: { after: 480 }, children: [new TextRun({ text: 'MANDAT DE DEPOT D’UNE DECLARATION IOTA', bold: true, font: POLICE, size: 24 })] }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 240, line: 300 },
            children: [
              r(`Je, soussigné${v.soussigne ? ` ${v.soussigne}` : ` ${POINTILLES}`}, ci-dessous désigné comme « Mandant » déclare sur l’honneur donner mandat à la personne ci-dessous désignée comme « Mandataire », aux fins qu’elle dépose numériquement sur le site Service-public.fr le dossier de ma déclaration IOTA décrite aux articles L.214-1 et suivants du code de l’environnement, relative au projet `),
              r(`« ${v.projet || POINTILLES} »`, { italique: true }),
            ],
          }),
          ...mandant,
          new Paragraph({
            spacing: { after: 160 },
            children: [r('Né(e) le : '), r(v.naissance ? jjmmaaaa(v.naissance) : '……/……/…………'), r('\t\tà '), r(v.lieuNaissance || POINTILLES)],
          }),
          titre('Partie réservée au MANDATAIRE :'),
          ligne('Nom de la personne en charge du dossier', v.mandataireNom),
          ligne('Prénom (s) de la personne en charge du dossier', v.mandatairePrenom),
          ligne('Organisme', v.mandataireOrganisme),
          ligne('SIRET', v.mandataireSiret),
          ligne('Adresse du siège social', v.mandataireAdresse),
          ligne('Code postal et ville', v.mandataireCodePostalVille),
          new Paragraph({ spacing: { before: 480, after: 600 }, children: [r(`Fait à ${v.faitA || POINTILLES}\t\tle ${date[0]} / ${date[1]} / ${date[2]}`)] }),
          signatures,
        ],
      },
    ],
  })
}

function enregistrer(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function telechargerMandat(d: Dossier | null): Promise<void> {
  const v = d ? valeursMandat(d) : vide()
  const blob = await Packer.toBlob(documentMandat(v))
  const commune = d?.site.commune.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_')
  enregistrer(blob, d ? `IOTA_${commune || 'site'}_mandat_de_depot.docx` : 'Modele_mandat_de_depot_IOTA.docx')
}
