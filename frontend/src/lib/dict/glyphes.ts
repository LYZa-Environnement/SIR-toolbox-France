import type { Etiquette } from './calage'
import type { Trace } from './vecteurs'

/** A grid label drawn as strokes (CAD single-stroke font) rather than
 *  written as text: its characters are known by their shape only. */
export interface EtiquetteDessinee {
  /** Shape of the letter before "=" (X, Y, E, N…). */
  lettre: string
  /** Shapes of the digits, in reading order. */
  chiffres: string[]
  /** Centre of the label across its reading direction: the grid line. */
  x: number
  y: number
  /** Reading along the page's vertical: an easting label, usually. */
  verticale: boolean
}

interface Boite {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface Trait {
  pts: number[]
  b: Boite
}

const boite = (pts: number[]): Boite => {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i])
    x1 = Math.max(x1, pts[i])
    y0 = Math.min(y0, pts[i + 1])
    y1 = Math.max(y1, pts[i + 1])
  }
  return { x0, y0, x1, y1 }
}
const union = (a: Boite, b: Boite): Boite => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })
const ecartBoites = (a: Boite, b: Boite) => Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1), Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1))

/** Groups items whose boxes come within `seuil` of each other. */
function grouper<T extends { b: Boite }>(elements: T[], seuil: number): T[][] {
  const parent = elements.map((_, i) => i)
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])))
  const tries = elements.map((e, i) => ({ e, i })).sort((a, b) => a.e.b.x0 - b.e.b.x0)
  for (let a = 0; a < tries.length; a++) {
    for (let b = a + 1; b < tries.length && tries[b].e.b.x0 - tries[a].e.b.x1 <= seuil; b++) {
      if (ecartBoites(tries[a].e.b, tries[b].e.b) <= seuil) parent[racine(tries[a].i)] = racine(tries[b].i)
    }
  }
  const groupes = new Map<number, T[]>()
  elements.forEach((e, i) => groupes.set(racine(i), [...(groupes.get(racine(i)) ?? []), e]))
  return [...groupes.values()]
}

/** "=": two straight strokes of the same length, parallel to the reading
 *  direction. */
function estEgal(glyphe: Trait[], verticale: boolean): boolean {
  if (glyphe.length !== 2 || glyphe.some((t) => t.pts.length !== 4)) return false
  const long = (t: Trait) => (verticale ? t.b.y1 - t.b.y0 : t.b.x1 - t.b.x0)
  const large = (t: Trait) => (verticale ? t.b.x1 - t.b.x0 : t.b.y1 - t.b.y0)
  return glyphe.every((t) => long(t) > 0.5 && large(t) < 0.15 * long(t)) && Math.abs(long(glyphe[0]) - long(glyphe[1])) < 0.2 * long(glyphe[0])
}

/** Finds the labels drawn as strokes on a plan page. */
export function etiquettesDessinees(traces: Trace[]): EtiquetteDessinee[] {
  const traits: Trait[] = []
  for (const t of traces) {
    if (t.type !== 'trait') continue
    for (const s of t.sousChemins) {
      if (s.length < 4) continue
      const b = boite(s)
      const taille = Math.max(b.x1 - b.x0, b.y1 - b.y0)
      if (taille > 0.3 && taille < 20) traits.push({ pts: s, b })
    }
  }
  const resultats: EtiquetteDessinee[] = []
  // Characters of a label are a stroke width apart; labels much further.
  for (const groupe of grouper(traits, 3.5)) {
    if (groupe.length < 6 || groupe.length > 60) continue
    const g = groupe.reduce((a, t) => union(a, t.b), groupe[0].b)
    const verticale = g.y1 - g.y0 > g.x1 - g.x0
    // Glyphs: strokes overlapping along the reading direction.
    const axe = (b: Boite): [number, number] => (verticale ? [b.y0, b.y1] : [b.x0, b.x1])
    const tries = [...groupe].sort((a, b) => axe(a.b)[0] - axe(b.b)[0])
    const glyphes: Trait[][] = []
    let fin = -Infinity
    for (const t of tries) {
      const [d, f] = axe(t.b)
      if (glyphes.length && d <= fin + 0.4) {
        glyphes[glyphes.length - 1].push(t)
        fin = Math.max(fin, f)
      } else {
        glyphes.push([t])
        fin = f
      }
    }
    // Reading direction: the "=" is the second character.
    const egal = glyphes.map((gl) => estEgal(gl, verticale))
    const n = glyphes.length
    let sens: 1 | -1 | 0 = 0
    let debut = 0
    for (let i = 1; i < n - 3 && !sens; i++) {
      if (egal[i]) {
        sens = 1
        debut = i - 1
      }
    }
    for (let i = n - 2; i > 2 && !sens; i--) {
      if (egal[i]) {
        sens = -1
        debut = i + 1
      }
    }
    if (!sens) continue
    // Characters in reading order, letter first.
    const ordre = sens === 1 ? glyphes.slice(debut) : glyphes.slice(0, debut + 1).reverse()
    // A tick against the end of the label: one straight stroke along the
    // reading direction (a "1" stands across it).
    const long = (t: Trait) => (verticale ? t.b.y1 - t.b.y0 : t.b.x1 - t.b.x0)
    const large = (t: Trait) => (verticale ? t.b.x1 - t.b.x0 : t.b.y1 - t.b.y0)
    while (ordre.length > 6) {
      const der = ordre[ordre.length - 1]
      if (der.length === 1 && der[0].pts.length === 4 && large(der[0]) < 0.1 * long(der[0])) ordre.pop()
      else break
    }
    if (ordre.length < 6) continue
    // Reading frame: u along the text, v towards the top of the glyphs
    // (the reading direction turned a quarter anticlockwise).
    const d = verticale ? [0, sens] : [sens, 0]
    const haut = [-d[1], d[0]]
    const v = (x: number, y: number) => x * haut[0] + y * haut[1]
    const tous = ordre.flat().flatMap((t) => t.pts)
    let vmin = Infinity
    let vmax = -Infinity
    for (let i = 0; i < tous.length; i += 2) {
      vmin = Math.min(vmin, v(tous[i], tous[i + 1]))
      vmax = Math.max(vmax, v(tous[i], tous[i + 1]))
    }
    const h = vmax - vmin
    if (h < 0.5) continue
    const forme = (gl: Trait[]) => {
      const pts = gl.flatMap((t) => t.pts)
      let umin = Infinity
      for (let i = 0; i < pts.length; i += 2) umin = Math.min(umin, pts[i] * d[0] + pts[i + 1] * d[1])
      return gl
        .map((t) => {
          const q: string[] = []
          for (let i = 0; i < t.pts.length; i += 2) {
            const u = t.pts[i] * d[0] + t.pts[i + 1] * d[1] - umin
            q.push(`${Math.round((u / h) * 10)},${Math.round(((v(t.pts[i], t.pts[i + 1]) - vmin) / h) * 10)}`)
          }
          return q.join(' ')
        })
        .sort()
        .join('|')
    }
    const chiffres = ordre.slice(2).map(forme)
    resultats.push({
      lettre: forme(ordre[0]),
      chiffres,
      x: verticale ? (g.x0 + g.x1) / 2 : 0,
      y: verticale ? 0 : (g.y0 + g.y1) / 2,
      verticale,
    })
  }
  return resultats
}

