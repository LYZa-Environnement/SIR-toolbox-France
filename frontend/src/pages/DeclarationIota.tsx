import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import AddressSearch from '../components/AddressSearch'
import { fetchParcelleAt } from '../lib/cadastre'
import { cardinalPhraseFr } from '../lib/geo'
import { completude, type EtatPiece } from '../lib/iota/completude'
import { estNatura, lireContexte } from '../lib/iota/contexte'
import {
  dateDebutPossible,
  dossierVide,
  LIBELLE_GESTION,
  LIBELLE_MAITRISE,
  LIBELLE_STATUT,
  LIBELLE_TYPE,
  normaliser,
  nouvelOuvrage,
  volumesPurge,
  type Dossier,
  type GestionEaux,
  type Maitrise,
  type Mandat,
  type Ouvrage,
  type SectionId,
  type StatutOuvrage,
  type TypeOuvrage,
} from '../lib/iota/modele'
import { fluxR1, LIBELLE_REGIME, R1, RUBRIQUES, synthese, TITRES, type Regime, type Rubrique, type Valeurs } from '../lib/iota/nomenclature'
import { departement, distance, PROPOSITIONS } from '../lib/iota/redaction'
import type { Site } from '../types/site'

const CLE = 'sir-toolbox:iota:dossier'

function chargerLocal(): Dossier | null {
  try {
    const t = localStorage.getItem(CLE)
    return t ? normaliser(JSON.parse(t)) : null
  } catch {
    return null
  }
}

const BADGE_REGIME: Record<Regime, string> = { A: 'badge badge--elevee', D: 'badge badge--moderee', NC: 'badge badge--faible' }
const BADGE_ETAT: Record<EtatPiece, [string, string]> = {
  ok: ['badge badge--faible', 'Complet'],
  'a-verifier': ['badge badge--moderee', 'À relire'],
  manquant: ['badge badge--elevee', 'Manquant'],
  'sans-objet': ['badge badge--indeterminee', 'Sans objet'],
}

const GROUPES: { titre: string; sections: [SectionId, string][] }[] = [
  { titre: 'Étude d’incidence — 1. Contexte de la demande', sections: [['contexteDemande', 'Contexte de la demande (historique, objet)']] },
  {
    titre: 'Étude d’incidence — 2. Contexte environnemental',
    sections: [
      ['topographie', '2.1 Topographie'],
      ['geologieRegionale', '2.2 Géologie régionale'],
      ['geologieLocale', '2.3 Géologie locale'],
      ['hydrologie', '2.4 Hydrologie'],
      ['hydrogeologie', '2.5 Hydrogéologie'],
      ['usages', '2.6 Usages des eaux souterraines'],
      ['zonesProtegees', '2.7 Zones protégées'],
      ['zonagesEau', '2.8 Documents de planification et zonages'],
    ],
  },
  {
    titre: 'Étude d’incidence — 4. Descriptif du projet',
    sections: [
      ['descriptionProjet', '4.1 Description des ouvrages et travaux'],
      ['modalitesTravaux', '4.2 Modalités de réalisation des travaux'],
      ['programmeSuivi', '4.3.1 Programme de suivi'],
      ['procedurePrelevement', '4.3.2 Procédure de prélèvement'],
      ['gestionEaux', '4.3.3 Gestion des eaux de purge'],
    ],
  },
  { titre: 'Étude d’incidence — 5. Raisons du choix du projet', sections: [['choixProjet', '5. Raisons du choix (R. 214-32 II 5° a)']] },
  {
    titre: 'Étude d’incidence — 6. Incidences',
    sections: [
      ['incidencesQuantitatives', '6.1 Ressource en eau'],
      ['incidencesQualitatives', '6.2 Qualité des eaux'],
      ['incidencesMilieux', '6.3 Milieu aquatique, écoulement, ruissellement'],
      ['incidencesChantier', '6.4 Phase travaux'],
      ['variations', '6.5 Variations saisonnières et climatiques'],
    ],
  },
  {
    titre: 'Étude d’incidence — 7. Compatibilité',
    sections: [
      ['compatibiliteSdage', '7.1 SDAGE'],
      ['compatibiliteSage', '7.2 SAGE'],
      ['compatibilitePgri', '7.3 PGRI'],
      ['objectifsQualite', '7.4 Objectifs L. 211-1 et D. 211-10'],
    ],
  },
  {
    titre: 'Étude d’incidence — 8 à 12. Mesures, surveillance, conclusion',
    sections: [
      ['mesuresErc', '8. Mesures d’évitement, de réduction et de compensation'],
      ['prescriptionsSpecifiques', '9. Prescriptions générales et spécifiques'],
      ['moyensSurveillance', '10.1 Moyens de surveillance'],
      ['moyensIntervention', '10.2 Moyens d’intervention en cas d’incident'],
      ['autresProcedures', '11. Autres procédures (R. 214-32 II 7°)'],
      ['conclusion', '12. Conclusion'],
    ],
  },
  {
    titre: 'Évaluation des incidences Natura 2000',
    sections: [
      ['naturaAnalyse', 'Sites Natura 2000 dans le voisinage'],
      ['naturaConclusion', 'Conclusion de l’évaluation'],
    ],
  },
  {
    titre: 'Résumé non technique',
    sections: [
      ['rntProjet', 'Projet soumis à déclaration'],
      ['rntIncidences', 'Incidences du projet'],
    ],
  },
]

