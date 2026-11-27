/**
 * The 3D scene of the model (three.js), driven by the page: build once per
 * model, then switch layers, move through the campaigns, cut, select.
 *
 * Scene axes: X east, Y up, Z south (three.js is right-handed with Y up).
 * Everything built in model units (x, z, −y) sits in a group stretched
 * vertically by the exaggeration; markers that must keep their shape
 * (spheres, discs, arrows, labels) are placed one by one at the stretched
 * height, and moved when the exaggeration changes.
 *
 * Rendering happens on demand (a camera move, a change), not in a loop.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { pasRond, type Grille } from '../../lib/modele3d/interpolation.ts'
import { CLASSES_LITHO } from '../../lib/modele3d/lithologie.ts'
import { indexBloc, type Enveloppe, type Modele, type Nappe } from '../../lib/modele3d/modele.ts'

export type Selection =
  | { type: 'point'; cle: string }
  | { type: 'echantillon'; cle: string; echantillon: string }
  | { type: 'bloc'; classe: string; x: number; y: number; z: number }
  | { type: 'enveloppe'; x: number; y: number; z: number }

export type NomCouche = 'sol' | 'geologie' | 'forages' | 'equipement' | 'nappe' | 'echantillons' | 'enveloppe' | 'eaux' | 'etiquettes' | 'cadre'

export type Couches = Record<NomCouche, boolean>

export interface Coupe {
  axe: 'aucune' | 'x' | 'y' | 'z'
  /** Model coordinate of the plane (m, or m NGF for z). */
  valeur: number
  /** Keep the part beyond the plane (east, north, above) rather than before it. */
  inverse: boolean
}

export type Vue = '3d' | 'dessus' | 'sud' | 'est'

export interface MarqueurEaux {
  cle: string
  /** Head (m NGF), or null when not measured at this campaign. */
  charge: number | null
  /** Coloured sphere at the screen, or none. */
  valeur: { z: number; couleur: string } | null
}

export interface MarqueurSol {
  cle: string
  echantillon: string
  x: number
  y: number
  z: number
  couleur: string
  /** Not quantified: a smaller sphere. */
  petit: boolean
}

interface Repere {
  objet: THREE.Object3D
  x: number
  y: number
  z: number
}

const COULEUR_NAPPE = '#3d8fd1'
const COULEUR_CREPINE = '#1f4e8c'
const COULEUR_SELECTION = '#00c896'

const estVisible = (o: THREE.Object3D | null): boolean => {
  for (let x = o; x; x = x.parent) if (!x.visible) return false
  return true
}

export class Rendu3D {
  private readonly conteneur: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly etiquettes: CSS2DRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controles: OrbitControls
  private readonly surSelection: (s: Selection | null) => void
  private readonly texteSurvol: (s: Selection) => string
  private readonly bulle: HTMLDivElement
  private readonly observateur: ResizeObserver

  private modele: Modele | null = null
  private exag = 1
  /** Stretched group: model units, Y = elevation. */
  private readonly monde = new THREE.Group()
  /** Unstretched markers, placed at stretched heights. */
  private readonly reperes = new THREE.Group()
  private listeReperes: Repere[] = []
  private readonly groupes: Record<NomCouche, THREE.Group>
  /** Elevation and distance ticks, north arrow: shown with the frame, but unstretched. */
  private readonly graduations = new THREE.Group()
  private readonly plans: THREE.Plane[] = []
  private coupeActive: Coupe = { axe: 'aucune', valeur: 0, inverse: false }
  private materiaux = new Map<string, THREE.Material>()
  private materiauSol: THREE.MeshLambertMaterial | null = null
  private texture: THREE.Texture | null = null
  private blocsGeologie = new Map<string, { mesh: THREE.InstancedMesh; centres: Float32Array }>()
  private classesVisibles: Set<string> | null = null
  private pointsVisibles: Set<string> | null = null
  private enveloppeCourante: { mesh: THREE.InstancedMesh; centres: Float32Array } | null = null
  private etiquettesParCle = new Map<string, HTMLDivElement>()
  private halo: THREE.Object3D | null = null
  private rayon = 1
  private demande = 0
  private appui: { x: number; y: number } | null = null