/** Digits of the usual CAD single-stroke fonts (AutoCAD "txt" and its
 *  kin), in the same normalised frame as the shapes read on the plans:
 *  width about 0.7, height 1, in tenths. Used only to choose between
 *  readings the arithmetic leaves open. */
const MODELES: Record<string, string> = {
  '0': '2,0 0,2 0,8 2,10 3,10 5,8 5,2 3,0 2,0',
  '1': '0,0 3,0|0,8 2,10 2,0',
  '2': '0,8 2,10 5,10 7,8 7,6 0,0 7,0',
  '3': '0,8 2,10 5,10 7,8 7,7 5,5 3,5|5,5 7,3 7,2 5,0 2,0 0,2',
  '4': '7,3 0,3 5,10 5,0',
  '5': '0,2 2,0 5,0 7,2 7,5 5,7 0,7 0,10 7,10',
  '6': '0,5 5,5 7,3 7,2 5,0 2,0 0,2 0,7 3,10 5,10',
  '7': '0,10 7,10 2,0',
  '8': '5,5 7,3 7,2 5,0 2,0 0,2 0,3 2,5 5,5 7,7 7,8 5,10 2,10 0,8 0,7 2,5',
  '9': '2,0 3,0 7,3 7,8 5,10 2,10 0,8 0,7 2,5 7,5',
}

/** Shape drawn on a 9 × 12 grid, as the set of cells crossed. */
function trame(forme: string): Set<number> {
  const cellules = new Set<number>()
  for (const trait of forme.split('|')) {
    const pts = trait.split(' ').map((p) => p.split(',').map(Number))
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2))
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / n)
        const y = Math.round(y0 + ((y1 - y0) * k) / n)
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cellules.add((y + dy + 1) * 16 + x + dx + 1)
      }
    }
  }
  return cellules
}

/** Overlap of two shapes (Dice coefficient), 1 when identical. */
function ressemblance(a: string, b: string): number {
  const ta = trame(a)
  const tb = trame(b)
  let commun = 0
  for (const c of ta) if (tb.has(c)) commun++
  return (2 * commun) / (ta.size + tb.size)
}

/** A page's drawn labels with what is needed to read them. */
export interface PageADecoder {
  etiquettes: EtiquetteDessinee[]
  /** Metres per point (from the scale written on the plan). */
  metresParPoint: number
}

/** Reads the digits of drawn labels across several pages of one operator.
 *  On a page, labels of one axis differ by what the scale gives between
 *  their positions; their values lie near `approx` (the works, in the
 *  plan's system, within `rayon` metres); and a digit always has the same
 *  shape. The digits are found when one assignment fits every label —
 *  or, when a few do, when one reads clearly better against the usual CAD
 *  digit shapes. Returns the labels of each page as values, or null. */
