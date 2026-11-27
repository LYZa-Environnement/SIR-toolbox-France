/**
 * Calls to the model's worker: `executer('construireModele', donnees, options)`
 * resolves with the result. One worker for the page, started on the first
 * call; without Web Workers (tests, old browsers), the calculation runs in
 * place.
 */

import { CALCULS, type NomCalcul } from './calcul.ts'

type Resultat<N extends NomCalcul> = ReturnType<(typeof CALCULS)[N]>

let worker: Worker | null = null
let indisponible = false
let compteur = 0
const attentes = new Map<number, { ok: (r: unknown) => void; ko: (e: Error) => void }>()

function demarrer(): Worker | null {
  if (worker || indisponible) return worker
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; resultat?: unknown; erreur?: string }>) => {
      const a = attentes.get(e.data.id)
      if (!a) return
      attentes.delete(e.data.id)
      if (e.data.erreur !== undefined) a.ko(new Error(e.data.erreur))
      else a.ok(e.data.resultat)
    }
    worker.onerror = (e) => {
      for (const a of attentes.values()) a.ko(new Error(e.message || 'calcul interrompu'))
      attentes.clear()
    }
  } catch {
    indisponible = true
    worker = null
  }
  return worker
}

export function executer<N extends NomCalcul>(nom: N, ...args: Parameters<(typeof CALCULS)[N]>): Promise<Resultat<N>> {
  const w = typeof Worker !== 'undefined' ? demarrer() : null
  if (!w) {
    try {
      return Promise.resolve((CALCULS[nom] as (...a: unknown[]) => Resultat<N>)(...args))
    } catch (e) {
      return Promise.reject(e)
    }
  }
  const id = ++compteur
  return new Promise<Resultat<N>>((ok, ko) => {
    attentes.set(id, { ok: ok as (r: unknown) => void, ko })
    w.postMessage({ id, nom, args })
  })
}
