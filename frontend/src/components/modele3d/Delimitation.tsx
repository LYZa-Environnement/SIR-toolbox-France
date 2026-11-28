import { useState } from 'react'
import { telechargerBlob } from '../../lib/fichiers'
import { jourIso } from '../../lib/format'
import { FAMILLES, LIBELLES_PHASE } from '../../lib/modele3d/comportement'
import { libelleCote, motifProposition, versDirection, type BilanCote, type Delimitation as Delim, type Proposition, type StatutCote } from '../../lib/modele3d/delimitation'
import { fr, frM } from '../../lib/modele3d/format'
import { lirePermeabilite, type CrepineConseillee, type ReglagesHydro } from '../../lib/modele3d/hydrogeologie'

interface Props {
  d: Delim
  nom: string
  unite: string
  /** Date shown (label of the campaign). */
  date: string
  /** Coordinates in Lambert 93 (else local). */
  georef: boolean
  nombre: number
  surNombre: (n: number) => void
  surProposition: (rang: number) => void
  hydro: ReglagesHydro
  /** Key of the compound (its half-life is kept by compound). */
  compose: string
  surHydro: (h: Partial<ReglagesHydro>) => void
}

type Onglet = 'delimitation' | 'geologie' | 'emplacements'

const STATUTS: Record<StatutCote, { libelle: string; classe: string }> = {
  delimite: { libelle: 'délimité', classe: 'm3d-statut--ok' },
  juste: { libelle: 'délimité de justesse', classe: 'm3d-statut--juste' },
  reserve: { libelle: 'délimité sous réserve', classe: 'm3d-statut--juste' },
  ouvert: { libelle: 'non délimité', classe: 'm3d-statut--ouvert' },
}

/** An estimate: two significant figures, no more is known. */
const deuxChiffres = (v: number) => fr(Number(v.toPrecision(2)))
/** A distance to the metre. */
const metres = (d: number) => `${fr(Math.round(d))} m`
const pourcent = (p: number | null) => (p === null ? '–' : `${Math.round(p * 100)} %`)
const surface = (a: number | null) => (a === null ? '–' : `${fr(Math.round(a))} m²`)
/** A small or large number in scientific notation: 5·10⁻⁴. */
function scientifique(v: number): string {
  const e = Math.floor(Math.log10(v))
  const m = Math.round((v / 10 ** e) * 10) / 10
  const exposants: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
  return `${m === 1 ? '' : `${fr(m)}·`}10${String(e)
    .split('')
    .map((c) => exposants[c] ?? c)
    .join('')}`
}
const vitesse = (v: number) => (v >= 1000 ? `${fr(Math.round(v / 10) * 10)} m/an` : v >= 10 ? `${fr(Math.round(v))} m/an` : `${fr(Number(v.toPrecision(2)))} m/an`)
/** A duration given in years, in days or months when short. */
function duree(ans: number): string {
  if (ans < 1 / 6) return `${fr(Math.max(1, Math.round(ans * 365.25)))} jours`
  if (ans < 1) return `${fr(Math.round(ans * 12))} mois`
  return `${fr(Number(ans.toPrecision(2)))} an${ans >= 2 ? 's' : ''}`
}

