import { useState } from 'react'
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

/** Tools grouped by stage of a site study; each group has its own colour (`.categorie--<id>`). */
interface Categorie {
  id: 'contexte' | 'terrain' | 'labo' | 'conformite'
  titre: string
  /** Stage of the study, shown as a short label. */
  etape: string
  description: string
  outils: Outil[]
}

const CATEGORIES: Categorie[] = [
  {
    id: 'contexte',
    titre: "Contexte du site et plan d'investigation",
    etape: 'Préparer',
    description: 'Lire les données publiques autour du site, puis dessiner le maillage des investigations.',
    outils: [
      {
        titre: 'Assistant Site Setting',
        accroche: "L'environnement d'une adresse",
        description:
          'Saisissez une adresse ou des parcelles : eau, air, sol, nature et risques sont lus en direct dans les bases publiques et restitués sur carte.',
        points: ['Géorisques, Hub’Eau, IGN, INPN', 'Distances et sources pour chaque donnée'],
        route: '/site-setting',
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
    ],
  },
  {
    id: 'terrain',
    titre: 'Données de terrain',
    etape: 'Investiguer',
    description: 'Mettre en forme les observations des sondages et lire les paramètres mesurés dans la nappe.',
    outils: [
      {
        titre: 'Logs de forage',
        accroche: 'Sondages et piézomètres',
        description:
          "Générez les logs de sondages et de piézomètres au format ERM depuis le classeur de saisie : lithologie, équipement, PID, niveau d'eau, échantillons et résultats d'analyses.",
        points: ['Contrôles de cohérence avant diffusion', 'Impression PDF et export SVG'],
        page: 'logs-forage.html',
      },
      {
        titre: 'Conditions de la nappe',
        accroche: 'Atténuation naturelle des COHV',
        description:
          'Chargez les fiches de prélèvement et, si vous les avez, les résultats du laboratoire : processus redox, criblage USEPA 1998 de la déchloration réductrice, devenir du chlorure de vinyle et données d’entrée BIOCHLOR.',
        points: ['pH, redox, O₂, conductivité, température en fin de purge', 'Récapitulatif min / max / moyenne et synthèse de la nappe', 'Contrôle des mesures, rapport Excel'],
        route: '/conditions-nappe',
      },
    ],
  },
  {
    id: 'labo',
    titre: "Résultats d'analyses et interprétation",
    etape: 'Interpréter',
    description: 'Mettre en forme les résultats du laboratoire et interpréter les familles de composés qui le demandent.',
    outils: [
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
    ],
  },
  {
    id: 'conformite',
    titre: 'Contrôle de conformité',
    etape: 'Vérifier',
    description: 'Vérifier les rejets des unités de traitement et la conformité des livrables avant diffusion.',
    outils: [
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
    ],
  },
]

function Carte({ outil, numero }: { outil: Outil; numero: number }) {
  const contenu = (
    <>
      <span className="outil__numero">{String(numero).padStart(2, '0')}</span>
      <span className="eyebrow" style={{ marginBottom: '0.4rem' }}>
        {outil.accroche}
      </span>
      <h3 className="outil__titre">{outil.titre}</h3>
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

const CLE_REPLIES = 'accueil.categoriesRepliees'

/** Categories folded by the viewer, remembered in this browser. */
function lireRepliees(): Set<string> {
  try {
    const brut = localStorage.getItem(CLE_REPLIES)
    return new Set(brut ? (JSON.parse(brut) as string[]) : [])
  } catch {
    return new Set()
  }
}

export default function Accueil() {
  const [repliees, setRepliees] = useState<Set<string>>(lireRepliees)
  function changer(suite: Set<string>) {
    setRepliees(suite)
    try {
      localStorage.setItem(CLE_REPLIES, JSON.stringify([...suite]))
    } catch {
      /* folding is only a convenience */
    }
  }
  const basculer = (id: string) => {
    const suite = new Set(repliees)
    if (suite.has(id)) suite.delete(id)
    else suite.add(id)
    changer(suite)
  }
  /** From the summary: unfold the category, then bring it into view. */
  function allerA(id: string) {
    if (repliees.has(id)) {
      const suite = new Set(repliees)
      suite.delete(id)
      changer(suite)
    }
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const toutReplie = CATEGORIES.every((c) => repliees.has(c.id))

  // One running number across groups, in reading order: each group starts after the previous ones.
  const debuts = CATEGORIES.map((_, i) => CATEGORIES.slice(0, i).reduce((n, c) => n + c.outils.length, 0))
  const total = CATEGORIES.reduce((n, c) => n + c.outils.length, 0)
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">ERM — boîte à outils</p>
        <h1 style={{ maxWidth: '22ch' }}>SIR Toolbox France</h1>
        <p className="lede">
          {total === 9 ? 'Neuf' : total} outils pour mener une étude de site, de la lecture des données publiques au terrain, à
          l'interprétation des résultats d'analyses et au contrôle de conformité.
        </p>

        <nav className="categories" aria-label="Catégories d'outils">
          {CATEGORIES.map((c, i) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className={`categories__lien categorie--${c.id}`}
              onClick={(e) => {
                e.preventDefault()
                allerA(c.id)
              }}
            >
              <span className="categories__etape">
                {i + 1}. {c.etape}
              </span>
              <span className="categories__titre">{c.titre}</span>
              <span className="categories__nombre">
                {c.outils.length} outil{c.outils.length > 1 ? 's' : ''}
              </span>
            </a>
          ))}
        </nav>

        <div className="categories__actions">
          <button type="button" className="btn btn--petit btn--ghost" onClick={() => changer(toutReplie ? new Set() : new Set(CATEGORIES.map((c) => c.id)))}>
            {toutReplie ? 'Tout déplier' : 'Tout replier'}
          </button>
        </div>

        {CATEGORIES.map((c, i) => {
          const ouverte = !repliees.has(c.id)
          return (
            <section key={c.id} id={c.id} className={`categorie categorie--${c.id}`} aria-labelledby={`titre-${c.id}`}>
              <header className="categorie__entete">
                <button
                  type="button"
                  className="categorie__bascule"
                  aria-expanded={ouverte}
                  aria-controls={`outils-${c.id}`}
                  onClick={() => basculer(c.id)}
                >
                  <span className="categorie__etape">
                    {i + 1}. {c.etape}
                  </span>
                  <h2 id={`titre-${c.id}`} className="categorie__titre">
                    {c.titre}
                  </h2>
                  <span className="categorie__chevron" aria-hidden="true">
                    {ouverte ? '▾' : '▸'}
                  </span>
                </button>
                <p className="categorie__texte">
                  {c.description}
                  {!ouverte && (
                    <span className="categorie__replie">
                      {' '}
                      · {c.outils.length} outil{c.outils.length > 1 ? 's' : ''} : {c.outils.map((o) => o.titre).join(', ')}
                    </span>
                  )}
                </p>
              </header>
              <div id={`outils-${c.id}`} className="grid grid--2" style={{ gap: '1.25rem' }} hidden={!ouverte}>
                {c.outils.map((outil, j) => (
                  <Carte key={outil.titre} outil={outil} numero={debuts[i] + j + 1} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}
