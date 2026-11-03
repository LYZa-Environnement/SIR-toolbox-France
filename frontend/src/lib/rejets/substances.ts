/**
 * Substances named by the arrêté du 2 février 1998 (version consolidée,
 * AIDA / INERIS) that a treatment unit of polluted groundwater or soil gas
 * may discharge: to air (article 27) and to water (articles 31, 32, 34).
 *
 * A lab row is matched to a substance by CAS number, else by name. Volatile
 * organic compounds carry what article 27 7° needs: their class (annexe III,
 * hazard statements H340/H350/H350i/H360D/H360F, halogenated with H341/H351,
 * from the harmonised CLP classification), their annexe IV list (12°), and
 * their carbon content, to express a sum in total carbon.
 */

import { normaliser } from '../resultats/guides.ts'

export type ClasseCov = 'cmr' | 'halogene' | 'autre'

export interface Substance {
  id: string
  nom: string
  cas: string[]
  /** Other names, as labs write them. */
  noms?: string[]
  /** Air: volatile organic compound (methane excluded). */
  cov?: { classe: ClasseCov; annexeIII?: boolean; carbones?: number; masseMolaire?: number; fractionCarbone?: number }
  /** Air: list of annexe IV (12° of article 27). */
  annexeIV?: 'a' | 'b' | 'c' | 'd'
  /** Water: element a result is expressed as ("mg N/l", "mg O2/l"). */
  milieu: ('air' | 'eau')[]
}

const C = 12.011

function cov(classe: ClasseCov, carbones: number, masseMolaire: number, annexeIII = false) {
  return { classe, annexeIII, carbones, masseMolaire, fractionCarbone: (carbones * C) / masseMolaire }
}

/** Petroleum fractions: carbon share of CnH2n+2 (≈ 0,85) or of aromatics (≈ 0,90). */
const FRACTION_ALIPHATIQUE = { classe: 'autre' as const, fractionCarbone: 0.85 }
const FRACTION_AROMATIQUE = { classe: 'autre' as const, fractionCarbone: 0.9 }

