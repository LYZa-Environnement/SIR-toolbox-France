import { Link } from 'react-router-dom'

interface Outil {
  titre: string
  accroche: string
  description: string
  points: string[]
  /** In-app route, or a standalone page under the site base. */
  route?: string
  page?: string
}

const OUTILS: Outil[] = [
  {
    titre: 'Assistant Site Setting',
    accroche: "L'environnement d'une adresse",
    description:
      'Saisissez une adresse ou des parcelles : eau, air, sol, nature et risques sont lus en direct dans les bases publiques et restitués sur carte.',
    points: ['Géorisques, Hub’Eau, IGN, INPN', 'Distances et sources pour chaque donnée'],
    route: '/site-setting',
  },
  {
    titre: 'Résultats labo',
    accroche: 'Mise en forme des résultats',
    description:
      'Chargez un rapport de laboratoire (eau, sol, gaz du sol / air ambiant) : tableau mis en forme, comparaison aux valeurs guides et export Excel.',
    points: ['Conversion µg/support → µg/m³', 'Export standard ou expert'],
    route: '/resultats-labo',
  },
  {
    titre: 'Interprétation PFAS',
    accroche: 'Ordres de grandeur et sources',
    description:
      'Chargez des résultats PFAS (eaux souterraines ou sols) : la somme des 20, le TFA et le 6:2 FTS situés sur des valeurs publiées, le profil de chaque échantillon et des pistes de sources, chaque lecture sourcée.',
    points: ['Directive 2020/2184, ANSES, RIVM, littérature', 'Profil par longueur de chaîne, bilan du fluor'],
    route: '/interpretation-pfas',
  },
  {
    titre: 'Conditions de la nappe',
    accroche: 'Atténuation naturelle des COHV',
    description:
      'Chargez les fiches de prélèvement et, si vous les avez, les résultats du laboratoire : processus redox, criblage USEPA 1998 de la déchloration réductrice, devenir du chlorure de vinyle et données d’entrée BIOCHLOR.',
    points: ['pH, redox, O₂, conductivité, température en fin de purge', 'Contrôle des mesures, rapport Excel'],
    route: '/conditions-nappe',
  },
  {
    titre: 'Conformité des rejets',
    accroche: 'Arrêté du 2 février 1998',
    description:
      "Vérifiez les rejets d'une unité de traitement d'air ou d'eau (extraction des gaz du sol, pompage-traitement) au regard des valeurs limites de l'arrêté du 2 février 1998.",
    points: ['Article 27 (air), articles 31, 32 et 34 (eau)', 'Seuils de flux, sommes de COV, rapport Excel'],
    route: '/conformite-rejets',
  },
  {
    titre: 'Vérification de livrables SSP',
    accroche: 'ATTES, IOTA, NF X31-620, LNE',
    description:
      'Déposez un livrable — attestation ATTES, déclaration IOTA, rapport d’étude ou de travaux, offre : chaque exigence des textes, de la norme NF X31-620 et du référentiel LNE SSP est recherchée dans le document, avec sa source.',
    points: ['Arrêté du 9 février 2022, R. 214-32, NF X31-620-1 à 5', 'Où trouver l’information, comment corriger'],
    route: '/verification-livrables',
  },
  {
    titre: 'Logs de forage',
    accroche: 'Sondages et piézomètres',
    description:
      "Générez les logs de sondages et de piézomètres au format ERM depuis le classeur de saisie : lithologie, équipement, PID, niveau d'eau, échantillons et résultats d'analyses.",
    points: ['Contrôles de cohérence avant diffusion', 'Impression PDF et export SVG'],
    page: 'logs-forage.html',
  },
  {
    titre: 'Données environnementales publiques',
    accroche: 'Carte interactive',
    description:
      'Explorez sur une carte les ouvrages, captages, sites et sols pollués, zones naturelles et photographies aériennes historiques.',
    points: ['BRGM, BNPE, AtlaSanté', 'Remonter le temps (IGN)'],
    page: 'donnees-environnementales.html',
  },
  {
    titre: 'Création maillage',
    accroche: "Plan d'échantillonnage",
    description:
      "Dessinez un maillage d'investigation sur parcelles : grille orientée, zones multiples, types de points, saisie de terrain et restitution.",
    points: ['Fond cadastral et photo aérienne', 'Export des points'],
    page: 'creation-maillage.html',
  },
]

function Carte({ outil, numero }: { outil: Outil; numero: number }) {
  const contenu = (
    <>
      <span className="outil__numero">{String(numero).padStart(2, '0')}</span>
      <span className="eyebrow" style={{ marginBottom: '0.4rem' }}>
        {outil.accroche}
      </span>
      <h2 className="outil__titre">{outil.titre}</h2>
      <p className="outil__texte">{outil.description}</p>
      <ul className="outil__points">
        {outil.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <span className="outil__ouvrir">Ouvrir l'outil →</span>
    </>
  )
  return outil.route ? (
    <Link to={outil.route} className="card outil">
      {contenu}
    </Link>
  ) : (
    <a href={`${import.meta.env.BASE_URL}${outil.page}`} className="card outil">
      {contenu}
    </a>
  )
}

export default function Accueil() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">ERM — boîte à outils</p>
        <h1 style={{ maxWidth: '22ch' }}>SIR Toolbox France</h1>
        <p className="lede">
          Neuf outils pour préparer une étude de site, de la lecture des données publiques à la mise en forme des résultats
          d'analyses, à l'interprétation des conditions de la nappe et au contrôle des rejets.
        </p>
        <div className="grid grid--2" style={{ marginTop: '2.5rem', gap: '1.25rem' }}>
          {OUTILS.map((outil, i) => (
            <Carte key={outil.titre} outil={outil} numero={i + 1} />
          ))}
        </div>
      </div>
    </section>
  )
}