function verdict(d: Delim, nom: string, unite: string): string {
  const ref = `${fr(d.reference)} ${unite}`
  const sens = d.aval !== null
  const au = (c: BilanCote) => libelleCote(c.cote, c.azimut, sens)
  if (d.verdict === 'aucun-depassement') return `Aucun ouvrage ne dépasse la valeur de comparaison de ${nom} (${ref}) à cette date : pas de panache à délimiter.`
  if (d.verdict === 'delimite') return `Panache de ${nom} délimité dans les quatre directions par des ouvrages sous la valeur de comparaison (${ref}).`
  const ouverts = d.cotes.filter((c) => c.statut === 'ouvert')
  if (d.verdict === 'non-delimite')
    return `Panache de ${nom} non délimité ${ouverts.map((c) => `${au(c)} au-delà de ${c.front.join(', ')}`).join(' ; ')} : aucun ouvrage sous la valeur de comparaison (${ref}) dans l’aquifère de ce côté.`
  const justes = d.cotes.filter((c) => c.statut === 'juste')
  const reserves = d.cotes.filter((c) => c.statut === 'reserve')
  const motifs = [
    ...(justes.length ? [`${justes.map(au).join(', ')}, l’ouvrage qui le ferme est entre la moitié de la valeur et la valeur (${ref})`] : []),
    ...(reserves.length ? [`${reserves.map(au).join(', ')}, la crépine de l’ouvrage qui le ferme ne convient pas au comportement du composé`] : []),
    ...(d.partBord > 0 ? [`le champ interpolé dépasse la valeur sur ${pourcent(d.partBord)} du pourtour des ouvrages`] : []),
  ]
  return `Panache de ${nom} délimité, à confirmer${motifs.length ? ` : ${motifs.join(' ; ')}` : ''}.`
}

function exporter(d: Delim, nom: string, unite: string, georef: boolean) {
  const n = (x: number | null, chiffres = 2) => (x === null || !Number.isFinite(x) ? '' : String(Number(x.toFixed(chiffres))).replace('.', ','))
  const lignes = [
    [
      'Emplacement',
      `X${georef ? ' (Lambert 93)' : ''}`,
      `Y${georef ? ' (Lambert 93)' : ''}`,
      'Motif',
      'Ouvrage le plus proche',
      'Distance (m)',
      'Probabilité de dépassement',
      `${nom} estimé (${unite})`,
      'Facteur d’incertitude (×/÷)',
      'Profondeur de l’eau estimée (m)',
      'Crépine conseillée, haut (m)',
      'Crépine conseillée, bas (m)',
      'Pourquoi cette crépine',
      'Sur le site',
    ],
    ...d.propositions.map((p) => [
      `N${p.rang}`,
      n(p.xa ?? p.x, 1),
      n(p.ya ?? p.y, 1),
      motifProposition(p, d),
      p.pres.nom,
      n(p.pres.distance, 0),
      p.probabilite === null ? '' : n(p.probabilite, 2),
      p.concentration === null ? '' : n(Number(p.concentration.toPrecision(2)), 6),
      n(p.facteur, 1),
      n(p.profondeurEau, 1),
      n(p.crepine?.de ?? null, 1),
      n(p.crepine?.a ?? null, 1),
      p.crepine?.raison ?? '',
      p.surSite === null ? '' : p.surSite ? 'oui' : 'non',
    ]),
  ]
  const csv = lignes.map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n')
  telechargerBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), `Emplacements proposes ${nom} ${jourIso()}.csv`)
}

/** A number setting typed in the French way. */
function Champ(p: { libelle: string; valeur: number; min: number; max: number; pas: number; surValeur: (v: number) => void; aide?: string }) {
  return (
    <label className="champ" title={p.aide}>
      <span>{p.libelle}</span>
      <input
        type="number"
        min={p.min}
        max={p.max}
        step={p.pas}
        value={p.valeur}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v >= p.min && v <= p.max) p.surValeur(v)
        }}
      />
    </label>
  )
}

/** Why a well is proposed there, as a short pill; the full sentence on hover. */
function Motif({ p, d, sens }: { p: Proposition; d: Delim; sens: boolean }) {
  const m = p.motif
  const phrase = motifProposition(p, d)
  if (m.type === 'incertitude')
    return (
      <span className="m3d-motif m3d-motif--doute" title={phrase}>
        Limite incertaine
      </span>
    )
  const c = d.cotes.find((x) => x.cote === m.cote)
  const vers = c ? libelleCote(c.cote, c.azimut, sens).replace(/ \(.*\)$/, '') : ''
  const ou = m.limite === 'transport' ? 'fin par le transport' : m.limite === 'estimee' ? 'fin estimée' : 'bout du modèle'
  return (
    <span title={phrase}>
      <span className="m3d-motif m3d-motif--fermer">Fermer {vers}</span>{' '}
      <span className="st-note">
        après {m.front}, {metres(m.distance)} · {ou}
        {m.transport !== undefined ? ` · transport : ${m.transport >= 1000 ? `${fr(Math.round(m.transport / 100) / 10)} km` : metres(m.transport)}` : ''}
      </span>
    </span>
  )
}

