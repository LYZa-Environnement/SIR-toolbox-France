import { useState, type DragEvent, type ReactNode } from 'react'

export const FORMATS_TABLEUR = '.xlsx,.xlsm,.xls,.csv'

interface Props {
  /** First line, shown while no file is being read. */
  titre: ReactNode
  aide: ReactNode
  chargement: boolean
  libelleChargement?: string
  accept?: string
  multiple?: boolean
  onFichiers: (fichiers: File[]) => void
  /** Buttons under the help text; `choisir` opens the file dialog.
   *  Default: a single "Choisir…" button. */
  actions?: (choisir: () => void) => ReactNode
}

/**
 * Where a file is dropped or chosen. The files are read in the browser by
 * the page; the hidden input is reached with the "Choisir" button, so the
 * zone works with the keyboard as well as by drag and drop.
 */
export default function ZoneDepot({ titre, aide, chargement, libelleChargement = 'Lecture du fichier…', accept = FORMATS_TABLEUR, multiple, onFichiers, actions }: Props) {
  const [survol, setSurvol] = useState(false)
  // The input element itself (callback ref): `choisir` can be handed to the
  // page's buttons without reading a ref during render.
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  const choisir = () => input?.click()
  const deposer = (e: DragEvent) => {
    e.preventDefault()
    setSurvol(false)
    const fichiers = [...e.dataTransfer.files]
    if (fichiers.length) onFichiers(fichiers)
  }
  return (
    <div
      className={`depot${survol ? ' depot--survol' : ''}`}
      aria-busy={chargement}
      onDragOver={(e) => {
        e.preventDefault()
        setSurvol(true)
      }}
      // Leaving for a child element (text, button) is not leaving the zone.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(false)
      }}
      onDrop={deposer}
    >
      <input
        ref={setInput}
        type="file"
        multiple={multiple}
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const fichiers = [...(e.target.files ?? [])]
          e.target.value = ''
          if (fichiers.length) onFichiers(fichiers)
        }}
      />
      <p className="depot__titre" aria-live="polite">
        {chargement ? libelleChargement : titre}
      </p>
      <p className="depot__aide">{aide}</p>
      {actions ? (
        actions(choisir)
      ) : (
        <button type="button" className="btn" onClick={choisir} disabled={chargement}>
          Choisir {multiple ? 'des fichiers' : 'un fichier'}
        </button>
      )}
    </div>
  )
}