  constructor(conteneur: HTMLElement, surSelection: (s: Selection | null) => void, texteSurvol: (s: Selection) => string) {
    this.conteneur = conteneur
    this.surSelection = surSelection
    this.texteSurvol = texteSurvol
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.localClippingEnabled = true
    this.renderer.setClearColor('#f4f7f7')
    conteneur.appendChild(this.renderer.domElement)
    this.renderer.domElement.className = 'm3d-canevas'

    this.etiquettes = new CSS2DRenderer()
    this.etiquettes.domElement.className = 'm3d-etiquettes'
    conteneur.appendChild(this.etiquettes.domElement)

    this.bulle = document.createElement('div')
    this.bulle.className = 'm3d-bulle'
    this.bulle.hidden = true
    conteneur.appendChild(this.bulle)

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 20000)
    this.controles = new OrbitControls(this.camera, this.renderer.domElement)
    this.controles.addEventListener('change', () => this.dessiner())
    this.controles.maxPolarAngle = Math.PI * 0.98

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8d8a7c', 1.6))
    const soleil = new THREE.DirectionalLight('#ffffff', 1.9)
    // Light from the north-west, as on a shaded relief map.
    soleil.position.set(-1, 1.6, -0.8)
    this.scene.add(soleil)
    const contre = new THREE.DirectionalLight('#ffffff', 0.5)
    contre.position.set(1, 0.4, 1)
    this.scene.add(contre)

    this.scene.add(this.monde, this.reperes)
    const g = () => new THREE.Group()
    this.groupes = { sol: g(), geologie: g(), forages: g(), equipement: g(), nappe: g(), echantillons: g(), enveloppe: g(), eaux: g(), etiquettes: g(), cadre: g() }
    for (const k of ['sol', 'geologie', 'forages', 'equipement', 'nappe', 'enveloppe', 'cadre'] as NomCouche[]) this.monde.add(this.groupes[k])
    for (const k of ['echantillons', 'eaux', 'etiquettes'] as NomCouche[]) this.reperes.add(this.groupes[k])
    this.reperes.add(this.graduations)

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', (e) => (this.appui = { x: e.clientX, y: e.clientY }))
    el.addEventListener('pointerup', (e) => {
      const a = this.appui
      this.appui = null
      // A drag turns the view; only a click selects.
      if (a && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 5) this.cliquer(e)
    })
    el.addEventListener('pointermove', (e) => this.survoler(e))
    el.addEventListener('pointerleave', () => (this.bulle.hidden = true))

