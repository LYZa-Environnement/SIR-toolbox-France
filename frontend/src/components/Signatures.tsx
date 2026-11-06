import { useMemo, useState } from 'react'
import { acronyme } from '../lib/resultats/acronymes'
import { dessinerCamembert, dessinerEchelle, dessinerPastille, rayonPour } from '../lib/resultats/camembert'
import type { Lecture } from '../lib/resultats/parse'
import { estControle, type Qualification } from '../lib/resultats/qualite'
import { signatures } from '../lib/resultats/signatures'

/** Pies for a map: drawn twice the sheet's size, so that they stay sharp. */
const FACTEUR_CARTE = 2

const fichier = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')

/** One pie per organic family, all samples together — the per-sample pies
 *  are in the "Signatures" sheet of the Excel file, and can be downloaded
 *  for a map, all on one scale. */
export function SignaturesApercu({ lecture, qualifications }: { lecture: Lecture; qualifications: Record<string, Qualification> }) {
  const [preparation, setPreparation] = useState(false)
  const familles = useMemo(() => {
    const echantillons = lecture.points.filter((p) => !estControle(qualifications[p.nom])).map((p) => p.nom)
    return signatures(lecture, echantillons)
  }, [lecture, qualifications])
  const images = useMemo(
    () =>
      familles
        .map((f) => ({
          famille: f.famille,
          n: f.echantillons.length,
          image: dessinerCamembert(f.ensemble, f.composes.map((c) => c.nom), f.unite, f.famille),
        }))
        .filter((x): x is { famille: string; n: number; image: string } => !!x.image),
    [familles],
  )

  /** A ZIP per download: per family, one transparent PNG per sample on the
   *  family's scale, the scale legend, and a CSV of totals and diameters
   *  (for proportional symbols in a GIS). */
  async function telechargerCarte() {
    setPreparation(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const csv = ['famille;echantillon;total;unite;diametre_px;surface_relative']
      for (const f of familles) {
        const ordre = f.composes.map((c) => c.nom)
        const totalMax = Math.max(...f.echantillons.map((s) => s.total))
        const dossier = zip.folder(fichier(f.famille))!
        const ajouter = (nom: string, url: string | null) => url && dossier.file(nom, url.split(',')[1], { base64: true })
        ajouter('_echelle.png', dessinerEchelle(totalMax, f.unite, f.famille, FACTEUR_CARTE))
        for (const s of f.echantillons) {
          ajouter(`${fichier(s.echantillon)}.png`, dessinerPastille(s, ordre, totalMax, FACTEUR_CARTE))
          const d = 2 * rayonPour(s.total, totalMax) * FACTEUR_CARTE
          csv.push([f.famille, s.echantillon, String(Number(s.total.toPrecision(4))).replace('.', ','), f.unite, d.toFixed(1).replace('.', ','), (s.total / totalMax).toFixed(4).replace('.', ',')].join(';'))
        }
        const abreges = f.composes.filter((c) => acronyme(c.nom) !== c.nom)
        if (abreges.length) dossier.file('_abreviations.txt', abreges.map((c) => `${acronyme(c.nom)} : ${c.nom}`).join('\r\n'))
      }
      zip.file('totaux_et_diametres.csv', '﻿' + csv.join('\r\n'))
      zip.file(
        'LISEZMOI.txt',
        [
          'Camemberts de signature pour une carte — SIR Toolbox France',
          '',
          'Un dossier par famille de composés : un PNG transparent par échantillon et la légende des diamètres (_echelle.png).',
          'La surface de chaque camembert est proportionnelle au total de l’échantillon (convention des symboles proportionnels) ; le plus fort total de la famille a le plus grand camembert.',
          'Pour garder l’échelle, insérez toutes les images d’une même famille avec le même facteur d’agrandissement (taille d’origine de préférence).',
          `Un total trop faible pour l’échelle est dessiné au diamètre minimal (${6 * FACTEUR_CARTE} px), plus grand que sa valeur.`,
          'totaux_et_diametres.csv donne, par échantillon, le total, le diamètre en pixels de l’image et la surface relative au plus fort total, pour des symboles proportionnels dans un SIG.',
          'Les composés sont désignés par leur abréviation usuelle (PCE, cis-DCE, BaP…) : voir _abreviations.txt dans chaque dossier.',
        ].join('\r\n'),
      )
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Camemberts signatures - carte.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setPreparation(false)
    }
  }

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
      <p style={{ fontSize: '0.85rem', margin: '0.75rem 0 0.5rem' }}>
        Par échantillon, la surface du camembert est proportionnelle au total de la famille, sur une échelle commune à tous les
        échantillons : les graphiques se comparent d’un ouvrage à l’autre et se placent sur une carte. Les composés y sont
        désignés par leur abréviation usuelle (PCE, cis-DCE, BaP…).
      </p>
      <button type="button" className="btn btn--petit" onClick={() => void telechargerCarte()} disabled={preparation}>
        {preparation ? 'Préparation…' : 'Télécharger les camemberts pour une carte (PNG transparents, échelle commune)'}
      </button>
    </details>
  )
}
