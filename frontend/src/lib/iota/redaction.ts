/**
 * Draft text for each section of the dossier, written in the register of the
 * ERM declarations (Issoudun, 2025) and filled from what the reader entered
 * and what the public services returned. Anything the tool cannot know is
 * left as "[À compléter : …]", which the Word export highlights, so a draft
 * never passes for a verified statement.
 *
 * Paragraphs are separated by a blank line; a line starting with "• " is a
 * bullet, "**…**" marks bold, as in the Word export.
 */

import { cardinalLabelFr, cardinalPhraseFr } from '../geo'
import { qualifiePente } from '../topographie'
import { estNatura, type Contexte } from './contexte'
import { LIBELLE_GESTION, syntheseDossier, volumesPurge, type Dossier, type SectionId } from './modele'
import { fluxR1, LIBELLE_REGIME, nombre } from './nomenclature'

export const A_COMPLETER = (quoi: string) => `[À compléter : ${quoi}]`

const n = (x: number, d = 1) => x.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 })
const n2 = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

export function distance(m: number): string {
  if (m >= 1000) return `${n(m / 1000, 1)} km`
  return `${Math.max(10, Math.round(m / 10) * 10)} m`
}

export function departement(codeInsee: string): string {
  if (!codeInsee) return ''
  return codeInsee.startsWith('97') ? codeInsee.slice(0, 3) : codeInsee.slice(0, 2)
}

/** "SAFRAN SA - ISSOUDUN (36)" */
export function sousTitre(d: Dossier): string {
  const dep = d.site.departement || departement(d.site.codeInsee)
  return [d.declarant.nom, d.site.commune && `${d.site.commune.toUpperCase()}${dep ? ` (${dep})` : ''}`].filter(Boolean).join(' - ')
}

function declarant(d: Dossier) {
  return d.declarant.nom || A_COMPLETER('nom du déclarant')
}

function lieu(d: Dossier) {
  const dep = d.site.departement || departement(d.site.codeInsee)
  return `${d.site.adresse ? `${d.site.adresse.replace(/,?\s*\d{5}.*$/, '')} ` : ''}sur la commune de ${d.site.commune || A_COMPLETER('commune')}${dep ? ` (${dep})` : ''}`
}

function rubriquesDeclarees(d: Dossier) {
  return syntheseDossier(d).retenues.filter((r) => r.classement.regime === 'D' || r.classement.regime === 'A')
}

function listeRubriques(d: Dossier): string {
  const r = rubriquesDeclarees(d)
  if (!r.length) return A_COMPLETER('rubrique(s) de la nomenclature')
  return r.map((x) => `${x.rubrique.code} (« ${x.rubrique.intitule} »)`).join(', ')
}

const forage = (d: Dossier) => d.rubriques.actives.includes('1.1.1.0')
const prelevement = (d: Dossier) => ['1.1.2.0', '1.2.1.0', '1.3.1.0'].some((c) => d.rubriques.actives.includes(c))
const rejetSurface = (d: Dossier) => ['2.2.1.0', '2.2.3.0'].some((c) => d.rubriques.actives.includes(c))
const pluvial = (d: Dossier) => d.rubriques.actives.includes('2.1.5.0')
const zoneHumide = (d: Dossier) => d.rubriques.actives.includes('3.3.1.0')
const litMajeur = (d: Dossier) => d.rubriques.actives.includes('3.2.2.0')

function plage(vals: number[], unite: string): string {
  if (!vals.length) return ''
  const a = Math.min(...vals)
  const b = Math.max(...vals)
  return a === b ? `${n(a)} ${unite}` : `entre ${n(a)} et ${n(b)} ${unite}`
}

function ouvragesConserves(d: Dossier) {
  return d.ouvrages.filter((o) => o.statut !== 'a-reboucher')
}

// ---- Sections -------------------------------------------------------------------

function contexteDemande(d: Dossier): string {
  const maitrise =
    d.site.maitrise === 'proprietaire'
      ? 'est propriétaire'
      : d.site.maitrise === 'autorise'
        ? 'dispose du droit de réaliser le projet'
        : 'fait l’objet d’une procédure en cours lui conférant le droit de réaliser le projet'
  const p = [
    `La société ${declarant(d)}${d.declarant.siret ? ` (SIRET ${d.declarant.siret})` : ''}, dont le siège est situé ${d.declarant.adresse || A_COMPLETER('adresse du déclarant')}, ${maitrise} d’un site localisé ${lieu(d)}${d.site.parcelles ? `, sur les parcelles cadastrales ${d.site.parcelles}` : ''}.`,
    A_COMPLETER('historique du site, études et travaux antérieurs (plan de gestion, échanges avec la DREAL ou la DDT)'),
    `Le projet relève de la ou des rubriques ${listeRubriques(d)} de la nomenclature annexée à l’article R. 214-1 du code de l’environnement et est soumis à déclaration au titre des articles L. 214-1 à L. 214-6 du même code.`,
    'Le présent document constitue l’étude d’incidence du projet au titre de l’article R. 214-32 du code de l’environnement.',
  ]
  return p.join('\n\n')
}

function topographie(c: Contexte | null): string {
  const t = c?.topographie
  if (!t) return `Le site se trouve à une altitude d’environ ${A_COMPLETER('altitude')} m NGF. ${A_COMPLETER('pente et orientation')}`
  const pente = t.pentePourcent < 1 ? 'est quasiment plat' : `présente une ${qualifiePente(t.pentePourcent)} (environ ${n(t.pentePourcent)} %) orientée vers le ${cardinalLabelFr(t.penteDirection)}`
  return `Le site se trouve à une altitude d’environ ${Math.round(t.altitudeCentre)} m NGF et ${pente}. L’altitude varie de ${Math.round(t.altitudeMin)} à ${Math.round(t.altitudeMax)} m NGF sur un carré de ${Math.round(t.coteM)} m de côté centré sur le site (RGE ALTI®, IGN).`
}