export const SUBSTANCES: Substance[] = [
  // ---- Air: general pollutants (1° to 6°, 9°) ----
  { id: 'poussieres', nom: 'Poussières totales', cas: [], noms: ['poussieres', 'poussieres totales', 'particules totales', 'tsp'], milieu: ['air'] },
  { id: 'co', nom: 'Monoxyde de carbone (CO)', cas: ['630-08-0'], noms: ['monoxyde de carbone', 'co'], milieu: ['air'] },
  { id: 'so2', nom: 'Oxydes de soufre (en SO2)', cas: ['7446-09-5'], noms: ['dioxyde de soufre', 'oxydes de soufre', 'so2', 'sox'], milieu: ['air'] },
  { id: 'nox', nom: "Oxydes d'azote (en NO2)", cas: ['10102-44-0'], noms: ['oxydes d azote', 'dioxyde d azote', 'nox', 'no2'], milieu: ['air'] },
  { id: 'n2o', nom: "Protoxyde d'azote (N2O)", cas: ['10024-97-2'], noms: ['protoxyde d azote', 'n2o'], milieu: ['air'] },
  { id: 'ch4', nom: 'Méthane (CH4)', cas: ['74-82-8'], noms: ['methane', 'ch4'], milieu: ['air'] },
  { id: 'hcl', nom: "Chlorure d'hydrogène et composés inorganiques gazeux du chlore (en HCl)", cas: ['7647-01-0'], noms: ['chlorure d hydrogene', 'acide chlorhydrique', 'hcl', 'chlorures gazeux'], milieu: ['air'] },
  { id: 'hf', nom: 'Fluor et composés inorganiques gazeux du fluor (en HF)', cas: ['7664-39-3'], noms: ['fluorure d hydrogene', 'acide fluorhydrique', 'hf', 'fluorures gazeux'], milieu: ['air'] },
  { id: 'hf-part', nom: 'Fluor, vésicules et particules (en HF)', cas: [], noms: ['fluorures particulaires', 'fluor particulaire'], milieu: ['air'] },
  { id: 'phosphine', nom: 'Phosphine', cas: ['7803-51-2'], noms: ['phosphine'], milieu: ['air'] },
  { id: 'phosgene', nom: 'Phosgène', cas: ['75-44-5'], noms: ['phosgene'], milieu: ['air'] },
  { id: 'hcn', nom: 'Acide cyanhydrique (en HCN)', cas: ['74-90-8'], noms: ['acide cyanhydrique', 'cyanure d hydrogene', 'hcn'], milieu: ['air'] },
  { id: 'hbr', nom: 'Brome et composés inorganiques gazeux du brome (en HBr)', cas: ['10035-10-6', '7726-95-6'], noms: ['brome', 'bromure d hydrogene', 'hbr'], milieu: ['air'] },
  { id: 'chlore', nom: 'Chlore (en HCl)', cas: ['7782-50-5'], noms: ['chlore', 'dichlore', 'cl2'], milieu: ['air'] },
  { id: 'h2s', nom: 'Hydrogène sulfuré (H2S)', cas: ['7783-06-4'], noms: ['hydrogene sulfure', 'sulfure d hydrogene', 'h2s'], milieu: ['air'] },
  { id: 'nh3', nom: 'Ammoniac (NH3)', cas: ['7664-41-7'], noms: ['ammoniac', 'nh3'], milieu: ['air'] },
  { id: 'covt', nom: 'COV totaux hors méthane (en carbone total)', cas: [], noms: ['cov totaux', 'covt', 'covnm', 'cov non methaniques', 'composes organiques volatils totaux', 'cot gazeux', 'carbone organique total'], milieu: ['air'] },

  // ---- Metals (air 8°, water 3° and 4°) ----
  { id: 'cd', nom: 'Cadmium', cas: ['7440-43-9'], noms: ['cadmium', 'cd'], milieu: ['air', 'eau'] },
  { id: 'hg', nom: 'Mercure', cas: ['7439-97-6'], noms: ['mercure', 'hg'], milieu: ['air', 'eau'] },
  { id: 'tl', nom: 'Thallium', cas: ['7440-28-0'], noms: ['thallium', 'tl'], milieu: ['air'] },
  { id: 'as', nom: 'Arsenic', cas: ['7440-38-2'], noms: ['arsenic', 'as'], milieu: ['air', 'eau'] },
  { id: 'se', nom: 'Sélénium', cas: ['7782-49-2'], noms: ['selenium', 'se'], milieu: ['air'] },
  { id: 'te', nom: 'Tellure', cas: ['13494-80-9'], noms: ['tellure', 'te'], milieu: ['air'] },
  { id: 'pb', nom: 'Plomb', cas: ['7439-92-1'], noms: ['plomb', 'pb'], milieu: ['air', 'eau'] },
  { id: 'sb', nom: 'Antimoine', cas: ['7440-36-0'], noms: ['antimoine', 'sb'], milieu: ['air'] },
  { id: 'cr', nom: 'Chrome', cas: ['7440-47-3'], noms: ['chrome', 'chrome total', 'cr'], milieu: ['air', 'eau'] },
  { id: 'cr6', nom: 'Chrome hexavalent (Cr VI)', cas: ['18540-29-9'], noms: ['chrome hexavalent', 'chrome vi', 'chrome 6', 'cr vi', 'cr6'], annexeIV: 'a', milieu: ['air', 'eau'] },
  { id: 'cobalt', nom: 'Cobalt', cas: ['7440-48-4'], noms: ['cobalt'], milieu: ['air'] },
  { id: 'cu', nom: 'Cuivre', cas: ['7440-50-8'], noms: ['cuivre', 'cu'], milieu: ['air', 'eau'] },
  { id: 'sn', nom: 'Étain', cas: ['7440-31-5'], noms: ['etain', 'sn'], milieu: ['air', 'eau'] },
  { id: 'mn', nom: 'Manganèse', cas: ['7439-96-5'], noms: ['manganese', 'mn'], milieu: ['air', 'eau'] },
  { id: 'ni', nom: 'Nickel', cas: ['7440-02-0'], noms: ['nickel', 'ni'], milieu: ['air', 'eau'] },
  { id: 'v', nom: 'Vanadium', cas: ['7440-62-2'], noms: ['vanadium'], milieu: ['air'] },
  { id: 'zn', nom: 'Zinc', cas: ['7440-66-6'], noms: ['zinc', 'zn'], milieu: ['air', 'eau'] },
  { id: 'be', nom: 'Béryllium', cas: ['7440-41-7'], noms: ['beryllium', 'be'], annexeIV: 'a', milieu: ['air'] },
  { id: 'fe', nom: 'Fer', cas: ['7439-89-6'], noms: ['fer', 'fe'], milieu: ['eau'] },
  { id: 'al', nom: 'Aluminium', cas: ['7429-90-5'], noms: ['aluminium', 'al'], milieu: ['eau'] },

  // ---- Volatile organic compounds (air 7°, 12°; water 4° for some) ----
  { id: 'benzene', nom: 'Benzène', cas: ['71-43-2'], noms: ['benzene'], cov: cov('cmr', 6, 78.11), annexeIV: 'd', milieu: ['air', 'eau'] },
  { id: 'toluene', nom: 'Toluène', cas: ['108-88-3'], noms: ['toluene'], cov: cov('autre', 7, 92.14), milieu: ['air', 'eau'] },
  { id: 'ethylbenzene', nom: 'Éthylbenzène', cas: ['100-41-4'], noms: ['ethylbenzene'], cov: cov('autre', 8, 106.17), milieu: ['air'] },
  { id: 'xylenes', nom: 'Xylènes (somme o, m, p)', cas: ['1330-20-7'], noms: ['xylenes', 'somme des xylenes', 'xylenes totaux'], cov: cov('autre', 8, 106.17), milieu: ['air', 'eau'] },
  { id: 'oxylene', nom: 'o-Xylène', cas: ['95-47-6'], noms: ['o xylene', 'ortho xylene', 'orthoxylene'], cov: cov('autre', 8, 106.17), milieu: ['air', 'eau'] },
  { id: 'mpxylene', nom: 'm+p-Xylène', cas: ['108-38-3', '106-42-3', '179601-23-1'], noms: ['m p xylene', 'm+p xylene', 'meta et para xylene', 'para et meta xylene', 'm xylene', 'p xylene'], cov: cov('autre', 8, 106.17), milieu: ['air', 'eau'] },
  { id: 'styrene', nom: 'Styrène', cas: ['100-42-5'], noms: ['styrene'], cov: cov('autre', 8, 104.15), milieu: ['air'] },
  { id: 'tmb', nom: 'Triméthylbenzènes', cas: ['95-63-6', '108-67-8', '526-73-8', '25551-13-7'], noms: ['trimethylbenzene', '1 2 4 trimethylbenzene', '1 3 5 trimethylbenzene', '1 2 3 trimethylbenzene', 'mesitylene'], cov: cov('autre', 9, 120.19), milieu: ['air'] },
  { id: 'cumene', nom: 'Cumène (isopropylbenzène)', cas: ['98-82-8'], noms: ['cumene', 'isopropylbenzene'], cov: cov('autre', 9, 120.19), milieu: ['air'] },
  { id: 'naphtalene', nom: 'Naphtalène', cas: ['91-20-3'], noms: ['naphtalene', 'naphthalene'], cov: cov('autre', 10, 128.17), milieu: ['air', 'eau'] },
  { id: 'hexane', nom: 'n-Hexane', cas: ['110-54-3'], noms: ['hexane', 'n hexane'], cov: cov('autre', 6, 86.18), milieu: ['air'] },
  { id: 'butadiene', nom: '1,3-Butadiène', cas: ['106-99-0'], noms: ['1 3 butadiene', 'butadiene'], cov: cov('cmr', 4, 54.09), annexeIV: 'd', milieu: ['air'] },
  { id: 'mtbe', nom: 'MTBE', cas: ['1634-04-4'], noms: ['mtbe', 'methyl tert butyl ether', 'methyl tertio butyl ether'], cov: cov('autre', 5, 88.15), milieu: ['air'] },
  { id: 'etbe', nom: 'ETBE', cas: ['637-92-3'], noms: ['etbe', 'ethyl tert butyl ether', 'ethyl tertio butyl ether'], cov: cov('autre', 6, 102.17), milieu: ['air'] },
  { id: 'acetone', nom: 'Acétone', cas: ['67-64-1'], noms: ['acetone'], cov: cov('autre', 3, 58.08), milieu: ['air'] },
  { id: 'formaldehyde', nom: 'Formaldéhyde', cas: ['50-00-0'], noms: ['formaldehyde', 'aldehyde formique', 'methanal'], cov: cov('cmr', 1, 30.03, true), milieu: ['air'] },
  { id: 'acetaldehyde', nom: 'Acétaldéhyde', cas: ['75-07-0'], noms: ['acetaldehyde', 'aldehyde acetique', 'ethanal'], cov: cov('autre', 2, 44.05, true), milieu: ['air'] },
  { id: 'phenol', nom: 'Phénol', cas: ['108-95-2'], noms: ['phenol'], cov: cov('autre', 6, 94.11, true), milieu: ['air'] },
  { id: 'cresols', nom: 'Crésols', cas: ['1319-77-3', '95-48-7', '108-39-4', '106-44-5'], noms: ['cresol', 'cresols', 'o cresol', 'm cresol', 'p cresol'], cov: cov('autre', 7, 108.14, true), milieu: ['air'] },
  { id: 'pyridine', nom: 'Pyridine', cas: ['110-86-1'], noms: ['pyridine'], cov: cov('autre', 5, 79.1, true), milieu: ['air'] },
  { id: 'aniline', nom: 'Aniline', cas: ['62-53-3'], noms: ['aniline'], cov: cov('autre', 6, 93.13, true), milieu: ['air'] },
  { id: 'dioxane', nom: '1,4-Dioxane', cas: ['123-91-1'], noms: ['1 4 dioxane', 'dioxane'], cov: cov('autre', 4, 88.11, true), milieu: ['air'] },
  { id: 'nitrobenzene', nom: 'Nitrobenzène', cas: ['98-95-3'], noms: ['nitrobenzene'], cov: cov('autre', 6, 123.11, true), milieu: ['air'] },
  { id: 'acroleine', nom: 'Acroléine', cas: ['107-02-8'], noms: ['acroleine', 'propenal'], cov: cov('autre', 3, 56.06, true), milieu: ['air'] },
  { id: 'acrylonitrile', nom: 'Acrylonitrile', cas: ['107-13-1'], noms: ['acrylonitrile'], cov: cov('cmr', 3, 53.06), annexeIV: 'c', milieu: ['air'] },
  { id: 'oxyde-ethylene', nom: "Oxyde d'éthylène", cas: ['75-21-8'], noms: ['oxyde d ethylene', 'oxirane'], cov: cov('cmr', 2, 44.05), annexeIV: 'd', milieu: ['air'] },
  { id: 'epoxypropane', nom: '1,2-Époxypropane', cas: ['75-56-9'], noms: ['1 2 epoxypropane', 'oxyde de propylene'], cov: cov('cmr', 3, 58.08), annexeIV: 'd', milieu: ['air'] },
  { id: 'nitropropane', nom: '2-Nitropropane', cas: ['79-46-9'], noms: ['2 nitropropane'], cov: cov('cmr', 3, 89.09), annexeIV: 'd', milieu: ['air'] },

  // Chlorinated solvents
  { id: 'cv', nom: 'Chlorure de vinyle', cas: ['75-01-4'], noms: ['chlorure de vinyle', 'chloroethylene', 'chloroethene', 'cvm'], cov: cov('cmr', 2, 62.5), annexeIV: 'c', milieu: ['air'] },
  { id: '11dce', nom: '1,1-Dichloroéthylène', cas: ['75-35-4'], noms: ['1 1 dichloroethylene', '1 1 dichloroethene', 'chlorure de vinylidene'], cov: cov('halogene', 2, 96.94, true), milieu: ['air'] },
  { id: 'c12dce', nom: 'cis-1,2-Dichloroéthylène', cas: ['156-59-2'], noms: ['cis 1 2 dichloroethylene', 'cis 1 2 dichloroethene'], cov: cov('autre', 2, 96.94), milieu: ['air'] },
  { id: 't12dce', nom: 'trans-1,2-Dichloroéthylène', cas: ['156-60-5'], noms: ['trans 1 2 dichloroethylene', 'trans 1 2 dichloroethene'], cov: cov('autre', 2, 96.94), milieu: ['air'] },
  { id: 'tce', nom: 'Trichloroéthylène', cas: ['79-01-6'], noms: ['trichloroethylene', 'trichloroethene'], cov: cov('cmr', 2, 131.39, true), milieu: ['air', 'eau'] },
  { id: 'pce', nom: 'Tétrachloroéthylène', cas: ['127-18-4'], noms: ['tetrachloroethylene', 'tetrachloroethene', 'perchloroethylene'], cov: cov('halogene', 2, 165.83, true), milieu: ['air', 'eau'] },
  { id: 'chloroethane', nom: 'Chloroéthane', cas: ['75-00-3'], noms: ['chloroethane', 'chlorure d ethyle'], cov: cov('autre', 2, 64.51), milieu: ['air'] },
  { id: '11dca', nom: '1,1-Dichloroéthane', cas: ['75-34-3'], noms: ['1 1 dichloroethane'], cov: cov('autre', 2, 98.96), milieu: ['air'] },
  { id: '12dca', nom: '1,2-Dichloroéthane', cas: ['107-06-2'], noms: ['1 2 dichloroethane'], cov: cov('cmr', 2, 98.96), annexeIV: 'd', milieu: ['air', 'eau'] },
  { id: '111tca', nom: '1,1,1-Trichloroéthane', cas: ['71-55-6'], noms: ['1 1 1 trichloroethane'], cov: cov('autre', 2, 133.4), milieu: ['air'] },
  { id: '112tca', nom: '1,1,2-Trichloroéthane', cas: ['79-00-5'], noms: ['1 1 2 trichloroethane'], cov: cov('halogene', 2, 133.4, true), milieu: ['air'] },
  { id: 'teca', nom: '1,1,2,2-Tétrachloroéthane', cas: ['79-34-5'], noms: ['1 1 2 2 tetrachloroethane'], cov: cov('autre', 2, 167.85, true), milieu: ['air'] },
  { id: 'chloromethane', nom: 'Chlorométhane', cas: ['74-87-3'], noms: ['chloromethane', 'chlorure de methyle'], cov: cov('halogene', 1, 50.49, true), milieu: ['air'] },
  { id: 'dcm', nom: 'Dichlorométhane', cas: ['75-09-2'], noms: ['dichloromethane', 'chlorure de methylene'], cov: cov('halogene', 1, 84.93, true), milieu: ['air', 'eau'] },
  { id: 'chloroforme', nom: 'Chloroforme (trichlorométhane)', cas: ['67-66-3'], noms: ['trichloromethane', 'chloroforme'], cov: cov('halogene', 1, 119.38, true), milieu: ['air', 'eau'] },
  { id: 'ccl4', nom: 'Tétrachlorure de carbone', cas: ['56-23-5'], noms: ['tetrachloromethane', 'tetrachlorure de carbone'], cov: cov('halogene', 1, 153.82, true), milieu: ['air', 'eau'] },
  { id: 'chlorobenzene', nom: 'Chlorobenzène', cas: ['108-90-7'], noms: ['chlorobenzene', 'monochlorobenzene'], cov: cov('autre', 6, 112.56), milieu: ['air'] },
  { id: '12dcb', nom: '1,2-Dichlorobenzène', cas: ['95-50-1'], noms: ['1 2 dichlorobenzene', 'o dichlorobenzene'], cov: cov('autre', 6, 147.0, true), milieu: ['air'] },
  { id: '13dcb', nom: '1,3-Dichlorobenzène', cas: ['541-73-1'], noms: ['1 3 dichlorobenzene', 'm dichlorobenzene'], cov: cov('autre', 6, 147.0), milieu: ['air'] },
  { id: '14dcb', nom: '1,4-Dichlorobenzène', cas: ['106-46-7'], noms: ['1 4 dichlorobenzene', 'p dichlorobenzene'], cov: cov('halogene', 6, 147.0), milieu: ['air'] },
  { id: 'tcb', nom: 'Trichlorobenzènes', cas: ['12002-48-1', '120-82-1', '87-61-6', '108-70-3'], noms: ['trichlorobenzene', 'trichlorobenzenes', '1 2 4 trichlorobenzene', '1 2 3 trichlorobenzene', '1 3 5 trichlorobenzene'], cov: cov('autre', 6, 181.45), milieu: ['air', 'eau'] },
  { id: 'hcbd', nom: 'Hexachlorobutadiène', cas: ['87-68-3'], noms: ['hexachlorobutadiene'], cov: cov('halogene', 4, 260.76), milieu: ['air', 'eau'] },
  { id: 'chlorure-benzyle', nom: 'Chlorure de benzyle', cas: ['100-44-7'], noms: ['chlorure de benzyle', 'chlorotoluene'], cov: cov('cmr', 7, 126.58, true), milieu: ['air'] },
  { id: 'dbe', nom: '1,2-Dibromoéthane', cas: ['106-93-4'], noms: ['1 2 dibromoethane', 'dibromure d ethylene'], cov: cov('cmr', 2, 187.86), annexeIV: 'c', milieu: ['air'] },
  { id: 'epichlorhydrine', nom: 'Épichlorhydrine', cas: ['106-89-8'], noms: ['epichlorhydrine', 'epichlorohydrine'], cov: cov('cmr', 3, 92.52), annexeIV: 'c', milieu: ['air'] },
  { id: 'chloroprene', nom: 'Chloroprène', cas: ['126-99-8'], noms: ['chloroprene', '2 chlorobuta 1 3 diene'], cov: cov('cmr', 4, 88.54), milieu: ['air'] },
  { id: '123tcp', nom: '1,2,3-Trichloropropane', cas: ['96-18-4'], noms: ['1 2 3 trichloropropane'], cov: cov('cmr', 3, 147.43), milieu: ['air'] },
  { id: 'dcp', nom: '1,3-Dichloro-2-propanol', cas: ['96-23-1'], noms: ['1 3 dichloro 2 propanol'], cov: cov('cmr', 3, 128.98), annexeIV: 'd', milieu: ['air'] },
  { id: 'chlorure-allyle', nom: "Chlorure d'allyle", cas: ['107-05-1'], noms: ['chlorure d allyle', '3 chloropropene'], cov: cov('halogene', 3, 76.52), milieu: ['air'] },

  // Petroleum fractions (air: total VOC only)
  { id: 'aliphatiques', nom: 'Hydrocarbures aliphatiques (fractions)', cas: [], cov: FRACTION_ALIPHATIQUE, milieu: ['air'] },
  { id: 'aromatiques', nom: 'Hydrocarbures aromatiques (fractions)', cas: [], cov: FRACTION_AROMATIQUE, milieu: ['air'] },

  // PAH (air 12° annexe IV a; water 4°)
  { id: 'bap', nom: 'Benzo(a)pyrène', cas: ['50-32-8'], noms: ['benzo a pyrene'], annexeIV: 'a', milieu: ['air', 'eau'] },
  { id: 'dbaha', nom: 'Dibenzo(a,h)anthracène', cas: ['53-70-3'], noms: ['dibenzo a h anthracene', 'dibenz a h anthracene'], annexeIV: 'a', milieu: ['air'] },
  { id: 'bbf', nom: 'Benzo(b)fluoranthène', cas: ['205-99-2'], noms: ['benzo b fluoranthene'], milieu: ['eau'] },
  { id: 'bkf', nom: 'Benzo(k)fluoranthène', cas: ['207-08-9'], noms: ['benzo k fluoranthene'], milieu: ['eau'] },
  { id: 'bghip', nom: 'Benzo(g,h,i)pérylène', cas: ['191-24-2'], noms: ['benzo g h i perylene'], milieu: ['eau'] },
  { id: 'ip', nom: 'Indéno(1,2,3-cd)pyrène', cas: ['193-39-5'], noms: ['indeno 1 2 3 cd pyrene', 'indeno 1 2 3 c d pyrene'], milieu: ['eau'] },
  { id: 'anthracene', nom: 'Anthracène', cas: ['120-12-7'], noms: ['anthracene'], milieu: ['eau'] },
  { id: 'fluoranthene', nom: 'Fluoranthène', cas: ['206-44-0'], noms: ['fluoranthene'], milieu: ['eau'] },

  // ---- Water: macropollutants and physical parameters (31°, 32 1° 2°) ----
  { id: 'ph', nom: 'pH', cas: [], noms: ['ph', 'ph a 20 c', 'ph mesure', 'potentiel hydrogene'], milieu: ['eau'] },
  { id: 'temperature', nom: 'Température', cas: [], noms: ['temperature', 'temperature de l eau', 'temperature eau'], milieu: ['eau'] },
  { id: 'mes', nom: 'Matières en suspension (MES)', cas: [], noms: ['matieres en suspension', 'mes', 'matieres en suspension totales'], milieu: ['eau'] },
  { id: 'dbo5', nom: 'DBO5', cas: [], noms: ['dbo5', 'dbo 5', 'demande biochimique en oxygene', 'demande biochimique en oxygene 5 jours', 'dbo'], milieu: ['eau'] },
  { id: 'dco', nom: 'DCO', cas: [], noms: ['dco', 'demande chimique en oxygene', 'st dco'], milieu: ['eau'] },
  { id: 'ngl', nom: 'Azote global (en N)', cas: [], noms: ['azote global', 'ngl', 'azote total', 'azote global en n'], milieu: ['eau'] },
  { id: 'ntk', nom: 'Azote Kjeldahl (en N)', cas: [], noms: ['azote kjeldahl', 'ntk', 'azote kjeldahl ntk'], milieu: ['eau'] },
  { id: 'nitrates', nom: 'Nitrates', cas: ['14797-55-8'], noms: ['nitrates', 'nitrate', 'no3'], milieu: ['eau'] },
  { id: 'nitrites', nom: 'Nitrites', cas: ['14797-65-0'], noms: ['nitrites', 'nitrite', 'no2'], milieu: ['eau'] },
  { id: 'pt', nom: 'Phosphore total (en P)', cas: ['7723-14-0'], noms: ['phosphore total', 'phosphore', 'pt', 'p total'], milieu: ['eau'] },

  // ---- Water: industrial substances (32 3°) ----
  { id: 'phenols', nom: 'Indice phénols', cas: [], noms: ['indice phenol', 'indice phenols', 'phenols totaux', 'indice phenolique'], milieu: ['eau'] },
  { id: 'cyanures', nom: 'Indice cyanures totaux', cas: ['57-12-5'], noms: ['cyanures totaux', 'indice cyanures totaux', 'cyanures', 'cyanure total'], milieu: ['eau'] },
  { id: 'aox', nom: 'AOX (halogènes organiques adsorbables)', cas: [], noms: ['aox', 'halogenes organiques adsorbables', 'composes organo halogenes adsorbables', 'eox'], milieu: ['eau'] },
  { id: 'hct', nom: 'Hydrocarbures totaux', cas: [], noms: ['hydrocarbures totaux', 'indice hydrocarbures', 'indice hydrocarbure', 'hydrocarbures c10 c40', 'indice d hydrocarbures', 'hct'], milieu: ['eau'] },
  { id: 'fluorures', nom: 'Ion fluorure (en F-)', cas: ['16984-48-8'], noms: ['fluorures', 'fluorure', 'ion fluorure'], milieu: ['eau'] },

  // ---- Water: other dangerous substances (32 4°) ----
  { id: 'alachlore', nom: 'Alachlore', cas: ['15972-60-8'], milieu: ['eau'] },
  { id: 'atrazine', nom: 'Atrazine', cas: ['1912-24-9'], milieu: ['eau'] },
  { id: 'bde47', nom: 'Tétra BDE 47', cas: ['5436-43-1'], noms: ['bde 47', 'tetrabde 47'], milieu: ['eau'] },
  { id: 'bde99', nom: 'Penta BDE 99', cas: ['60348-60-9'], noms: ['bde 99', 'pentabde 99'], milieu: ['eau'] },
  { id: 'bde100', nom: 'Penta BDE 100', cas: ['189084-64-8'], noms: ['bde 100', 'pentabde 100'], milieu: ['eau'] },
  { id: 'bde153', nom: 'Hexa BDE 153', cas: ['68631-49-2'], noms: ['bde 153', 'hexabde 153'], milieu: ['eau'] },
  { id: 'bde154', nom: 'Hexa BDE 154', cas: ['207122-15-4'], noms: ['bde 154', 'hexabde 154'], milieu: ['eau'] },
  { id: 'bde183', nom: 'Hepta BDE 183', cas: ['207122-16-5'], noms: ['bde 183', 'heptabde 183'], milieu: ['eau'] },
  { id: 'bde209', nom: 'Déca BDE 209', cas: ['1163-19-5'], noms: ['bde 209', 'decabde 209'], milieu: ['eau'] },
  { id: 'chloroalcanes', nom: 'Chloroalcanes C10-13', cas: ['85535-84-8'], noms: ['chloroalcanes c10 13', 'chloroalcanes c10 c13', 'sccp'], milieu: ['eau'] },
  { id: 'chlorfenvinphos', nom: 'Chlorfenvinphos', cas: ['470-90-6'], milieu: ['eau'] },
  { id: 'chlorpyrifos', nom: 'Chlorpyrifos (éthylchlorpyrifos)', cas: ['2921-88-2'], noms: ['chlorpyrifos', 'chlorpyriphos', 'chlorpyrifos ethyl'], milieu: ['eau'] },
  { id: 'aldrine', nom: 'Aldrine', cas: ['309-00-2'], noms: ['aldrine', 'aldrin'], milieu: ['eau'] },
  { id: 'dieldrine', nom: 'Dieldrine', cas: ['60-57-1'], noms: ['dieldrine', 'dieldrin'], milieu: ['eau'] },
  { id: 'endrine', nom: 'Endrine', cas: ['72-20-8'], noms: ['endrine', 'endrin'], milieu: ['eau'] },
  { id: 'isodrine', nom: 'Isodrine', cas: ['465-73-6'], noms: ['isodrine', 'isodrin'], milieu: ['eau'] },
  { id: 'ddt', nom: 'DDT total', cas: ['50-29-3', '789-02-6', '72-55-9', '72-54-8'], noms: ['ddt total', 'ddt', 'p p ddt', 'o p ddt', 'p p dde', 'p p ddd'], milieu: ['eau'] },
  { id: 'diuron', nom: 'Diuron', cas: ['330-54-1'], milieu: ['eau'] },
  { id: 'endosulfan', nom: 'Endosulfan', cas: ['115-29-7', '959-98-8', '33213-65-9'], noms: ['endosulfan', 'alpha endosulfan', 'beta endosulfan'], milieu: ['eau'] },
  { id: 'hcb', nom: 'Hexachlorobenzène', cas: ['118-74-1'], noms: ['hexachlorobenzene'], milieu: ['eau'] },
  { id: 'hch', nom: 'Hexachlorocyclohexane (somme des isomères)', cas: ['608-73-1', '319-84-6', '319-85-7', '58-89-9', '319-86-8'], noms: ['hexachlorocyclohexane', 'hch', 'lindane', 'alpha hch', 'beta hch', 'gamma hch', 'delta hch'], milieu: ['eau'] },
  { id: 'isoproturon', nom: 'Isoproturon', cas: ['34123-59-6'], milieu: ['eau'] },
  { id: 'nonylphenols', nom: 'Nonylphénols', cas: ['84852-15-3', '25154-52-3', '104-40-5'], noms: ['nonylphenols', 'nonylphenol', '4 nonylphenol'], milieu: ['eau'] },
  { id: 'octylphenols', nom: 'Octylphénols', cas: ['140-66-9', '1806-26-4'], noms: ['octylphenols', 'octylphenol', '4 tert octylphenol'], milieu: ['eau'] },
  { id: 'pecb', nom: 'Pentachlorobenzène', cas: ['608-93-5'], noms: ['pentachlorobenzene'], milieu: ['eau'] },
  { id: 'pcp', nom: 'Pentachlorophénol', cas: ['87-86-5'], noms: ['pentachlorophenol'], milieu: ['eau'] },
  { id: 'simazine', nom: 'Simazine', cas: ['122-34-9'], milieu: ['eau'] },
  { id: 'tbt', nom: 'Composés du tributylétain', cas: ['36643-28-4', '688-73-3'], noms: ['tributyletain', 'tributyletain cation', 'tbt'], milieu: ['eau'] },
  { id: 'dehp', nom: 'Di(2-éthylhexyl)phtalate (DEHP)', cas: ['117-81-7'], noms: ['dehp', 'di 2 ethylhexyl phtalate', 'bis 2 ethylhexyl phtalate'], milieu: ['eau'] },
  { id: 'trifluraline', nom: 'Trifluraline', cas: ['1582-09-8'], milieu: ['eau'] },
  { id: 'pfos', nom: 'PFOS et dérivés', cas: ['45298-90-6', '1763-23-1'], noms: ['pfos', 'acide perfluorooctanesulfonique', 'perfluorooctane sulfonate'], milieu: ['eau'] },
  { id: 'quinoxyfene', nom: 'Quinoxyfène', cas: ['124495-18-7'], milieu: ['eau'] },
  { id: 'aclonifene', nom: 'Aclonifène', cas: ['74070-46-5'], milieu: ['eau'] },
  { id: 'bifenox', nom: 'Bifénox', cas: ['42576-02-3'], milieu: ['eau'] },
  { id: 'cybutryne', nom: 'Cybutryne', cas: ['28159-98-0'], milieu: ['eau'] },
  { id: 'cypermethrine', nom: 'Cyperméthrine', cas: ['52315-07-8'], milieu: ['eau'] },
  { id: 'hbcdd', nom: 'Hexabromocyclododécane (HBCDD)', cas: ['3194-55-6', '25637-99-4'], noms: ['hbcdd', 'hexabromocyclododecane'], milieu: ['eau'] },
  { id: 'heptachlore', nom: "Heptachlore et époxyde d'heptachlore", cas: ['76-44-8', '1024-57-3'], noms: ['heptachlore', 'heptachlore epoxyde', 'epoxyde d heptachlore'], milieu: ['eau'] },
  { id: 'ampa', nom: 'AMPA', cas: ['1066-51-9', '77521-29-0'], milieu: ['eau'] },
  { id: 'glyphosate', nom: 'Glyphosate', cas: ['1071-83-6'], milieu: ['eau'] },
  { id: 'tbp', nom: 'Tributylphosphate', cas: ['126-73-8'], noms: ['tributylphosphate', 'phosphate de tributyle'], milieu: ['eau'] },
  { id: 'biphenyle', nom: 'Biphényle', cas: ['92-52-4'], noms: ['biphenyle', 'biphenyl'], cov: cov('autre', 12, 154.21, true), milieu: ['air', 'eau'] },
]