/** The advised screen as a depth bar: ground on the left, the screen, the water, the aquifer's base. */
function BarreCrepine({ c }: { c: CrepineConseillee }) {
  const L = 132
  const H = 26
  const fond = Math.max(c.a, c.mur ?? 0, c.eauBasse) + 1
  const X = (prof: number) => 4 + (Math.min(prof, fond) / fond) * (L - 8)
  return (
    <figure className="m3d-barre-crepine" title={c.raison}>
      <svg viewBox={`0 0 ${L} ${H}`} width={L} height={H} role="img" aria-label={`Crépine de ${fr(c.de)} à ${fr(c.a)} m ; eau à ${fr(c.eau)} m${c.mur !== null ? ` ; mur de l’aquifère à ${fr(c.mur)} m` : ''}`}>
        <rect x={4} y={9} width={L - 8} height={8} rx={2} className="m3d-barre-crepine__terrain" />
        {c.toit !== null && <rect x={X(c.toit)} y={9} width={Math.max(1, X(c.mur ?? fond) - X(c.toit))} height={8} className="m3d-barre-crepine__aquifere" />}
        <rect x={X(c.de)} y={6} width={Math.max(2, X(c.a) - X(c.de))} height={14} rx={1.5} className="m3d-barre-crepine__crepine" />
        <line x1={X(c.eau)} x2={X(c.eau)} y1={2} y2={24} className="m3d-barre-crepine__eau" />
        {c.mur !== null && <line x1={X(c.mur)} x2={X(c.mur)} y1={4} y2={22} className="m3d-barre-crepine__mur" />}
      </svg>
      <figcaption>
        {fr(c.de)} à {fr(c.a)} m
      </figcaption>
    </figure>
  )
}

