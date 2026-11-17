/**
 * Families of wells (or sampling points): samples that look alike once all
 * the compounds analysed and the field parameters are read together.
 *
 * Method, kept simple and stated on the page:
 * - compounds on a log scale (concentrations span orders of magnitude),
 *   a result below the LQ at half the LQ; field parameters as measured
 *   (CO2 and PID on a log scale); a compound never quantified, or measured
 *   in fewer than half the samples, is left out;
 * - every variable centred and scaled (z-score), a missing value at the
 *   mean; the two blocks — compounds and field parameters — weighted
 *   equally, so that thirty compounds do not drown five field parameters;
 * - hierarchical clustering, Ward's criterion (Ward, 1963) on Euclidean
 *   distances; the number of families chosen by the mean silhouette
 *   (Rousseeuw, 1987), between 2 and 6, without single-sample families;
 * - a principal component analysis for the map (two first axes) and the
 *   variables that shape them (correlation with the axes).
 *
 * Pure.
 */

export interface Variable {
  cle: string
  libelle: string
  groupe: 'terrain' | 'compose'
  unite: string
  /** Read on a log scale. */
  log: boolean
}

export interface Mesure {
  valeur: number
  inferieur: boolean
}

export interface EntreeFamilles {
  echantillons: string[]
  variables: Variable[]
  /** échantillon → variable → mesure. */
  mesures: Record<string, Record<string, Mesure | null | undefined>>
}

export interface Noeud {
  /** Leaves: sample index; merges: children. */
  feuille?: number
  gauche?: Noeud
  droite?: Noeud
  hauteur: number
  membres: number[]
}

export interface Trait {
  variable: Variable
  /** Mean z-score of the family on this variable. */
  z: number
}

export interface Famille {
  id: number
  nom: string
  membres: string[]
  hauts: Trait[]
  bas: Trait[]
}

export interface ResultatFamilles {
  echantillons: string[]
  variables: Variable[]
  /** Unweighted z-scores, samples × variables. */
  z: number[][]
  /** Sample order of the dendrogram leaves. */
  ordre: number[]
  arbre: Noeud
  k: number
  silhouette: number
  /** Silhouette for each k tried. */
  silhouettes: { k: number; s: number }[]
  groupes: number[]
  familles: Famille[]
  /** Scores on the two first principal axes. */
  coords: [number, number][]
  inerties: [number, number]
  /** Correlation of each variable with the two axes. */
  charges: { variable: Variable; x: number; y: number }[]
}

const LETTRES = 'ABCDEFGH'

function transformer(m: Mesure, v: Variable): number {
  const x = m.inferieur ? m.valeur / 2 : m.valeur
  return v.log ? Math.log10(Math.max(x, 1e-9)) : x
}

/**
 * Ward's clustering (Lance–Williams update on squared distances): each merge
 * is the one that least increases the within-family scatter, which gives
 * families of comparable weight rather than a few outliers apart.
 */
function classifier(d: number[][]): Noeud {
  const n = d.length
  let groupes: Noeud[] = d.map((_, i) => ({ feuille: i, hauteur: 0, membres: [i] }))
  // Squared distances between current groups.
  let d2 = d.map((r) => r.map((x) => x * x))
  while (groupes.length > 1) {
    let best = [0, 1]
    let min = Infinity
    for (let i = 0; i < groupes.length; i++) {
      for (let j = i + 1; j < groupes.length; j++) {
        if (d2[i][j] < min) {
          min = d2[i][j]
          best = [i, j]
        }
      }
    }
    const [a, b] = best
    const na = groupes[a].membres.length
    const nb = groupes[b].membres.length
    const fusion: Noeud = { gauche: groupes[a], droite: groupes[b], hauteur: Math.sqrt(min), membres: [...groupes[a].membres, ...groupes[b].membres] }
    const restants = groupes.map((_, k) => k).filter((k) => k !== a && k !== b)
    const nouvelle = restants.map((k) => {
      const nk = groupes[k].membres.length
      return ((na + nk) * d2[a][k] + (nb + nk) * d2[b][k] - nk * d2[a][b]) / (na + nb + nk)
    })
    d2 = [...restants.map((k, i) => [...restants.map((l) => d2[k][l]), nouvelle[i]]), [...nouvelle, 0]]
    groupes = [...restants.map((k) => groupes[k]), fusion]
  }
  void n
  return groupes[0]
}

