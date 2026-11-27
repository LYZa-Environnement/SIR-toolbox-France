import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Enveloppe, Modele, Nappe } from '../../lib/modele3d/modele'
import { Rendu3D, type Couches, type Coupe, type MarqueurEaux, type MarqueurSol, type Selection } from './rendu'

interface Props {
  modele: Modele
  exageration: number
  couches: Couches
  /** Lithology classes shown (null: all). */
  classes: Set<string> | null
  /** Boreholes and wells shown (null: all). */
  points: Set<string> | null
  coupe: Coupe
  fond: string | null
  opaciteSol: number
  nappe: Nappe | null
  couleursNappe: (string | null)[] | null
  marqueursEaux: MarqueurEaux[]
  echantillons: MarqueurSol[]
  enveloppe: Enveloppe | null
  libelles: Map<string, string[]>
  selection: Selection | null
  surSelection: (s: Selection | null) => void
  texteSurvol: (s: Selection) => string
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
  const rappels = useRef({ surSelection: p.surSelection, texteSurvol: p.texteSurvol, surFond: p.surFond })
  useEffect(() => {
    rappels.current = { surSelection: p.surSelection, texteSurvol: p.texteSurvol, surFond: p.surFond }
  })

  // The scene lives as long as its element (a ref callback with its cleanup).
  const { surRendu } = p
  const monter = useCallback(
    (conteneur: HTMLDivElement | null) => {
      if (!conteneur) return
      let r: Rendu3D
      try {
        r = new Rendu3D(
          conteneur,
          (s) => rappels.current.surSelection(s),
          (s) => rappels.current.texteSurvol(s),
        )
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
  useEffect(() => rendu?.echantillons(p.echantillons), [rendu, modele, p.echantillons])
  useEffect(() => rendu?.enveloppe(p.enveloppe), [rendu, modele, p.enveloppe])
  useEffect(() => rendu?.libelles(p.libelles), [rendu, modele, p.libelles])
  // After the markers: the visibility of each borehole applies to them too.
  useEffect(() => rendu?.points(p.points), [rendu, modele, p.points, p.marqueursEaux, p.echantillons])
  useEffect(() => rendu?.selectionner(p.selection), [rendu, modele, p.selection])

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
