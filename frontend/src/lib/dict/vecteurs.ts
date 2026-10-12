import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'

/** One painted path of a page, in PDF user space. */
export interface Trace {
  type: 'trait' | 'remplissage'
  couleur: string
  /** Line width in points, current transform applied. */
  epaisseur: number
  /** Optional-content layer (marked content) the path belongs to. */
  calque: string | null
  /** Sub-paths as flat [x0, y0, x1, y1…] lists; curves reduced to their
   *  end points, which is enough to locate and measure. */
  sousChemins: number[][]
}

// pdf.js operator codes (OPS), fixed by its API.
const OP = {
  save: 10,
  restore: 11,
  transform: 12,
  setLineWidth: 2,
  setGState: 9,
  constructPath: 91,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  beginMarkedContent: 69,
  beginMarkedContentProps: 70,
  endMarkedContent: 71,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
} as const

type M = [number, number, number, number, number, number]
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

/** Walks the page's operator list, keeping the graphics state pdf.js
 *  would, and returns every stroked or filled path. */
export async function lireTraces(page: PDFPageProxy): Promise<Trace[]> {
  const liste = await page.getOperatorList()
  const traces: Trace[] = []
  let etat = { ctm: [1, 0, 0, 1, 0, 0] as M, trait: '#000000', fond: '#000000', epaisseur: 1 }
  const pile: (typeof etat)[] = []
  const calques: (string | null)[] = []
  for (let k = 0; k < liste.fnArray.length; k++) {
    const fn = liste.fnArray[k]
    const a = liste.argsArray[k] as unknown[]
    switch (fn) {
      case OP.save:
      case OP.paintFormXObjectBegin:
        pile.push({ ...etat })
        if (fn === OP.paintFormXObjectBegin && Array.isArray(a[0])) etat.ctm = mul(etat.ctm, a[0] as M)
        break
      case OP.restore:
      case OP.paintFormXObjectEnd:
        etat = pile.pop() ?? etat
        break
      case OP.transform:
        etat.ctm = mul(etat.ctm, a as M)
        break
      case OP.setStrokeRGBColor:
        etat.trait = String(a[0])
        break
      case OP.setFillRGBColor:
        etat.fond = String(a[0])
        break
      case OP.setLineWidth:
        etat.epaisseur = Number(a[0])
        break
      case OP.setGState:
        for (const [cle, v] of a[0] as [string, unknown][]) if (cle === 'LW') etat.epaisseur = Number(v)
        break
      case OP.beginMarkedContentProps:
        calques.push((a[1] as { id?: string } | null)?.id ?? null)
        break
      case OP.beginMarkedContent:
        calques.push(null)
        break
      case OP.endMarkedContent:
        calques.pop()
        break
      case OP.constructPath: {
        const op = a[0] as number
        const donnees = (a[1] as ArrayLike<number>[] | undefined)?.[0]
        const trait = op === OP.stroke || op === OP.closeStroke
        const fond = op === OP.fill || op === OP.eoFill
        const lesDeux = op >= OP.fillStroke && op <= OP.closeEOFillStroke
        if (!donnees || !(trait || fond || lesDeux)) break
        const m = etat.ctm
        const sous: number[][] = []
        let cur: number[] | null = null
        const pt = (x: number, y: number) => cur?.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])
        for (let i = 0; i < donnees.length; ) {
          const c = donnees[i++]
          if (c === 0) {
            cur = []
            sous.push(cur)
            pt(donnees[i], donnees[i + 1])
            i += 2
          } else if (c === 1) {
            pt(donnees[i], donnees[i + 1])
            i += 2
          } else if (c === 2) {
            pt(donnees[i + 4], donnees[i + 5])
            i += 6
          } else if (c === 3) {
            pt(donnees[i + 2], donnees[i + 3])
            i += 4
          } else if (c === 4 && cur && cur.length >= 2) cur.push(cur[0], cur[1])
        }
        const echelle = Math.hypot(m[0], m[1])
        const calque = calques.length ? calques[calques.length - 1] : null
        traces.push({
          type: trait || lesDeux ? 'trait' : 'remplissage',
          couleur: trait || lesDeux ? etat.trait : etat.fond,
          epaisseur: etat.epaisseur * echelle,
          calque,
          sousChemins: sous,
        })
      }
    }
  }
  return traces
}

/** Axis-aligned rectangles among the paths: candidate map frames. */
export function rectangles(traces: Trace[]): [number, number, number, number][] {
  const r: [number, number, number, number][] = []
  for (const t of traces) {
    for (const s of t.sousChemins) {
      const n = s.length / 2
      if (n < 4 || n > 8) continue
      const xs = new Set<number>()
      const ys = new Set<number>()
      for (let i = 0; i < s.length; i += 2) {
        xs.add(Math.round(s[i]))
        ys.add(Math.round(s[i + 1]))
      }
      if (xs.size !== 2 || ys.size !== 2) continue
      const [x0, x1] = [...xs].sort((a, b) => a - b)
      const [y0, y1] = [...ys].sort((a, b) => a - b)
      r.push([x0, y0, x1, y1])
    }
  }
  return r
}