/** The compound's behaviour, the aquifer, the transport and the attenuation read in the data. */
function Geologie(p: Props) {
  const { d, hydro } = p
  const c = d.comportement
  const s = c.substance
  const f = FAMILLES[c.famille]
  const aq = d.aquifere
  const t = d.transport
  const k = lirePermeabilite(hydro.K)
  const demiVie = hydro.demiVies[p.compose]
  const at = d.attenuation
  const utiliser = (v: number) => p.surHydro({ demiVies: { ...hydro.demiVies, [p.compose]: Number(v.toPrecision(2)) } })
  return (
    <div className="m3d-geologie">
      <dl className="m3d-geologie__dl">
        <dt>Composé</dt>
        <dd>
          {s ? <strong>{s.nom}</strong> : <strong>{p.nom}</strong>} · {f.libelle} · {LIBELLES_PHASE[c.phase]}.
          {s && (
            <>
              {' '}
              {s.densite !== null ? `Masse volumique ${fr(s.densite)} g/cm³` : ''}
              {s.solubilite ? ` · solubilité ${s.solubilite[0] === s.solubilite[1] ? fr(s.solubilite[0]) : `${fr(s.solubilite[0])} à ${fr(s.solubilite[1])}`} mg/l` : ''}
              {s.logKow ? ` · log Kow ${s.logKow[0] === s.logKow[1] ? fr(s.logKow[0]) : `${fr(s.logKow[0])} à ${fr(s.logKow[1])}`}` : ''}
              {s.henry ? ` · constante de Henry ${fr(s.henry.valeur)}${s.henry.unite === '-' ? '' : ` ${s.henry.unite}`}` : ''}.
            </>
          )}{' '}
          {f.logKoc ? `log Koc de la famille ${fr(f.logKoc[0])} à ${fr(f.logKoc[1])} L/kg.` : ''} {f.stabilite ? `${f.stabilite.charAt(0).toUpperCase()}${f.stabilite.slice(1)}.` : ''}
          {s?.douteux?.map((x) => (
            <span key={x.champ} className="m3d-geologie__douteux">
              {' '}
              ⚠ {x.champ === 'densite' ? 'Masse volumique' : 'Solubilité'} du guide douteuse ; autre référence : {x.autre} ({x.source}). Le calcul garde la valeur du guide.
            </span>
          ))}
          {c.sources.length > 0 && <span className="st-note"> Sources : {c.sources.join(' ; ')}.</span>}
        </dd>
        {d.phasePure.length > 0 && (
          <>
            <dt>Phase pure</dt>
            <dd className="m3d-geologie__alerte">
              {d.phasePure.map((x) => `${x.nom} à ${fr(Number((x.part * 100).toPrecision(2)))} % de la solubilité`).join(', ')} : une phase organique est probable à proximité (1 à 10 % de la
              solubilité, BRGM/RP-74064-FR, § 10.6.5). Prévoir des ouvrages en PEHD ou en acier plutôt qu’en PVC, et des investigations à plusieurs niveaux (§ 4.3).
            </dd>
          </>
        )}
        <dt>Aquifère</dt>
        <dd>
          {aq ? (
            <>
              <strong>{aq.unites.map((u) => u.nom).join(' et ')}</strong>
              {aq.origine === 'crepines' ? `, où sont crépinés ${aq.dansAquifere} des ${aq.crepines} ouvrages analysés à crépine connue` : ', où l’eau a été rencontrée en forant (pas de crépine connue)'}
              {aq.mur ? ` ; mur : ${aq.mur.nom}` : ''}.{' '}
              {d.horsAquifere > 0 ? `Panache limité à l’aquifère : ${d.horsAquifere} nœud(s) de la zone interpolée écartés (formation absente).` : ''}
            </>
          ) : (
            'Non déterminé : ni crépine ni niveau d’eau de foration dans les logs. Les contrôles géologiques ne sont pas faits.'
          )}
        </dd>
        <dt>Transport</dt>
        <dd>
          {t.permeabilite?.origine === 'lithologie' && t.permeabilite.plage && (
            <>
              Perméabilité non mesurée : de {scientifique(t.permeabilite.plage[0])} à {scientifique(t.permeabilite.plage[1])} m/s pour ces terrains ({t.permeabilite.detail} ; Freeze et
              Cherry, 1979), trop large pour une vitesse. Saisissez la perméabilité d’un essai.{' '}
            </>
          )}
          {t.vitesseEau !== null ? (
            <>
              Eau : <strong>{vitesse(t.vitesseEau)}</strong> (u = K·i / ωc, K {scientifique(t.permeabilite!.valeur)} m/s, gradient {fr(Number(((t.gradient ?? 0) * 1000).toFixed(2)))} ‰)
              {t.retard && t.vitessePolluant ? (
                <>
                  {' '}
                  · polluant : <strong>{vitesse(t.vitessePolluant[1])}</strong> à <strong>{vitesse(t.vitessePolluant[0])}</strong> (facteur de retard {fr(Number(t.retard[0].toFixed(2)))} à{' '}
                  {fr(Number(t.retard[1].toFixed(2)))}, R = 1 + ρd·Koc·foc / ω)
                </>
              ) : (
                ' · polluant : au plus la vitesse de l’eau (pas de Koc pour cette famille : rétention réglée par le pH, le redox, la sorption)'
              )}
              . Dispersivité longitudinale de l’ordre du dixième de la distance parcourue, transversale du dixième de la longitudinale (BRGM, 2008).
            </>
          ) : t.gradient === null ? (
            'Gradient inconnu à cette date : pas de vitesse.'
          ) : null}
        </dd>
        <dt>Atténuation</dt>
        <dd>
          {at ? (
            <>
              De {at.ouvrages.map((o) => o.nom).join(' à ')} dans le sens de l’écoulement : <strong>÷ 10 tous les {metres(at.decade)}</strong>
              {at.prolongement ? ` ; prolongée, la pente atteint la valeur de comparaison à ${metres(at.prolongement.distance)} au-delà de ${at.prolongement.depuis}` : ''}.{' '}
              {at.demiVie ? (
                <>
                  Avec la vitesse du polluant, atténuation globale (Newell et al., 2002) : demi-vie apparente de <strong>{duree(at.demiVie[0])}</strong> à {duree(at.demiVie[1])}.{' '}
                  <button type="button" className="btn btn--ghost btn--petit" onClick={() => utiliser(at.demiVie![0])}>
                    Utiliser {duree(at.demiVie[0])}
                  </button>
                </>
              ) : (
                <span className="st-note">Une demi-vie se déduit de cette pente avec une perméabilité mesurée (vitesse du polluant).</span>
              )}
            </>
          ) : (
            <span className="st-note">Pas de décroissance lisible le long de l’écoulement (deux ouvrages quantifiés au moins dans l’axe, en aval de la source).</span>
          )}
          {d.declinSource && (
            <span className="st-note">
              {' '}
              Source ({d.declinSource.nom}, {d.declinSource.n} campagnes) :{' '}
              {d.declinSource.demiVie !== null ? `baisse de moitié en ${duree(d.declinSource.demiVie)}` : 'pas de baisse'} (pente de Sen) — durée de vie de la source, pas une
              dégradation dans le panache.
            </span>
          )}
        </dd>
        <dt>Interpolation</dt>
        <dd>
          {d.anisotropie ? `Étirée ×${fr(Number(d.anisotropie.toFixed(1)))} dans le sens de l’écoulement (αT = αL / 10, Documents du BRGM 300, annexe 4)` : 'Isotrope'}
          {hydro.limiterAquifere ? ', limitée à l’aquifère.' : '.'}
        </dd>
      </dl>
      <div className="m3d-geologie__hypotheses">
        <label className="champ" title="Perméabilité d’un essai (pompage, slug test) : 5e-4, 5.10-4 ou 0,0005">
          <span>Perméabilité K (m/s)</span>
          <input type="text" inputMode="decimal" placeholder="essai : 5.10-4" value={hydro.K} onChange={(e) => p.surHydro({ K: e.target.value })} aria-invalid={!!hydro.K.trim() && k === null} />
        </label>
        <Champ libelle="Porosité cinématique ωc" valeur={hydro.porositeCinematique} min={0.005} max={0.5} pas={0.01} surValeur={(v) => p.surHydro({ porositeCinematique: v })} aide="BRGM : 1 à 10 %" />
        <Champ libelle="Porosité totale ω" valeur={hydro.porositeTotale} min={0.05} max={0.6} pas={0.01} surValeur={(v) => p.surHydro({ porositeTotale: v })} aide="BRGM : 25 à 35 %" />
        <Champ libelle="Masse volumique sèche ρd (kg/l)" valeur={hydro.masseVolumique} min={1} max={2.6} pas={0.05} surValeur={(v) => p.surHydro({ masseVolumique: v })} />
        <Champ libelle="Carbone organique foc" valeur={hydro.foc} min={0} max={0.1} pas={0.0005} surValeur={(v) => p.surHydro({ foc: v })} aide="À mesurer (COT des terrains de l’aquifère)" />
        <label className="champ" title="Demi-vie de dégradation dans l’aquifère, si elle est connue (atténuation ci-dessus, littérature) ; vide : pas de dégradation">
          <span>Demi-vie de {p.nom} (ans)</span>
          <input
            type="number"
            min={0.001}
            max={1000}
            step="any"
            value={demiVie ?? ''}
            placeholder="inconnue"
            onChange={(e) => {
              const v = Number(e.target.value)
              const demiVies = { ...hydro.demiVies }
              if (e.target.value === '' || !(v > 0)) delete demiVies[p.compose]
              else demiVies[p.compose] = v
              p.surHydro({ demiVies })
            }}
          />
        </label>
      </div>
      <div className="st-boutons">
        <label className="st-coche">
          <input type="checkbox" checked={hydro.anisotropie} onChange={(e) => p.surHydro({ anisotropie: e.target.checked })} /> Panache étiré dans le sens de l’écoulement
        </label>
        <label className="st-coche">
          <input type="checkbox" checked={hydro.limiterAquifere} onChange={(e) => p.surHydro({ limiterAquifere: e.target.checked })} /> Limiter le panache à l’aquifère
        </label>
      </div>
      {t.vitesseEau !== null && !demiVie && <p className="st-note">Sans demi-vie, le panache n’a pas de longueur stationnaire : les puits de fermeture restent placés d’après le modèle.</p>}
    </div>
  )
}

