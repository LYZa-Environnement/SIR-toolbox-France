import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Cadre, Couleur, TraceImage } from '../../lib/chromato/numerisation'

export type Mode = 'cadre' | 'c10' | 'c40' | 'couleur'

export interface Reglages {
  cadre: Cadre | null
  x10: number | null
  x40: number | null
  /** Trace colour picked by the user; null: found automatically. */
  couleur: Couleur | null
  tolerance: number
}

interface Props {
  image: ImageData
  reglages: Reglages
  mode: Mode | null
  trace: TraceImage | null
  onCadre: (c: Cadre) => void
  onPoint: (mode: Exclude<Mode, 'cadre'>, x: number, y: number) => void
}

/**
 * The page or screenshot, on a canvas. Drawing the frame works on the whole
 * page; once the frame is set, the view zooms on it to place C10 and C40,
 * pick the trace colour and check the digitised trace (red, over the image).
 */
export default function Numeriseur({ image, reglages, mode, trace, onCadre, onPoint }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [glisse, setGlisse] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  useEffect(() => {
    let annule = false
    createImageBitmap(image).then((b) => {
      if (!annule) setBitmap(b)
    })
    return () => {
      annule = true
    }
  }, [image])

  const { cadre } = reglages
  const zoom = !!cadre && mode !== 'cadre'
  const vue = zoom && cadre ? cadre : { x0: 0, y0: 0, x1: image.width - 1, y1: image.height - 1 }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !bitmap) return
    const l = vue.x1 - vue.x0 + 1
    const h = vue.y1 - vue.y0 + 1
    canvas.width = l
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, vue.x0, vue.y0, l, h, 0, 0, l, h)
    const ep = Math.max(1, Math.round(l / 700))
    const rect = glisse ?? (!zoom ? cadre : null)
    if (rect) {
      ctx.strokeStyle = '#00756a'
      ctx.lineWidth = 2 * ep
      ctx.setLineDash([8 * ep, 5 * ep])
      ctx.strokeRect(Math.min(rect.x0, rect.x1) - vue.x0, Math.min(rect.y0, rect.y1) - vue.y0, Math.abs(rect.x1 - rect.x0), Math.abs(rect.y1 - rect.y0))
      ctx.setLineDash([])
    }
    if (zoom && trace) {
      ctx.strokeStyle = 'rgba(227, 73, 72, 0.85)'
      ctx.lineWidth = ep
      ctx.beginPath()
      trace.x.forEach((x, i) => {
        const px = x - vue.x0
        const py = vue.y1 - vue.y0 - trace.y[i]
        if (i) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      })
      ctx.stroke()
    }
    for (const [x, nom] of [
      [reglages.x10, 'C10'],
      [reglages.x40, 'C40'],
    ] as [number | null, string][]) {
      if (x === null) continue
      ctx.strokeStyle = '#2a78d6'
      ctx.lineWidth = 2 * ep
      ctx.beginPath()
      ctx.moveTo(x - vue.x0, 0)
      ctx.lineTo(x - vue.x0, h)
      ctx.stroke()
      ctx.fillStyle = '#2a78d6'
      ctx.font = `700 ${14 * ep}px sans-serif`
      ctx.fillText(nom, x - vue.x0 + 4 * ep, 16 * ep)
    }
  }, [bitmap, vue.x0, vue.y0, vue.x1, vue.y1, glisse, cadre, zoom, trace, reglages.x10, reglages.x40])

  const position = (ev: PointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    return {
      x: vue.x0 + ((ev.clientX - r.left) / r.width) * (vue.x1 - vue.x0 + 1),
      y: vue.y0 + ((ev.clientY - r.top) / r.height) * (vue.y1 - vue.y0 + 1),
    }
  }

  return (
    <canvas
      ref={ref}
      className={`chromato-canvas${mode ? ' chromato-canvas--actif' : ''}`}
      onPointerDown={(ev) => {
        if (!mode) return
        const p = position(ev)
        if (mode === 'cadre') {
          ev.currentTarget.setPointerCapture(ev.pointerId)
          setGlisse({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
        } else onPoint(mode, p.x, p.y)
      }}
      onPointerMove={(ev) => {
        if (mode !== 'cadre' || !glisse) return
        const p = position(ev)
        setGlisse({ ...glisse, x1: p.x, y1: p.y })
      }}
      onPointerUp={() => {
        if (mode !== 'cadre' || !glisse) return
        if (Math.abs(glisse.x1 - glisse.x0) > 20 && Math.abs(glisse.y1 - glisse.y0) > 20) onCadre(glisse)
        setGlisse(null)
      }}
    />
  )
}