const trous = (t: string) => t.match(/\[À compléter/g)?.length ?? 0

function Champ({ label, children, large }: { label: string; children: ReactNode; large?: boolean }) {
  return (
    <label className="champ" style={large ? { gridColumn: '1 / -1' } : undefined}>
      {label}
      {children}
    </label>
  )
}

export default function DeclarationIota() {
  const [d, setD] = useState<Dossier>(() => chargerLocal() ?? dossierVide())
  const [lecture, setLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [export_, setExport] = useState<string | null>(null)
  const [depot, setDepot] = useState('')
  const fichier = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CLE, JSON.stringify(d))
      } catch {
        /* storage full or blocked: the JSON file remains the way to keep work */
      }
    }, 400)
    return () => clearTimeout(t)
  }, [d])

  const majDoc = (p: Partial<Dossier['document']>) => setD((x) => ({ ...x, document: { ...x.document, ...p } }))
  const majDecl = (p: Partial<Dossier['declarant']>) => setD((x) => ({ ...x, declarant: { ...x.declarant, ...p } }))
  const majSite = (p: Partial<Dossier['site']>) => setD((x) => ({ ...x, site: { ...x.site, ...p } }))
  const majTexte = (id: SectionId, v: string | undefined) =>
    setD((x) => {
      const textes = { ...x.textes }
      if (v === undefined) delete textes[id]
      else textes[id] = v
      return { ...x, textes }
    })
  const majMandat = (p: Partial<Mandat>) => setD((x) => ({ ...x, mandat: { ...x.mandat, ...p } }))
  const majOuvrage = (id: string, p: Partial<Ouvrage>) => setD((x) => ({ ...x, ouvrages: x.ouvrages.map((o) => (o.id === id ? { ...o, ...p } : o)) }))
  const basculer = (code: string) =>
    setD((x) => {
      const on = x.rubriques.actives.includes(code)
      return { ...x, rubriques: { ...x.rubriques, actives: on ? x.rubriques.actives.filter((c) => c !== code) : [...x.rubriques.actives, code] } }
    })
  const majValeur = (code: string, k: string, v: string | boolean) =>
    setD((x) => ({ ...x, rubriques: { ...x.rubriques, valeurs: { ...x.rubriques.valeurs, [code]: { ...x.rubriques.valeurs[code], [k]: v } } } }))

  async function choisirSite(s: Site) {
    majSite({
      adresse: s.label,
      commune: s.city,
      codeInsee: s.citycode,
      codePostal: s.postcode,
      departement: departement(s.citycode),
      lat: s.lat,
      lon: s.lon,
    })
    const p = await fetchParcelleAt(s.lat, s.lon)
    if (p?.section && p.numero) setD((x) => (x.site.parcelles ? x : { ...x, site: { ...x.site, parcelles: `${p.section} ${p.numero}` } }))
  }

  async function lireLeContexte() {
    if (d.site.lat === null || d.site.lon === null) return
    setLecture(true)
    setErreur(null)
    try {
      const c = await lireContexte(d.site.lat, d.site.lon)
      setD((x) => ({ ...x, contexte: c }))
    } catch (e) {
      setErreur(`Lecture du contexte impossible : ${(e as Error).message}`)
    } finally {
      setLecture(false)
    }
  }

  function enregistrer() {
    const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `IOTA_${(d.site.commune || 'dossier').replace(/[^\p{L}\d]+/gu, '_')}_dossier.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function ouvrir(f: File | undefined) {
    if (!f) return
    try {
      setD(normaliser(JSON.parse(await f.text())))
      setErreur(null)
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  async function mandat(vierge: boolean) {
    setExport(vierge ? 'mandat-vierge' : 'mandat')
    setErreur(null)
    try {
      const m = await import('../lib/iota/mandat')
      await m.telechargerMandat(vierge ? null : d)
    } catch (e) {
      setErreur(`Export impossible : ${(e as Error).message}`)
    } finally {
      setExport(null)
    }
  }

  async function exporter(types: ('etude' | 'natura' | 'rnt')[]) {
    setExport(types.join(','))
    setErreur(null)
    try {
      const m = await import('../lib/iota/docx')
      const logos = await m.logosErm(import.meta.env.BASE_URL)
      for (const t of types) await m.telecharger(t, d, logos)
    } catch (e) {
      setErreur(`Export impossible : ${(e as Error).message}`)
    } finally {
      setExport(null)
    }
  }

  const s = useMemo(() => synthese(d.rubriques.actives, d.rubriques.valeurs), [d.rubriques])
  const purge = useMemo(() => volumesPurge(d), [d])
  const pieces = useMemo(() => completude(d), [d])
  const c = d.contexte
  const enZre = !!c?.zre.length
  const debut = depot ? dateDebutPossible(depot) : null

  const avertissements: string[] = []
  if (s.regime === 'A')
    avertissements.push(
      'Au moins une rubrique relève de l’autorisation : le projet entier relève alors de l’autorisation environnementale (article L. 181-1), et non de la déclaration. Les documents produits ici n’en couvrent pas le contenu (article R. 181-13 et suivants).',
    )
  if (s.titreV) avertissements.push('Une rubrique du titre V est retenue : ces opérations relèvent de procédures particulières (articles R. 214-6 à R. 214-56 non applicables).')
  if (enZre && ['1.1.2.0', '1.2.1.0'].some((x) => d.rubriques.actives.includes(x)))
    avertissements.push(`Le site est en zone de répartition des eaux (${c!.zre.join(', ')}) : les prélèvements y relèvent de la rubrique 1.3.1.0 et non des rubriques 1.1.2.0 ou 1.2.1.0.`)
  if (enZre && (d.ouvrages.length || d.rubriques.actives.includes('1.1.1.0')) && !d.rubriques.actives.includes('1.3.1.0'))
    avertissements.push(
      `Le site est en zone de répartition des eaux (${c!.zre.join(', ')}) : tout prélèvement non domestique, même temporaire (purges, essais de pompage), peut relever de la rubrique 1.3.1.0 (déclaration sous 8 m³/h). À confirmer avec le service chargé de la police de l’eau.`,
    )
  if (s.regime === 'NC') avertissements.push('Aucune rubrique n’atteint le seuil de déclaration : le projet ne relève pas de la nomenclature IOTA au vu des quantités saisies.')

  return (
    <>
      <section className="section">
        <div className="container">
          <p className="eyebrow">Loi sur l’eau — articles L. 214-1 à L. 214-6</p>
          <h1 style={{ maxWidth: '24ch' }}>Déclaration IOTA</h1>
          <p className="lede">
            Préparez le dossier de déclaration d’une installation, d’un ouvrage, de travaux ou d’une activité soumis à la nomenclature de
            l’article R. 214-1 : classement des rubriques, lecture du contexte dans les bases publiques, rédaction guidée et export des trois
            rapports Word au gabarit ERM (étude d’incidence, évaluation des incidences Natura 2000, résumé non technique). Le dossier reste
            dans votre navigateur ; enregistrez-le en fichier pour le reprendre.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button type="button" className="btn btn--petit" onClick={enregistrer}>
              Enregistrer le dossier (.json)
            </button>
            <button type="button" className="btn btn--petit btn--ghost" onClick={() => fichier.current?.click()}>
              Ouvrir un dossier
            </button>
            <button
              type="button"
              className="btn btn--petit btn--ghost"
              onClick={() => {
                if (confirm('Effacer le dossier en cours et repartir de zéro ?')) setD(dossierVide())
              }}
            >
              Nouveau dossier
            </button>
            <input
              ref={fichier}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                void ouvrir(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {erreur && (
            <p role="alert" className="alerte">
              {erreur}
            </p>
          )}

          {/* ---- 1 ---- */}
          <h2 className="etape">
            <span>1</span> Document et déclarant
          </h2>
          <div className="grid grid--3" style={{ alignItems: 'end' }}>
            <Champ label="Titre du projet">
              <input value={d.document.titreProjet} onChange={(e) => majDoc({ titreProjet: e.target.value })} placeholder="ex. Traitement de la nappe" />
            </Champ>
            <Champ label="N° de projet (GMS)">
              <input value={d.document.gms} onChange={(e) => majDoc({ gms: e.target.value })} placeholder="ex. 0588817" />
            </Champ>
            <div className="grid grid--2" style={{ gap: '0.75rem' }}>
              <Champ label="Version">
                <input value={d.document.version} onChange={(e) => majDoc({ version: e.target.value })} />
              </Champ>
              <Champ label="Date">
                <input type="date" value={d.document.date} onChange={(e) => majDoc({ date: e.target.value })} />
              </Champ>
            </div>
            <Champ label="Directeur de projet">
              <input value={d.document.directeurNom} onChange={(e) => majDoc({ directeurNom: e.target.value })} placeholder="Prénom NOM" />
            </Champ>
            <Champ label="Chef de projet">
              <input value={d.document.chefNom} onChange={(e) => majDoc({ chefNom: e.target.value })} placeholder="Prénom NOM" />
            </Champ>
            <Champ label="Fonction affichée">
              <select value={d.document.chefFonction} onChange={(e) => majDoc({ chefFonction: e.target.value })}>
                <option>Chef de projet</option>
                <option>Cheffe de projet</option>
              </select>
            </Champ>
            <Champ label="Auteurs" large>
              <input value={d.document.auteurs} onChange={(e) => majDoc({ auteurs: e.target.value })} placeholder="ex. Prénom Nom, Prénom Nom" />
            </Champ>
          </div>
          <div className="grid grid--3" style={{ alignItems: 'end', marginTop: '1rem' }}>
            <Champ label="Déclarant (R. 214-32 II 1°)">
              <input value={d.declarant.nom} onChange={(e) => majDecl({ nom: e.target.value })} placeholder="ex. SAFRAN SA" />
            </Champ>
            <Champ label="Personne">
              <select value={d.declarant.morale ? 'm' : 'p'} onChange={(e) => majDecl({ morale: e.target.value === 'm' })}>
                <option value="m">Morale (SIRET)</option>
                <option value="p">Physique (date de naissance)</option>
              </select>
            </Champ>
            {d.declarant.morale ? (
              <Champ label="SIRET">
                <input value={d.declarant.siret} onChange={(e) => majDecl({ siret: e.target.value })} placeholder="14 chiffres" />
              </Champ>
            ) : (
              <Champ label="Date de naissance">
                <input type="date" value={d.declarant.dateNaissance} onChange={(e) => majDecl({ dateNaissance: e.target.value })} />
              </Champ>
            )}
            <Champ label="Adresse du déclarant" large>
              <input value={d.declarant.adresse} onChange={(e) => majDecl({ adresse: e.target.value })} />
            </Champ>
          </div>

          {/* ---- 2 ---- */}
          <h2 className="etape">
            <span>2</span> Site et contexte environnemental
          </h2>
          <div style={{ maxWidth: '40rem' }}>
            <AddressSearch onSelect={(x) => void choisirSite(x)} />
          </div>
          <div className="grid grid--3" style={{ alignItems: 'end', marginTop: '1rem' }}>
            <Champ label="Commune">
              <input value={d.site.commune} onChange={(e) => majSite({ commune: e.target.value })} />
            </Champ>
            <Champ label="Code INSEE">
              <input value={d.site.codeInsee} onChange={(e) => majSite({ codeInsee: e.target.value, departement: departement(e.target.value) })} />
            </Champ>
            <Champ label="Autres départements concernés">
              <input value={d.site.autresDepartements} onChange={(e) => majSite({ autresDepartements: e.target.value })} placeholder="le cas échéant" />
            </Champ>
            <Champ label="Parcelles cadastrales">
              <input value={d.site.parcelles} onChange={(e) => majSite({ parcelles: e.target.value })} placeholder="ex. AB 12, AB 13" />
            </Champ>
            <Champ label="Maîtrise foncière (R. 214-32 II 2°)">
              <select value={d.site.maitrise} onChange={(e) => majSite({ maitrise: e.target.value as Maitrise })}>
                {Object.entries(LIBELLE_MAITRISE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ label="Pièce justificative jointe">
              <input value={d.site.pieceMaitrise} onChange={(e) => majSite({ pieceMaitrise: e.target.value })} placeholder="ex. attestation de propriété (annexe B)" />
            </Champ>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn" disabled={d.site.lat === null || lecture} onClick={() => void lireLeContexte()}>
              {lecture ? 'Lecture des bases publiques…' : c ? 'Relire le contexte' : 'Lire le contexte environnemental'}
            </button>
            <span className="iota-note" style={{ margin: 0 }}>
              {d.site.lat === null ? 'Choisissez d’abord l’adresse du site.' : `Point : ${d.site.lat.toFixed(5)}, ${d.site.lon!.toFixed(5)}`}
              {c && ` — lu le ${c.date}`}
            </span>
          </div>
          {c && <ContexteResume d={d} />}

          {/* ---- 3 ---- */}
          <h2 className="etape">
            <span>3</span> Rubriques de la nomenclature
          </h2>
          <p className="iota-note" style={{ maxWidth: '48rem' }}>
            Cochez les rubriques que le projet peut viser et renseignez les quantités : le régime suit les seuils de l’annexe à l’article R.
            214-1 (version consolidée du 28 août 2025). Les quantités sont celles de l’ensemble des ouvrages du projet (cumul, article R.
            214-42).
          </p>
          {[1, 2, 3, 4, 5].map((ti) => {
            const rs = RUBRIQUES.filter((r) => r.titre === ti)
            const nb = rs.filter((r) => d.rubriques.actives.includes(r.code)).length
            return (
              <details key={ti} className="qualif" open={ti <= 3 || nb > 0} style={{ marginBottom: '0.75rem' }}>
                <summary>
                  {TITRES[ti]}
                  {nb > 0 && ` — ${nb} retenue${nb > 1 ? 's' : ''}`}
                </summary>
                <div style={{ marginTop: '0.6rem' }}>
                  {rs.map((r) => (
                    <CarteRubrique
                      key={r.code}
                      r={r}
                      active={d.rubriques.actives.includes(r.code)}
                      v={d.rubriques.valeurs[r.code] ?? {}}
                      onBascule={() => basculer(r.code)}
                      onValeur={(k, v) => majValeur(r.code, k, v)}
                    />
                  ))}
                </div>
              </details>
            )
          })}
          <div className="grid grid--2" style={{ alignItems: 'end', marginTop: '1rem' }}>
            <Champ label="Évaluation environnementale (R. 122-2)">
              <select value={d.evalEnv} onChange={(e) => setD((x) => ({ ...x, evalEnv: e.target.value as Dossier['evalEnv'] }))}>
                <option value="non">Projet non visé par l’annexe de l’article R. 122-2</option>
                <option value="dispense">Dispensé après examen au cas par cas</option>
                <option value="etude-impact">Soumis à étude d’impact (elle remplace le document d’incidences)</option>
              </select>
            </Champ>
            <label style={{ fontSize: '0.9rem' }}>
              <input type="checkbox" checked={d.hydraulique} onChange={(e) => setD((x) => ({ ...x, hydraulique: e.target.checked }))} /> Installation utilisant l’énergie
              hydraulique (pièces du VIII de l’article R. 214-32)
            </label>
          </div>
          <div className="card" style={{ marginTop: '1rem' }}>
            <strong>Régime du projet : </strong>
            {s.regime ? <span className={BADGE_REGIME[s.regime]}>{LIBELLE_REGIME[s.regime]}</span> : <span className="badge badge--indeterminee">À déterminer</span>}
            {s.aCompleter.length > 0 && <p className="iota-note">À compléter : {s.aCompleter.join(' ; ')}</p>}
            {[...new Set(s.retenues.flatMap((r) => r.apg))].length > 0 && (
              <>
                <p style={{ margin: '0.6rem 0 0.2rem', fontSize: '0.9rem', fontWeight: 600 }}>Prescriptions générales applicables</p>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem' }}>
                  {[...new Set(s.retenues.flatMap((r) => r.apg))].map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </>
            )}
            {avertissements.map((a) => (
              <p key={a} className="alerte" style={{ maxWidth: 'none' }}>
                {a}
              </p>
            ))}
          </div>

          {/* ---- 4 ---- */}
          <h2 className="etape">
            <span>4</span> Ouvrages et volumes de purge
          </h2>
          <p className="iota-note" style={{ maxWidth: '48rem' }}>
            Un ouvrage par ligne. Le volume de purge suit la méthode des dossiers ERM : π × (rayon du forage)² × hauteur d’eau × nombre de
            volumes renouvelés ; les ouvrages à reboucher ne sont pas échantillonnés.
          </p>
          <div className="tableau-defile" style={{ marginTop: '0.5rem' }}>
            <table className="tableau">
              <thead>
                <tr>
                  <th>Ouvrage</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Profondeur (m)</th>
                  <th>Ø forage (mm)</th>
                  <th>Équipement</th>
                  <th>Crépine de (m)</th>
                  <th>à (m)</th>
                  <th>Niveau d’eau (m/sol)</th>
                  <th>Purge (m³)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.ouvrages.map((o) => {
                  const l = purge.lignes.find((x) => x.ouvrage.id === o.id)
                  const txt = (k: keyof Ouvrage, w = '5rem') => (
                    <input value={o[k] as string} onChange={(e) => majOuvrage(o.id, { [k]: e.target.value })} style={{ width: w }} aria-label={`${String(k)} ${o.nom}`} />
                  )
                  return (
                    <tr key={o.id}>
                      <td>{txt('nom', '6rem')}</td>
                      <td>
                        <select value={o.type} onChange={(e) => majOuvrage(o.id, { type: e.target.value as TypeOuvrage })}>
                          {Object.entries(LIBELLE_TYPE).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select value={o.statut} onChange={(e) => majOuvrage(o.id, { statut: e.target.value as StatutOuvrage })}>
                          {Object.entries(LIBELLE_STATUT).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{txt('profondeur')}</td>
                      <td>{txt('diametreForage')}</td>
                      <td>{txt('tube', '8rem')}</td>
                      <td>{txt('crepineDe', '4rem')}</td>
                      <td>{txt('crepineA', '4rem')}</td>
                      <td>{txt('niveauEau')}</td>
                      <td>{l ? l.volumeM3.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '-'}</td>
                      <td>
                        <button type="button" className="btn btn--petit btn--ghost" onClick={() => setD((x) => ({ ...x, ouvrages: x.ouvrages.filter((y) => y.id !== o.id) }))} aria-label={`Retirer ${o.nom}`}>
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
            <button
              type="button"
              className="btn btn--petit"
              onClick={() =>
                setD((x) => {
                  const der = x.ouvrages[x.ouvrages.length - 1]
                  const o = nouvelOuvrage(x.ouvrages.length + 1)
                  return { ...x, ouvrages: [...x.ouvrages, der ? { ...der, id: o.id, nom: o.nom } : o] }
                })
              }
            >
              Ajouter un ouvrage
            </button>
          </div>
          <div className="grid grid--3" style={{ alignItems: 'end', marginTop: '1rem' }}>
            <Champ label="Volumes renouvelés par purge">
              <input inputMode="decimal" value={d.purge.nbVolumes} onChange={(e) => setD((x) => ({ ...x, purge: { ...x.purge, nbVolumes: e.target.value } }))} />
            </Champ>
            <Champ label="Campagnes par an">
              <input inputMode="decimal" value={d.purge.campagnesAn} onChange={(e) => setD((x) => ({ ...x, purge: { ...x.purge, campagnesAn: e.target.value } }))} />
            </Champ>
            <Champ label="Gestion des eaux de purge">
              <select value={d.purge.gestion} onChange={(e) => setD((x) => ({ ...x, purge: { ...x.purge, gestion: e.target.value as GestionEaux } }))}>
                {Object.entries(LIBELLE_GESTION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Champ>
          </div>
          {purge.lignes.length > 0 && (
            <p style={{ marginTop: '0.6rem', fontSize: '0.92rem' }}>
              Volume purgé : <strong>{purge.parCampagneM3.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m³ par campagne</strong>
              {purge.campagnesAn > 0 && `, ${purge.annuelM3.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m³/an`}
              {purge.ignores.length > 0 && <span className="iota-note"> — non comptés : {purge.ignores.join(', ')}</span>}
            </p>
          )}
        </div>
      </section>

      {/* ---- 5 ---- */}
      <section className="section section--muted">
        <div className="container">
          <h2 className="etape">
            <span>5</span> Rédaction
          </h2>
          <p className="lede" style={{ marginBottom: '1rem' }}>
            Chaque section part d’une proposition (en pointillé) établie à partir de vos saisies et du contexte lu ; elle se met à jour tant que vous
            ne l’avez pas modifiée. Les passages « [À compléter : …] » ressortent surlignés en jaune dans les documents Word.
          </p>
          {GROUPES.map((g, i) => {
            const n = g.sections.reduce((a, [id]) => a + trous(d.textes[id] ?? PROPOSITIONS[id](d, c)), 0)
            return (
              <details key={g.titre} className="qualif" open={i === 0} style={{ marginBottom: '0.75rem' }}>
                <summary>
                  {g.titre}
                  {n > 0 ? ` — ${n} élément${n > 1 ? 's' : ''} à compléter` : ''}
                </summary>
                <div style={{ marginTop: '0.75rem' }}>
                  {g.titre.startsWith('Évaluation') && (
                    <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                      Conclusion de l’évaluation préliminaire (R. 414-23 I) :{' '}
                      <select value={d.naturaIncidence} onChange={(e) => setD((x) => ({ ...x, naturaIncidence: e.target.value as Dossier['naturaIncidence'] }))}>
                        <option value="absence">absence d’incidence significative</option>
                        <option value="possible">incidence possible : évaluation complète (R. 414-23 II et III)</option>
                      </select>
                    </label>
                  )}
                  {g.sections.map(([id, libelle]) => (
                    <Section key={id} id={id} libelle={libelle} d={d} onChange={(v) => majTexte(id, v)} />
                  ))}
                </div>
              </details>
            )
          })}
          <div className="grid grid--2" style={{ marginTop: '1.25rem', alignItems: 'start' }}>
            <div>
              <h3 style={{ margin: '0 0 0.5rem' }}>Figures (R. 214-32 II 6°)</h3>
              {d.figures.map((f, j) => (
                <div key={f.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <input type="checkbox" checked={f.prevue} onChange={(e) => setD((x) => ({ ...x, figures: x.figures.map((y, k) => (k === j ? { ...y, prevue: e.target.checked } : y)) }))} />
                  <input
                    value={f.titre}
                    onChange={(e) => setD((x) => ({ ...x, figures: x.figures.map((y, k) => (k === j ? { ...y, titre: e.target.value } : y)) }))}
                    style={{ flex: 1, font: 'inherit', fontSize: '0.88rem', padding: '0.3rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}
                  />
                </div>
              ))}
              <p className="iota-note">Une page encadrée par figure cochée est réservée dans les documents, pour la carte du cartographe.</p>
            </div>
            <Champ label="Annexes (une par ligne)">
              <textarea value={d.annexes.join('\n')} onChange={(e) => setD((x) => ({ ...x, annexes: e.target.value.split('\n') }))} rows={4} />
            </Champ>
          </div>
        </div>
      </section>

      {/* ---- 6 ---- */}
      <section className="section">
        <div className="container">
          <h2 className="etape">
            <span>6</span> Complétude et export
          </h2>
          <div className="tableau-defile">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Élément exigé</th>
                  <th>État</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((p, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{p.ref}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: '18rem' }}>{p.libelle}</td>
                    <td>
                      <span className={BADGE_ETAT[p.etat][0]} style={{ fontSize: '0.72rem' }}>
                        {BADGE_ETAT[p.etat][1]}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'normal', fontSize: '0.82rem', color: 'var(--color-muted)', minWidth: '14rem' }}>{p.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: '1.25rem', maxWidth: '52rem' }}>
            <strong>Procédure</strong>
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
              <li>
                Dépôt auprès du préfet du département des travaux (guichet unique de l’eau de la DDT ou DDTM), par téléprocédure ou en un
                exemplaire papier accompagné d’une version électronique (R. 214-32 I et II).
              </li>
              <li>
                Délai d’opposition de deux mois à compter de la réception d’un dossier complet : les travaux ne peuvent commencer avant son
                expiration (II de l’article L. 214-3). Une demande de compléments fait courir le délai à nouveau à leur réception.
              </li>
              <li>Prescriptions générales à respecter et à rappeler dans le dossier ; le récépissé ne dispense pas des autres autorisations.</li>
              {d.rubriques.actives.includes('1.1.1.0') && (
                <li>
                  Forages : les prescriptions générales actuelles (arrêté du 11 septembre 2003) s’appliquent jusqu’au 31 décembre 2027 ; à compter
                  de cette date, règles générales de l’arrêté du 18 mars 2026 et entreprises de forage certifiées.
                </li>
              )}
            </ul>
            <label className="champ" style={{ marginTop: '0.75rem', maxWidth: '16rem' }}>
              Date prévue du dépôt complet
              <input type="date" value={depot} onChange={(e) => setDepot(e.target.value)} />
            </label>
            {debut && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
                Début des travaux possible, en l’absence d’opposition, à partir du <strong>{new Date(debut).toLocaleDateString('fr-FR')}</strong>.
              </p>
            )}
          </div>

          <div className="exports" style={{ marginTop: '1.25rem' }}>
            {(
              [
                ['etude', 'Étude d’incidence', 'Document d’incidences (R. 214-32 II 1° à 7°) : contexte, rubriques, projet, incidences, compatibilité, mesures, surveillance, tableau de correspondance.'],
                ['natura', 'Évaluation des incidences Natura 2000', 'Évaluation au titre des articles R. 214-32 et R. 414-23 : sites les plus proches, distances, conclusion.'],
                ['rnt', 'Résumé non technique', 'Résumé du contexte, du projet et des incidences (R. 214-32 II 4°).'],
              ] as const
            ).map(([t, titre, texte]) => (
              <div key={t} className="card export">
                <strong>{titre}</strong>
                <p>{texte}</p>
                <button type="button" className="btn" disabled={!!export_} onClick={() => void exporter([t])}>
                  {export_?.includes(t) ? 'Préparation…' : 'Télécharger (.docx)'}
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn--ghost" style={{ marginTop: '0.75rem' }} disabled={!!export_} onClick={() => void exporter(['etude', 'natura', 'rnt'])}>
            Télécharger les trois documents
          </button>
          <p className="iota-note" style={{ maxWidth: '48rem' }}>
            À l’ouverture, Word propose de mettre à jour les champs : acceptez pour numéroter la table des matières. Les cartes sont à insérer dans
            les pages de figures réservées.
          </p>
        </div>
      </section>

      {/* ---- 7 ---- */}
      <section className="section section--muted">
        <div className="container">
          <h2 className="etape">
            <span>7</span> Mandat de dépôt
          </h2>
          <p className="lede" style={{ marginBottom: '1rem' }}>
            Lorsque ERM dépose la déclaration sur Service-public.fr pour le compte du déclarant, joignez un mandat signé par les deux parties.
            Le mandant reprend le déclarant de l’étape 1 ; complétez son représentant. Les champs laissés vides restent en pointillés à remplir
            à la main.
          </p>
          <div className="grid grid--3" style={{ alignItems: 'end' }}>
            <Champ label="Projet cité dans le mandat">
              <input value={d.mandat.projet} onChange={(e) => majMandat({ projet: e.target.value })} placeholder={[d.declarant.nom, d.site.commune.toUpperCase()].filter(Boolean).join(' ') || 'ex. Bosch DRANCY'} />
            </Champ>
            {d.declarant.morale && (
              <>
                <Champ label="Représentant : nom">
                  <input value={d.mandat.representantNom} onChange={(e) => majMandat({ representantNom: e.target.value })} />
                </Champ>
                <Champ label="Représentant : prénom">
                  <input value={d.mandat.representantPrenom} onChange={(e) => majMandat({ representantPrenom: e.target.value })} />
                </Champ>
                <Champ label="Représentant : né(e) le">
                  <input type="date" value={d.mandat.representantNaissance} onChange={(e) => majMandat({ representantNaissance: e.target.value })} />
                </Champ>
              </>
            )}
            <Champ label="Lieu de naissance">
              <input value={d.mandat.representantLieuNaissance} onChange={(e) => majMandat({ representantLieuNaissance: e.target.value })} placeholder="ex. Ville (département)" />
            </Champ>
            <Champ label="Code postal et ville du siège">
              <input value={d.mandat.mandantCodePostalVille} onChange={(e) => majMandat({ mandantCodePostalVille: e.target.value })} placeholder="repris de l’adresse du déclarant" />
            </Champ>
          </div>
          <div className="grid grid--3" style={{ alignItems: 'end', marginTop: '1rem' }}>
            <Champ label="Mandataire : nom de la personne en charge">
              <input value={d.mandat.mandataireNom} onChange={(e) => majMandat({ mandataireNom: e.target.value })} placeholder="par défaut : chef de projet" />
            </Champ>
            <Champ label="Mandataire : prénom">
              <input value={d.mandat.mandatairePrenom} onChange={(e) => majMandat({ mandatairePrenom: e.target.value })} />
            </Champ>
            <Champ label="Organisme">
              <input value={d.mandat.mandataireOrganisme} onChange={(e) => majMandat({ mandataireOrganisme: e.target.value })} />
            </Champ>
            <Champ label="SIRET du mandataire">
              <input value={d.mandat.mandataireSiret} onChange={(e) => majMandat({ mandataireSiret: e.target.value })} />
            </Champ>
            <Champ label="Adresse du siège social">
              <input value={d.mandat.mandataireAdresse} onChange={(e) => majMandat({ mandataireAdresse: e.target.value })} />
            </Champ>
            <Champ label="Code postal et ville">
              <input value={d.mandat.mandataireCodePostalVille} onChange={(e) => majMandat({ mandataireCodePostalVille: e.target.value })} />
            </Champ>
            <Champ label="Fait à">
              <input value={d.mandat.faitA} onChange={(e) => majMandat({ faitA: e.target.value })} />
            </Champ>
            <Champ label="Le">
              <input type="date" value={d.mandat.date} onChange={(e) => majMandat({ date: e.target.value })} />
            </Champ>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button type="button" className="btn" disabled={!!export_} onClick={() => void mandat(false)}>
              {export_ === 'mandat' ? 'Préparation…' : 'Télécharger le mandat pré-rempli (.docx)'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={!!export_} onClick={() => void mandat(true)}>
              {export_ === 'mandat-vierge' ? 'Préparation…' : 'Télécharger le modèle vierge'}
            </button>
          </div>
          <p className="iota-note" style={{ maxWidth: '48rem' }}>
            Le mandat ne s’enregistre que dans votre dossier : la date et le lieu de naissance du représentant ne quittent pas votre navigateur.
          </p>
        </div>
      </section>
    </>
  )
}

function ContexteResume({ d }: { d: Dossier }) {
  const c = d.contexte!
  const n2000 = c.zonages.filter(estNatura)
  const lignes: [string, string][] = [
    ['Bassin / SDAGE', c.bassin ? `${c.bassin.nom} — ${c.bassin.sdage}` : 'non lu'],
    ['SAGE', c.sages.length ? c.sages.map((x) => `${x.nom} (${x.etat})`).join(', ') : 'aucun'],
    ['Zone de répartition des eaux', c.zre.length ? c.zre.join(', ') : 'non'],
    ['Zone sensible / vulnérable', [c.zonesSensibles.length ? `sensible (${c.zonesSensibles.join(', ')})` : 'non sensible', c.zoneVulnerable === null ? 'vulnérabilité non lue' : c.zoneVulnerable ? 'vulnérable nitrates' : 'non vulnérable'].join(' ; ')],
    ['Cours d’eau le plus proche', c.reseau ? `${c.reseau.nom ?? 'sans toponyme'}, ${distance(c.reseau.distanceM)} ${cardinalPhraseFr(c.reseau.direction)}` : 'non lu'],
    ['Masses d’eau souterraines', c.massesEau.map((m) => m.nom).join(' ; ') || 'non lues'],
    [
      'Natura 2000 le plus proche',
      n2000[0] ? `${n2000[0].nom} (${n2000[0].code ?? '?'}) — ${n2000[0].inclus ? 'site inclus' : `${distance(n2000[0].distanceM)} ${n2000[0].direction ? cardinalPhraseFr(n2000[0].direction) : ''}`}` : 'aucun dans 10 km',
    ],
    ['Ouvrages BNPE (3 km)', String(c.prelevements.length)],
  ]
  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <table className="tableau" style={{ fontSize: '0.86rem' }}>
        <tbody>
          {lignes.map(([k, v]) => (
            <tr key={k}>
              <th scope="row" style={{ whiteSpace: 'nowrap' }}>
                {k}
              </th>
              <td style={{ whiteSpace: 'normal' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.lacunes.length > 0 && <p className="iota-note">Sans réponse (à compléter à la main ou à relire plus tard) : {c.lacunes.join(', ')}.</p>}
    </div>
  )
}

function CarteRubrique({ r, active, v, onBascule, onValeur }: { r: Rubrique; active: boolean; v: Valeurs; onBascule: () => void; onValeur: (k: string, v: string | boolean) => void }) {
  const cl = active ? r.classer(v) : null
  const flux = r.code === '2.2.3.0' && active ? fluxR1(v) : null
  return (
    <div className={`iota-rubrique${active ? ' iota-rubrique--active' : ''}`}>
      <label>
        <input type="checkbox" checked={active} onChange={onBascule} />
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{r.code}</strong>
        <span>{r.intitule}</span>
        {cl && (cl.regime ? <span className={BADGE_REGIME[cl.regime]} style={{ fontSize: '0.72rem' }}>{LIBELLE_REGIME[cl.regime]}</span> : <span className="badge badge--indeterminee" style={{ fontSize: '0.72rem' }}>À compléter</span>)}
      </label>
      {active && (
        <div style={{ marginTop: '0.6rem' }}>
          <p className="iota-note" style={{ marginTop: 0 }}>
            {r.texte}
          </p>
          <ul style={{ margin: '0.3rem 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
            {r.seuils.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {r.params.length > 0 && (
            <div className="grid grid--3" style={{ alignItems: 'end', marginTop: '0.5rem' }}>
              {r.params.map((p) =>
                p.type === 'nombre' ? (
                  <label key={p.id} className="champ">
                    {p.libelle}
                    {p.unite && ` (${p.unite})`}
                    <input inputMode="decimal" value={(v[p.id] as string) ?? ''} onChange={(e) => onValeur(p.id, e.target.value)} title={p.aide} />
                  </label>
                ) : p.type === 'case' ? (
                  <label key={p.id} style={{ fontSize: '0.88rem' }}>
                    <input type="checkbox" checked={!!v[p.id]} onChange={(e) => onValeur(p.id, e.target.checked)} /> {p.libelle}
                  </label>
                ) : (
                  <label key={p.id} className="champ">
                    {p.libelle}
                    <select value={(v[p.id] as string) ?? ''} onChange={(e) => onValeur(p.id, e.target.value)}>
                      <option value="">—</option>
                      {p.options.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.l}
                        </option>
                      ))}
                    </select>
                  </label>
                ),
              )}
            </div>
          )}
          {flux && (
            <details className="qualif" open style={{ marginTop: '0.75rem' }}>
              <summary>Flux comparés aux niveaux R1 (arrêté du 9 août 2006) : concentrations du rejet</summary>
              <div className="tableau-defile" style={{ marginTop: '0.5rem' }}>
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Paramètre</th>
                      <th>Concentration</th>
                      <th>Flux</th>
                      <th>R1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {R1.map((p) => {
                      const f = flux.flux.find((x) => x.p.id === p.id)
                      return (
                        <tr key={p.id}>
                          <th scope="row" style={{ fontWeight: 500 }} title={p.note}>
                            {p.nom}
                            {p.note ? ' *' : ''}
                          </th>
                          <td>
                            <input inputMode="decimal" value={(v[`c_${p.id}`] as string) ?? ''} onChange={(e) => onValeur(`c_${p.id}`, e.target.value)} style={{ width: '6rem' }} aria-label={`Concentration ${p.nom}`} />{' '}
                            {p.uniteConc}
                          </td>
                          <td>{f ? <span className={f.depasse ? 'badge badge--moderee' : undefined}>{f.flux.toLocaleString('fr-FR', { maximumSignificantDigits: 3 })} {p.uniteR1}</span> : '-'}</td>
                          <td>
                            {p.r1.toLocaleString('fr-FR')} {p.uniteR1}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {cl && <p style={{ margin: '0.5rem 0 0', fontSize: '0.88rem' }}>{cl.motif}</p>}
          {r.notes?.map((n) => (
            <p key={n} className="iota-note">
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ id, libelle, d, onChange }: { id: SectionId; libelle: string; d: Dossier; onChange: (v: string | undefined) => void }) {
  const propre = d.textes[id]
  const valeur = propre ?? PROPOSITIONS[id](d, d.contexte)
  const n = trous(valeur)
  return (
    <div className="iota-section">
      <div className="iota-section__entete">
        <strong style={{ fontSize: '0.9rem' }}>{libelle}</strong>
        <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {n > 0 && <span className="badge badge--moderee" style={{ fontSize: '0.7rem' }}>{n} à compléter</span>}
          {propre === undefined ? (
            <span className="badge badge--indeterminee" style={{ fontSize: '0.7rem' }}>
              Proposition
            </span>
          ) : (
            <button type="button" className="btn btn--petit btn--ghost" onClick={() => onChange(undefined)} title="Revenir à la proposition de l’outil (votre texte sera perdu)">
              Revenir à la proposition
            </button>
          )}
        </span>
      </div>
      <label className="champ" style={{ marginTop: '0.35rem' }}>
        <span className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>
          {libelle}
        </span>
        <textarea className={propre === undefined ? 'iota-proposition' : undefined} value={valeur} rows={Math.min(14, Math.max(4, Math.ceil(valeur.length / 110)))} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}
