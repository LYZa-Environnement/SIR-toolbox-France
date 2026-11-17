import type { ReactNode, ThHTMLAttributes } from 'react'
import type { EtatTri } from '../lib/tri'

/** A column heading that sorts the table, with its direction shown. */
export function EnTete({
  cle,
  tri,
  onTrier,
  children,
  ...th
}: { cle: string; tri: EtatTri | null; onTrier: (cle: string) => void; children: ReactNode } & ThHTMLAttributes<HTMLTableCellElement>) {
  const actif = tri?.cle === cle
  return (
    <th {...th} aria-sort={actif ? (tri!.sens === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`tri${actif ? ' tri--actif' : ''}`} onClick={() => onTrier(cle)}>
        <span>{children}</span>
        <span className="tri__fleche" aria-hidden="true">
          {actif ? (tri!.sens === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}