export function decoder(pages: PageADecoder[], approx: [number, number], rayon = 15000): Etiquette[][] | null {
  interface Groupe {
    page: number
    verticale: boolean
    etiquettes: EtiquetteDessinee[]
    candidats: number[][]
  }
  const groupes: Groupe[] = []
  pages.forEach((p, i) => {
    for (const verticale of [true, false]) {
      const toutes = p.etiquettes.filter((x) => x.verticale === verticale)
      if (!toutes.length) continue
      // A tick drawn against a label reads as one more character: only
      // the labels of the most common length are kept.
      const longueurs = new Map<number, number>()
      for (const x of toutes) longueurs.set(x.chiffres.length, (longueurs.get(x.chiffres.length) ?? 0) + 1)
      const longueur = [...longueurs.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const e = toutes.filter((x) => x.chiffres.length === longueur)
      const pos = (x: EtiquetteDessinee) => (verticale ? x.x : x.y)
      const ref = e[0]
      const ecarts = e.map((x) => (pos(x) - pos(ref)) * p.metresParPoint)
      // Values of the reference label, for either axis (easting or
      // northing): integers near the works whose companions are integers.
      const candidats: number[][] = []
      for (const centre of approx) {
        const v0 = Math.ceil(centre - rayon)
        for (let v = v0; v <= centre + rayon; v++) {
          if (String(v).length !== longueur) continue
          const valeurs = ecarts.map((d) => v + d)
          if (valeurs.some((x) => Math.abs(x - Math.round(x)) > 0.6)) continue
          const entiers = valeurs.map(Math.round)
          // Same shape, same digit — within the group already.
          const carte = new Map<string, string>()
          let ok = true
          for (let k = 0; k < e.length && ok; k++) {
            const s = String(entiers[k])
            if (s.length !== longueur) ok = false
            for (let j = 0; j < longueur && ok; j++) {
              const deja = carte.get(e[k].chiffres[j])
              if (deja === undefined) carte.set(e[k].chiffres[j], s[j])
              else if (deja !== s[j]) ok = false
            }
          }
          if (ok && new Set(carte.values()).size === carte.size) candidats.push(entiers)
        }
      }
      if (candidats.length) groupes.push({ page: i, verticale, etiquettes: e, candidats })
    }
  })
  if (!groupes.length) return null
  // Most constrained groups first.
  groupes.sort((a, b) => a.candidats.length - b.candidats.length)

  const solutions: number[][][] = []
  const choix: number[][] = []
  const carte = new Map<string, string>()
  const inverse = new Map<string, string>()
  const essayer = (g: number) => {
    if (solutions.length > 50) return
    if (g === groupes.length) {
      solutions.push([...choix])
      return
    }
    const gr = groupes[g]
    for (const c of gr.candidats) {
      const ajouts: string[] = []
      let ok = true
      for (let k = 0; k < gr.etiquettes.length && ok; k++) {
        const s = String(c[k])
        gr.etiquettes[k].chiffres.forEach((forme, j) => {
          if (!ok) return
          const deja = carte.get(forme)
          if (deja !== undefined) {
            if (deja !== s[j]) ok = false
          } else if (inverse.has(s[j]) && inverse.get(s[j]) !== forme) ok = false
          else {
            carte.set(forme, s[j])
            inverse.set(s[j], forme)
            ajouts.push(forme)
          }
        })
      }
      if (ok) {
        choix[g] = c
        essayer(g + 1)
      }
      for (const f of ajouts) {
        inverse.delete(carte.get(f)!)
        carte.delete(f)
      }
      if (solutions.length > 50) return
    }
  }
  essayer(0)
  if (!solutions.length || solutions.length > 50) return null
  // Several readings fit the arithmetic: the one whose digits look most
  // like digits wins, if clearly.
  let retenue = solutions[0]
  if (solutions.length > 1) {
    const lecture = (sol: number[][]) => {
      const carteSol = new Map<string, string>()
      groupes.forEach((gr, i) => gr.etiquettes.forEach((e, k) => e.chiffres.forEach((f, j) => carteSol.set(f, String(sol[i][k])[j]))))
      return carteSol
    }
    const lectures = solutions.map(lecture)
    // Only the shapes read differently from one solution to another count.
    const disputees = [...lectures[0].keys()].filter((f) => lectures.some((l) => l.get(f) !== lectures[0].get(f)))
    const notes = lectures.map((l) => disputees.reduce((n, f) => n + ressemblance(f, MODELES[l.get(f)!]), 0) / disputees.length)
    const ordre = notes.map((n, i) => ({ n, i })).sort((a, b) => b.n - a.n)
    if (ordre[0].n < 0.6 || ordre[0].n - ordre[1].n < 0.15) return null
    retenue = solutions[ordre[0].i]
  }

  const resultat: Etiquette[][] = pages.map(() => [])
  groupes.forEach((gr, i) => {
    // A label written along a vertical grid line gives its easting.
    gr.etiquettes.forEach((e, k) => resultat[gr.page].push({ valeur: retenue[i][k], axe: e.verticale ? 'E' : 'N', x: e.x, y: e.y }))
  })
  return resultat
}
