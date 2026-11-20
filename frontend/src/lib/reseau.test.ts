import { afterEach, describe, expect, it, vi } from 'vitest'
import { estDelaiDepasse, requete } from './reseau'

// A fetch that never answers, but rejects as the real one does when its signal aborts.
function fetchSansReponse() {
  return vi.fn((_url: string | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      signal?.addEventListener('abort', () => reject(signal.reason))
    })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('requete', () => {
  it('aborts a request that does not answer in time', async () => {
    vi.useFakeTimers()
    const fetchFactice = fetchSansReponse()
    vi.stubGlobal('fetch', fetchFactice)
    const promesse = requete('https://exemple.test/', {}, 1000)
    const attente = expect(promesse).rejects.toSatisfy(estDelaiDepasse)
    await vi.advanceTimersByTimeAsync(1001)
    await attente
    expect(fetchFactice.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it("still lets the caller's own signal cancel it, without calling it a timeout", async () => {
    vi.stubGlobal('fetch', fetchSansReponse())
    const controleur = new AbortController()
    const promesse = requete('https://exemple.test/', { signal: controleur.signal }, 60000)
    controleur.abort()
    const erreur = await promesse.catch((e: unknown) => e)
    expect((erreur as DOMException).name).toBe('AbortError')
    expect(estDelaiDepasse(erreur)).toBe(false)
  })

  it('passes the other options through and returns the response', async () => {
    const reponse = new Response('{}')
    const fetchFactice = vi.fn(async () => reponse)
    vi.stubGlobal('fetch', fetchFactice)
    await expect(requete('https://exemple.test/', { mode: 'cors' })).resolves.toBe(reponse)
    expect(fetchFactice).toHaveBeenCalledWith('https://exemple.test/', expect.objectContaining({ mode: 'cors' }))
  })
})
