/**
 * Official sources the checks cite. Légifrance identifiers were all read on
 * Légifrance (or on a ministry page linking to it) on 5 November 2026;
 * AIDA (INERIS) publishes the consolidated texts where Légifrance refuses
 * automated reading. An article's identifier changes with each new version:
 * the link then shows the version current at that date, the article's page
 * leads to the later ones.
 */

import type { Source } from './controles.ts'

const code = (libelle: string, id: string): Source => ({ libelle, url: `https://www.legifrance.gouv.fr/codes/article_lc/${id}` })
const arrete = (libelle: string, id: string): Source => ({ libelle, url: `https://www.legifrance.gouv.fr/loda/article_lc/${id}` })
const texte = (libelle: string, id: string): Source => ({ libelle, url: `https://www.legifrance.gouv.fr/loda/id/${id}` })

export const S = {
  // ---- ATTES: certification and models (arrêté du 9 février 2022) ----
  arrete2022: texte('Arrêté du 9 février 2022 (certification SSP et modèles d’attestation)', 'JORFTEXT000045220761'),
  arrete2022Aida: { libelle: 'Arrêté du 9 février 2022, texte consolidé (AIDA)', url: 'https://aida.ineris.fr/reglementation/arrete-090222-fixant-modalites-certification-prevues-articles-556-1-556-2-code' },
  modeleAlur: arrete('Arrêté du 9 février 2022, art. 74 (modèle ATTES-ALUR)', 'LEGIARTI000045231836'),
  livrableSecur: arrete('Arrêté du 9 février 2022, art. 81 (livrable ATTES-SECUR)', 'LEGIARTI000045231906'),
  modeleSecur: arrete('Arrêté du 9 février 2022, art. 83 (modèle ATTES-SECUR)', 'LEGIARTI000045231678'),
  livrableMemoire: arrete('Arrêté du 9 février 2022, art. 86 (livrable ATTES-MEMOIRE)', 'LEGIARTI000045231722'),
  modeleMemoire: arrete('Arrêté du 9 février 2022, art. 88 (modèle ATTES-MEMOIRE)', 'LEGIARTI000045231911'),
  independanceTravaux: arrete('Arrêté du 9 février 2022, art. 90 (indépendance ATTES-TRAVAUX)', 'LEGIARTI000045231582'),
  livrableTravaux: arrete('Arrêté du 9 février 2022, art. 95 (livrable ATTES-TRAVAUX)', 'LEGIARTI000045231597'),
  modeleTravaux: arrete('Arrêté du 9 février 2022, art. 97 (modèle ATTES-TRAVAUX)', 'LEGIARTI000045231601'),
  annulation2018: { libelle: 'Conseil d’État, 21 juillet 2021, n° 428437 (annulation de l’arrêté du 19 décembre 2018 au 1er mars 2022)', url: 'https://aida.ineris.fr/reglementation/decision-ndeg-428437-210721-conseil-detat-statuant-contentieux' },
  lneCertificats: { libelle: 'LNE — liste des certificats « SSP ATTES – Arrêté du 09/02/2022 »', url: 'https://www.lne.fr/recherche-certificats/fr/297' },
  lneRetraits: { libelle: 'LNE — certificats SSP réglementaires suspendus ou retirés', url: 'https://www.lne.fr/sites/default/files/bloc-telecharger/ssp-reglementaire-liste-suspensions-retraits.pdf' },
  equivalences: { libelle: 'Ministère — certification réglementaire et équivalences', url: 'https://www.ecologie.gouv.fr/politiques-publiques/sites-sols-pollues#la-certification-reglementaire-10' },

  // ---- ATTES-ALUR: code de l'environnement, code de l'urbanisme ----
  l5561: code('Code de l’environnement, art. L. 556-1', 'LEGIARTI000048247479'),
  l5562: code('Code de l’environnement, art. L. 556-2', 'LEGIARTI000028788965'),
  r5561: code('Code de l’environnement, art. R. 556-1', 'LEGIARTI000049913967'),
  r5561B: code('Code de l’environnement, art. R. 556-1-B (changement d’usage)', 'LEGIARTI000046762438'),
  r5562: code('Code de l’environnement, art. R. 556-2 (étude de sols)', 'LEGIARTI000046762519'),
  r5563: code('Code de l’environnement, art. R. 556-3', 'LEGIARTI000035769003'),
  d5561A: code('Code de l’environnement, art. D. 556-1 A (types d’usage)', 'LEGIARTI000046762430'),
  r43116: code('Code de l’urbanisme, art. R. 431-16 n) et o)', 'LEGIARTI000053903389'),
  r44281: code('Code de l’urbanisme, art. R. 442-8-1', 'LEGIARTI000031390577'),

  // ---- Cessation d'activité ICPE ----
  l51261: code('Code de l’environnement, art. L. 512-6-1', 'LEGIARTI000048247469'),
  l51276: code('Code de l’environnement, art. L. 512-7-6', 'LEGIARTI000048247460'),
  l512121: code('Code de l’environnement, art. L. 512-12-1', 'LEGIARTI000042655635'),
  r512391: code('Code de l’environnement, art. R. 512-39-1', 'LEGIARTI000049913755'),
  r5124625: code('Code de l’environnement, art. R. 512-46-25', 'LEGIARTI000049913802'),
  r512661: code('Code de l’environnement, art. R. 512-66-1', 'LEGIARTI000049913823'),
  r512663: code('Code de l’environnement, art. R. 512-66-3 (rubriques soumises à ATTES-SECUR en déclaration)', 'LEGIARTI000049913825'),
  r512751: code('Code de l’environnement, art. R. 512-75-1 (mise en sécurité)', 'LEGIARTI000049913832'),
  r512393: code('Code de l’environnement, art. R. 512-39-3', 'LEGIARTI000052089907'),
  r5124627: code('Code de l’environnement, art. R. 512-46-27', 'LEGIARTI000052089904'),

  // ---- Déclaration IOTA ----
  r21432: code('Code de l’environnement, art. R. 214-32 (contenu de la déclaration)', 'LEGIARTI000046017018'),
  r21432_1: code('Code de l’environnement, art. R. 214-32-1', 'LEGIARTI000046015707'),
  r2141: code('Code de l’environnement, art. R. 214-1 (nomenclature IOTA)', 'LEGIARTI000052149965'),
  nomenclatureAida: { libelle: 'Nomenclature IOTA en vigueur (AIDA, PDF)', url: 'https://aida.ineris.fr/reglementation/consulter-nomenclature-iota-r214-1-vigueur-version-pdf' },
  r21433: code('Code de l’environnement, art. R. 214-33', 'LEGIARTI000046017040'),
  r21435: code('Code de l’environnement, art. R. 214-35 (délai d’opposition)', 'LEGIARTI000053561202'),
  livre2Aida: { libelle: 'Code de l’environnement, livre II, partie réglementaire (AIDA) — dont R. 214-42 (cumul)', url: 'https://aida.ineris.fr/reglementation/livre-ii-milieux-physiques-titre-i-eau-milieux-aquatiques-marins-partie' },
  r41419: code('Code de l’environnement, art. R. 414-19 (évaluation des incidences Natura 2000)', 'LEGIARTI000046885095'),
  r41423: code('Code de l’environnement, art. R. 414-23 (contenu de l’évaluation Natura 2000)', 'LEGIARTI000022090274'),
  r12221: code('Code de l’environnement, art. R. 122-2-1 (clause filet)', 'LEGIARTI000045413959'),
  apgForage: texte('Arrêté du 11 septembre 2003, rubrique 1.1.1.0 (applicable jusqu’au 30 décembre 2027)', 'JORFTEXT000000415722'),
  apgPrelevement: texte('Arrêté du 11 septembre 2003, prélèvements soumis à déclaration (1.1.2.0, 1.2.1.0, 1.3.1.0)', 'JORFTEXT000000415723'),
  apgForage2026: { libelle: 'Arrêté du 18 mars 2026, règles générales des forages (applicable au 31 décembre 2027)', url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053722986' },
  arrete2006: texte('Arrêté du 9 août 2006 (niveaux de référence R1, rubrique 2.2.3.0)', 'JORFTEXT000000423497'),
  codeMinier: code('Code minier, art. L. 411-1 (déclaration des forages de plus de 10 m)', 'LEGIARTI000023505812'),
  duplos: { libelle: 'DUPLOS (BRGM) — déclaration code minier et code BSS', url: 'https://duplos.developpement-durable.gouv.fr/' },
  teleprocedure: { libelle: 'Service-public — téléprocédure « Déposer une déclaration IOTA »', url: 'https://entreprendre.service-public.gouv.fr/vosdroits/R62929' },
  guideGunenv: { libelle: 'Guide de la téléprocédure DIOTA (GUNenv)', url: 'https://monaiot.developpement-durable.gouv.fr/sites/default/files/documents/GUNenv%20-%20Guide%20teleprocedure%20DIOTA.pdf' },

  // ---- Where to find the information ----
  annuaire: { libelle: 'Annuaire des entreprises (SIRET, NAF)', url: 'https://annuaire-entreprises.data.gouv.fr/' },
  cadastre: { libelle: 'Cadastre', url: 'https://www.cadastre.gouv.fr/' },
  georisques: { libelle: 'Géorisques (SIS, CASIAS, ICPE)', url: 'https://www.georisques.gouv.fr/' },
  gesteau: { libelle: 'Gest’eau (SAGE)', url: 'https://www.gesteau.fr/sage' },
  sandre: { libelle: 'Sandre (masses d’eau)', url: 'https://www.sandre.eaufrance.fr/' },
  inpn: { libelle: 'INPN (sites Natura 2000)', url: 'https://inpn.mnhn.fr/' },
  infoterre: { libelle: 'InfoTerre (BSS)', url: 'https://infoterre.brgm.fr/' },
} satisfies Record<string, Source>
