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
    titre: 'Site Setting',
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
          Quatre outils pour préparer une étude de site, de la lecture des données publiques à la mise en forme des résultats
          d'analyses.
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