export const PAR_ID = new Map(SUBSTANCES.map((s) => [s.id, s]))

const cle = (nom: string) => normaliser(nom).replace(/\b(et (ses )?composes|en [a-z0-9]+|total|totaux|dissous)\b/g, ' ').replace(/\s+/g, ' ').trim()

// A name or CAS can stand for one substance in air and another in water
// ("NO2": nitrogen dioxide, nitrites), hence lists.
const PAR_CAS = new Map<string, Substance[]>()
const PAR_NOM = new Map<string, Substance[]>()
const ajouter = (m: Map<string, Substance[]>, k: string, s: Substance) => {
  if (!k) return
  const l = m.get(k) ?? []
  if (!l.includes(s)) l.push(s)
  m.set(k, l)
}
for (const s of SUBSTANCES) {
  for (const c of s.cas) ajouter(PAR_CAS, c, s)
  for (const n of [s.nom, ...(s.noms ?? [])]) for (const k of [normaliser(n), cle(n)]) ajouter(PAR_NOM, k, s)
}

/** The substance a lab row is, for this medium; null when the arrêté does
 *  not name it. */
export function reconnaitre(nom: string, cas: string, milieu: 'air' | 'eau'): Substance | null {
  const dans = (l: Substance[] | undefined) => l?.find((s) => s.milieu.includes(milieu)) ?? null
  // The limits are on the raw effluent: dissolved or filtered fractions are
  // left to the user to assign.
  if (/dissous|filtr|soluble/i.test(nom)) return null
  const parCas = dans(PAR_CAS.get(cas.trim()))
  if (parCas) return parCas
  const sans = nom.replace(/\(([^)]{9,})\)/g, ' ')
  for (const k of [normaliser(nom), cle(nom), normaliser(sans), cle(sans)]) {
    const s = dans(PAR_NOM.get(k))
    if (s) return s
  }
  // "Trichlorométhane (chloroforme)": the name in brackets.
  for (const m of nom.matchAll(/\(([^)]+)\)/g)) {
    const s = dans(PAR_NOM.get(normaliser(m[1])))
    if (s) return s
  }
  return null
}

export const LIBELLES_CLASSE: Record<ClasseCov, string> = {
  cmr: 'CMR (H340, H350, H350i, H360D, H360F)',
  halogene: 'Halogéné H341 / H351',
  autre: 'Autre COV',
}
