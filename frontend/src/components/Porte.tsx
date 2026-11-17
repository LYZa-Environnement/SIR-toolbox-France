import { useState, type FormEvent, type ReactNode } from 'react'
import { deverrouiller, estDeverrouille } from '../lib/acces'

/** A standalone page sent here to unlock comes back to it afterwards. */
function pageDeRetour(): string | null {
  const requete = window.location.hash.split('?')[1] ?? ''
  const retour = new URLSearchParams(requete).get('retour')
  return retour && /^[a-z0-9-]+\.html$/.test(retour) ? retour : null
}

export function Porte({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(estDeverrouille)
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState(false)
  const [verification, setVerification] = useState(false)

  if (ouvert) return <>{children}</>

  async function valider(e: FormEvent) {
    e.preventDefault()
    setVerification(true)
    const ok = await deverrouiller(saisie)
    setVerification(false)
    if (!ok) {
      setErreur(true)
      return
    }
    const retour = pageDeRetour()
    if (retour) window.location.href = `${import.meta.env.BASE_URL}${retour}`
    else setOuvert(true)
  }

  return (
    <main className="porte">
      <form className="card porte__carte" onSubmit={valider}>
        <p className="eyebrow">ERM — boîte à outils</p>
        <h1 className="porte__titre">SIR Toolbox France</h1>
        <label className="champ">
          Mot de passe
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={saisie}
            aria-invalid={erreur}
            onChange={(e) => {
              setSaisie(e.target.value)
              setErreur(false)
            }}
          />
        </label>
        {erreur && (
          <p role="alert" className="alerte" style={{ margin: 0 }}>
            Mot de passe incorrect.
          </p>
        )}
        <button type="submit" className="btn" disabled={!saisie || verification}>
          {verification ? 'Vérification…' : 'Entrer'}
        </button>
      </form>
    </main>
  )
}