    this.observateur = new ResizeObserver(() => this.redimensionner())
    this.observateur.observe(conteneur)
    this.redimensionner()
  }

  // ---- Drawing ------------------------------------------------------------------------------

  dessiner() {
    if (this.demande) return
    this.demande = requestAnimationFrame(() => {
      this.demande = 0
      this.renderer.render(this.scene, this.camera)
      this.etiquettes.render(this.scene, this.camera)
    })
  }

  private redimensionner() {
    const l = Math.max(1, this.conteneur.clientWidth)
    const h = Math.max(1, this.conteneur.clientHeight)
    this.renderer.setSize(l, h)
    this.etiquettes.setSize(l, h)
    this.camera.aspect = l / h
    this.camera.updateProjectionMatrix()
    this.dessiner()
  }

  /** Model coordinates → scene position, at the current exaggeration. */
  private vers(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, (z - (this.modele?.zmin ?? 0)) * this.exag, -y)
  }

  private placer(objet: THREE.Object3D, x: number, y: number, z: number) {
    objet.position.copy(this.vers(x, y, z))
    this.listeReperes.push({ objet, x, y, z })
  }

  private materiau(cle: string, fabrique: () => THREE.Material): THREE.Material {
    let m = this.materiaux.get(cle)
    if (!m) {
      m = fabrique()
      m.clippingPlanes = this.plans
      this.materiaux.set(cle, m)
    }
    return m
  }

  private lambert(couleur: string, opacite = 1) {
    return this.materiau(`l:${couleur}:${opacite}`, () => new THREE.MeshLambertMaterial({ color: couleur, transparent: opacite < 1, opacity: opacite, depthWrite: opacite >= 1 }))
  }

  private vider(groupe: THREE.Group) {
    const retires = new Set<THREE.Object3D>()
    const partages = new Set(this.materiaux.values())
    for (const enfant of [...groupe.children]) {
      groupe.remove(enfant)
      enfant.traverse((o) => {
        retires.add(o)
        if (o instanceof CSS2DObject) o.element.remove()
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        for (const m of mats) if (!partages.has(m) && m !== this.materiauSol) m.dispose()
      })
    }
    this.listeReperes = this.listeReperes.filter((r) => !retires.has(r.objet))
  }

  // ---- Model --------------------------------------------------------------------------------

  /** Builds the scene of a model; keeps the camera when the model's extent hardly changed. */
  charger(m: Modele, exageration: number) {
    const ancien = this.modele
    this.modele = m
    this.exag = exageration
    for (const g of Object.values(this.groupes)) this.vider(g)
    this.vider(this.graduations)
    this.listeReperes = []
    this.blocsGeologie.clear()
    this.enveloppeCourante = null
    this.etiquettesParCle.clear()
    if (this.halo) this.monde.remove(this.halo)
    this.halo = null
    const e = m.emprise
    this.rayon = Math.min(3, Math.max(0.35, Math.max(e.xmax - e.xmin, e.ymax - e.ymin) / 160))
    this.monde.scale.y = exageration
    this.monde.position.y = -m.zmin * exageration

    this.construireSol()
    this.construireGeologie()
    this.construireForages()
    this.construireCadre()
    this.appliquerCoupe()
    const memeEmprise = ancien && Math.abs(ancien.emprise.xmax - e.xmax) < 1 && Math.abs(ancien.emprise.ymin - e.ymin) < 1
    if (!memeEmprise) this.vue('3d')
    this.dessiner()
  }

  private construireSol() {
    const m = this.modele!
    const g = m.sol
    const geo = grilleEnGeometrie(g, (i, j) => g.valeurs[j * g.nx + i])
    // Texture coordinates: the WMS image covers the extent exactly, north up.
    const uv = new Float32Array(g.nx * g.ny * 2)
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        uv[(j * g.nx + i) * 2] = i / (g.nx - 1)
        uv[(j * g.nx + i) * 2 + 1] = j / (g.ny - 1)
      }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    this.materiauSol?.dispose()
    this.materiauSol = new THREE.MeshLambertMaterial({ color: '#c9ccb4', side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false, map: this.texture })
    this.materiauSol.clippingPlanes = this.plans
    const mesh = new THREE.Mesh(geo, this.materiauSol)
    mesh.renderOrder = 2
    this.groupes.sol.add(mesh)
  }

  private construireGeologie() {
    const m = this.modele!
    const geol = m.geologie
    if (!geol) return
    const b = m.blocs
    const parClasse = geol.classes.map(() => [] as number[])
    for (let k = 0; k < b.nz; k++)
      for (let j = 0; j < b.ny; j++)
        for (let i = 0; i < b.nx; i++) {
          const v = geol.valeurs[indexBloc(b, i, j, k)]
          if (v) parClasse[v - 1].push(b.x0 + (i + 0.5) * b.dx, b.y0 + (j + 0.5) * b.dy, b.z0 + (k + 0.5) * b.dz)
        }
    const boite = new THREE.BoxGeometry(b.dx, b.dz, b.dy)
    geol.classes.forEach((c, n) => {
      const centres = new Float32Array(parClasse[n])
      if (!centres.length) return
      const mat = new THREE.MeshLambertMaterial({ color: CLASSES_LITHO[c]?.couleur ?? '#cccccc' })
      const mesh = new THREE.InstancedMesh(boite, mat, centres.length / 3)
      mesh.userData.classe = c
      mesh.frustumCulled = false
      this.groupes.geologie.add(mesh)
      this.blocsGeologie.set(c, { mesh, centres })
    })
    this.filtrerBlocs()
  }

  /** Blocks shown: their class visible, on the kept side of the cut. */
  private filtrerBlocs() {
    const garde = this.gardeBloc()
    const matrice = new THREE.Matrix4()
    for (const [c, { mesh, centres }] of this.blocsGeologie) {
      mesh.visible = !this.classesVisibles || this.classesVisibles.has(c)
      let n = 0
      for (let q = 0; q < centres.length; q += 3) {
        if (!garde(centres[q], centres[q + 1], centres[q + 2])) continue
        matrice.makeTranslation(centres[q], centres[q + 2], -centres[q + 1])
        mesh.setMatrixAt(n++, matrice)
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    const env = this.enveloppeCourante
    if (env) {
      let n = 0
      for (let q = 0; q < env.centres.length; q += 3) {
        if (!garde(env.centres[q], env.centres[q + 1], env.centres[q + 2])) continue
        matrice.makeTranslation(env.centres[q], env.centres[q + 2], -env.centres[q + 1])
        env.mesh.setMatrixAt(n++, matrice)
      }
      env.mesh.count = n
      env.mesh.instanceMatrix.needsUpdate = true
      env.mesh.computeBoundingSphere()
    }
  }

  private gardeBloc(): (x: number, y: number, z: number) => boolean {
    const c = this.coupeActive
    if (c.axe === 'aucune') return () => true
    const s = c.inverse ? -1 : 1
    if (c.axe === 'x') return (x) => s * (c.valeur - x) >= 0
    if (c.axe === 'y') return (_x, y) => s * (c.valeur - y) >= 0
    return (_x, _y, z) => s * (c.valeur - z) >= 0
  }

  private construireForages() {
    const m = this.modele!
    const r = this.rayon
    for (const p of m.points) {
      const groupe = new THREE.Group()
      groupe.userData.cle = p.cle
      const selection: Selection = { type: 'point', cle: p.cle }
      const f = p.forage
      if (f && f.lithologie.length) {
        for (const l of f.lithologie) {
          const h = l.a - l.de
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), this.lambert(CLASSES_LITHO[l.classe]?.couleur ?? '#cccccc'))
          mesh.position.set(p.x, p.zSol - (l.de + l.a) / 2, -p.y)
          mesh.userData.selection = selection
          groupe.add(mesh)
        }
      } else {
        // A well with no log: a plain tube down to its depth, or a few metres below the water.
        const prof = f?.profondeur || 6
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, prof, 10), this.lambert('#8b9696'))
        mesh.position.set(p.x, p.zSol - prof / 2, -p.y)
        mesh.userData.selection = selection
        groupe.add(mesh)
      }
      this.groupes.forages.add(groupe)

      // Equipment: screens, and the tube standing above the ground.
      const equip = new THREE.Group()
      equip.userData.cle = p.cle
      for (const c of f?.equipement.filter((e) => e.element === 'CREPINE') ?? []) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.55, r * 1.55, c.a - c.de, 16, 1, true), this.lambert(COULEUR_CREPINE, 0.55))
        mesh.position.set(p.x, p.zSol - (c.de + c.a) / 2, -p.y)
        mesh.userData.selection = selection
        equip.add(mesh)
      }
      if (p.crepine || p.ouvrage) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.6, 10), this.lambert('#5f6b6b'))
        tube.position.set(p.x, p.zSol + 0.3, -p.y)
        tube.userData.selection = selection
        equip.add(tube)
      }
      this.groupes.equipement.add(equip)

      // Label above the head of the borehole.
      const div = document.createElement('div')
      div.className = 'm3d-etiquette'
      div.textContent = p.nom
      const etiquette = new CSS2DObject(div)
      etiquette.center.set(0.5, 1.15)
      etiquette.userData.cle = p.cle
      this.groupes.etiquettes.add(etiquette)
      this.placer(etiquette, p.x, p.y, p.zSol + 0.8)
      this.etiquettesParCle.set(p.cle, div)
    }
  }

  private construireCadre() {
    const m = this.modele!
    const e = m.emprise
    const z0 = m.zmin
    const z1 = m.zmax
    const coins = [
      [e.xmin, e.ymin],
      [e.xmax, e.ymin],
      [e.xmax, e.ymax],
      [e.xmin, e.ymax],
    ]
    const pts: number[] = []
    for (let i = 0; i < 4; i++) {
      const [xa, ya] = coins[i]
      const [xb, yb] = coins[(i + 1) % 4]
      pts.push(xa, z0, -ya, xb, z0, -yb, xa, z1, -ya, xb, z1, -yb, xa, z0, -ya, xa, z1, -ya)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.groupes.cadre.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#9aa8a6' })))

    // Elevation ticks on the south-west edge.
    const pas = pasRond((z1 - z0) / 5)
    for (let z = Math.ceil(z0 / pas) * pas; z <= z1 + 1e-6; z += pas) {
      const div = document.createElement('div')
      div.className = 'm3d-graduation'
      div.textContent = m.relatif ? `${fr(z)} m` : `${fr(z)} m NGF`
      const o = new CSS2DObject(div)
      o.center.set(1.08, 0.5)
      this.graduations.add(o)
      this.placer(o, e.xmin, e.ymin, z)
    }
    // Distances along the south edge.
    const pasX = pasRond((e.xmax - e.xmin) / 5)
    for (let d = 0; d <= e.xmax - e.xmin + 1e-6; d += pasX) {
      const div = document.createElement('div')
      div.className = 'm3d-graduation'
      div.textContent = d === 0 ? '0' : `${fr(d)} m`
      const o = new CSS2DObject(div)
      o.center.set(0.5, -0.3)
      this.graduations.add(o)
      this.placer(o, e.xmin + d, e.ymin, z0)
    }
    // North arrow on the top of the north-east corner.
    const fleche = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), Math.max(6, (e.ymax - e.ymin) * 0.12), 0x0d2421)
    this.graduations.add(fleche)
    this.placer(fleche, e.xmax - (e.xmax - e.xmin) * 0.04, e.ymax - (e.ymax - e.ymin) * 0.2, z1)
    const n = document.createElement('div')
    n.className = 'm3d-nord'
    n.textContent = 'N'
    const on = new CSS2DObject(n)
    this.graduations.add(on)
    this.placer(on, e.xmax - (e.xmax - e.xmin) * 0.04, e.ymax - (e.ymax - e.ymin) * 0.04, z1)
  }

  // ---- Settings -----------------------------------------------------------------------------

  exageration(e: number) {
    if (!this.modele || e === this.exag) return
    const cible = this.controles.target.clone()
    const yAvant = cible.y / this.exag
    this.exag = e
    this.monde.scale.y = e
    this.monde.position.y = -this.modele.zmin * e
    for (const r of this.listeReperes) r.objet.position.copy(this.vers(r.x, r.y, r.z))
    this.controles.target.set(cible.x, yAvant * e, cible.z)
    this.appliquerCoupe()
    this.controles.update()
    this.dessiner()
  }

  couches(c: Couches) {
    for (const [k, v] of Object.entries(c) as [NomCouche, boolean][]) this.groupes[k].visible = v
    this.graduations.visible = c.cadre
    this.dessiner()
  }

  classes(visibles: Set<string> | null) {
    this.classesVisibles = visibles
    this.filtrerBlocs()
    this.dessiner()
  }

  /** Boreholes and wells shown (null: all). */
  points(visibles: Set<string> | null) {
    this.pointsVisibles = visibles
    const voir = (o: THREE.Object3D) => {
      const cle = o.userData.cle as string | undefined
      if (cle !== undefined) o.visible = !visibles || visibles.has(cle)
    }
    for (const g of [this.groupes.forages, this.groupes.equipement, this.groupes.eaux, this.groupes.echantillons, this.groupes.etiquettes]) g.children.forEach(voir)
    this.dessiner()
  }

  coupe(c: Coupe) {
    this.coupeActive = c
    this.appliquerCoupe()
    this.filtrerBlocs()
    this.dessiner()
  }

  private appliquerCoupe() {
    const c = this.coupeActive
    const m = this.modele
    this.plans.length = 0
    if (c.axe !== 'aucune' && m) {
      const s = c.inverse ? -1 : 1
      if (c.axe === 'x') this.plans.push(new THREE.Plane(new THREE.Vector3(-s, 0, 0), s * c.valeur))
      else if (c.axe === 'y') this.plans.push(new THREE.Plane(new THREE.Vector3(0, 0, s), s * c.valeur))
      else this.plans.push(new THREE.Plane(new THREE.Vector3(0, -s, 0), s * (c.valeur - m.zmin) * this.exag))
    }
    // Materials share the array; they need recompiling when its length changes.
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material
      if (mat && !Array.isArray(mat) && mat.clippingPlanes === this.plans) mat.needsUpdate = true
    })
  }

  /** Ground: opacity, and an image (orthophoto, map) or none. */
  sol(opacite: number) {
    if (!this.materiauSol) return
    this.materiauSol.opacity = opacite
    this.materiauSol.transparent = opacite < 1
    this.materiauSol.depthWrite = opacite >= 1
    this.materiauSol.needsUpdate = true
    this.dessiner()
  }

  fond(url: string | null, surErreur: () => void, surChargement: () => void) {
    const appliquer = (t: THREE.Texture | null) => {
      this.texture?.dispose()
      this.texture = t
      if (this.materiauSol) {
        this.materiauSol.map = t
        this.materiauSol.color.set(t ? '#ffffff' : '#c9ccb4')
        this.materiauSol.needsUpdate = true
      }
      this.dessiner()
    }
    if (!url) return appliquer(null)
    const chargeur = new THREE.TextureLoader()
    chargeur.setCrossOrigin('anonymous')
    chargeur.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 4
        appliquer(t)
        surChargement()
      },
      undefined,
      () => {
        appliquer(null)
        surErreur()
      },
    )
  }

  // ---- Water --------------------------------------------------------------------------------

  /**
   * Water table of the campaign shown: its surface (coloured by the plume
   * when `couleurs` gives a colour per node), a disc at each well's head and
   * the flow arrow.
   */
  nappe(n: Nappe | null, couleurs: (string | null)[] | null, marqueurs: MarqueurEaux[]) {
    this.vider(this.groupes.nappe)
    this.vider(this.groupes.eaux)
    const m = this.modele
    if (!m) return
    const g = n?.grille
    if (g) {
      const valide = (i: number, j: number) => Number.isFinite(g.valeurs[j * g.nx + i])
      const geo = grilleEnGeometrie(g, (i, j) => g.valeurs[j * g.nx + i], valide)
      const col = new Float32Array(g.nx * g.ny * 3)
      const c = new THREE.Color()
      for (let q = 0; q < g.nx * g.ny; q++) {
        c.set(couleurs?.[q] ?? COULEUR_NAPPE)
        col.set([c.r, c.g, c.b], q * 3)
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false })
      mat.clippingPlanes = this.plans
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = 1
      this.groupes.nappe.add(mesh)
    }
    const r = this.rayon
    for (const mq of marqueurs) {
      const p = m.points.find((x) => x.cle === mq.cle)
      if (!p) continue
      const groupe = new THREE.Group()
      groupe.userData.cle = p.cle
      if (mq.charge !== null) {
        const disque = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.1, r * 2.1, Math.max(0.08, r * 0.15), 24), this.lambert('#1565c0'))
        disque.userData.selection = { type: 'point', cle: p.cle } satisfies Selection
        groupe.add(disque)
        this.placer(disque, p.x, p.y, mq.charge)
      }
      if (mq.valeur) {
        const boule = new THREE.Mesh(new THREE.SphereGeometry(r * 2, 20, 14), this.lambert(mq.valeur.couleur))
        boule.userData.selection = { type: 'point', cle: p.cle } satisfies Selection
        groupe.add(boule)
        this.placer(boule, p.x, p.y, mq.valeur.z)
      }
      groupe.visible = !this.pointsVisibles || this.pointsVisibles.has(p.cle)
      this.groupes.eaux.add(groupe)
    }
    if (n?.ecoulement && n.charges.length >= 3) {
      const cx = n.charges.reduce((s, c) => s + c.x, 0) / n.charges.length
      const cy = n.charges.reduce((s, c) => s + c.y, 0) / n.charges.length
      const az = (n.ecoulement.azimut * Math.PI) / 180
      const longueur = Math.max(10, Math.max(m.emprise.xmax - m.emprise.xmin, m.emprise.ymax - m.emprise.ymin) * 0.18)
      const fleche = new THREE.ArrowHelper(new THREE.Vector3(Math.sin(az), 0, -Math.cos(az)), new THREE.Vector3(), longueur, 0x0b3d75, longueur * 0.3, longueur * 0.16)
      fleche.position.set(0, 0, 0)
      // From the centre of the wells, back by half its length, so that it sits across them.
      const zc = valeurGrille(n.grille, cx, cy) ?? n.charges.reduce((s, c) => s + c.charge, 0) / n.charges.length
      this.groupes.eaux.add(fleche)
      this.placer(fleche, cx - (Math.sin(az) * longueur) / 2, cy - (Math.cos(az) * longueur) / 2, zc + 0.15)
    }
    this.dessiner()
  }

  /** Lines of each borehole's label (name first). */
  libelles(lignes: Map<string, string[]>) {
    for (const [cle, div] of this.etiquettesParCle) {
      const l = lignes.get(cle)
      div.replaceChildren()
      const nom = document.createElement('strong')
      nom.textContent = l?.[0] ?? ''
      div.append(nom)
      for (const t of l?.slice(1) ?? []) {
        const s = document.createElement('span')
        s.textContent = t
        div.append(s)
      }
    }
    this.dessiner()
  }

  // ---- Soils --------------------------------------------------------------------------------

  echantillons(liste: MarqueurSol[]) {
    this.vider(this.groupes.echantillons)
    const r = this.rayon
    for (const s of liste) {
      const boule = new THREE.Mesh(new THREE.SphereGeometry(r * (s.petit ? 1.2 : 1.7), 18, 12), this.lambert(s.couleur))
      boule.userData.cle = s.cle
      boule.userData.selection = { type: 'echantillon', cle: s.cle, echantillon: s.echantillon } satisfies Selection
      boule.visible = !this.pointsVisibles || this.pointsVisibles.has(s.cle)
      this.groupes.echantillons.add(boule)
      this.placer(boule, s.x + r * 1.9, s.y, s.z)
    }
    this.dessiner()
  }

  enveloppe(e: Enveloppe | null) {
    this.vider(this.groupes.enveloppe)
    this.enveloppeCourante = null
    const m = this.modele
    if (!m || !e || !e.blocs) return this.dessiner()
    const b = m.blocs
    const centres: number[] = []
    for (let k = 0; k < b.nz; k++)
      for (let j = 0; j < b.ny; j++)
        for (let i = 0; i < b.nx; i++) if (e.valeurs[indexBloc(b, i, j, k)]) centres.push(b.x0 + (i + 0.5) * b.dx, b.y0 + (j + 0.5) * b.dy, b.z0 + (k + 0.5) * b.dz)
    const mat = new THREE.MeshLambertMaterial({ color: '#b3261e', transparent: true, opacity: 0.5, depthWrite: false })
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(b.dx, b.dz, b.dy), mat, centres.length / 3)
    mesh.frustumCulled = false
    mesh.renderOrder = 3
    mesh.userData.enveloppe = true
    this.groupes.enveloppe.add(mesh)
    this.enveloppeCourante = { mesh, centres: new Float32Array(centres) }
    this.filtrerBlocs()
    this.dessiner()
  }

  // ---- Selection ----------------------------------------------------------------------------

  private viser(e: PointerEvent): THREE.Intersection | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const souris = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    const rayon = new THREE.Raycaster()
    rayon.setFromCamera(souris, this.camera)
    const cibles = [this.groupes.forages, this.groupes.equipement, this.groupes.echantillons, this.groupes.eaux, this.groupes.geologie, this.groupes.enveloppe]
    for (const i of rayon.intersectObjects(cibles, true)) {
      if (!estVisible(i.object)) continue
      // The kept side of the cut only.
      if (this.plans.some((p) => p.distanceToPoint(i.point) < 0)) continue
      if (i.object.userData.selection || i.object instanceof THREE.InstancedMesh) return i
    }
    return null
  }

  private selectionDe(i: THREE.Intersection): Selection | null {
    if (i.object.userData.selection) return i.object.userData.selection as Selection
    if (i.object instanceof THREE.InstancedMesh && i.instanceId !== undefined) {
      const mat = new THREE.Matrix4()
      i.object.getMatrixAt(i.instanceId, mat)
      const p = new THREE.Vector3().setFromMatrixPosition(mat)
      const pos = { x: p.x, y: -p.z, z: p.y }
      if (i.object.userData.enveloppe) return { type: 'enveloppe', ...pos }
      return { type: 'bloc', classe: i.object.userData.classe as string, ...pos }
    }
    return null
  }

  private cliquer(e: PointerEvent) {
    const i = this.viser(e)
    const s = i ? this.selectionDe(i) : null
    this.surSelection(s)
  }

  private survoler(e: PointerEvent) {
    if (e.buttons) {
      this.bulle.hidden = true
      return
    }
    const i = this.viser(e)
    const s = i ? this.selectionDe(i) : null
    const texte = s ? this.texteSurvol(s) : ''
    this.renderer.domElement.style.cursor = s ? 'pointer' : ''
    if (!texte) {
      this.bulle.hidden = true
      return
    }
    const rect = this.conteneur.getBoundingClientRect()
    this.bulle.textContent = texte
    this.bulle.hidden = false
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    this.bulle.style.left = `${Math.min(x + 14, rect.width - this.bulle.offsetWidth - 6)}px`
    this.bulle.style.top = `${Math.max(6, y - this.bulle.offsetHeight - 10)}px`
  }

  /** Highlights the selected borehole or well (a ring around it, its label stressed). */
  selectionner(s: Selection | null) {
    if (this.halo) {
      this.halo.parent?.remove(this.halo)
      const h = this.halo as THREE.Mesh
      h.geometry.dispose()
      ;(h.material as THREE.Material).dispose()
      this.halo = null
    }
    for (const [cle, div] of this.etiquettesParCle) div.classList.toggle('m3d-etiquette--choisie', !!s && 'cle' in s && s.cle === cle)
    const m = this.modele
    const p = s && 'cle' in s ? m?.points.find((x) => x.cle === s.cle) : null
    if (m && p) {
      const prof = Math.max(p.forage?.profondeur ?? 0, 6)
      const anneau = new THREE.Mesh(
        new THREE.CylinderGeometry(this.rayon * 2.6, this.rayon * 2.6, prof + 1.2, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: COULEUR_SELECTION, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
      )
      anneau.position.set(p.x, p.zSol + 0.6 - (prof + 1.2) / 2, -p.y)
      this.monde.add(anneau)
      this.halo = anneau
    }
    this.dessiner()
  }

  // ---- Camera -------------------------------------------------------------------------------

  vue(v: Vue) {
    const m = this.modele
    if (!m) return
    const e = m.emprise
    const cx = (e.xmin + e.xmax) / 2
    const cy = (e.ymin + e.ymax) / 2
    const cz = (m.zmin + m.zmax) / 2
    const cible = this.vers(cx, cy, cz)
    const taille = Math.max(e.xmax - e.xmin, e.ymax - e.ymin, (m.zmax - m.zmin) * this.exag)
    // A narrow view (a phone held upright) needs to stand further back to see the whole width.
    const d = taille * 1.45 * Math.max(1, 1.25 / Math.max(0.2, this.camera.aspect))
    const pos =
      v === 'dessus'
        ? new THREE.Vector3(cible.x, cible.y + d * 1.2, cible.z + 0.001)
        : v === 'sud'
          ? new THREE.Vector3(cible.x, cible.y + d * 0.08, cible.z + d)
          : v === 'est'
            ? new THREE.Vector3(cible.x + d, cible.y + d * 0.08, cible.z)
            : new THREE.Vector3(cible.x - d * 0.62, cible.y + d * 0.62, cible.z + d * 0.78)
    this.camera.position.copy(pos)
    this.camera.near = Math.max(0.1, taille / 2000)
    this.camera.far = taille * 30
    this.camera.updateProjectionMatrix()
    this.controles.target.copy(cible)
    this.controles.update()
    this.dessiner()
  }

  // ---- Export -------------------------------------------------------------------------------

  /** PNG of the view, labels included. */
  async capture(titre: string): Promise<Blob> {
    this.renderer.render(this.scene, this.camera)
    this.etiquettes.render(this.scene, this.camera)
    const source = this.renderer.domElement
    const echelle = source.width / Math.max(1, this.conteneur.clientWidth)
    const c = document.createElement('canvas')
    c.width = source.width
    c.height = source.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(source, 0, 0)
    const rect = this.conteneur.getBoundingClientRect()
    ctx.textBaseline = 'top'
    for (const el of this.etiquettes.domElement.querySelectorAll<HTMLElement>('.m3d-etiquette, .m3d-graduation, .m3d-nord')) {
      if (el.style.display === 'none' || !estVisibleDom(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right < rect.left || r.left > rect.right || r.bottom < rect.top || r.top > rect.bottom) continue
      const x = (r.left - rect.left) * echelle
      const y = (r.top - rect.top) * echelle
      const style = getComputedStyle(el)
      if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        ctx.fillStyle = style.backgroundColor
        ctx.fillRect(x, y, r.width * echelle, r.height * echelle)
      }
      ctx.fillStyle = style.color
      const lignes = [...el.childNodes].map((n) => n.textContent ?? '').filter(Boolean)
      const taille = Number.parseFloat(style.fontSize) * echelle
      lignes.forEach((t, i) => {
        ctx.font = `${i === 0 && el.classList.contains('m3d-etiquette') ? '700' : '400'} ${taille}px Figtree, Arial, sans-serif`
        ctx.fillText(t, x + Number.parseFloat(style.paddingLeft) * echelle, y + Number.parseFloat(style.paddingTop) * echelle + i * taille * 1.2)
      })
    }
    ctx.font = `700 ${14 * echelle}px Figtree, Arial, sans-serif`
    ctx.fillStyle = '#0d2421'
    ctx.fillText(titre, 12 * echelle, 10 * echelle)
    return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Image impossible à produire.'))), 'image/png'))
  }

  detruire() {
    this.observateur.disconnect()
    cancelAnimationFrame(this.demande)
    this.controles.dispose()
    for (const g of Object.values(this.groupes)) this.vider(g)
    this.vider(this.graduations)
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) m.dispose()
    })
    for (const m of this.materiaux.values()) m.dispose()
    this.texture?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.etiquettes.domElement.remove()
    this.bulle.remove()
  }
}

const estVisibleDom = (el: HTMLElement) => {
  for (let x: HTMLElement | null = el; x; x = x.parentElement) if (x.style.display === 'none' || x.hidden) return false
  return true
}

const fr = (x: number) => String(Number(x.toFixed(2))).replace('.', ',')

function valeurGrille(g: Grille | null | undefined, x: number, y: number): number | null {
  if (!g) return null
  const i = Math.round((x - g.x0) / g.dx)
  const j = Math.round((y - g.y0) / g.dy)
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null
  const v = g.valeurs[j * g.nx + i]
  return Number.isFinite(v) ? v : null
}

/** A grid as a triangulated surface (model units: x, z, −y); cells with an invalid corner left out. */
function grilleEnGeometrie(g: Grille, z: (i: number, j: number) => number, valide: (i: number, j: number) => boolean = () => true): THREE.BufferGeometry {
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
