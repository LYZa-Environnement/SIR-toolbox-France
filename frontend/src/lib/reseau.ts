/**
 * `fetch` with a deadline, for every call to a public service.
 *
 * `safe()` (themes/common.ts) already stops a rubrique from waiting on a
 * source that never answers, but it only stops *waiting*: the request itself
 * stays open and keeps one of the ~6 connections the browser allows per host
 * (see lib/queue.ts), delaying the next rubrique's requests to the same
 * service. Aborting it frees the connection.
 *
 * The deadline is shorter than `safe()`'s, so the request is aborted before
 * the rubrique gives up on it.
 */

export const DELAI_REQUETE_MS = 20000

export function requete(url: string | URL, init: RequestInit = {}, delaiMs = DELAI_REQUETE_MS): Promise<Response> {
  const delai = AbortSignal.timeout(delaiMs)
  // A caller's own signal (a search replaced by the next keystroke) still
  // cancels the request; whichever fires first wins.
  const signal = init.signal ? AbortSignal.any([init.signal, delai]) : delai
  return fetch(url, { ...init, signal })
}

/** True when the request ran out of time, as opposed to being cancelled by the
 * caller or failing on the network. */
export function estDelaiDepasse(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError'
}