function geologieRegionale(c: Contexte | null): string {
  const f = c?.feuilleGeologique
  const carte = f ? `la carte géologique au 1/50 000 de ${f.nom ?? A_COMPLETER('nom de la feuille')} n° ${f.numero}` : `la carte géologique au 1/50 000 de ${A_COMPLETER('nom et numéro de la feuille')}`
  return `Sur la base de ${carte}, publiée par le BRGM, la principale formation géologique rencontrée dans le secteur d’étude, sous une éventuelle couche de remblais, est ${A_COMPLETER('formation géologique au droit du site')}.\n\nLa Figure 2 présente un extrait de la carte géologique locale.`
}

function geologieLocale(d: Dossier): string {
  const prof = d.ouvrages.map((o) => nombre(o.profondeur)).filter((x): x is number => x !== null)
  return [
    `D’après les coupes des sondages réalisés au droit du site${d.ouvrages.length ? ', ainsi que des ouvrages installés' : ''}, la géologie rencontrée est la suivante (depuis la surface) :`,
    `• Remblais : ${A_COMPLETER('nature et épaisseur')} ;`,
    `• ${A_COMPLETER('formation sous-jacente, nature, épaisseur et profondeur maximale investiguée')}${prof.length ? ` (recoupée jusqu’à ${n(Math.max(...prof))} m de profondeur)` : ''}.`,
    d.ouvrages.length ? 'Les coupes géologiques et techniques des ouvrages sont présentées en Annexe A.' : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function hydrologie(c: Contexte | null): string {
  const r = c?.reseau
  const etat = A_COMPLETER('état écologique et chimique de la masse d’eau superficielle (données de l’agence de l’eau, dernière année disponible)')
  if (!r) return `${A_COMPLETER('cours d’eau le plus proche, distance et direction')}\n\n${etat}`
  const nom = r.nom ? `le cours d’eau « ${r.nom} »` : 'un cours d’eau sans toponyme dans la BD TOPO®'
  const p = [`D’après la BD TOPO® de l’IGN, ${nom} se trouve à ${distance(r.distanceM)} ${cardinalPhraseFr(r.direction)} du site.`]
  if (!r.nom && r.exutoire) p.push(`Il rejoint « ${r.exutoire.nom} » environ ${distance(r.exutoire.cheminM)} en aval.`)
  else if (!r.nom && r.premierNomme) p.push(`Le cours d’eau nommé le plus proche est « ${r.premierNomme.nom} », à ${distance(r.premierNomme.distanceM)} ${cardinalPhraseFr(r.premierNomme.direction)} du site.`)
  return `${p.join(' ')}\n\n${etat}`
}

function hydrogeologie(d: Dossier, c: Contexte | null): string {
  const p: string[] = []
  if (c?.massesEau.length) {
    const libres = c.massesEau.filter((m) => !m.captive)
    const liste = (libres.length ? libres : c.massesEau).map((m) => `« ${m.nom} » (${m.code})`).join(', ')
    p.push(`Le site se trouve au droit de la ou des masses d’eau souterraines ${liste} (référentiel Sandre)${libres.length && libres.length < c.massesEau.length ? `, au-dessus de masses d’eau captives (${c.massesEau.filter((m) => m.captive).map((m) => m.nom).join(', ')})` : ''}.`)
  }
  const niveaux = d.ouvrages.map((o) => nombre(o.niveauEau)).filter((x): x is number => x !== null)
  p.push(
    niveaux.length
      ? `D’après les mesures effectuées au droit des ouvrages du site, le niveau de la nappe est compris ${plage(niveaux, 'm')} de profondeur.`
      : `D’après les mesures effectuées au droit des ouvrages du site, le niveau de la nappe est compris entre ${A_COMPLETER('profondeurs')} m de profondeur.`,
  )
  p.push(`Le sens d’écoulement des eaux souterraines est globalement orienté vers le ${A_COMPLETER('direction')} au droit du site.`)
  if (c?.ades) {
    const a = c.ades
    p.push(
      `Le point d’eau ADES le plus proche (${a.codeBss}${a.entitesHydrogeologiques[0] ? `, ${a.entitesHydrogeologiques[0]}` : ''}) est situé à ${distance(a.distanceM)} ${cardinalPhraseFr(a.direction)} du site${a.profondeurNappeM !== null ? ` ; la dernière mesure disponible y donne un niveau à ${n(a.profondeurNappeM)} m de profondeur${a.dateMesure ? ` (${a.dateMesure})` : ''}` : ''}.`,
    )
  }
  return p.join('\n\n')
}

function usages(c: Contexte | null): string {
  const p = [A_COMPLETER('captages d’alimentation en eau potable et périmètres de protection (données de l’ARS)')]
  const pr = c?.prelevements ?? []
  if (pr.length) {
    const lignes = pr.slice(0, 8).map((o) => `• ${o.nom ?? 'Ouvrage sans nom'}${o.usage ? `, usage « ${o.usage.toLowerCase()} »` : ''}, à ${distance(o.distanceM)} ${cardinalPhraseFr(o.direction)} du site (position hydraulique ${A_COMPLETER('amont / aval')}) ;`)
    p.push(`D’après la Banque nationale des prélèvements quantitatifs en eau (BNPE), ${pr.length} ouvrage${pr.length > 1 ? 's' : ''} de prélèvement ${pr.length > 1 ? 'sont recensés' : 'est recensé'} dans un rayon de 3 km autour du site, dont :`, ...lignes)
  } else if (c) {
    p.push('Aucun ouvrage de prélèvement n’est recensé dans la BNPE dans un rayon de 3 km autour du site.')
  }
  p.push(`Par ailleurs, d’après la base de données InfoTerre, ${A_COMPLETER('nombre')} ouvrages sont recensés dans la Banque du Sous-Sol (BSS) du BRGM dans un rayon de 1 km autour du site, avec notamment : ${A_COMPLETER('ouvrages, profondeur, usage, position hydraulique')}.`)
  p.push(`${A_COMPLETER('sensibilité de la nappe au regard des usages recensés')}\n\nLa Figure 4 présente la localisation des captages dans le voisinage du site.`)
  return p.join('\n\n')
}

function zonesProtegees(c: Contexte | null): string {
  if (!c) return A_COMPLETER('zones naturelles protégées ou inventoriées (ZNIEFF, Natura 2000, parcs, réserves)')
  const z = c.zonages
  const dedans = z.filter((x) => x.inclus)
  const p: string[] = []
  if (dedans.length) p.push(`Le site est localisé dans ${dedans.map((x) => `la zone « ${x.nom} » (${x.categorie})`).join(', ')}.`)
  else p.push('Le site étudié n’est pas localisé dans une zone protégée ou d’inventaire (ZNIEFF, Natura 2000, parc, réserve naturelle).')
  const proches = z.filter((x) => !x.inclus && !estNatura(x)).slice(0, 4)
  if (proches.length)
    p.push(`Les zones les plus proches du site sont : ${proches.map((x) => `« ${x.nom} » (${x.categorie.replace(/ — .*/, '').replace('Zone naturelle d’intérêt écologique (ZNIEFF) de type', 'ZNIEFF')}) à ${distance(x.distanceM)} ${x.direction ? cardinalPhraseFr(x.direction) : ''} du site`).join(' ; ')}.`)
  const n2000 = z.filter((x) => estNatura(x) && !x.inclus)
  if (n2000.length) p.push(`La zone Natura 2000 la plus proche du site est localisée à ${distance(n2000[0].distanceM)} ${n2000[0].direction ? cardinalPhraseFr(n2000[0].direction) : ''} de celui-ci (« ${n2000[0].nom} »${n2000[0].code ? `, ${n2000[0].code}` : ''}).`)
  else if (!z.some(estNatura)) p.push('Aucune zone Natura 2000 n’est recensée dans un rayon de 10 km autour du site.')
  p.push('La Figure 5 présente la localisation des zones protégées dans le voisinage du site.')
  return p.join('\n\n')
}

function zonagesEau(c: Contexte | null): string {
  if (!c) return A_COMPLETER('SDAGE, SAGE, zone de répartition des eaux, zones sensible et vulnérable')
  const p: string[] = []
  p.push(c.bassin ? `Le site appartient au bassin « ${c.bassin.nom} », couvert par le ${c.bassin.sdage}.` : A_COMPLETER('bassin et SDAGE'))
  p.push(
    c.sages.length
      ? `Il est inclus dans le périmètre du ${c.sages.map((x) => `SAGE « ${x.nom} » (${x.etat})`).join(' et du ')}.`
      : 'Il n’est inclus dans le périmètre d’aucun SAGE (référentiel Sandre).',
  )
  p.push(
    c.zre.length
      ? `**Le site est situé en zone de répartition des eaux (${c.zre.join(', ')})** : les prélèvements y relèvent de la rubrique 1.3.1.0 de la nomenclature, avec des seuils abaissés.`
      : 'Le site n’est pas situé en zone de répartition des eaux.',
  )
  if (c.zonesSensibles.length) p.push(`Il est situé en zone sensible à l’eutrophisation (${c.zonesSensibles.join(', ')}).`)
  if (c.zoneVulnerable) p.push('Il est situé en zone vulnérable aux pollutions par les nitrates d’origine agricole.')
  if (c.atlasInondation !== null)
    p.push(
      c.atlasInondation.length
        ? `La commune est couverte par l’atlas des zones inondables ${c.atlasInondation.map((a) => `« ${a} »`).join(', ')} (Géorisques). ${A_COMPLETER('position du site vis-à-vis des zones inondables et du PPRI éventuel')}`
        : 'La commune n’est couverte par aucun atlas des zones inondables (Géorisques).',
    )
  return p.join('\n\n')
}

function descriptionProjet(d: Dossier): string {
  const o = d.ouvrages
  const p: string[] = []
  if (o.length) {
    const prof = o.map((x) => nombre(x.profondeur)).filter((x): x is number => x !== null)
    const diam = [...new Set(o.map((x) => x.diametreForage).filter(Boolean))]
    const tubes = [...new Set(o.map((x) => x.tube).filter(Boolean))]
    const conserves = ouvragesConserves(d)
    const rebouches = o.filter((x) => x.statut === 'a-reboucher')
    const crees = o.filter((x) => x.statut === 'a-creer')
    p.push(
      `Le projet porte sur ${o.length} ouvrage${o.length > 1 ? 's' : ''} (${o.map((x) => x.nom).join(', ')})${prof.length ? `, réalisé${o.length > 1 ? 's' : ''} ${plage(prof, 'mètres')} de profondeur` : ''}${crees.length ? `, dont ${crees.length} à créer` : ''}. Les coupes géologiques et techniques des ouvrages sont présentées en Annexe A.`,
    )
    p.push(
      `Chaque ouvrage ${crees.length && crees.length === o.length ? 'sera foré' : 'a été foré'} ${A_COMPLETER('méthode de foration (marteau fond de trou, tarière…)')}${diam.length ? `, avec un diamètre de forage de ${diam.join(' ou ')} mm` : ''}.`,
    )
    p.push(
      `La structure interne des ouvrages est composée d’un tube plein ${tubes.join(' ou ') || A_COMPLETER('matériau et diamètre')}, d’une crépine positionnée dans le massif filtrant (${o
        .filter((x) => x.crepineDe && x.crepineA)
        .map((x) => `${x.nom} : ${x.crepineDe} à ${x.crepineA} m`)
        .join(' ; ') || A_COMPLETER('cotes des crépines')}), d’un bouchon de fond, d’un scellement en bentonite au-dessus du massif filtrant et d’un scellement en béton en tête. L’ensemble permet une bonne représentativité des eaux souterraines dans les horizons ciblés, tout en assurant l’étanchéité et la pérennité des ouvrages.`,
    )
    if (rebouches.length)
      p.push(
        `${rebouches.length > 1 ? `Les ${rebouches.length} ouvrages` : 'L’ouvrage'} ${rebouches.map((x) => x.nom).join(', ')} ${rebouches.length > 1 ? 'feront' : 'fera'} l’objet d’un rebouchage dans les règles de l’art, selon la norme NF X10-999 « Réalisation, suivi et abandon d’ouvrages de captage ou de surveillance des eaux souterraines réalisés par forages ». ${conserves.length} ouvrage${conserves.length > 1 ? 's sont conservés' : ' est conservé'}.`,
      )
    p.push('La Figure 3 indique la position des ouvrages.')
  } else {
    p.push(A_COMPLETER('nature, consistance, volume et objet des installations, ouvrages, travaux ou activités'))
  }
  for (const r of rubriquesDeclarees(d)) {
    if (r.rubrique.code === '1.1.1.0') continue
    p.push(`Rubrique ${r.rubrique.code} : ${r.classement.motif}, soit un régime de ${LIBELLE_REGIME[r.classement.regime!].toLowerCase()}.`)
  }
  return p.join('\n\n')
}

function modalitesTravaux(d: Dossier): string {
  const p = [`Les travaux seront réalisés ${A_COMPLETER('période, durée et entreprise')}.`]
  if (forage(d))
    p.push(
      'Les forages seront réalisés par une entreprise qualifiée, conformément aux prescriptions générales applicables à la rubrique 1.1.1.0 et à la norme NF X10-999. Les cuttings de foration seront gérés comme des déchets, après caractérisation, en filière adaptée.',
    )
  return p.join('\n\n')
}

function programmeSuivi(d: Dossier): string {
  const conserves = ouvragesConserves(d)
  return [
    `Le suivi des eaux souterraines sera réalisé à une fréquence ${A_COMPLETER('semestrielle')} incluant une campagne en période de hautes eaux et une campagne en période de basses eaux.`,
    `${conserves.length ? `Les ouvrages ${conserves.map((o) => o.nom).join(', ')}` : 'Les ouvrages du réseau de surveillance'} seront échantillonnés à chaque campagne. Les analyses porteront sur ${A_COMPLETER('paramètres analysés')} :`,
    '• Métaux (arsenic, cadmium, chrome, cuivre, mercure, plomb, nickel, zinc) ;',
    '• Hydrocarbures totaux (C10-C40) ;',
    '• BTEX (benzène, toluène, éthylbenzène, xylènes) ;',
    '• Composés organo-halogénés volatils (COHV).',
  ].join('\n\n')
}

function procedurePrelevement(d: Dossier): string {
  const nv = nombre(d.purge.nbVolumes) ?? 3
  return [
    'Les prélèvements d’eau souterraine seront réalisés conformément à la norme NF X31-615 et à la procédure suivante :',
    '• Mesure du niveau piézométrique à l’aide d’une sonde interface, permettant de détecter la présence éventuelle d’une phase flottante ;',
    '• Purge préalable de chaque ouvrage par pompage, afin de renouveler l’eau contenue dans l’ouvrage, avec un suivi en continu des paramètres physico-chimiques (pH, conductivité électrique spécifique, potentiel redox, teneur en oxygène dissous) ;',
    `• Poursuite de la purge jusqu’à stabilisation des paramètres ; si cette stabilisation n’est pas atteinte, un volume équivalent à ${n(nv, 0)} fois le volume d’eau contenu dans le forage (tube et massif filtrant) sera purgé ;`,
    '• Collecte des échantillons en sortie du tuyau d’exhaure, en régulant le débit de pompage afin de limiter les pertes de composés volatils, et transfert direct dans les flacons fournis par le laboratoire d’analyse.',
  ].join('\n\n')
}

function gestionEaux(d: Dossier): string {
  const pg = volumesPurge(d)
  const p: string[] = []
  if (pg.lignes.length) {
    p.push(`Dans l’hypothèse d’une purge de ${n(pg.nbVolumes, 0)} fois le volume au droit de l’ensemble des ouvrages de surveillance, le volume total purgé maximal sera le suivant :`)
    pg.lignes.forEach((l, i) =>
      p.push(`${i + 1}. ${l.ouvrage.nom} : π × ${n2(l.rayonM)} (rayon du forage en m)² × ${n(l.hauteurEauM)} (hauteur d’eau en m) × ${n(pg.nbVolumes, 0)} (volume renouvelé) ≈ ${n2(l.volumeM3)} m³`),
    )
    p.push(
      `Volume total de purge : ≈ ${n2(pg.parCampagneM3)} m³ par campagne${pg.campagnesAn ? `, soit ≈ ${n2(pg.annuelM3)} m³/an pour ${n(pg.campagnesAn, 0)} campagne${pg.campagnesAn > 1 ? 's' : ''} par an` : ''}.`,
    )
    if (pg.ignores.length) p.push(A_COMPLETER(`données manquantes pour ${pg.ignores.join(', ')}`))
  }
  const g = d.purge.gestion
  p.push(
    g === 'charbon'
      ? 'Les eaux issues des opérations de purge seront traitées sur site, via une filtration sur charbon actif permettant la fixation des composés organiques présents, avant rejet dans l’environnement.'
      : g === 'evacuation'
        ? 'Les eaux issues des opérations de purge seront collectées en cuve étanche puis éliminées dans une filière agréée, avec bordereau de suivi des déchets.'
        : g === 'reseau'
          ? 'Les eaux issues des opérations de purge seront rejetées au réseau d’assainissement après accord du gestionnaire (autorisation de déversement, article L. 1331-10 du code de la santé publique).'
          : A_COMPLETER('mode de gestion des eaux de purge'),
  )
  return p.join('\n\n')
}

function choixProjet(d: Dossier): string {
  const p: string[] = []
  if (forage(d))
    p.push(
      `Le réseau de surveillance a été défini ${A_COMPLETER('en concertation avec la DREAL / dans le cadre du plan de gestion')} de façon à encadrer les zones sources et à suivre la qualité des eaux souterraines en amont et en aval hydraulique du site. Le recours à des ouvrages existants a été privilégié afin de limiter le nombre de forages et donc les risques de mise en communication de nappes.`,
    )
  if (prelevement(d))
    p.push(`Le prélèvement a été dimensionné au plus juste des besoins ${A_COMPLETER('justification du débit et du volume retenus, alternatives écartées')}.`)
  if (pluvial(d)) p.push(`La gestion des eaux pluviales privilégie l’infiltration à la parcelle et la régulation des débits ${A_COMPLETER('alternatives étudiées')}.`)
  p.push(A_COMPLETER('solutions de substitution envisagées et raisons du choix (techniques, environnementales, économiques)'))
  return p.join('\n\n')
}

function incidencesQuantitatives(d: Dossier): string {
  const pg = volumesPurge(d)
  const p: string[] = []
  if (pg.lignes.length)
    p.push(
      `Les prélèvements liés à la purge des ouvrages représentent au plus ≈ ${n2(pg.parCampagneM3)} m³ par campagne${pg.campagnesAn ? ` (≈ ${n2(pg.annuelM3)} m³/an)` : ''}, répartis sur plusieurs ouvrages et sur la durée d’une campagne. **Compte tenu de ces faibles volumes, les opérations de purge n’auront pas d’incidence sur le niveau piézométrique local ni sur le fonctionnement de l’aquifère.**`,
    )
  const v = d.rubriques.valeurs
  if (d.rubriques.actives.includes('1.1.2.0') && nombre(v['1.1.2.0']?.volume) !== null)
    p.push(`Le volume prélevé atteint ${n(nombre(v['1.1.2.0']?.volume)!, 0)} m³/an. ${A_COMPLETER('rayon d’influence, rabattement attendu, incidence sur les ouvrages voisins')}`)
  if (d.rubriques.actives.includes('1.3.1.0'))
    p.push(`Le prélèvement est situé en zone de répartition des eaux. ${A_COMPLETER('part du volume prélevable du sous-bassin, période de prélèvement')}`)
  if (!p.length) p.push(A_COMPLETER('incidences sur la ressource en eau (volumes, niveaux, écoulements)'))
  return p.join('\n\n')
}

function incidencesQualitatives(d: Dossier): string {
  const p: string[] = []
  if (forage(d))
    p.push(
      'Les principaux risques qualitatifs liés aux ouvrages souterrains sont l’infiltration d’eaux de surface le long de l’ouvrage et la mise en communication de niveaux aquifères distincts. Ces risques sont maîtrisés par la cimentation annulaire en tête, le bouchon de bentonite au-dessus du massif filtrant et la tête d’ouvrage étanche, fermée et protégée.',
    )
  if (d.ouvrages.length || forage(d))
    p.push(
      d.purge.gestion === 'charbon'
        ? '**Compte tenu de la gestion des eaux de purge, traitées sur site par filtration sur charbon actif avant tout rejet, le risque de pollution secondaire est considéré comme maîtrisé.**'
        : d.purge.gestion === 'evacuation'
          ? '**Les eaux de purge étant collectées et éliminées en filière agréée, aucun rejet n’a lieu dans le milieu naturel.**'
          : A_COMPLETER('incidence des rejets des eaux de purge sur la qualité des eaux'),
    )
  if (d.rubriques.actives.includes('2.2.3.0')) {
    const { flux } = fluxR1(d.rubriques.valeurs['2.2.3.0'] ?? {})
    if (flux.length)
      p.push(
        `Les flux rejetés sont les suivants : ${flux.map((f) => `${f.p.nom} ${f.flux.toLocaleString('fr-FR', { maximumSignificantDigits: 3 })} ${f.p.uniteR1} (R1 : ${f.p.r1.toLocaleString('fr-FR')} ${f.p.uniteR1})`).join(' ; ')}. ${A_COMPLETER('dilution dans le milieu récepteur et comparaison aux normes de qualité environnementale')}`,
      )
  }
  if (pluvial(d)) p.push(A_COMPLETER('qualité des eaux pluviales rejetées et dispositifs de traitement (débourbeur, séparateur, noues)'))
  if (!p.length) p.push(A_COMPLETER('incidences sur la qualité des eaux'))
  return p.join('\n\n')
}

function incidencesMilieux(d: Dossier, c: Contexte | null): string {
  const r = c?.reseau
  const p: string[] = []
  p.push(
    r
      ? `Le cours d’eau le plus proche${r.nom ? ` (« ${r.nom} »)` : ''} se trouve à ${distance(r.distanceM)} du site. ${rejetSurface(d) ? A_COMPLETER('incidence du rejet sur le cours d’eau récepteur') : 'Le projet ne comporte aucun rejet direct dans les eaux superficielles et n’affecte ni le lit, ni les berges, ni l’écoulement des cours d’eau.'}`
      : A_COMPLETER('incidences sur le milieu aquatique, l’écoulement et le ruissellement'),
  )
  if (zoneHumide(d)) p.push(A_COMPLETER('fonctionnalités de la zone humide affectée (hydrologique, biogéochimique, biologique)'))
  if (litMajeur(d)) p.push(A_COMPLETER('volume soustrait à l’expansion des crues et incidence sur les lignes d’eau'))
  if (!pluvial(d) && !zoneHumide(d) && !litMajeur(d)) p.push('Le projet ne modifie pas l’imperméabilisation du site ni les conditions de ruissellement.')
  return p.join('\n\n')
}

function incidencesChantier(): string {
  return [
    `En phase travaux, les risques sont liés à la circulation des engins, au stockage de carburant et, le cas échéant, aux fluides de foration. Les engins seront ravitaillés sur une aire étanche ou au-dessus d’un bac de rétention, et un kit anti-pollution sera disponible en permanence sur le chantier.`,
    'Ces incidences sont temporaires et limitées à la durée des travaux.',
  ].join('\n\n')
}

function variations(): string {
  return 'Les campagnes de suivi en hautes et basses eaux permettent d’apprécier l’influence des variations saisonnières sur le niveau et la qualité de la nappe. En période de sécheresse, les prélèvements resteront limités aux volumes de purge et respecteront les éventuelles mesures de restriction des usages de l’eau prises par arrêté préfectoral (VigiEau). Le projet n’est pas de nature à aggraver les effets du changement climatique sur la ressource en eau.'
}

function compatibiliteSdage(c: Contexte | null): string {
  const sdage = c?.bassin?.sdage ?? A_COMPLETER('SDAGE du bassin')
  return [
    `Le site est situé dans le périmètre du ${sdage} 2022-2027, approuvé par arrêté du préfet coordonnateur de bassin.`,
    `Le projet contribue aux orientations du SDAGE relatives à la réduction des pollutions et à la protection de la qualité des eaux souterraines, en permettant ${A_COMPLETER('objet du projet : suivi de la qualité, réhabilitation…')}. ${A_COMPLETER('orientations et dispositions du SDAGE concernées et justification de la compatibilité')}`,
  ].join('\n\n')
}

function compatibiliteSage(c: Contexte | null): string {
  if (!c) return A_COMPLETER('SAGE applicable et compatibilité avec son PAGD, conformité à son règlement')
  if (!c.sages.length) return 'Le site n’est inclus dans le périmètre d’aucun schéma d’aménagement et de gestion des eaux (SAGE).'
  return c.sages
    .map(
      (x) =>
        `Le site est inclus dans le périmètre du SAGE « ${x.nom} » (${x.etat}). ${A_COMPLETER('compatibilité avec les dispositions du plan d’aménagement et de gestion durable (PAGD) et conformité aux articles du règlement du SAGE')}`,
    )
    .join('\n\n')
}

function compatibilitePgri(c: Contexte | null): string {
  const bassin = c?.bassin ? c.bassin.sdage.replace('SDAGE', 'PGRI') : A_COMPLETER('PGRI du bassin')
  const azi = c?.atlasInondation?.length
    ? `La commune est couverte par l’atlas des zones inondables ${c.atlasInondation.map((a) => `« ${a} »`).join(', ')}.`
    : c?.atlasInondation
      ? 'La commune n’est couverte par aucun atlas des zones inondables.'
      : ''
  return `Le site est couvert par le ${bassin} 2022-2027 (article L. 566-7 du code de l’environnement). ${azi} ${A_COMPLETER('PPRI éventuel')} Le projet ne crée aucun obstacle à l’écoulement des crues et ne réduit pas les champs d’expansion des crues ; il est compatible avec les objectifs du PGRI.`.replace(/\s+/g, ' ')
}

function objectifsQualite(): string {
  return `Le projet s’inscrit dans la gestion équilibrée et durable de la ressource en eau prévue par l’article L. 211-1 du code de l’environnement, notamment la préservation des écosystèmes aquatiques et la protection des eaux contre toute pollution. Il ne compromet pas l’atteinte des objectifs de bon état des masses d’eau concernées. ${A_COMPLETER('objectifs de qualité de l’article D. 211-10 (eaux conchylicoles, piscicoles) le cas échéant')}`
}

function mesuresErc(d: Dossier): string {
  const p: string[] = ['**Mesures d’évitement**']
  if (forage(d)) p.push('• Implantation des ouvrages hors des périmètres de protection des captages et à distance des sources potentielles de pollution, conformément aux prescriptions générales ;')
  p.push('• Absence de rejet d’eaux non traitées dans le milieu naturel.')
  p.push('**Mesures de réduction**')
  if (forage(d)) {
    p.push('• Cimentation annulaire en tête, bouchon de bentonite au-dessus du massif filtrant, tête d’ouvrage étanche et cadenassée ;')
    p.push('• Rebouchage des ouvrages abandonnés selon la norme NF X10-999 ;')
  }
  if (d.ouvrages.length) p.push(`• Gestion des eaux de purge : ${LIBELLE_GESTION[d.purge.gestion].toLowerCase()} ;`)
  p.push('• Kit anti-pollution et procédures de ravitaillement en phase travaux.')
  p.push('**Mesures de compensation**')
  p.push('Compte tenu de l’absence d’incidence résiduelle significative, aucune mesure de compensation n’est nécessaire.')
  return p.join('\n\n')
}

function prescriptionsSpecifiques(d: Dossier): string {
  const apg = [...new Set(rubriquesDeclarees(d).flatMap((r) => r.apg))]
  return [
    'Le déclarant ne sollicite pas de prescriptions spécifiques modifiant les prescriptions générales applicables.',
    apg.length ? `Le projet respectera les prescriptions générales des textes suivants :\n\n${apg.map((a) => `• ${a} ;`).join('\n\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function moyensSurveillance(d: Dossier): string {
  const p: string[] = []
  if (d.ouvrages.length || forage(d)) p.push('• Contrôle visuel de l’état des têtes d’ouvrage (capot, cadenas, margelle) à chaque campagne ;')
  p.push('• Consignation des volumes purgés ou prélevés et des quantités d’eau traitées ;')
  if (prelevement(d)) p.push('• Mise en place d’un compteur volumétrique et tenue d’un registre des volumes prélevés ;')
  if (rejetSurface(d)) p.push('• Analyses périodiques de la qualité des eaux rejetées en sortie de traitement ;')
  p.push('• Transmission des résultats de suivi dans un rapport après chaque campagne.')
  return p.join('\n\n')
}

function moyensIntervention(): string {
  return [
    'En cas d’incident (déversement accidentel, dégradation d’un ouvrage), les mesures suivantes seront mises en œuvre :',
    '• Arrêt immédiat des opérations et confinement de la pollution à l’aide du kit anti-pollution ;',
    '• Information sans délai du service chargé de la police de l’eau (article L. 211-5 du code de l’environnement) ;',
    '• Réparation ou, à défaut, rebouchage de l’ouvrage endommagé dans les règles de l’art.',
  ].join('\n\n')
}

function conclusion(d: Dossier, c: Contexte | null): string {
  const p = [`Le présent projet, porté par ${declarant(d)}, vise à ${A_COMPLETER('objet du projet')} sur le site de ${d.site.commune || A_COMPLETER('commune')}.`]
  if (d.ouvrages.length) p.push('**Compte tenu des faibles volumes d’eau extraits, il est considéré que les opérations de purge n’auront pas d’incidence sur le niveau piézométrique local ni sur le fonctionnement de l’aquifère.**')
  if (d.purge.gestion === 'charbon') p.push('**Compte tenu de la gestion des eaux de purge, traitées sur site par filtration sur charbon actif avant tout rejet, le risque de pollution secondaire est considéré comme maîtrisé.**')
  const r = c?.reseau
  const protegeDedans = c?.zonages.some((z) => z.inclus)
  p.push(
    `**Compte tenu de la distance aux cours d’eau les plus proches${r ? ` (${distance(r.distanceM)})` : ''} et ${protegeDedans ? 'des mesures prévues vis-à-vis des zones protégées' : 'de l’absence de zones protégées au droit du site'}, il est considéré que le projet ne présente pas de risque pour les milieux aquatiques ou les écosystèmes sensibles.**`,
  )
  p.push('**L’étude d’incidence conclut à l’absence d’impact significatif du projet sur les milieux aquatiques, les usages de la ressource en eau, ou les zones protégées à proximité.**')
  return p.join('\n\n')
}

function naturaAnalyse(c: Contexte | null): string {
  if (!c) return A_COMPLETER('sites Natura 2000 les plus proches, distance et direction')
  const n2000 = c.zonages.filter(estNatura)
  const dedans = n2000.filter((z) => z.inclus)
  const p: string[] = []
  if (dedans.length) p.push(`**Le site est localisé dans le site Natura 2000 ${dedans.map((z) => `« ${z.nom} » (${z.code ?? 'code à préciser'}, ${z.categorie.replace('Natura 2000 — ', '')})`).join(' et ')}.**`)
  else p.push('Le site étudié n’est pas localisé dans une zone Natura 2000.')
  const autour = n2000.filter((z) => !z.inclus).slice(0, 5)
  if (autour.length) {
    p.push('Les sites Natura 2000 les plus proches sont les suivants :')
    for (const z of autour)
      p.push(`• « ${z.nom} »${z.code ? ` (${z.code})` : ''}, ${z.categorie.includes('Habitats') ? 'zone spéciale de conservation ou site d’importance communautaire (directive Habitats)' : 'zone de protection spéciale (directive Oiseaux)'}, situé à ${distance(z.distanceM)} ${z.direction ? cardinalPhraseFr(z.direction) : ''} du site ;`)
  } else if (!dedans.length) p.push('Aucun site Natura 2000 n’est recensé dans un rayon de 10 km autour du site.')
  p.push('La Figure 1 présente la localisation des zones Natura 2000 à l’échelle locale.')
  return p.join('\n\n')
}

function naturaConclusion(d: Dossier, c: Contexte | null): string {
  if (d.naturaIncidence === 'possible')
    return [
      'L’évaluation préliminaire ne permet pas d’exclure une incidence sur un ou plusieurs sites Natura 2000. Conformément aux II et III de l’article R. 414-23 du code de l’environnement, le dossier comprend :',
      `• L’analyse des effets temporaires ou permanents, directs ou indirects, du projet sur l’état de conservation des habitats et espèces ayant justifié la désignation des sites : ${A_COMPLETER('analyse')} ;`,
      `• Les mesures de suppression ou de réduction de ces effets : ${A_COMPLETER('mesures')}.`,
    ].join('\n\n')
  const proche = c?.zonages.filter(estNatura).find((z) => !z.inclus)
  return `L’emprise du site se trouve en dehors${proche ? ` et à ${distance(proche.distanceM)}` : ''} des zones Natura 2000 les plus proches ; le projet ne comporte ni rejet ni prélèvement susceptible d’affecter les habitats ou les espèces ayant justifié leur désignation. **Compte tenu de la distance importante aux zones Natura 2000 les plus proches, il est considéré que le projet n’aura aucune incidence sur ces zones Natura 2000.** Conformément au I de l’article R. 414-23 du code de l’environnement, l’évaluation se limite à cette analyse préliminaire.`
}

function rntProjet(d: Dossier): string {
  const o = d.ouvrages
  const conserves = ouvragesConserves(d)
  const rebouches = o.filter((x) => x.statut === 'a-reboucher')
  const p = [`Le projet relève de la ou des rubriques ${listeRubriques(d)} de la nomenclature « loi sur l’eau ».`]
  if (o.length)
    p.push(
      `Le réseau de surveillance comprendra ${conserves.length} ouvrage${conserves.length > 1 ? 's' : ''}${rebouches.length ? ` ; ${rebouches.length} autre${rebouches.length > 1 ? 's' : ''} ouvrage${rebouches.length > 1 ? 's feront' : ' fera'} l’objet d’un rebouchage dans les règles de l’art, selon la norme NF X10-999` : ''}.`,
    )
  return p.join('\n\n')
}

function rntIncidences(d: Dossier, c: Contexte | null): string {
  return [
    d.ouvrages.length ? 'Les volumes d’eau extraits lors des purges sont faibles et sans incidence sur le niveau de la nappe. Les eaux de purge sont gérées sans rejet direct non traité dans le milieu naturel.' : A_COMPLETER('incidences principales'),
    naturaAnalyse(c).split('\n\n')[0] + ' ' + (d.naturaIncidence === 'absence' ? 'Le projet n’aura aucune incidence sur les zones Natura 2000.' : ''),
  ].join('\n\n')
}

export const PROPOSITIONS: Record<SectionId, (d: Dossier, c: Contexte | null) => string> = {
  contexteDemande: (d) => contexteDemande(d),
  topographie: (_d, c) => topographie(c),
  geologieRegionale: (_d, c) => geologieRegionale(c),
  geologieLocale: (d) => geologieLocale(d),
  hydrologie: (_d, c) => hydrologie(c),
  hydrogeologie: (d, c) => hydrogeologie(d, c),
  usages: (_d, c) => usages(c),
  zonesProtegees: (_d, c) => zonesProtegees(c),
  zonagesEau: (_d, c) => zonagesEau(c),
  descriptionProjet: (d) => descriptionProjet(d),
  modalitesTravaux: (d) => modalitesTravaux(d),
  programmeSuivi: (d) => programmeSuivi(d),
  procedurePrelevement: (d) => procedurePrelevement(d),
  gestionEaux: (d) => gestionEaux(d),
  choixProjet: (d) => choixProjet(d),
  incidencesQuantitatives: (d) => incidencesQuantitatives(d),
  incidencesQualitatives: (d) => incidencesQualitatives(d),
  incidencesMilieux: (d, c) => incidencesMilieux(d, c),
  incidencesChantier: () => incidencesChantier(),
  variations: () => variations(),
  compatibiliteSdage: (_d, c) => compatibiliteSdage(c),
  compatibiliteSage: (_d, c) => compatibiliteSage(c),
  compatibilitePgri: (_d, c) => compatibilitePgri(c),
  objectifsQualite: () => objectifsQualite(),
  mesuresErc: (d) => mesuresErc(d),
  prescriptionsSpecifiques: (d) => prescriptionsSpecifiques(d),
  moyensSurveillance: (d) => moyensSurveillance(d),
  moyensIntervention: () => moyensIntervention(),
  autresProcedures: () => `${A_COMPLETER('autorisations ou déclarations déposées pour le même projet au titre d’une autre législation (ICPE, permis, plan de gestion…), date de dépôt et autorité compétente ; à défaut : « Aucune autre demande n’a été déposée pour ce projet. »')}`,
  conclusion: (d, c) => conclusion(d, c),
  naturaAnalyse: (_d, c) => naturaAnalyse(c),
  naturaConclusion: (d, c) => naturaConclusion(d, c),
  rntProjet: (d) => rntProjet(d),
  rntIncidences: (d, c) => rntIncidences(d, c),
}

/** Text of a section: what the reader wrote, else the proposal. */
export function texte(id: SectionId, d: Dossier, c: Contexte | null = d.contexte): string {
  const t = d.textes[id]
  return t && t.trim() ? t : PROPOSITIONS[id](d, c)
}
