import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Batiment } from '../../lib/modele3d/cibles'
import type { VolumesFilieres } from '../../lib/modele3d/filieres'
import type { Enveloppe, Modele, Nappe } from '../../lib/modele3d/modele'
import { Rendu3D, type Colonne, type Couches, type Coupe, type Isoligne, type MarqueurEaux, type MarqueurGaz, type MarqueurSol, type Mesure, type Outil, type Selection } from './rendu'

interface Props {
  modele: Modele
  exageration: number
  couches: Couches
  /** Lithology classes or formations shown (null: all). */
  classes: Set<string> | null
  ecart: number
  /** Boreholes and wells shown (null: all). */
  points: Set<string> | null
  coupe: Coupe
  fond: string | null
  opaciteSol: number
  nappe: Nappe | null
  couleursNappe: (string | null)[] | null
  marqueursEaux: MarqueurEaux[]
  isolignes: Isoligne[]
  echantillons: MarqueurSol[]
  enveloppe: Enveloppe | null
  filieres: VolumesFilieres | null
  pid: { cle: string; index: number; de: number; a: number; couleur: string }[]
  observations: { cle: string; index: number; z: number }[]
  gaz: MarqueurGaz[]
  batiments: Batiment[]
  /** Buildings of the site (raised), the others flat. */
  batimentSurSite: (b: Batiment) => boolean
  coursDEau: [number, number][][]
  libelles: Map<string, string[]>
  selection: Selection | null
  outil: Outil
  virtuel: Colonne | null
  surSelection: (s: Selection | null) => void
  texteSurvol: (s: Selection) => string
  surSol: (x: number, y: number) => void
  surMesure: (m: Mesure | null) => void
  surFond: (etat: 'ok' | 'erreur') => void
  /** The scene, for the view buttons and the image export. */
  surRendu: (r: Rendu3D | null) => void
  children?: ReactNode
}

/**
 * The 3D view: a three.js scene (rendu.ts) kept in step with the page's
 * state, one effect per setting, every one applied again on a new model.
 */
export default function Vue3D(p: Props) {
  const [rendu, setRendu] = useState<Rendu3D | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  // Latest callbacks, read by the scene's event handlers.
  const rappels = useRef({ surSelection: p.surSelection, texteSurvol: p.texteSurvol, surFond: p.surFond, surSol: p.surSol, surMesure: p.surMesure })
  useEffect(() => {
    rappels.current = { surSelection: p.surSelection, texteSurvol: p.texteSurvol, surFond: p.surFond, surSol: p.surSol, surMesure: p.surMesure }
  })

  // The scene lives as long as its element (a ref callback with its cleanup).
  const { surRendu } = p
  const monter = useCallback(
    (conteneur: HTMLDivElement | null) => {
      if (!conteneur) return
      let r: Rendu3D
      try {
        r = new Rendu3D(conteneur, {
          surSelection: (s) => rappels.current.surSelection(s),
          texteSurvol: (s) => rappels.current.texteSurvol(s),
          surSol: (x, y) => rappels.current.surSol(x, y),
          surMesure: (m) => rappels.current.surMesure(m),
        })
      } catch (e) {
        setErreur(`La vue 3D ne peut pas s'afficher sur ce poste (WebGL indisponible : ${(e as Error).message}). Essayez Edge ou Chrome à jour, accélération matérielle activée.`)
        return
      }
      setRendu(r)
      surRendu(r)
      return () => {
        surRendu(null)
        r.detruire()
        setRendu(null)
      }
    },
    [surRendu],
  )

  const { modele, exageration } = p
  useEffect(() => {
    rendu?.charger(modele, exageration)
    // The exaggeration has its own effect: a change does not rebuild the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendu, modele])
  useEffect(() => rendu?.exageration(exageration), [rendu, exageration])
  useEffect(() => rendu?.couches(p.couches), [rendu, modele, p.couches])
  useEffect(() => rendu?.classes(p.classes), [rendu, modele, p.classes])
  useEffect(() => rendu?.coupe(p.coupe), [rendu, modele, p.coupe])
  useEffect(() => rendu?.eclate(p.ecart), [rendu, modele, p.ecart, p.classes, p.coupe])
  useEffect(() => rendu?.sol(p.opaciteSol), [rendu, modele, p.opaciteSol])
  useEffect(() => {
    if (!rendu) return
    rendu.fond(
      p.fond,
      () => rappels.current.surFond('erreur'),
      () => rappels.current.surFond('ok'),
    )
  }, [rendu, modele, p.fond])
  useEffect(() => rendu?.nappe(p.nappe, p.couleursNappe, p.marqueursEaux), [rendu, modele, p.nappe, p.couleursNappe, p.marqueursEaux])
  useEffect(() => rendu?.isolignes(p.isolignes), [rendu, modele, p.isolignes])
  useEffect(() => rendu?.echantillons(p.echantillons), [rendu, modele, p.echantillons])
  useEffect(() => rendu?.enveloppe(p.enveloppe), [rendu, modele, p.enveloppe])
  useEffect(() => rendu?.filieres(p.filieres), [rendu, modele, p.filieres])
  useEffect(() => rendu?.pid(p.pid), [rendu, modele, p.pid])
  useEffect(() => rendu?.observations(p.observations), [rendu, modele, p.observations])
  useEffect(() => rendu?.gaz(p.gaz), [rendu, modele, p.gaz])
  useEffect(() => rendu?.batiments(p.batiments, p.batimentSurSite), [rendu, modele, p.batiments, p.batimentSurSite])
  useEffect(() => rendu?.coursDEau(p.coursDEau), [rendu, modele, p.coursDEau])
  useEffect(() => rendu?.libelles(p.libelles), [rendu, modele, p.libelles])
  // After the markers: the visibility of each borehole applies to them too.
  useEffect(() => rendu?.points(p.points), [rendu, modele, p.points, p.marqueursEaux, p.echantillons, p.observations, p.gaz, p.pid])
  useEffect(() => rendu?.selectionner(p.selection), [rendu, modele, p.selection])
  useEffect(() => rendu?.choisirOutil(p.outil), [rendu, p.outil])
  useEffect(() => rendu?.forageVirtuel(p.virtuel), [rendu, modele, p.virtuel, exageration])

  return (
    <div className="m3d-vue" ref={monter}>
      {erreur && (
        <p role="alert" className="alerte m3d-vue__erreur">
          {erreur}
        </p>
      )}
      {p.children}
    </div>
  )
}
