import { useMemo } from 'react'
import { dessinerCamembert } from '../lib/resultats/camembert'
import type { Lecture } from '../lib/resultats/parse'
import { estControle, type Qualification } from '../lib/resultats/qualite'
import { signatures } from '../lib/resultats/signatures'

/** One pie per organic family, all samples together — the per-sample pies
 *  are in the "Signatures" sheet of the Excel file. */
export function SignaturesApercu({ lecture, qualifications }: { lecture: Lecture; qualifications: Record<string, Qualification> }) {
  const images = useMemo(() => {
    const echantillons = lecture.points.filter((p) => !estControle(qualifications[p.nom])).map((p) => p.nom)
    return signatures(lecture, echantillons)
      .map((f) => ({
        famille: f.famille,
        n: f.echantillons.length,
        image: dessinerCamembert(f.ensemble, f.composes.map((c) => c.nom), f.unite, f.famille),
      }))
      .filter((x): x is { famille: string; n: number; image: string } => !!x.image)
  }, [lecture, qualifications])

  if (!images.length) return null
  return (
    <details className="qualif" style={{ marginTop: '1rem' }}>
      <summary>Signatures des composés organiques (aperçu — un graphique par échantillon dans l'onglet Excel)</summary>
      <div className="signatures">
        {images.map((x) => (
          <figure key={x.famille} style={{ margin: 0 }}>
            <img src={x.image} alt={`Répartition des composés de la famille ${x.famille}, ensemble des échantillons`} />
            <figcaption style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.3rem' }}>
              Ensemble des {x.n} échantillon{x.n > 1 ? 's' : ''} où la famille est quantifiée
            </figcaption>
          </figure>
        ))}
      </div>
    </details>
  )
}