/** The k groups obtained by cutting the tree at its k − 1 highest merges. */
function couper(arbre: Noeud, k: number, n: number): number[] {
  let feuilles: Noeud[] = [arbre]
  while (feuilles.length < k) {
    const i = feuilles.reduce((m, x, j) => (x.hauteur > feuilles[m].hauteur ? j : m), 0)
    const x = feuilles[i]
    if (!x.gauche || !x.droite) break
    feuilles = [...feuilles.slice(0, i), x.gauche, x.droite, ...feuilles.slice(i + 1)]
  }
  const groupes = new Array<number>(n).fill(0)
  feuilles.forEach((f, g) => f.membres.forEach((m) => (groupes[m] = g)))
  return groupes
}

function silhouette(d: number[][], groupes: number[]): number {
  const n = groupes.length
  let total = 0
  for (let i = 0; i < n; i++) {
    const parGroupe = new Map<number, { s: number; n: number }>()
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const g = parGroupe.get(groupes[j]) ?? { s: 0, n: 0 }
      g.s += d[i][j]
      g.n++
      parGroupe.set(groupes[j], g)
    }
    const propre = parGroupe.get(groupes[i])
    if (!propre) continue // alone in its group: silhouette 0
    const a = propre.s / propre.n
    let b = Infinity
    for (const [g, v] of parGroupe) if (g !== groupes[i]) b = Math.min(b, v.s / v.n)
    total += b === Infinity ? 0 : (b - a) / Math.max(a, b)
  }
  return total / n
}

function feuillesOrdonnees(n: Noeud): number[] {
  return n.feuille !== undefined ? [n.feuille] : [...feuillesOrdonnees(n.gauche!), ...feuillesOrdonnees(n.droite!)]
}

/** Two leading eigenvectors of a symmetric matrix, by power iteration with deflation. */
function vecteursPropres(g: number[][], nb: number): { valeur: number; vecteur: number[] }[] {
  const n = g.length
  const m = g.map((r) => [...r])
  const out: { valeur: number; vecteur: number[] }[] = []
  for (let k = 0; k < nb; k++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i + 1 + k))
    let valeur = 0
    for (let it = 0; it < 300; it++) {
      const w = m.map((r) => r.reduce((s, x, j) => s + x * v[j], 0))
      const norme = Math.hypot(...w) || 1
      valeur = norme
      const suivant = w.map((x) => x / norme)
      const ecart = suivant.reduce((s, x, j) => s + Math.abs(x - v[j]), 0)
      v = suivant
      if (ecart < 1e-10) break
    }
    out.push({ valeur, vecteur: v })
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) m[i][j] -= valeur * v[i] * v[j]
  }
  return out
}

