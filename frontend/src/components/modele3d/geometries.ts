/**
 * Geometries of the 3D model, in model units (scene X = x east, Y = z
 * elevation, Z = −y): surfaces of a grid, formations between their top and
 * base, blocks reduced to their visible faces. Materials are two-sided:
 * the winding does not matter, the normals are computed per face.
 */

import * as THREE from 'three'
import type { Grille } from '../../lib/modele3d/interpolation.ts'
import { indexBloc, type GrilleBlocs } from '../../lib/modele3d/modele.ts'

/** A grid as a triangulated surface; cells with an invalid corner left out. */
export function grilleEnGeometrie(g: Grille, z: (i: number, j: number) => number, valide: (i: number, j: number) => boolean = () => true): THREE.BufferGeometry {
  const pos = new Float32Array(g.nx * g.ny * 3)
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const v = z(i, j)
      pos.set([g.x0 + i * g.dx, Number.isFinite(v) ? v : 0, -(g.y0 + j * g.dy)], (j * g.nx + i) * 3)
    }
  const index: number[] = []
  for (let j = 0; j < g.ny - 1; j++)
    for (let i = 0; i < g.nx - 1; i++) {
      const a = j * g.nx + i
      const b = a + 1
      const c = a + g.nx
      const d = c + 1
      if (valide(i, j) && valide(i + 1, j) && valide(i, j + 1)) index.push(a, b, c)
      if (valide(i + 1, j) && valide(i + 1, j + 1) && valide(i, j + 1)) index.push(b, d, c)
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

export interface CoupeZ {
  valeur: number
  /** Keep what lies below the plane (else above). */
  dessous: boolean
}

/**
 * A formation as a closed volume over the cells kept: its top, its base
 * and walls where a kept cell meets one that is not (edge of the site, the
 * cut). A horizontal cut clamps top and base to the plane, which then
 * shows as the formation's section.
 */
export function geometrieFormation(
  sol: Grille,
  toit: Float64Array,
  mur: Float64Array,
  garde: (i: number, j: number) => boolean,
  coupeZ: CoupeZ | null,
): THREE.BufferGeometry | null {
  const nxC = sol.nx - 1
  const nyC = sol.ny - 1
  const t = new Float64Array(toit.length)
  const b = new Float64Array(mur.length)
  for (let q = 0; q < toit.length; q++) {
    let h = toit[q]
    let l = mur[q]
    if (coupeZ) {
      if (coupeZ.dessous) [h, l] = [Math.min(h, coupeZ.valeur), Math.min(l, coupeZ.valeur)]
      else [h, l] = [Math.max(h, coupeZ.valeur), Math.max(l, coupeZ.valeur)]
    }
    t[q] = h
    b[q] = l
  }
  const noeud = (i: number, j: number) => j * sol.nx + i
  const epais = (i: number, j: number) => [noeud(i, j), noeud(i + 1, j), noeud(i, j + 1), noeud(i + 1, j + 1)].some((q) => t[q] - b[q] > 1e-3)
  const inclus = new Uint8Array(nxC * nyC)
  for (let j = 0; j < nyC; j++) for (let i = 0; i < nxC; i++) inclus[j * nxC + i] = garde(i, j) && epais(i, j) ? 1 : 0
  const dedans = (i: number, j: number) => i >= 0 && j >= 0 && i < nxC && j < nyC && inclus[j * nxC + i] === 1
  const pos: number[] = []
  const X = (i: number) => sol.x0 + i * sol.dx
  const Z = (j: number) => -(sol.y0 + j * sol.dy)
  const tri = (a: number[], c: number[], d: number[]) => pos.push(...a, ...c, ...d)
  const sommet = (i: number, j: number, v: Float64Array) => [X(i), v[noeud(i, j)], Z(j)]
  for (let j = 0; j < nyC; j++)
    for (let i = 0; i < nxC; i++) {
      if (!dedans(i, j)) continue
      for (const v of [t, b]) {
        tri(sommet(i, j, v), sommet(i + 1, j, v), sommet(i + 1, j + 1, v))
        tri(sommet(i, j, v), sommet(i + 1, j + 1, v), sommet(i, j + 1, v))
      }
      // Walls on the edges facing a cell left out.
      const aretes: [number, number, number, number, number, number][] = [
        [i, j, i + 1, j, i, j - 1],
        [i + 1, j, i + 1, j + 1, i + 1, j],
        [i + 1, j + 1, i, j + 1, i, j + 1],
        [i, j + 1, i, j, i - 1, j],
      ]
      for (const [i1, j1, i2, j2, vi, vj] of aretes) {
        if (dedans(vi, vj)) continue
        const h1 = sommet(i1, j1, t)
        const h2 = sommet(i2, j2, t)
        const l1 = sommet(i1, j1, b)
        const l2 = sommet(i2, j2, b)
        tri(l1, l2, h2)
        tri(l1, h2, h1)
      }
    }
  if (!pos.length) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return geo
}

/** Blocks of one category reduced to their visible faces, and the block behind each triangle. */
export interface Faces {
  geometrie: THREE.BufferGeometry
  /** Index of the block of each triangle. */
  blocs: Uint32Array
}

// Face of each direction: neighbour offset (i, j, k) and the scene corners of the face, in half-sizes.
const DIRECTIONS: { d: [number, number, number]; coins: [number, number, number][] }[] = [
  { d: [1, 0, 0], coins: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { d: [-1, 0, 0], coins: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  // Model north (j + 1) is scene −Z.
  { d: [0, 1, 0], coins: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]] },
  { d: [0, -1, 0], coins: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  // Up (k + 1) is scene +Y.
  { d: [0, 0, 1], coins: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { d: [0, 0, -1], coins: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
]

/**
 * Block geometries by category: only the faces between a shown block and
 * an empty, hidden or cut-away one — a few per cent of the faces of a full
 * block model.
 */
export function facesBlocs(g: GrilleBlocs, categorie: (idx: number) => number, montre: (cat: number) => boolean, garde: (x: number, y: number, z: number) => boolean): Map<number, Faces> {
  const N = g.nx * g.ny * g.nz
  const visible = new Uint8Array(N)
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        const idx = indexBloc(g, i, j, k)
        const c = categorie(idx)
        if (c && montre(c) && garde(g.x0 + (i + 0.5) * g.dx, g.y0 + (j + 0.5) * g.dy, g.z0 + (k + 0.5) * g.dz)) visible[idx] = 1
      }
  const parCat = new Map<number, { pos: number[]; blocs: number[] }>()
  const hx = g.dx / 2
  const hy = g.dz / 2
  const hz = g.dy / 2
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        const idx = indexBloc(g, i, j, k)
        if (!visible[idx]) continue
        const c = categorie(idx)
        const cx = g.x0 + (i + 0.5) * g.dx
        const cy = g.z0 + (k + 0.5) * g.dz
        const cz = -(g.y0 + (j + 0.5) * g.dy)
        let e = parCat.get(c)
        if (!e) parCat.set(c, (e = { pos: [], blocs: [] }))
        for (const { d, coins } of DIRECTIONS) {
          const [ni, nj, nk] = [i + d[0], j + d[1], k + d[2]]
          const dedans = ni >= 0 && nj >= 0 && nk >= 0 && ni < g.nx && nj < g.ny && nk < g.nz
          // Between two shown blocks the face is hidden, whatever their categories (no coplanar faces).
          if (dedans && visible[indexBloc(g, ni, nj, nk)]) continue
          const p = coins.map(([a, b2, c2]) => [cx + a * hx, cy + b2 * hy, cz + c2 * hz])
          e.pos.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3])
          e.blocs.push(idx, idx)
        }
      }
  const out = new Map<number, Faces>()
  for (const [c, e] of parCat) {
    const geometrie = new THREE.BufferGeometry()
    geometrie.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3))
    geometrie.computeVertexNormals()
    out.set(c, { geometrie, blocs: Uint32Array.from(e.blocs) })
  }
  return out
}