/** Is the plume delineated by the wells, on which sides, and where to put the next wells. */
export default function Delimitation(p: Props) {
  const d = p.d
  const sens = d.aval !== null
  const [onglet, setOnglet] = useState<Onglet>('delimitation')
  const ouverts = d.cotes.filter((c) => c.statut === 'ouvert')
  const reste = d.propositions.length ? d.propositions[d.propositions.length - 1].douteuxApres : null
  const onglets: [Onglet, string][] = [
    ['delimitation', 'Délimitation'],
    ['geologie', 'Géologie et comportement'],
    ['emplacements', `Emplacements (${d.propositions.length})`],
  ]
  return (
    <div className="m3d-delimitation">
      <p className={`m3d-verdict m3d-verdict--${d.verdict}`}>
        <strong>{p.date}</strong> · {verdict(d, p.nom, p.unite)}
      </p>

      <div className="m3d-chiffres" aria-label="En bref">
        <div className={`m3d-chiffre${ouverts.length ? ' m3d-chiffre--alerte' : ''}`}>
          <span className="m3d-chiffre__valeur">{d.depassants.length ? `${ouverts.length} / 4` : '–'}</span>
          <span className="m3d-chiffre__libelle">{ouverts.length ? `côtés non délimités : ${ouverts.map((c) => libelleCote(c.cote, c.azimut, sens).replace(/ \(.*\)$/, '')).join(', ')}` : 'côté non délimité'}</span>
        </div>
        <div className="m3d-chiffre">
          <span className="m3d-chiffre__valeur">{surface(d.aire50)}</span>
          <span className="m3d-chiffre__libelle">dépassement probable (≥ 50 %)</span>
        </div>
        <div className="m3d-chiffre">
          <span className="m3d-chiffre__valeur">{surface(d.douteux)}</span>
          <span className="m3d-chiffre__libelle">au classement douteux{reste !== null ? `, ${surface(reste)} après les ${d.propositions.length} emplacements` : ''}</span>
        </div>
        {d.phasePure.length > 0 && (
          <div className="m3d-chiffre m3d-chiffre--alerte">
            <span className="m3d-chiffre__valeur">{d.phasePure.map((x) => x.nom).join(', ')}</span>
            <span className="m3d-chiffre__libelle">phase pure probable à proximité</span>
          </div>
        )}
      </div>

      <div className="m3d-onglets m3d-onglets--panneau" role="tablist" aria-label="Délimitation du panache">
        {onglets.map(([o, l]) => (
          <button key={o} type="button" role="tab" aria-selected={onglet === o} className={`m3d-onglet${onglet === o ? ' m3d-onglet--actif' : ''}`} onClick={() => setOnglet(o)}>
            {l}
          </button>
        ))}
      </div>

      {onglet === 'delimitation' && (
        <div role="tabpanel" className="m3d-delimitation__onglet">
          {d.depassants.length > 0 && (
            <>
              <p>
                Au-dessus de la valeur de comparaison : {d.depassants.map((w) => `${w.nom} (× ${fr(w.rapport, 2)})`).join(', ')} · {d.ouvrages} ouvrage{d.ouvrages > 1 ? 's' : ''} analysé
                {d.ouvrages > 1 ? 's' : ''} à cette date.
              </p>
              <div className="tableau-defile">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Direction</th>
                      <th>Panache</th>
                      <th>Ouvrages au front</th>
                      <th>Ouvrage qui le ferme (le plus proche)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.cotes.map((c) => (
                      <tr key={c.cote}>
                        <th scope="row">{libelleCote(c.cote, c.azimut, sens)}</th>
                        <td>
                          <span className={`m3d-statut ${STATUTS[c.statut].classe}`}>{STATUTS[c.statut].libelle}</span>
                        </td>
                        <td>{c.front.join(', ') || '–'}</td>
                        <td style={{ whiteSpace: 'normal', minWidth: '16rem' }}>
                          {c.temoins.length
                            ? c.temoins
                                .slice(0, 3)
                                .map((t) => `${t.nom} (${t.resultat.brut} ${p.unite}, à ${metres(t.distance)})`)
                                .join(' ; ')
                            : '–'}
                          {c.temoins.some((t) => t.reserve) && <span className="st-note"> Sous réserve : {c.temoins.find((t) => t.reserve)!.reserve}.</span>}
                          {c.ecartes.length > 0 && <span className="st-note"> Écarté{c.ecartes.length > 1 ? 's' : ''} : {c.ecartes.map((x) => `${x.nom}, ${x.motif}`).join(' ; ')}.</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <ul className="m3d-delimitation__chiffres">
            {d.bord.length > 0 && (
              <li>
                Pourtour des ouvrages franchi par le panache interpolé : <strong>{pourcent(d.partBord)}</strong> (trait rouge au sol dans la vue)
              </li>
            )}
            {d.aire90 !== null && <li>Dépassement quasi certain (≥ 90 %) sur {surface(d.aire90)}.</li>}
          </ul>
          {d.avertissements.length > 0 && (
            <ul className="st-note">
              {d.avertissements.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {onglet === 'geologie' && (
        <div role="tabpanel" className="m3d-delimitation__onglet">
          <Geologie {...p} />
        </div>
      )}

      {onglet === 'emplacements' && (
        <div role="tabpanel" className="m3d-delimitation__onglet">
          <div className="st-boutons m3d-delimitation__actions">
            <label className="champ m3d-delimitation__nombre">
              <span>Nombre</span>
              <select value={p.nombre} onChange={(e) => p.surNombre(Number(e.target.value))}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn--ghost btn--petit" onClick={() => exporter(d, p.nom, p.unite, p.georef)} disabled={!d.propositions.length}>
              Exporter (CSV)
            </button>
          </div>
          {d.propositions.length ? (
            <div className="tableau-defile">
              <table className="tableau m3d-tableau-emplacements">
                <thead>
                  <tr>
                    <th>Emplacement</th>
                    <th>Pourquoi</th>
                    <th>{p.georef ? 'X · Y (Lambert 93)' : 'X · Y (local)'}</th>
                    <th>Position</th>
                    <th>Dépassement</th>
                    <th>{`${p.nom} (${p.unite})`}</th>
                    <th>Crépine conseillée</th>
                    <th>Site</th>
                  </tr>
                </thead>
                <tbody>
                  {d.propositions.map((x) => (
                    <tr key={x.rang}>
                      <th scope="row">
                        <button type="button" className="m3d-lien" onClick={() => p.surProposition(x.rang)}>
                          N{x.rang}
                        </button>
                      </th>
                      <td style={{ whiteSpace: 'normal', minWidth: '13rem' }}>
                        <Motif p={x} d={d} sens={sens} />
                      </td>
                      <td className="m3d-num">
                        {fr(Math.round(x.xa ?? x.x))} · {fr(Math.round(x.ya ?? x.y))}
                      </td>
                      <td>
                        {metres(x.pres.distance)} {versDirection(x.pres.azimut).replace(/^l’/, 'à l’').replace(/^le /, 'au ')} de {x.pres.nom}
                      </td>
                      <td>{x.probabilite === null ? (x.concentration === null ? 'hors zone' : '–') : pourcent(x.probabilite)}</td>
                      <td>{x.concentration === null ? '–' : `≈ ${deuxChiffres(x.concentration)}${x.facteur !== null ? ` ×/÷ ${fr(Number(x.facteur.toFixed(1)))}` : ''}`}</td>
                      <td>{x.crepine ? <BarreCrepine c={x.crepine} /> : x.profondeurEau !== null ? `eau à ≈ ${frM(x.profondeurEau)}` : '–'}</td>
                      <td>{x.surSite === null ? '–' : x.surSite ? 'oui' : 'non'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="st-note">
              {p.nombre === 0
                ? 'Aucun emplacement demandé.'
                : d.verdict === 'aucun-depassement' && !d.douteux
                  ? 'Rien à proposer : pas de dépassement à encadrer.'
                  : 'Rien à proposer : la limite du panache est déjà encadrée par les ouvrages, ou le krigeage n’est pas disponible.'}
            </p>
          )}
          {d.propositions.some((x) => x.crepine) && (
            <p className="st-note m3d-barre-crepine__legende">
              <span className="m3d-trait m3d-barre-crepine__crepine" aria-hidden="true" /> crépine <span className="m3d-trait m3d-barre-crepine__aquifere" aria-hidden="true" /> aquifère{' '}
              <span className="m3d-trait m3d-barre-crepine__eau" aria-hidden="true" /> eau à la date <span className="m3d-trait m3d-barre-crepine__mur" aria-hidden="true" /> mur · profondeur
              depuis le sol, de gauche à droite ; survol : la raison de la crépine.
            </p>
          )}
        </div>
      )}

      <details className="m3d-delimitation__methode">
        <summary>Méthode</summary>
        <p className="st-note">
          Fermeture : autour de chaque ouvrage au-dessus de la valeur, quatre quadrants de 90° orientés sur l’écoulement ; un côté est fermé par un ouvrage sous la valeur dans ce
          quadrant (de justesse entre la moitié de la valeur et la valeur), crépiné dans l’aquifère ; sous réserve quand sa crépine ne descend pas au mur de l’aquifère pour un composé
          plus dense que l’eau, ou reste sous la nappe pour un composé plus léger (BRGM/RP-74064-FR, chapitres 4 et 6). Un résultat non quantifié avec une LQ au-dessus de la valeur
          ne ferme rien. Probabilité de dépassement : krigeage du logarithme des concentrations, étiré dans le sens de l’écoulement, erreur supposée gaussienne (Goovaerts, 1997) ;
          l’incertitude de la tendance n’est pas comptée. Emplacements : d’abord au-delà du front de chaque côté ouvert, puis là où le classement au-dessus ou au-dessous de la
          valeur est le plus douteux, l’incertitude recalculée avec chaque ouvrage ajouté ; crépine selon la densité du composé, la nappe et le mur de l’aquifère. Atténuation :
          pente de ln C en fonction de la distance le long de l’écoulement depuis la source, atténuation globale k = v·pente (Newell et al., EPA/540/S-02/500, 2002). Emplacements
          indicatifs : accès, propriété du terrain, réseaux enterrés (DT-DICT) à vérifier.
        </p>
      </details>
    </div>
  )
}
