/** References of the groundwater-conditions tool, shown on the page and in the report. */

export interface Source {
  texte: string
  url?: string
}

export const SOURCES: Source[] = [
  {
    texte:
      'Wiedemeier T.H. et al. (1998). Technical Protocol for Evaluating Natural Attenuation of Chlorinated Solvents in Ground Water. USEPA, EPA/600/R-98/128 — tableaux 2.3 et 2.4 (criblage), 2.5 (hydrogène), annexes B (Koc, tableau B.2.1) et C (vitesse, retard, normalisation, constantes de biodégradation).',
    url: 'https://semspub.epa.gov/work/05/249631.pdf',
  },
  {
    texte: 'Aziz C.E., Newell C.J., Gonzales J.R. et al. (2000). BIOCHLOR Natural Attenuation Decision Support System, version 1.0. USEPA, EPA/600/R-00/008.',
    url: 'https://frtr.gov/decisionsupport/DST_Tools/BIOCHLOR.htm',
  },
  {
    texte: 'ADEME (2007-2008). Programme MACAOH (Modélisation, Atténuation, Caractérisation dans les Aquifères des Organo-Halogénés) — guides méthodologiques sur l’atténuation naturelle des solvants chlorés.',
    url: 'https://librairie.ademe.fr/sols-pollues/4088-macaoh-rd-project-2001-2006-natural-attenuation-of-chlorinated-solvents-in-aquifers.html',
  },
  {
    texte: 'McMahon P.B., Chapelle F.H. (2008). Redox processes and water quality of selected principal aquifer systems. Ground Water 46(2), 259-271.',
    url: 'https://www.usgs.gov/publications/redox-processes-and-water-quality-selected-principal-aquifer-systems',
  },
  {
    texte: 'Jurgens B.C., McMahon P.B., Chapelle F.H., Eberts S.M. (2009). An Excel Workbook for Identifying Redox Processes in Ground Water. USGS Open-File Report 2009-1004.',
    url: 'https://pubs.usgs.gov/publication/ofr20091004',
  },
  {
    texte: 'Chapelle F.H., Bradley P.M., Thomas M.A., McMahon P.B. (2009). Distinguishing iron-reducing from sulfate-reducing conditions. Ground Water 47(2), 300-305.',
    url: 'https://pubs.usgs.gov/publication/70032278',
  },
  {
    texte: 'North Carolina DENR (2000). Guidance on Developing a Monitored Natural Attenuation Remedial Proposal for Chlorinated Organics in Ground Water — trois lignes de preuve, points géochimiques, usage de BIOCHLOR.',
    url: 'https://www.deq.nc.gov/monitored-natural-attenuation-remedial-proposal/download',
  },
  { texte: 'Xu M., Eckstein Y. (1995). Use of weighted least-squares method in evaluation of the relationship between dispersivity and field scale. Ground Water 33(6), 905-908 — dispersivité αx = 0,83 (log10 L)^2,414.' },
  { texte: 'Domenico P.A., Schwartz F.W. (1990). Physical and Chemical Hydrogeology. Wiley — perméabilités types (repris dans USEPA 1998, tableau C.3.1).' },
  { texte: 'Rodier J. et al. L’analyse de l’eau. Dunod — classes de minéralisation d’après la conductivité.' },
  { texte: 'APHA, AWWA, WEF. Standard Methods for the Examination of Water and Wastewater, méthode 4500-O (solubilité de l’oxygène dans l’eau douce).' },
]