export function construireFamilles(e: EntreeFamilles, kImpose?: number): ResultatFamilles | null {
  const n = e.echantillons.length
  if (n < 3) return null

  // Variables kept: measured in at least half the samples, varying, and for
  // compounds quantified at least once.
  const colonnes: { v: Variable; x: number[] }[] = []
  for (const v of e.variables) {
    const mesures = e.echantillons.map((s) => e.mesures[s]?.[v.cle] ?? null)
    const presentes = mesures.filter((m): m is Mesure => !!m)
    if (presentes.length < n / 2) continue
    if (v.groupe === 'compose' && !presentes.some((m) => !m.inferieur)) continue
    const x = mesures.map((m) => (m ? transformer(m, v) : null))
    const vals = x.filter((y): y is number => y !== null)
    const moyenne = vals.reduce((a, b) => a + b, 0) / vals.length
    const ecart = Math.sqrt(vals.reduce((a, b) => a + (b - moyenne) ** 2, 0) / Math.max(1, vals.length - 1))
    if (!(ecart > 1e-9)) continue
    colonnes.push({ v, x: x.map((y) => (y === null ? 0 : (y - moyenne) / ecart)) as number[] })
  }
  if (colonnes.length < 2) return null

  const variables = colonnes.map((c) => c.v)
  const z = e.echantillons.map((_, i) => colonnes.map((c) => c.x[i]))
  // Equal weight for each block.
  const parBloc = (g: Variable['groupe']) => colonnes.filter((c) => c.v.groupe === g).length
  const deuxBlocs = parBloc('terrain') > 0 && parBloc('compose') > 0
  const poids = colonnes.map((c) => (deuxBlocs ? 1 / Math.sqrt(parBloc(c.v.groupe)) : 1 / Math.sqrt(colonnes.length)))
  const x = z.map((ligne) => ligne.map((y, j) => y * poids[j]))

  const d = x.map((a) => x.map((b) => Math.sqrt(a.reduce((s, y, j) => s + (y - b[j]) ** 2, 0))))
  const arbre = classifier(d)
  const kMax = Math.min(6, n - 1)
  const silhouettes: { k: number; s: number }[] = []
  for (let k = 2; k <= kMax; k++) silhouettes.push({ k, s: silhouette(d, couper(arbre, k, n)) })
  // A family of a single sample is an outlier, not a family: such cuts are
  // only taken when the user asks for them.
  const sansIsole = silhouettes.filter(({ k }) => {
    const g = couper(arbre, k, n)
    return [...new Set(g)].every((x) => g.filter((y) => y === x).length >= 2)
  })
  const candidats = sansIsole.length ? sansIsole : silhouettes
  const choisi = kImpose && kImpose >= 2 && kImpose <= kMax ? kImpose : candidats.reduce((m, s) => (s.s > m.s ? s : m), candidats[0]).k
  const brut = couper(arbre, choisi, n)
  const ordre = feuillesOrdonnees(arbre)
  // Families lettered in the order of the dendrogram.
  const renum = new Map<number, number>()
  for (const i of ordre) if (!renum.has(brut[i])) renum.set(brut[i], renum.size)
  const groupes = brut.map((g) => renum.get(g)!)

  const familles: Famille[] = [...new Set(groupes)]
    .sort((a, b) => a - b)
    .map((g) => {
      const idx = groupes.map((x, i) => (x === g ? i : -1)).filter((i) => i >= 0)
      const moy = variables.map((v, j) => ({ variable: v, z: idx.reduce((s, i) => s + z[i][j], 0) / idx.length }))
      return {
        id: g,
        nom: `Famille ${LETTRES[g] ?? g + 1}`,
        membres: idx.map((i) => e.echantillons[i]),
        hauts: moy.filter((t) => t.z >= 0.5).sort((a, b) => b.z - a.z).slice(0, 4),
        bas: moy.filter((t) => t.z <= -0.5).sort((a, b) => a.z - b.z).slice(0, 3),
      }
    })

  // Principal axes from the Gram matrix of the weighted, centred data.
  const gram = x.map((a) => x.map((b) => a.reduce((s, y, j) => s + y * b[j], 0)))
  const trace = gram.reduce((s, r, i) => s + r[i], 0) || 1
  const [p1, p2] = vecteursPropres(gram, 2)
  const coords = e.echantillons.map((_, i) => [p1.vecteur[i] * Math.sqrt(p1.valeur), p2.vecteur[i] * Math.sqrt(p2.valeur)] as [number, number])
  const correlation = (a: number[], b: number[]) => {
    const ma = a.reduce((s, y) => s + y, 0) / a.length
    const mb = b.reduce((s, y) => s + y, 0) / b.length
    const num = a.reduce((s, y, i) => s + (y - ma) * (b[i] - mb), 0)
    const den = Math.sqrt(a.reduce((s, y) => s + (y - ma) ** 2, 0) * b.reduce((s, y) => s + (y - mb) ** 2, 0))
    return den ? num / den : 0
  }
  const ax = coords.map((c) => c[0])
  const ay = coords.map((c) => c[1])
  const charges = variables.map((v, j) => ({ variable: v, x: correlation(z.map((r) => r[j]), ax), y: correlation(z.map((r) => r[j]), ay) }))

  return {
    echantillons: e.echantillons,
    variables,
    z,
    ordre,
    arbre,
    k: choisi,
    silhouette: silhouettes.find((s) => s.k === choisi)?.s ?? 0,
    silhouettes,
    groupes,
    familles,
    coords,
    inerties: [(p1.valeur / trace) * 100, (p2.valeur / trace) * 100],
    charges,
  }
}
