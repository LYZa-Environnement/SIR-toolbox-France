import { useEffect, useRef } from 'react'
import { monterBandeau } from './bandeau'

/** The dossier banner (plain DOM, shared with the standalone pages) under the header. */
export default function BandeauDossier() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => (ref.current ? monterBandeau(ref.current) : undefined), [])
  return <div ref={ref} />
}
