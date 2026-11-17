/**
 * Bibliography of the PFAS interpretation tool. Every threshold, reference
 * value and reading rule of the tool points to one or more entries here.
 *
 * Each entry was checked online (authors, journal, volume, DOI or official
 * URL) when the tool was written (November 2026). `verification` says how
 * far: `texte` when the figure used by the tool was read in the primary
 * source or its abstract, `secondaire` when it comes from a reliable
 * secondary account of the source (press release, official summary) and
 * should be confirmed in the original before being quoted in a report.
 *
 * The numbering shown in the tool follows the order of this list.
 */

export type Theme = 'reglementation' | 'ordres' | 'mesure' | 'sources' | 'methode'

export interface Reference {
  id: string
  /** Short form shown in the text, e.g. "Brusseau et al., 2020". */
  court: string
  /** Full citation. */
  citation: string
  url?: string
  theme: Theme
  /** What the tool takes from it. */
  apport: string
  verification: 'texte' | 'secondaire'
}

export const THEMES: Record<Theme, string> = {
  reglementation: 'Textes réglementaires et valeurs de gestion',
  ordres: 'Ordres de grandeur dans les sols et les eaux',
  mesure: 'Mesure : paramètres globaux, précurseurs, nomenclature',
  sources: 'Signatures des sources',
  methode: 'Méthode d’interprétation et inventaires de sites',
}

