/**
 * The 3D scene of the model (three.js), driven by the page: build once per
 * model, then switch layers, move through the campaigns, cut, select,
 * measure.
 *
 * Scene axes: X east, Y up, Z south (three.js is right-handed with Y up).
 * Everything built in model units (x, z, −y) sits in a group stretched
 * vertically by the exaggeration; markers that must keep their shape
 * (spheres, discs, arrows, buildings, labels) are placed one by one at the
 * stretched height, and moved when the exaggeration changes.
 *
 * Rendering happens on demand (a camera move, a change), not in a loop.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Batiment } from '../../lib/modele3d/cibles.ts'
import { ORDRE_FILIERES, FILIERES, type VolumesFilieres } from '../../lib/modele3d/filieres.ts'
import { pasRond, valeurEn, type Grille } from '../../lib/modele3d/interpolation.ts'
import { CLASSES_LITHO } from '../../lib/modele3d/lithologie.ts'
import type { Enveloppe, Modele, Nappe } from '../../lib/modele3d/modele.ts'
import { facesBlocs, geometrieFormation, grilleEnGeometrie, type Faces } from './geometries.ts'

export type Selection =
  | { type: 'point'; cle: string }
  | { type: 'echantillon'; cle: string; echantillon: string }
  | { type: 'bloc'; classe: string; x: number; y: number; z: number }
  | { type: 'formation'; index: number; x: number; y: number; z: number }
  | { type: 'enveloppe'; x: number; y: number; z: number }
  | { type: 'filiere'; rang: number; x: number; y: number; z: number }
  | { type: 'pid'; cle: string; index: number }
  | { type: 'observation'; cle: string; index: number }
  | { type: 'gaz'; cle: string }
  | { type: 'batiment'; index: number }

export type NomCouche =
  | 'sol'
  | 'geologie'
  | 'forages'
  | 'equipement'
  | 'pid'
  | 'observations'
  | 'nappe'
  | 'isopiezes'
  | 'eaux'
  | 'echantillons'
  | 'enveloppe'
  | 'filieres'
  | 'gaz'
  | 'batiments'
  | 'coursdeau'
  | 'etiquettes'
  | 'cadre'

export type Couches = Record<NomCouche, boolean>

export interface Coupe {
  axe: 'aucune' | 'x' | 'y' | 'z'
  /** Model coordinate of the plane (m, or m NGF for z). */
  valeur: number
  /** Keep the part beyond the plane (east, north, above) rather than before it. */
  inverse: boolean
}

export type Vue = '3d' | 'dessus' | 'sud' | 'est'

export type Outil = 'selection' | 'virtuel' | 'mesure'

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

export interface MarqueurGaz {
  cle: string
  x: number
  y: number
  z: number
  couleur: string
}

export interface Isoligne {
  niveau: number
  segments: [number, number, number, number][]
}

/** A column drawn where the user asked for a virtual borehole. */
export interface Colonne {
  x: number
  y: number
  couches: { haut: number; bas: number; couleur: string }[]
}

export interface Mesure {
  horizontale: number
  verticale: number
  totale: number
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

export interface Rappels {
  surSelection: (s: Selection | null) => void
  texteSurvol: (s: Selection) => string
  /** A click on the ground with the virtual borehole tool (local x, y). */
  surSol: (x: number, y: number) => void
  surMesure: (m: Mesure | null) => void
}

export class Rendu3D {
  private readonly conteneur: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly etiquettes: CSS2DRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controles: OrbitControls
  private readonly rappels: Rappels
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
  private readonly outils = new THREE.Group()
  private readonly plans: THREE.Plane[] = []
  private coupeActive: Coupe = { axe: 'aucune', valeur: 0, inverse: false }
  private materiaux = new Map<string, THREE.Material>()
  private materiauSol: THREE.MeshLambertMaterial | null = null
  private meshSol: THREE.Mesh | null = null
  private texture: THREE.Texture | null = null
  private classesVisibles: Set<string> | null = null
  private pointsVisibles: Set<string> | null = null
  private enveloppeCourante: Enveloppe | null = null
  private filieresCourantes: VolumesFilieres | null = null
  private ecart = 0
  private etiquettesParCle = new Map<string, HTMLDivElement>()
  private prioritaires = new Set<string>()
  private halo: THREE.Object3D | null = null
  private rayon = 1
  private demande = 0
  private appui: { x: number; y: number } | null = null
  private outil: Outil = 'selection'
  private mesure: THREE.Vector3[] = []

