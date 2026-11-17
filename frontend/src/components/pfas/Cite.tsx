import { numero, reference } from '../../lib/pfas/references'

/** Numbered call to the bibliography at the bottom of the page: [3, 7]. */
export function Cite({ ids }: { ids: string[] }) {
  const tries = [...new Set(ids)].sort((a, b) => numero(a) - numero(b))
  if (!tries.length) return null
  return (
    <sup className="pfas-cite">
      [
      {tries.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <a href={`#ref-${id}`} title={reference(id).court}>
            {numero(id)}
          </a>
        </span>
      ))}
      ]
    </sup>
  )
}

/** "Brusseau et al., 2020 [6]" — the short form, for running text. */
export function Auteur({ id }: { id: string }) {
  return (
    <>
      {reference(id).court}
      <Cite ids={[id]} />
    </>
  )
}