export const REFERENCES: Reference[] = [
  // ---- Réglementation -------------------------------------------------
  {
    id: 'directive2020',
    court: 'Directive (UE) 2020/2184',
    citation:
      'Directive (UE) 2020/2184 du Parlement européen et du Conseil du 16 décembre 2020 relative à la qualité des eaux destinées à la consommation humaine (refonte), annexe I partie B (« Somme des PFAS » 0,10 µg/l, « PFAS total » 0,50 µg/l) et annexe III partie B point 3 (liste des 20 substances).',
    url: 'https://eur-lex.europa.eu/eli/dir/2020/2184/oj',
    theme: 'reglementation',
    apport: 'Liste des 20 PFAS de la somme ; valeurs paramétriques 0,1 µg/l (somme des 20) et 0,5 µg/l (PFAS total).',
    verification: 'texte',
  },
  {
    id: 'lignesDirectrices2024',
    court: 'Commission européenne, 2024',
    citation:
      'Communication de la Commission C/2024/4910 du 7 août 2024 — Lignes directrices techniques concernant les méthodes d’analyse pour la surveillance des substances alkylées per- et polyfluorées (PFAS) dans le cadre des paramètres « PFAS total » et « Somme des PFAS » (directive (UE) 2020/2184).',
    url: 'https://eur-lex.europa.eu/eli/C/2024/4910/oj/eng',
    theme: 'reglementation',
    apport: 'LQ attendues (≤ 30 ng/l pour la somme), définition OCDE des PFAS, TFA dosé à part et retranché du PFAS total.',
    verification: 'secondaire',
  },
  {
    id: 'arrete2007',
    court: 'Arrêté du 11 janvier 2007 modifié',
    citation:
      'Arrêté du 11 janvier 2007 relatif aux limites et références de qualité des eaux brutes et des eaux destinées à la consommation humaine, modifié par l’arrêté du 30 décembre 2022 : annexe I-I (eaux distribuées, somme des 20 PFAS 0,1 µg/l) et annexe II (eaux brutes utilisées pour la production d’eau potable, somme des 20 PFAS 2 µg/l).',
    theme: 'reglementation',
    apport: 'Les deux seuils français de la somme des 20 PFAS ; l’annexe II est la valeur de comparaison retenue par ERM pour les eaux souterraines.',
    verification: 'texte',
  },
  {
    id: 'instructionDgs2025',
    court: 'Instruction DGS/EA4/2025/22',
    citation:
      'Instruction n° DGS/EA4/2025/22 du 19 février 2025 relative à la gestion des risques sanitaires liés à la présence de PFAS dans les eaux destinées à la consommation humaine — valeur sanitaire indicative du TFA de 60 µg/l, reprise de l’Allemagne dans l’attente de l’expertise européenne, avec un objectif de 10 µg/l (rappelés dans la réponse du Gouvernement à la question n° 1122, Assemblée nationale, XVIIe législature).',
    url: 'https://www.assemblee-nationale.fr/dyn/17/questions/QANR5L17QG1122',
    theme: 'reglementation',
    apport: 'Valeur sanitaire indicative du TFA (60 µg/l) et objectif plus protecteur (10 µg/l).',
    verification: 'secondaire',
  },
  {
    id: 'rivm2020',
    court: 'RIVM, 2020',
    citation:
      'Wintersen A., Spijker J., van Breemen P., van Wijnen H. (2020). Achtergrondwaarden perfluoralkylstoffen (PFAS) in de Nederlandse landbodem. RIVM-briefrapport 2020-0100, Bilthoven.',
    url: 'https://www.rivm.nl/bibliotheek/rapporten/2020-0100.pdf',
    theme: 'reglementation',
    apport:
      'Valeurs de bruit de fond des sols néerlandais non influencés, plus de 100 sites : PFOS 1,4 µg/kg MS, PFOA 1,9 µg/kg MS (reprises dans le Tijdelijk handelingskader PFAS).',
    verification: 'secondaire',
  },

  // ---- Ordres de grandeur ----------------------------------------------
  {
    id: 'brusseau2020',
    court: 'Brusseau et al., 2020',
    citation:
      'Brusseau M.L., Anderson R.H., Guo B. (2020). PFAS concentrations in soils: Background levels versus contaminated sites. Science of the Total Environment 740, 140017.',
    url: 'https://doi.org/10.1016/j.scitotenv.2020.140017',
    theme: 'ordres',
    apport:
      'Plus de 30 000 échantillons de sols sur plus de 2 500 sites : PFAS détectés presque partout, y compris loin des sources ; sites contaminés supérieurs de plusieurs ordres de grandeur au bruit de fond, PFOS jusqu’à plusieurs centaines de mg/kg ; le sol est un réservoir durable.',
    verification: 'texte',
  },
  {
    id: 'rankin2016',
    court: 'Rankin et al., 2016',
    citation:
      'Rankin K., Mabury S.A., Jenkins T.M., Washington J.W. (2016). A North American and global survey of perfluoroalkyl substances in surface soils: Distribution patterns and mode of occurrence. Chemosphere 161, 333–341.',
    url: 'https://doi.org/10.1016/j.chemosphere.2016.06.109',
    theme: 'ordres',
    apport:
      '62 sols de surface sans activité humaine directe, sur tous les continents : acides carboxyliques détectés dans tous les échantillons, PFOA et PFOS les plus fréquents ; apport par transport atmosphérique de précurseurs.',
    verification: 'texte',
  },
  {
    id: 'ackermanGrunfeld2024',
    court: 'Ackerman Grunfeld et al., 2024',
    citation:
      'Ackerman Grunfeld D., et al. (2024). Underestimated burden of per- and polyfluoroalkyl substances in global surface waters and groundwaters. Nature Geoscience 17, 340–346.',
    url: 'https://doi.org/10.1038/s41561-024-01402-8',
    theme: 'ordres',
    apport:
      'Plus de 45 000 échantillons d’eaux de surface et souterraines : dépassements fréquents des valeurs de gestion, plus encore près des sources connues ; les listes ciblées sous-estiment la charge totale.',
    verification: 'texte',
  },
  {
    id: 'anses2025',
    court: 'ANSES, 2025',
    citation:
      'ANSES — Laboratoire d’hydrologie de Nancy (2025). Campagne nationale de mesure de l’occurrence de PFAS dans les eaux destinées à la consommation humaine (35 PFAS dont les 20 de la directive et le TFA), résultats publiés en décembre 2025. Chiffres repris de la synthèse CLCV et de la Banque des Territoires.',
    url: 'https://www.clcv.org/storage/app/media/Les%20r%C3%A9sultats%20de%20la%20campagne%20nationale%20eau%20ANSES.pdf',
    theme: 'ordres',
    apport:
      'Eau traitée : 9 échantillons sur 627 au-dessus de 100 ng/l pour la somme des 20 (110 à 451 ng/l) ; TFA détecté dans 92 % des échantillons, médiane 780 ng/l, maximum 25 000 ng/l.',
    verification: 'secondaire',
  },
  {
    id: 'dauchy2019',
    court: 'Dauchy et al., 2019',
    citation:
      'Dauchy X., et al. (2019). Deep seepage of per- and polyfluoroalkyl substances through the soil of a firefighter training site and subsequent groundwater contamination. Chemosphere 214, 729–737.',
    url: 'https://doi.org/10.1016/j.chemosphere.2018.10.003',
    theme: 'ordres',
    apport:
      'Centre d’entraînement des pompiers en France : PFAS totaux jusqu’à 357 µg/g dans les sols, 300 à 8 300 ng/l dans la nappe en limite de site et à une source en aval ; migration profonde.',
    verification: 'texte',
  },
  {
    id: 'boiteux2017',
    court: 'Boiteux et al., 2017',
    citation:
      'Boiteux V., et al. (2017). Concentrations and patterns of perfluoroalkyl and polyfluoroalkyl substances in a river and three drinking water treatment plants near and far from a major production source. Science of the Total Environment 583, 393–400.',
    url: 'https://doi.org/10.1016/j.scitotenv.2017.01.079',
    theme: 'ordres',
    apport:
      'Rhône en aval d’une plateforme de production de fluoropolymères : profils propres au site, traitements classiques inefficaces, 18 à 77 % des PFCA après oxydation issus de précurseurs non identifiés.',
    verification: 'texte',
  },

  // ---- Mesure ------------------------------------------------------------
  {
    id: 'buck2011',
    court: 'Buck et al., 2011',
    citation:
      'Buck R.C., Franklin J., Berger U., et al. (2011). Perfluoroalkyl and polyfluoroalkyl substances in the environment: terminology, classification, and origins. Integrated Environmental Assessment and Management 7(4), 513–541.',
    url: 'https://doi.org/10.1002/ieam.258',
    theme: 'mesure',
    apport:
      'Nomenclature des familles (PFCA, PFSA, fluorotélomères) et définition des « chaînes longues » : PFCA à 7 carbones perfluorés ou plus (PFOA et au-delà), PFSA à 6 ou plus (PFHxS et au-delà).',
    verification: 'texte',
  },
  {
    id: 'uba2024',
    court: 'UBA, 2024',
    citation:
      'Umweltbundesamt (2024). Empfehlung des Umweltbundesamtes — Bewertung der PFAS-20 aus der Trinkwasserverordnung (Stand: 14. Juni 2024).',
    url: 'https://www.umweltbundesamt.de/system/files/medien/13195/dokumente/empfehlung_des_umweltbundesamtes_-_bewertung_der_pfas-20_aus_der_trinkwasserverordnung.pdf',
    theme: 'mesure',
    apport: 'Tableau des 20 substances de la somme avec leurs n° CAS (servent ici à reconnaître les lignes du fichier labo).',
    verification: 'secondaire',
  },
  {
    id: 'iarc2025',
    court: 'CIRC (IARC), 2025',
    citation:
      'Centre international de recherche sur le cancer (IARC). Perfluorooctanoic acid (PFOA) and perfluorooctanesulfonic acid (PFOS). IARC Monographs on the Identification of Carcinogenic Hazards to Humans, volume 135, Lyon.',
    url: 'https://publications.iarc.who.int/_publications/media/download/6739/cfea878bfb404d94b198e73d910f54482e3008c1.pdf',
    theme: 'mesure',
    apport:
      'Les deux procédés de fabrication : la fluoration électrochimique (principal usage des années 1950 à 2002) donne des isomères linéaires et ramifiés ; la télomérisation donne des acides carboxyliques linéaires à nombre pair de carbones.',
    verification: 'secondaire',
  },
  {
    id: 'tm2000',
    court: '3M, 2000',
    citation: '3M. 3M and fluorochemicals — annonce de mai 2000 de l’arrêt volontaire de la chimie du perfluorooctanyle (PFOS et dérivés), pour l’essentiel achevé fin 2002.',
    url: 'https://www.3m.co.th/3M/th_TH/sustainability-th/annual-report/past-reports-policies/3m-and-fluorochemicals',
    theme: 'mesure',
    apport: 'Fin de la production à base de PFOS par fluoration électrochimique chez le principal fabricant (annonce en mai 2000, achèvement pour l’essentiel fin 2002).',
    verification: 'secondaire',
  },
  {
    id: 'houtzSedlak2012',
    court: 'Houtz & Sedlak, 2012',
    citation:
      'Houtz E.F., Sedlak D.L. (2012). Oxidative conversion as a means of detecting precursors to perfluoroalkyl acids in urban runoff. Environmental Science & Technology 46, 9342–9349.',
    url: 'https://doi.org/10.1021/es302274g',
    theme: 'mesure',
    apport: 'Méthode TOP (oxydation totale des précurseurs) : les précurseurs sont convertis en PFCA, dosés avant et après oxydation.',
    verification: 'texte',
  },
  {
    id: 'ateia2023',
    court: 'Ateia et al., 2023',
    citation:
      'Ateia M., Chiang D., Cashman M., Acheson C. (2023). Total Oxidizable Precursor (TOP) Assay — Best Practices, Capabilities and Limitations for PFAS Site Investigation and Remediation. Environmental Science & Technology Letters 10.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10259459',
    theme: 'mesure',
    apport: 'Usage du TOP en diagnostic de site : oxydation parfois incomplète, résultat à lire comme un minimum, variabilité entre laboratoires.',
    verification: 'texte',
  },
  {
    id: 'wagner2013',
    court: 'Wagner et al., 2013',
    citation:
      'Wagner A., Raue B., Brauch H.-J., Worch E., Lange F.T. (2013). Determination of adsorbable organic fluorine from aqueous environmental samples by adsorption to polystyrene-divinylbenzene based activated carbon and combustion ion chromatography. Journal of Chromatography A 1295, 82–89.',
    theme: 'mesure',
    apport:
      'Méthode AOF par combustion et chromatographie ionique ; jusqu’à 50 % de l’AOF expliqué par les PFAS ciblés dans une nappe touchée par des mousses, moins de 5 % en contamination diffuse.',
    verification: 'secondaire',
  },
  {
    id: 'willach2016',
    court: 'Willach et al., 2016',
    citation:
      'Willach S., Brauch H.-J., Lange F.T. (2016). Contribution of selected perfluoroalkyl and polyfluoroalkyl substances to the adsorbable organically bound fluorine in German rivers and in a highly contaminated groundwater. Chemosphere 145, 342–350.',
    url: 'https://doi.org/10.1016/j.chemosphere.2015.11.113',
    theme: 'mesure',
    apport: 'Bilan entre l’AOF et le fluor des PFAS dosés, en rivière et dans une nappe très contaminée : une grande part du fluor organique reste non identifiée.',
    verification: 'texte',
  },
  {
    id: 'epa1621',
    court: 'US EPA, 2024',
    citation:
      'US EPA (2024). Method 1621: Determination of Adsorbable Organic Fluorine (AOF) in Aqueous Matrices by Combustion Ion Chromatography (CIC). EPA 821-R-24-002, janvier 2024.',
    url: 'https://www.epa.gov/system/files/documents/2024-01/method-1621-for-web-posting.pdf',
    theme: 'mesure',
    apport: 'L’AOF est un paramètre global de dépistage du fluor organique retenu sur charbon actif ; il ne distingue pas les composés.',
    verification: 'texte',
  },
  {
    id: 'arp2024',
    court: 'Arp et al., 2024',
    citation:
      'Arp H.P.H., Gredelj A., Glüge J., Scheringer M., Cousins I.T. (2024). The Global Threat from the Irreversible Accumulation of Trifluoroacetic Acid (TFA). Environmental Science & Technology 58, 19925–19935.',
    url: 'https://doi.org/10.1021/acs.est.4c06189',
    theme: 'mesure',
    apport:
      'TFA : produit de dégradation de nombreux PFAS (fluides frigorigènes, pesticides, médicaments, produits industriels) et rejets directs ; concentrations en hausse irréversible à l’échelle mondiale.',
    verification: 'texte',
  },
  {
    id: 'zhang2016',
    court: 'Zhang et al., 2016',
    citation:
      'Zhang S., Lu X., Wang N., Buck R.C. (2016). Biotransformation potential of 6:2 fluorotelomer sulfonate (6:2 FTSA) in aerobic and anaerobic sediment. Chemosphere 154, 224–230.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27058914/',
    theme: 'mesure',
    apport:
      '6:2 FTS : demi-vie inférieure à 5 jours en sédiment aérobie (produits stables : PFPeA, PFHxA, acide 5:3) ; pas de dégradation mesurable en anaérobie sur 100 jours.',
    verification: 'texte',
  },

  // ---- Sources -------------------------------------------------------------
  {
    id: 'backe2013',
    court: 'Backe et al., 2013',
    citation:
      'Backe W.J., Day T.C., Field J.A. (2013). Zwitterionic, cationic, and anionic fluorinated chemicals in aqueous film forming foam formulations and groundwater from U.S. military bases by nonaqueous large-volume injection HPLC-MS/MS. Environmental Science & Technology 47, 5226–5234.',
    theme: 'sources',
    apport:
      'Dix classes de composés fluorés dans sept mousses militaires (chaînes de 4 à 12 carbones) ; les précurseurs cationiques et zwitterioniques restent fixés dans les zones sources, contrairement aux fluorotélomères sulfonates anioniques.',
    verification: 'texte',
  },
  {
    id: 'houtz2013',
    court: 'Houtz et al., 2013',
    citation:
      'Houtz E.F., Higgins C.P., Field J.A., Sedlak D.L. (2013). Persistence of perfluoroalkyl acid precursors in AFFF-impacted groundwater and soil. Environmental Science & Technology 47, 8187–8195.',
    url: 'https://doi.org/10.1021/es4018877',
    theme: 'sources',
    apport:
      'Zone d’entraînement incendie utilisée jusqu’en 1990 : une grande partie des précurseurs des mousses est devenue des acides perfluorés terminaux (carboxyliques et sulfoniques), mais des précurseurs persistent des décennies.',
    verification: 'texte',
  },
  {
    id: 'barzenHanson2017',
    court: 'Barzen-Hanson et al., 2017',
    citation:
      'Barzen-Hanson K.A., et al. (2017). Discovery of 40 classes of per- and polyfluoroalkyl substances in historical aqueous film-forming foams (AFFFs) and AFFF-impacted groundwater. Environmental Science & Technology 51.',
    url: 'https://cswab.org/wp-content/uploads/2018/07/Firefighting-Foams-AFFF-Fluorotelomers-Persistent-Barzen-Hanson-2017.pdf',
    theme: 'sources',
    apport:
      'Mousses 3M et à fluorotélomères, et nappes touchées : 34 des 40 nouvelles classes identifiées proviennent de la fluoration électrochimique ; ces mousses associaient PFOS, PFHxS et leurs précurseurs sulfonamides.',
    verification: 'secondaire',
  },
  {
    id: 'anderson2016',
    court: 'Anderson et al., 2016',
    citation:
      'Anderson R.H., Anderson J.K., Porter R.C., Long G.C. (2016). Occurrence of select perfluoroalkyl substances at U.S. Air Force aqueous film-forming foam release sites other than fire-training areas: Field-validation of critical fate and transport properties. Chemosphere 150, 678–685.',
    url: 'https://doi.org/10.1016/j.chemosphere.2016.01.014',
    theme: 'sources',
    apport:
      '40 sites de rejet de mousses sur 10 bases (hors aires d’entraînement) : concentrations liées au volume rejeté ; l’analyse multivariée désigne les mousses 3M (fluoration électrochimique, PFOS) comme contributrices majeures.',
    verification: 'texte',
  },
  {
    id: 'benskin2010',
    court: 'Benskin et al., 2010',
    citation:
      'Benskin J.P., De Silva A.O., Martin J.W. (2010). Isomer profiling of perfluorinated substances as a tool for source tracking: a review of early findings and future applications. Reviews of Environmental Contamination and Toxicology 208, 111–160.',
    theme: 'sources',
    apport:
      'La fluoration électrochimique produit un mélange d’isomères linéaires et ramifiés, la télomérisation un produit essentiellement linéaire : la présence d’isomères ramifiés signe la fluoration électrochimique (interprétation prudente dans le biote).',
    verification: 'texte',
  },
  {
    id: 'prevedouros2006',
    court: 'Prevedouros et al., 2006',
    citation:
      'Prevedouros K., Cousins I.T., Buck R.C., Korzeniowski S.H. (2006). Sources, fate and transport of perfluorocarboxylates. Environmental Science & Technology 40(1), 32–44.',
    theme: 'sources',
    apport: 'Environ 80 % des émissions historiques mondiales de PFCA (3 200 à 7 300 t) proviennent de la fabrication et de l’utilisation des fluoropolymères.',
    verification: 'texte',
  },
  {
    id: 'egle2020',
    court: 'EGLE / US EPA (Michigan)',
    citation:
      'Michigan Department of Environment, Great Lakes, and Energy (EGLE), avec l’US EPA. PFAS in chrome plating: analyse de 12 suppresseurs de brouillard et de 11 effluents d’ateliers de chromage.',
    url: 'https://www.michigan.gov/documents/egle/wrd-ep-pfas-chrome-plating_693686_7.pdf',
    theme: 'sources',
    apport:
      'Les suppresseurs de brouillard actuels ne contiennent plus de PFOS ; le seul PFAS ciblé trouvé est le 6:2 FTS ; le PFOS encore rejeté est attribué aux usages anciens (interdiction des produits au PFOS en 2015 aux États-Unis).',
    verification: 'texte',
  },
  {
    id: 'bmuv2019',
    court: 'BMUV / UBA, FKZ 3717533023',
    citation:
      'Rapport de recherche pour le ministère fédéral allemand de l’Environnement (BMUV), FKZ 3717533023 — Substitution du PFOS dans le chromage fonctionnel et le mordançage des plastiques.',
    url: 'https://www.bmuv.de/fileadmin/Daten_BMU/Pools/Forschungsdatenbank/fkz_3717533023_pfos-substitution_bf.pdf',
    theme: 'sources',
    apport: 'Le PFOS a été remplacé par le 6:2 FTS dans le chromage fonctionnel (environ 12 t consommées en Allemagne en 2017).',
    verification: 'texte',
  },
  {
    id: 'hamid2018',
    court: 'Hamid et al., 2018',
    citation:
      'Hamid H., Li L.Y., Grace J.R. (2018). Review of the fate and transformation of per- and polyfluoroalkyl substances (PFASs) in landfills. Environmental Pollution 235, 74–84.',
    url: 'https://doi.org/10.1016/j.envpol.2017.12.030',
    theme: 'sources',
    apport:
      'Lixiviats de décharge : acides perfluorés courts (C4 à C7) les plus abondants, le PFOA restant l’un des plus présents malgré les restrictions.',
    verification: 'secondaire',
  },
  {
    id: 'lang2017',
    court: 'Lang et al., 2017',
    citation:
      'Lang J.R., et al. (2017). National estimate of per- and polyfluoroalkyl substance (PFAS) release to U.S. municipal landfill leachate. Environmental Science & Technology 51(4), 2197–2205.',
    url: 'https://doi.org/10.1021/acs.est.6b05005',
    theme: 'sources',
    apport:
      '70 PFAS dans 95 lixiviats : l’acide 5:3 FTCA domine la majorité des échantillons (non dosé dans la liste des 20) ; concentrations plus fortes dans les déchets récents.',
    verification: 'texte',
  },
  {
    id: 'sepulvado2011',
    court: 'Sepulvado et al., 2011',
    citation:
      'Sepulvado J.G., Blaine A.C., Hundal L.S., Higgins C.P. (2011). Occurrence and fate of perfluorochemicals in soil following the land application of municipal biosolids. Environmental Science & Technology 45, 8106–8112.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/21446724/',
    theme: 'sources',
    apport:
      'Sols amendés par des boues : PFOS dominant, concentrations proportionnelles aux apports cumulés, migration jusqu’à 120 cm, plus marquée pour les chaînes courtes.',
    verification: 'texte',
  },
  {
    id: 'guelfoHiggins2013',
    court: 'Guelfo & Higgins, 2013',
    citation:
      'Guelfo J.L., Higgins C.P. (2013). Subsurface transport potential of perfluoroalkyl acids at aqueous film-forming foam (AFFF)-impacted sites. Environmental Science & Technology 47.',
    theme: 'sources',
    apport:
      'La sorption des acides perfluorés dépend de leur longueur de chaîne et des co-contaminants : les chaînes courtes migrent plus loin, ce qui modifie le profil le long d’un panache.',
    verification: 'secondaire',
  },

  // ---- Méthode ---------------------------------------------------------
  {
    id: 'rodowa2021',
    court: 'Rodowa et al., 2021',
    citation:
      'Rodowa A.E., Charbonnet J.A., Guelfo J.L., Field J.A., Jones G.D., Higgins C.P., Helbling D.E., Houtz E.F. (2021). Environmental source tracking of per- and polyfluoroalkyl substances within a forensic context: current and future techniques. Environmental Science & Technology 55, 7237–7245.',
    url: 'https://doi.org/10.1021/acs.est.0c08506',
    theme: 'methode',
    apport:
      'Cadre du traçage des sources : composés propres à une source, rapports entre homologues, familles et isomères, statistiques multivariées, toujours confrontés au schéma conceptuel du site.',
    verification: 'texte',
  },
  {
    id: 'kibbey2020',
    court: 'Kibbey et al., 2020',
    citation:
      'Kibbey T.C.G., Jabrzemski R., O’Carroll D.M. (2020). Supervised machine learning for source allocation of per- and polyfluoroalkyl substances (PFAS) in environmental samples. Chemosphere 252, 126593.',
    url: 'https://doi.org/10.1016/j.chemosphere.2020.126593',
    theme: 'methode',
    apport:
      '1 197 échantillons d’eau : des classifieurs de principes différents distinguent les profils issus de mousses des autres origines, preuve que la composition porte une information de source.',
    verification: 'texte',
  },
  {
    id: 'salvatore2022',
    court: 'Salvatore et al., 2022',
    citation:
      'Salvatore D., Mok K., Garrett K.K., et al. (2022). Presumptive contamination: a new approach to PFAS contamination based on likely sources. Environmental Science & Technology Letters 9.',
    url: 'https://doi.org/10.1021/acs.estlett.2c00502',
    theme: 'methode',
    apport:
      'Contamination présumée autour de trois types de sites : rejets de mousses, certaines industries, déchets (décharges, stations d’épuration) ; 72 % des sites contaminés connus retrouvés par ce modèle.',
    verification: 'texte',
  },
  {
    id: 'cordner2024',
    court: 'Cordner et al., 2024',
    citation:
      'Cordner A., Brown P., Cousins I.T., Scheringer M., et al. (2024). PFAS contamination in Europe: generating knowledge and mapping known and likely contamination with “expert-reviewed” journalism. Environmental Science & Technology 58.',
    url: 'https://doi.org/10.1021/acs.est.3c09746',
    theme: 'methode',
    apport:
      'Carte européenne (Forever Pollution Project) : 22 934 sites contaminés connus et 21 426 sites présumés, dont la France ; seuil de « point chaud » à 100 ng/l.',
    verification: 'texte',
  },
  {
    id: 'itrc2026',
    court: 'ITRC PFAS-1',
    citation:
      'Interstate Technology & Regulatory Council (ITRC). PFAS Technical and Regulatory Guidance Document (PFAS-1), mise à jour de janvier 2026 : historique et usages, mousses, devenir et transport, caractérisation des sites, échantillonnage et analyse.',
    url: 'https://pfas-1.itrcweb.org',
    theme: 'methode',
    apport: 'Synthèse de référence sur les rejets, la caractérisation de site et les précautions de prélèvement (contamination croisée, blancs).',
    verification: 'texte',
  },
]

const INDEX = new Map(REFERENCES.map((r, i) => [r.id, i]))

export function numero(id: string): number {
  const i = INDEX.get(id)
  if (i === undefined) throw new Error(`Référence PFAS inconnue : ${id}`)
  return i + 1
}

export function reference(id: string): Reference {
  return REFERENCES[numero(id) - 1]
}
