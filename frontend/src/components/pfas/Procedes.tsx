import { Cite } from './Cite'

const ENCRE = '#0d2421'
const MUET = '#4f625f'
const ECF = '#b4471a'
const TELOMERE = '#6250d6'

/** A carbon chain drawn as beads: fluorinated (filled) or not (hollow). */
function Chaine({
  x,
  y,
  n,
  couleur,
  vides = 0,
  ramification,
  tete,
}: {
  x: number
  y: number
  n: number
  couleur: string
  vides?: number
  /** Index of the bead carrying a branch (one extra fluorinated carbon). */
  ramification?: number
  tete: string
}) {
  const pas = 22
  const perles = Array.from({ length: n + vides }, (_, i) => i)
  const fin = x + (n + vides - 1) * pas
  return (
    <g>
      <line x1={x} x2={fin} y1={y} y2={y} stroke="#9aaba8" strokeWidth={2} />
      {ramification !== undefined && <line x1={x + ramification * pas} x2={x + ramification * pas} y1={y} y2={y + 22} stroke="#9aaba8" strokeWidth={2} />}
      {perles.map((i) => (
        <circle key={i} cx={x + i * pas} cy={y} r={8} fill={i < n ? couleur : '#fff'} stroke={i < n ? '#fff' : '#9aaba8'} strokeWidth={2} />
      ))}
      {ramification !== undefined && <circle cx={x + ramification * pas} cy={y + 22} r={8} fill={couleur} stroke="#fff" strokeWidth={2} />}
      <text x={fin + 14} y={y + 4} fontSize="12" fontWeight={700} fill={ENCRE}>
        {tete}
      </text>
    </g>
  )
}

/**
 * The two manufacturing routes, side by side, and what each leaves in a
 * sample: the key to reading "electrochemical" in the source leads.
 */
export function Procedes() {
  return (
    <div className="pfas-procedes" id="procedes">
      <div className="card">
        <h3>Le procédé électrochimique</h3>
        <p className="pfas-procedes__sous-titre">ou fluoration électrochimique (ECF), années 1950 à 2002</p>
        <svg viewBox="0 0 330 124" width="100%" role="img" aria-label="Procédé électrochimique : chaînes linéaires et ramifiées">
          <text x="0" y="14" fontSize="11" fill={MUET}>
            Le même produit contient :
          </text>
          <Chaine x={12} y={40} n={8} couleur={ECF} tete="SO₃H  linéaire" />
          <Chaine x={12} y={84} n={7} couleur={ECF} ramification={3} tete="SO₃H  ramifié" />
        </svg>
        <p>
          Une chaîne carbonée ordinaire est plongée dans du fluorure d’hydrogène et soumise à un courant électrique : tous ses atomes
          d’hydrogène sont remplacés par du fluor. La réaction est brutale ; une partie des chaînes se casse ou se réarrange. Le produit est
          donc un <strong>mélange</strong> : chaînes linéaires, <strong>chaînes ramifiées</strong>, et chaînes plus courtes ou plus longues
          que voulu <Cite ids={['iarc2025', 'benskin2010']} />.
        </p>
        <p>
          C’est ainsi qu’étaient fabriqués le <strong>PFOS</strong>, le <strong>PFHxS</strong> et une partie du PFOA, notamment dans les
          mousses d’extinction 3M, jusqu’à l’arrêt de cette chimie par 3M (annoncé en 2000, achevé pour l’essentiel fin 2002)
          <Cite ids={['tm2000', 'barzenHanson2017']} />.
        </p>
        <p className="pfas-procedes__trace">
          <strong>Ce qu’on retrouve dans un échantillon :</strong> des sulfonates (PFOS, PFHxS) dominants, souvent ensemble, et des
          isomères ramifiés quand le laboratoire les distingue.
        </p>
      </div>
      <div className="card">
        <h3>La télomérisation</h3>
        <p className="pfas-procedes__sous-titre">procédé des fluorotélomères, toujours utilisé</p>
        <svg viewBox="0 0 330 124" width="100%" role="img" aria-label="Télomérisation : chaîne linéaire assemblée par paires de carbones">
          <text x="0" y="14" fontSize="11" fill={MUET}>
            Assemblée deux carbones par deux carbones :
          </text>
          <Chaine x={12} y={46} n={6} vides={2} couleur={TELOMERE} tete="SO₃H  6:2 FTS" />
          <text x="12" y="76" fontSize="11" fill={MUET}>
            6 carbones fluorés
          </text>
          <text x="144" y="76" fontSize="11" fill={MUET}>
            2 non fluorés
          </text>
          <text x="0" y="106" fontSize="11" fill={ENCRE}>
            se dégrade en milieu oxygéné en → PFHxA, PFPeA
          </text>
        </svg>
        <p>
          La chaîne fluorée est construite pièce par pièce, en ajoutant des motifs de deux carbones fluorés. Le produit est{' '}
          <strong>linéaire</strong>, avec un nombre <strong>pair</strong> de carbones fluorés, et garde en bout de chaîne deux carbones non
          fluorés : ce sont les <strong>fluorotélomères</strong>, comme le 6:2 FTS (6 carbones fluorés, 2 non fluorés)
          <Cite ids={['iarc2025', 'buck2011']} />.
        </p>
        <p>
          Ces composés sont des <em>précurseurs</em> : dans l’environnement, le bout non fluoré se dégrade et laisse des acides carboxyliques
          (PFHxA, PFPeA…) <Cite ids={['zhang2016', 'houtz2013']} />. C’est la chimie des mousses et des suppresseurs de brouillard actuels
          <Cite ids={['backe2013', 'bmuv2019']} />.
        </p>
        <p className="pfas-procedes__trace">
          <strong>Ce qu’on retrouve dans un échantillon :</strong> du 6:2 FTS et des carboxylates courts (PFHxA, PFPeA), des chaînes
          linéaires, peu ou pas de PFOS.
        </p>
      </div>
    </div>
  )
}