  constructor(conteneur: HTMLElement, rappels: Rappels) {
    this.conteneur = conteneur
    this.rappels = rappels
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
    this.groupes = {
      sol: g(),
      geologie: g(),
      forages: g(),
      equipement: g(),
      pid: g(),
      observations: g(),
      nappe: g(),
      isopiezes: g(),
      eaux: g(),
      echantillons: g(),
      enveloppe: g(),
      filieres: g(),
      gaz: g(),
      batiments: g(),
      coursdeau: g(),
      etiquettes: g(),
      cadre: g(),
    }
    for (const k of ['sol', 'geologie', 'forages', 'equipement', 'pid', 'nappe', 'isopiezes', 'enveloppe', 'filieres', 'coursdeau', 'cadre'] as NomCouche[]) this.monde.add(this.groupes[k])
    for (const k of ['echantillons', 'observations', 'eaux', 'gaz', 'batiments', 'etiquettes'] as NomCouche[]) this.reperes.add(this.groupes[k])
    this.reperes.add(this.graduations, this.outils)

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
      this.desencombrer()
    })
  }

  /**
   * Labels that would overlap are hidden, the piezometers and the selected
   * point first, then the others in their order: a crowded view stays
   * readable, a hidden name shows again on zooming in.
   */
  private desencombrer() {
    const gardes: DOMRect[] = []
    const liste = [...this.etiquettesParCle.entries()].sort((a, b) => Number(this.prioritaires.has(b[0])) - Number(this.prioritaires.has(a[0])))
    for (const [, div] of liste) {
      if (div.style.display === 'none') continue
      div.style.visibility = ''
      const r = div.getBoundingClientRect()
      if (!r.width) continue
      if (gardes.some((g) => r.left < g.right + 2 && r.right > g.left - 2 && r.top < g.bottom + 1 && r.bottom > g.top - 1)) div.style.visibility = 'hidden'
      else gardes.push(r)
    }
    // Contour values last: they give way to the names.
    for (const div of this.etiquettes.domElement.querySelectorAll<HTMLElement>('.m3d-isopieze')) {
      if (div.style.display === 'none') continue
      div.style.visibility = ''
      const r = div.getBoundingClientRect()
      if (gardes.some((g) => r.left < g.right + 2 && r.right > g.left - 2 && r.top < g.bottom + 1 && r.bottom > g.top - 1)) div.style.visibility = 'hidden'
      else gardes.push(r)
    }
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

  /** Scene position → model coordinates. */
  private depuis(v: THREE.Vector3): { x: number; y: number; z: number } {
    return { x: v.x, y: -v.z, z: v.y / this.exag + (this.modele?.zmin ?? 0) }
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

  private lambert(couleur: string, opacite = 1, deuxFaces = false) {
    return this.materiau(`l:${couleur}:${opacite}:${deuxFaces}`, () => new THREE.MeshLambertMaterial({ color: couleur, transparent: opacite < 1, opacity: opacite, depthWrite: opacite >= 1, side: deuxFaces ? THREE.DoubleSide : THREE.FrontSide }))
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
    this.vider(this.outils)
    this.mesure = []
    this.listeReperes = []
    this.enveloppeCourante = null
    this.filieresCourantes = null
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
    this.meshSol = mesh
    this.groupes.sol.add(mesh)
  }

  /** The geology: formations (continuous layers) or blocks, on the kept side of the cut. */
  private construireGeologie() {
    this.vider(this.groupes.geologie)
    const m = this.modele
    if (!m) return
    if (m.formations) {
      const r = m.formations
      const s = m.sol
      const nxC = s.nx - 1
      const garde = this.gardeBloc()
      const c = this.coupeActive
      const coupeZ = c.axe === 'z' ? { valeur: c.valeur, dessous: !c.inverse } : null
      r.formations.forEach((f, i) => {
        if (this.classesVisibles && !this.classesVisibles.has(f.id)) return
        const geo = geometrieFormation(s, r.toits[i], r.murs[i], (ci, cj) => r.masque[cj * nxC + ci] === 1 && (c.axe === 'z' || garde(s.x0 + (ci + 0.5) * s.dx, s.y0 + (cj + 0.5) * s.dy, 0)), coupeZ)
        if (!geo) return
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: f.couleur, side: THREE.DoubleSide }))
        mesh.position.y = -i * this.ecart
        mesh.userData.formation = i
        this.groupes.geologie.add(mesh)
      })
      return
    }
    if (m.geologie) {
      const geol = m.geologie
      const faces = facesBlocs(
        m.blocs,
        (idx) => geol.valeurs[idx],
        (cat) => !this.classesVisibles || this.classesVisibles.has(geol.classes[cat - 1]),
        this.gardeBloc(),
      )
      for (const [cat, f] of faces) this.ajouterFaces(this.groupes.geologie, f, new THREE.MeshLambertMaterial({ color: CLASSES_LITHO[geol.classes[cat - 1]]?.couleur ?? '#cccccc', side: THREE.DoubleSide }), { classe: geol.classes[cat - 1] })
    }
  }

  private ajouterFaces(groupe: THREE.Group, f: Faces, mat: THREE.Material, donnees: Record<string, unknown>) {
    const mesh = new THREE.Mesh(f.geometrie, mat)
    mesh.userData = { ...donnees, blocs: f.blocs }
    groupe.add(mesh)
    return mesh
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
    this.prioritaires = new Set(m.points.filter((p) => p.crepine || p.ouvrage).map((p) => p.cle))
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

      // PID readings: a ring per interval, coloured by the page.
      const pid = new THREE.Group()
      pid.userData.cle = p.cle
      this.groupes.pid.add(pid)

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
    // Outline of the site's parcels on the ground.
    for (const a of m.parcelles ?? []) {
      const ligne = a.map(([x, y]) => new THREE.Vector3(x, valeurEn(m.sol, x, y) + 0.08, -y))
      this.groupes.cadre.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ligne), new THREE.LineBasicMaterial({ color: '#0d2421' })))
    }

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
    this.effacerMesure()
    this.appliquerCoupe()
    this.controles.update()
    this.dessiner()
  }

  couches(c: Couches) {
    for (const [k, v] of Object.entries(c) as [NomCouche, boolean][]) this.groupes[k].visible = v
    this.graduations.visible = c.cadre
    this.dessiner()
  }

  /** Lithology classes (blocks) or formations shown, by id (null: all). */
  classes(visibles: Set<string> | null) {
    this.classesVisibles = visibles
    this.construireGeologie()
    this.dessiner()
  }

  /** Vertical gap between formations (m, model units): an exploded view of the layers. */
  eclate(ecart: number) {
    this.ecart = ecart
    for (const o of this.groupes.geologie.children) if (o.userData.formation !== undefined) o.position.y = -o.userData.formation * ecart
    this.dessiner()
  }

  /** Boreholes and wells shown (null: all). */
  points(visibles: Set<string> | null) {
    this.pointsVisibles = visibles
    const voir = (o: THREE.Object3D) => {
      const cle = o.userData.cle as string | undefined
      if (cle !== undefined) o.visible = !visibles || visibles.has(cle)
    }
    for (const k of ['forages', 'equipement', 'pid', 'observations', 'eaux', 'echantillons', 'gaz', 'etiquettes'] as NomCouche[]) this.groupes[k].children.forEach(voir)
    this.dessiner()
  }

  coupe(c: Coupe) {
    this.coupeActive = c
    this.appliquerCoupe()
    this.construireGeologie()
    this.construireEnveloppe()
    this.construireFilieres()
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

  /** Ground: opacity. */
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
   * Water table of the date shown: its surface (coloured by the plume, the
   * difference with another date or the uncertainty when `couleurs` gives a
   * colour per node), a disc at each well's head and the flow arrow.
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
      const zc = valeurGrille(n.grille, cx, cy) ?? n.charges.reduce((s, c) => s + c.charge, 0) / n.charges.length
      this.groupes.eaux.add(fleche)
      this.placer(fleche, cx - (Math.sin(az) * longueur) / 2, cy - (Math.cos(az) * longueur) / 2, zc + 0.15)
    }
    this.dessiner()
  }

  /** Contour lines of the water table, labelled once per level. */
  isolignes(lignes: Isoligne[]) {
    this.vider(this.groupes.isopiezes)
    const m = this.modele
    if (!m) return
    const pos: number[] = []
    for (const l of lignes) for (const [x1, y1, x2, y2] of l.segments) pos.push(x1, l.niveau + 0.03, -y1, x2, l.niveau + 0.03, -y2)
    if (!pos.length) return this.dessiner()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const mat = new THREE.LineBasicMaterial({ color: '#0b3d75' })
    mat.clippingPlanes = this.plans
    this.groupes.isopiezes.add(new THREE.LineSegments(geo, mat))
    for (const l of lignes) {
      const s = l.segments[Math.floor(l.segments.length / 2)]
      const div = document.createElement('div')
      div.className = 'm3d-isopieze'
      div.textContent = m.relatif ? `${fr(l.niveau)}` : `${fr(l.niveau)} m`
      const o = new CSS2DObject(div)
      // In the stretched group: placed in model units.
      o.position.set((s[0] + s[2]) / 2, l.niveau, -(s[1] + s[3]) / 2)
      this.groupes.isopiezes.add(o)
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

  // ---- Soils, gas, field readings -----------------------------------------------------------

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

  /** PID readings: a ring around the borehole over each measured interval. */
  pid(liste: { cle: string; index: number; de: number; a: number; couleur: string }[]) {
    const m = this.modele
    if (!m) return
    for (const g of this.groupes.pid.children) this.vider(g as THREE.Group)
    const r = this.rayon
    for (const v of liste) {
      const p = m.points.find((x) => x.cle === v.cle)
      const groupe = this.groupes.pid.children.find((g) => g.userData.cle === v.cle) as THREE.Group | undefined
      if (!p || !groupe) continue
      const h = Math.max(0.1, v.a - v.de)
      const anneau = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.3, h, 16), this.lambert(v.couleur))
      anneau.position.set(p.x, p.zSol - v.de - h / 2, -p.y)
      anneau.userData.selection = { type: 'pid', cle: v.cle, index: v.index } satisfies Selection
      groupe.add(anneau)
    }
    this.dessiner()
  }

  /** Organoleptic observations of the logs: a marker beside the borehole at their depth. */
  observations(liste: { cle: string; index: number; z: number }[]) {
    this.vider(this.groupes.observations)
    const m = this.modele
    if (!m) return
    const r = this.rayon
    for (const o of liste) {
      const p = m.points.find((x) => x.cle === o.cle)
      if (!p) continue
      const marque = new THREE.Mesh(new THREE.OctahedronGeometry(r * 1.25), this.lambert('#b4690e'))
      marque.userData.cle = o.cle
      marque.userData.selection = { type: 'observation', cle: o.cle, index: o.index } satisfies Selection
      marque.visible = !this.pointsVisibles || this.pointsVisibles.has(o.cle)
      this.groupes.observations.add(marque)
      this.placer(marque, p.x - r * 2.2, p.y, o.z)
    }
    this.dessiner()
  }

  gaz(liste: MarqueurGaz[]) {
    this.vider(this.groupes.gaz)
    const r = this.rayon
    for (const g of liste) {
      const boule = new THREE.Mesh(new THREE.SphereGeometry(r * 1.9, 18, 12), this.lambert(g.couleur))
      boule.userData.cle = g.cle
      boule.userData.selection = { type: 'gaz', cle: g.cle } satisfies Selection
      boule.visible = !this.pointsVisibles || this.pointsVisibles.has(g.cle)
      this.groupes.gaz.add(boule)
      this.placer(boule, g.x, g.y - r * 2.2, g.z)
    }
    this.dessiner()
  }

  enveloppe(e: Enveloppe | null) {
    this.enveloppeCourante = e
    this.construireEnveloppe()
    this.dessiner()
  }

  private construireEnveloppe() {
    this.vider(this.groupes.enveloppe)
    const m = this.modele
    const e = this.enveloppeCourante
    if (!m || !e || !e.blocs) return
    const faces = facesBlocs(m.blocs, (idx) => e.valeurs[idx], () => true, this.gardeBloc())
    for (const f of faces.values()) {
      const mesh = this.ajouterFaces(this.groupes.enveloppe, f, new THREE.MeshLambertMaterial({ color: '#b3261e', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), { enveloppe: true })
      mesh.renderOrder = 3
    }
  }

  filieres(v: VolumesFilieres | null) {
    this.filieresCourantes = v
    this.construireFilieres()
    this.dessiner()
  }

  private construireFilieres() {
    this.vider(this.groupes.filieres)
    const m = this.modele
    const v = this.filieresCourantes
    if (!m || !v) return
    const faces = facesBlocs(m.blocs, (idx) => v.valeurs[idx], () => true, this.gardeBloc())
    for (const [cat, f] of faces) this.ajouterFaces(this.groupes.filieres, f, new THREE.MeshLambertMaterial({ color: FILIERES[ORDRE_FILIERES[cat - 1]].couleur, side: THREE.DoubleSide }), { filiere: cat - 1 })
  }

  // ---- Surroundings ---------------------------------------------------------------------------

  /**
   * Buildings (BD TOPO): those of the site raised to their height
   * (unstretched, standing on the ground), the neighbours as flat footprints
   * — targets to place, not a city model hiding the ground.
   */
  batiments(liste: Batiment[], surSite: (b: Batiment) => boolean) {
    this.vider(this.groupes.batiments)
    const m = this.modele
    if (!m) return
    const e = m.emprise
    liste.forEach((b, i) => {
      const pts = b.anneau.filter(([x, y]) => x > e.xmin - 50 && x < e.xmax + 50 && y > e.ymin - 50 && y < e.ymax + 50)
      if (pts.length < 3) return
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
      const forme = new THREE.Shape(b.anneau.map(([x, y]) => new THREE.Vector2(x - cx, y - cy)))
      const site = surSite(b)
      const geo = new THREE.ExtrudeGeometry(forme, { depth: site ? (b.hauteur ?? 6) : 0.4, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      const mesh = new THREE.Mesh(geo, this.lambert(site ? '#a9a296' : '#c9c4ba', site ? 0.55 : 0.45, true))
      mesh.userData.selection = { type: 'batiment', index: i } satisfies Selection
      mesh.renderOrder = 4
      this.groupes.batiments.add(mesh)
      this.placer(mesh, cx, cy, valeurEn(m.sol, cx, cy))
    })
    this.dessiner()
  }

  /** Watercourses draped on the ground, within the extent. */
  coursDEau(lignes: [number, number][][]) {
    this.vider(this.groupes.coursdeau)
    const m = this.modele
    if (!m) return
    const e = m.emprise
    const mat = new THREE.LineBasicMaterial({ color: '#1f6fd1' })
    for (const l of lignes) {
      let courant: THREE.Vector3[] = []
      const finir = () => {
        if (courant.length > 1) this.groupes.coursdeau.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(courant), mat))
        courant = []
      }
      for (const [x, y] of l) {
        if (x < e.xmin || x > e.xmax || y < e.ymin || y > e.ymax) {
          finir()
          continue
        }
        courant.push(new THREE.Vector3(x, valeurEn(m.sol, x, y) + 0.1, -y))
      }
      finir()
    }
    this.dessiner()
  }

  // ---- Tools ----------------------------------------------------------------------------------

  choisirOutil(o: Outil) {
    this.outil = o
    this.renderer.domElement.style.cursor = o === 'selection' ? '' : 'crosshair'
    if (o !== 'mesure') this.effacerMesure()
  }

  /** The virtual borehole asked by a click on the ground (null to remove it). */
  forageVirtuel(c: Colonne | null) {
    for (const o of [...this.monde.children])
      if (o.userData.virtuel) {
        this.monde.remove(o)
        o.traverse((x) => (x as THREE.Mesh).geometry?.dispose())
      }
    if (c && c.couches.length) {
      const g = new THREE.Group()
      g.userData.virtuel = true
      const r = this.rayon * 1.1
      for (const k of c.couches) {
        if (!(k.haut > k.bas)) continue
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, k.haut - k.bas, 16), this.lambert(k.couleur))
        mesh.position.set(c.x, (k.haut + k.bas) / 2, -c.y)
        g.add(mesh)
      }
      const haut = Math.max(...c.couches.map((k) => k.haut))
      const bas = Math.min(...c.couches.map((k) => k.bas))
      const anneau = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 2.2, r * 2.2, haut - bas + 0.6, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: COULEUR_SELECTION, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
      )
      anneau.position.set(c.x, (haut + bas) / 2, -c.y)
      g.add(anneau)
      this.monde.add(g)
    }
    this.dessiner()
  }

  private effacerMesure() {
    this.mesure = []
    this.vider(this.outils)
    this.rappels.surMesure(null)
  }

  private ajouterMesure(p: THREE.Vector3) {
    if (this.mesure.length >= 2) this.effacerMesure()
    this.mesure.push(p.clone())
    const point = new THREE.Mesh(new THREE.SphereGeometry(this.rayon * 0.8, 12, 8), new THREE.MeshBasicMaterial({ color: '#0d2421' }))
    point.position.copy(p)
    this.outils.add(point)
    if (this.mesure.length === 2) {
      const [a, b] = this.mesure
      this.outils.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: '#0d2421' })))
      const ma = this.depuis(a)
      const mb = this.depuis(b)
      const horizontale = Math.hypot(ma.x - mb.x, ma.y - mb.y)
      const verticale = mb.z - ma.z
      const mesure = { horizontale, verticale, totale: Math.hypot(horizontale, verticale) }
      const div = document.createElement('div')
      div.className = 'm3d-mesure'
      div.textContent = `${fr(mesure.totale)} m`
      const o = new CSS2DObject(div)
      o.position.copy(a.clone().add(b).multiplyScalar(0.5))
      this.outils.add(o)
      this.rappels.surMesure(mesure)
    }
    this.dessiner()
  }

  // ---- Selection ----------------------------------------------------------------------------

  private rayonDepuis(e: PointerEvent): THREE.Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const souris = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    const rayon = new THREE.Raycaster()
    rayon.setFromCamera(souris, this.camera)
    return rayon
  }

  private viser(e: PointerEvent, cibles: THREE.Object3D[]): THREE.Intersection | null {
    for (const i of this.rayonDepuis(e).intersectObjects(cibles, true)) {
      if (!estVisible(i.object)) continue
      // The kept side of the cut only.
      if (this.plans.some((p) => p.distanceToPoint(i.point) < 0)) continue
      if (i.object.userData.selection || i.object.userData.blocs || i.object.userData.formation !== undefined || i.object === this.meshSol) return i
    }
    return null
  }

  private ciblesSelection() {
    const g = this.groupes
    return [g.forages, g.equipement, g.pid, g.observations, g.echantillons, g.gaz, g.eaux, g.geologie, g.enveloppe, g.filieres, g.batiments]
  }

  private selectionDe(i: THREE.Intersection): Selection | null {
    const o = i.object
    if (o.userData.selection) return o.userData.selection as Selection
    const pos = this.depuis(i.point)
    if (o.userData.formation !== undefined) return { type: 'formation', index: o.userData.formation as number, ...pos, z: pos.z + (o.userData.formation as number) * this.ecart }
    const blocs = o.userData.blocs as Uint32Array | undefined
    if (blocs && i.faceIndex !== undefined && i.faceIndex !== null && this.modele) {
      const b = this.modele.blocs
      const idx = blocs[i.faceIndex]
      const k = Math.floor(idx / (b.nx * b.ny))
      const j = Math.floor((idx - k * b.nx * b.ny) / b.nx)
      const ii = idx - k * b.nx * b.ny - j * b.nx
      const centre = { x: b.x0 + (ii + 0.5) * b.dx, y: b.y0 + (j + 0.5) * b.dy, z: b.z0 + (k + 0.5) * b.dz }
      if (o.userData.enveloppe) return { type: 'enveloppe', ...centre }
      if (o.userData.filiere !== undefined) return { type: 'filiere', rang: o.userData.filiere as number, ...centre }
      return { type: 'bloc', classe: o.userData.classe as string, ...centre }
    }
    return null
  }

  private cliquer(e: PointerEvent) {
    if (this.outil === 'virtuel') {
      const i = this.meshSol ? this.rayonDepuis(e).intersectObject(this.meshSol)[0] : undefined
      if (i) {
        const p = this.depuis(i.point)
        this.rappels.surSol(p.x, p.y)
      }
      return
    }
    if (this.outil === 'mesure') {
      const i = this.viser(e, [...this.ciblesSelection(), this.groupes.nappe])
      const point = i?.point ?? (this.meshSol ? this.rayonDepuis(e).intersectObject(this.meshSol)[0]?.point : undefined)
      if (point) this.ajouterMesure(point)
      return
    }
    const i = this.viser(e, this.ciblesSelection())
    this.rappels.surSelection(i ? this.selectionDe(i) : null)
  }

  private survoler(e: PointerEvent) {
    if (e.buttons || this.outil !== 'selection') {
      this.bulle.hidden = true
      return
    }
    const i = this.viser(e, this.ciblesSelection())
    const s = i ? this.selectionDe(i) : null
    const texte = s ? this.rappels.texteSurvol(s) : ''
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

  /** Highlights the selected borehole or well (a ring around it, its label stressed and kept in front). */
  selectionner(s: Selection | null) {
    if (this.halo) {
      this.halo.parent?.remove(this.halo)
      const h = this.halo as THREE.Mesh
      h.geometry.dispose()
      ;(h.material as THREE.Material).dispose()
      this.halo = null
    }
    const cleChoisie = s && 'cle' in s ? s.cle : null
    for (const [cle, div] of this.etiquettesParCle) div.classList.toggle('m3d-etiquette--choisie', cle === cleChoisie)
    const m = this.modele
    if (m) this.prioritaires = new Set([...(cleChoisie ? [cleChoisie] : []), ...m.points.filter((p) => p.crepine || p.ouvrage).map((p) => p.cle)])
    const p = cleChoisie ? m?.points.find((x) => x.cle === cleChoisie) : null
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
    this.desencombrer()
    const source = this.renderer.domElement
    const echelle = source.width / Math.max(1, this.conteneur.clientWidth)
    const c = document.createElement('canvas')
    c.width = source.width
    c.height = source.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(source, 0, 0)
    const rect = this.conteneur.getBoundingClientRect()
    ctx.textBaseline = 'top'
    for (const el of this.etiquettes.domElement.querySelectorAll<HTMLElement>('.m3d-etiquette, .m3d-graduation, .m3d-nord, .m3d-isopieze, .m3d-mesure')) {
      if (el.style.display === 'none' || el.style.visibility === 'hidden' || !estVisibleDom(el)) continue
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
    this.vider(this.outils)
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
