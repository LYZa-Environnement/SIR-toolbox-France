/**
 * Bibliography of the chromatogram tool. Every product range, ratio,
 * equation and reading rule of the tool points to one or more entries.
 *
 * `verification`: `texte` when the figure used by the tool was read in the
 * source itself (the BRGM report, the ITRC fact sheet, EU texts), or in the
 * BRGM report quoting it; `secondaire` when it comes from an abstract or a
 * reliable secondary account and should be checked in the original before
 * being quoted in a report.
 *
 * The numbering shown in the tool follows the order of this list.
 */

export type Theme = 'socle' | 'produits' | 'alteration' | 'datation' | 'methode'

export interface Reference {
  id: string
  /** Short form shown in the text, e.g. "Colombano et al., 2014". */
  court: string
  citation: string
  url?: string
  theme: Theme
  /** What the tool takes from it. */
  apport: string
  verification: 'texte' | 'secondaire'
}

export const THEMES: Record<Theme, string> = {
  socle: 'Rapport de référence',
  produits: 'Nature des produits et lecture des chromatogrammes',
  alteration: 'Altération : évaporation, biodégradation',
  datation: 'Datation des déversements',
  methode: 'Méthodes d’analyse et repères chromatographiques',
}

export const REFERENCES: Reference[] = [
  {
    id: 'brgm2014',
    court: 'Colombano et al., 2014 (BRGM)',
    citation:
      'Colombano S., Saada A., Victoire E., Guerin V., Zornig C., Amalric L., Blessing M., Widory D., Hube D., Blanc C. (2014). Nature des produits pétroliers et origine du vieillissement : tentative de l’identification de la source via la prise en compte des impacts et l’analyse de l’âge approximatif des déversements. Rapport final BRGM/RP-64174-FR, 163 p.',
    url: 'https://infoterre.brgm.fr/rapports/RP-64174-FR.pdf',
    theme: 'socle',
    apport:
      'Démarche graduée (CG/DIF puis CG/SM), plages de carbone des produits (§ 2.2.2), ordre de disparition des composés (§ 2.3), lecture des profils CG/DIF (§ 5.1), ratios n-C17/pristane, n-C18/phytane et pristane/phytane, CPI, équation de Christensen et Larsen et ses limites (§ 5.5), rapport BTEX de Kaplan (§ 5.5.4), additifs (§ 5.4), niveaux de correspondance entre échantillons (§ 6.2).',
    verification: 'texte',
  },
  {
    id: 'itrc2018',
    court: 'ITRC, 2018',
    citation:
      'Interstate Technology & Regulatory Council (2018). TPH Risk Evaluation at Petroleum-Contaminated Sites, fact sheet A.5 « Chromatograms: A Wealth of Information », novembre 2018.',
    url: 'https://tphrisk-1.itrcweb.org/wp-content/uploads/2018/11/tph_fact_sheet_a5_chromatograms__11_4_18.pdf',
    theme: 'produits',
    apport:
      'Ordre d’élution essence → kérosène → gazole, pétrole brut couvrant toute la gamme ; biodégradation visible par la perte des n-alcanes et les isoprénoïdes restants ; la bosse (UCM) faite d’alcanes ramifiés, cycloalcanes et naphténo-aromatiques ; bosse au-delà de C15 dans une eau = hydrocarbures non dissous ou composés polaires (purification sur gel de silice) ; solvants et matière végétale dans la fenêtre des hydrocarbures.',
    verification: 'texte',
  },
  {
    id: 'wangStout2007',
    court: 'Wang et Stout, 2007',
    citation: 'Wang Z., Stout S.A. (dir.) (2007). Oil Spill Environmental Forensics: Fingerprinting and Source Identification. Academic Press, Elsevier.',
    theme: 'produits',
    apport: 'Démarche graduée d’identification des sources et liste des ratios diagnostiques, telles que reprises par le BRGM (2014, § 5.5 et § 6).',
    verification: 'secondaire',
  },
  {
    id: 'petersMoldowan2005',
    court: 'Peters et al., 2005',
    citation:
      'Peters K.E., Walters C.C., Moldowan J.M. (2005). The Biomarker Guide, 2e éd., vol. 2 : Biomarkers and Isotopes in Petroleum Exploration and Earth History, chap. « Biodegradation parameters ». Cambridge University Press (échelle de Peters et Moldowan, 1993).',
    url: 'https://www.cambridge.org/core/books/biomarker-guide/biodegradation-parameters/2ADECA243B83A7B92731E2E1B03AA0B8',
    theme: 'alteration',
    apport:
      'Échelle de biodégradation PM de 1 à 10 : disparition successive des n-alcanes légers, de l’ensemble des n-alcanes, puis des isoprénoïdes acycliques (pristane, phytane), puis des stéranes et des hopanes ; légère (PM 1–3), modérée (PM 4–5), forte (PM 6–7). Seuls les premiers stades se lisent en CG/DIF.',
    verification: 'secondaire',
  },
  {
    id: 'christensenLarsen1993',
    court: 'Christensen et Larsen, 1993',
    citation: 'Christensen L.B., Larsen T.H. (1993). Method for determining the age of diesel oil spills in the soil. Ground Water Monitoring & Remediation 13(4), 142–149.',
    url: 'https://agris.fao.org/search/en/records/65dfc9947c7033e84beee2ff',
    theme: 'datation',
    apport:
      'Âge d’un déversement de gazole dans le sol à partir du rapport n-C17/pristane, le meilleur des indices testés sur 12 sites de date connue ; relation linéaire sur les 20 premières années, T (ans) = −8,4 × (n-C17/Pr) + 19,8, précision ± 2 ans (95 %) pour un sol, une profondeur et une région donnés (forme reprise par le BRGM, 2014, § 5.5.2 b).',
    verification: 'texte',
  },
  {
    id: 'hurstSchmidt2005',
    court: 'Hurst et Schmidt, 2005',
    citation:
      'Hurst R.W., Schmidt G.W. (2005). Age significance of nC17/Pr ratios in forensic investigations of refined product and crude oil releases. Environmental Geosciences 12(3), 177–192.',
    url: 'https://archives.datapages.com/data/deg/2005/EG04004/EG04004.HTM',
    theme: 'datation',
    apport: 'Réévaluation du modèle : n-C17 presque entièrement dégradé en une vingtaine d’années ; incertitude sur l’âge de l’ordre de 3 à 10 ans selon les conditions du site.',
    verification: 'secondaire',
  },
  {
    id: 'oudijk2009',
    court: 'Oudijk, 2009',
    citation: 'Oudijk G. (2009). Age dating heating-oil releases, Part 1. Decision-tree analysis. Environmental Forensics 10(2), 107–119.',
    theme: 'datation',
    apport:
      'Méthode réservée aux distillats moyens (fioul domestique, gazole) ; la composition initiale varie selon la raffinerie et le lot, d’où la nécessité de plusieurs lignes de preuve pour dater ; ordre de disparition des composés repris par le BRGM (2014, § 2.3).',
    verification: 'secondaire',
  },
  {
    id: 'kaplan1997',
    court: 'Kaplan et al., 1997',
    citation:
      'Kaplan I.R., Galperin Y., Lu S.-T., Lee R.-P. (1997). Forensic environmental geochemistry: differentiation of fuel-types, their sources and release time. Organic Geochemistry 27(5/6), 289–317.',
    theme: 'datation',
    apport:
      'Rapport (B + T)/(E + X) des BTEX décroissant avec le temps, Rb = 6,0 × exp(−0,308 t) (Kaplan et al., 1996, repris par le BRGM, 2014, § 5.5.4) ; méthode PIANO pour les essences.',
    verification: 'secondaire',
  },
  {
    id: 'directive9870',
    court: 'Directive 98/70/CE',
    citation:
      'Directive 98/70/CE du Parlement européen et du Conseil du 13 octobre 1998 concernant la qualité de l’essence et des carburants diesel, article 3 (interdiction de la commercialisation de l’essence plombée au 1er janvier 2000, report possible jusqu’en 2005 non demandé par la France).',
    url: 'https://eur-lex.europa.eu/eli/dir/1998/70/oj',
    theme: 'datation',
    apport: 'Borne de date : en France, l’essence plombée n’est plus distribuée depuis le 1er janvier 2000 (hors petites quantités pour véhicules anciens).',
    verification: 'texte',
  },
  {
    id: 'brayEvans1961',
    court: 'Bray et Evans, 1961',
    citation: 'Bray E.E., Evans E.D. (1961). Distribution of n-paraffins as a clue to recognition of source beds. Geochimica et Cosmochimica Acta 22(1), 2–15.',
    theme: 'methode',
    apport:
      'Indice de préférence carbonée (CPI) : moyenne de Σ impairs C25–C33 / Σ pairs C24–C32 et de Σ impairs C25–C33 / Σ pairs C26–C34 ; voisin de 1 pour les produits pétroliers, nettement supérieur pour les cires végétales (BRGM, 2014, § 5.5.1).',
    verification: 'secondaire',
  },
  {
    id: 'iso16703',
    court: 'NF EN ISO 16703 et NF EN ISO 9377-2',
    citation:
      'NF EN ISO 16703 (sols) et NF EN ISO 9377-2 (eaux) : dosage des hydrocarbures de C10 à C40 par chromatographie en phase gazeuse avec détection par ionisation de flamme ; fenêtre d’intégration bornée par le n-décane et le n-tétracontane.',
    theme: 'methode',
    apport: 'Les deux repères C10 et C40 portés sur les chromatogrammes des laboratoires, qui servent ici au calage de l’axe des carbones.',
    verification: 'secondaire',
  },
  {
    id: 'nistRi',
    court: 'NIST Chemistry WebBook',
    citation:
      'NIST Chemistry WebBook, SRD 69 : indices de rétention de Kováts sur colonne apolaire du pristane (n° CAS 1921-70-6, environ 1 707) et du phytane (n° CAS 638-36-8, environ 1 811).',
    url: 'https://webbook.nist.gov/chemistry/',
    theme: 'methode',
    apport: 'Position des isoprénoïdes : le pristane sort juste après n-C17, le phytane juste après n-C18 (doublets caractéristiques des gazoles).',
    verification: 'secondaire',
  },
]

const INDEX = new Map(REFERENCES.map((r, i) => [r.id, i]))

export function numero(id: string): number {
  const i = INDEX.get(id)
  if (i === undefined) throw new Error(`Référence inconnue : ${id}`)
  return i + 1
}

export function reference(id: string): Reference {
  return REFERENCES[numero(id) - 1]
}
