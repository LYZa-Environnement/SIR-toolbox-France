/**
 * The conceptual model of the site (« schéma conceptuel »), as the
 * national methodology for polluted sites asks for it (MTES, « Méthodologie
 * nationale de gestion des sites et sols pollués », avril 2017, § 2.3 and
 * annexe « schéma conceptuel »): the sources of pollution, the transfer
 * pathways and the exposure media, the targets — with the evidence each
 * rests on. Proposed from the data of the model; the engineer keeps,
 * removes or completes each item, the tool does not decide.
 *
 * Pure: the targets around the site are fetched beforehand (cibles.ts).
 */

import type { Donnees } from './assemblage.ts'
import type { Cibles } from './cibles.ts'
import { predicatEmprise, type Modele, type Nappe } from './modele.ts'

export type Colonne = 'source' | 'transfert' | 'cible'

export interface Element {
  id: string
  colonne: Colonne
  titre: string
  preuves: string[]
  /** Proposed as retained (the user may change it). */
  retenu: boolean
}

export interface Lien {
  de: string
  vers: string
}

export interface Schema {
  elements: Element[]
  liens: Lien[]
}

const VOLATILS = /chlor|[ée]thyl[èe]ne|[ée]thane|benz[èe]ne|tolu[èe]ne|xyl[èe]ne|naphtal|btex|cohv|c5|c6|c8|c10-c12|chloroforme|m[ée]thane/i
const fr = (x: number) => String(Number(x.toPrecision(3))).replace('.', ',')
const ROSE = ['le nord', 'le nord-est', 'l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest']
const direction = (az: number) => ROSE[Math.round(az / 45) % 8]

/** Position of a target against the flow: within 60° of downstream, of upstream, or aside. */
export function positionHydraulique(azimutEcoulement: number, dx: number, dy: number): 'aval' | 'amont' | 'lateral' {
  const az = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  const ecart = Math.abs(((az - azimutEcoulement + 540) % 360) - 180)
  return ecart <= 60 ? 'aval' : ecart >= 120 ? 'amont' : 'lateral'
}

export interface EntreesSchema {
  modele: Modele
  donnees: Donnees
  /** Soil guide value by soil parameter key. */
  guideSol: (cle: string) => number | null
  /** Groundwater comparison value by compound key. */
  referenceEau: (cle: string) => number | null
  /** Soil gas reference (indoor air, R1) by parameter key. */
  referenceGaz: (cle: string) => number | null
  /** Water table of the latest campaign (or of the drilling). */
  nappe: Nappe | null
  cibles: Cibles | null
}

export function schemaConceptuel(e: EntreesSchema): Schema {
  const { modele: m, donnees: d } = e
  const elements: Element[] = []
  const ajouter = (x: Element) => elements.push(x)

  // ---- Sources ----------------------------------------------------------------------------------
  let solsSurface = false
  let solsProfonds = 0
  let volatilsSols = false
  for (const p of d.parametresSol) {
    if (p.eluat) continue
    const g = e.guideSol(p.cle)
    const ech = m.points.flatMap((pt) => (pt.forage?.echantillons ?? []).flatMap((s) => (s.resultats[p.cle] && !s.resultats[p.cle].inferieur && s.resultats[p.cle].valeur !== null ? [{ pt, s, v: s.resultats[p.cle].valeur! }] : [])))
    if (!ech.length) continue
    const volatil = VOLATILS.test(p.nom) || VOLATILS.test(p.famille)
    const depasse = g !== null ? ech.filter((x) => x.v > g) : volatil ? ech : []
    if (!depasse.length) continue
    const max = depasse.reduce((a, b) => (b.v > a.v ? b : a))
    if (depasse.some((x) => x.s.de < 1)) solsSurface = true
    solsProfonds = Math.max(solsProfonds, ...depasse.map((x) => x.s.a))
    if (volatil) volatilsSols = true
    ajouter({
      id: `sol:${p.cle}`,
      colonne: 'source',
      titre: `Sols : ${p.nom}`,
      preuves: [
        g !== null
          ? `${depasse.length} échantillon${depasse.length > 1 ? 's' : ''} au-dessus de la valeur guide (${fr(g)} ${p.unite})`
          : `${depasse.length} échantillon${depasse.length > 1 ? 's' : ''} quantifié${depasse.length > 1 ? 's' : ''}, sans valeur guide`,
        `jusqu’à ${fr(max.v)} ${p.unite} (${max.s.id}, ${String(max.s.de).replace('.', ',')}–${String(max.s.a).replace('.', ',')} m)`,
      ],
      retenu: true,
    })
  }
  const odeurs = m.points.flatMap((pt) => (pt.forage?.observations ?? []).filter((o) => /odeur|irisation|coloration|hydrocarbure|solvant|noir/i.test(o.organoleptique + o.remarque)).map((o) => `${pt.nom} ${String(o.de).replace('.', ',')}–${String(o.a).replace('.', ',')} m : ${o.organoleptique || o.remarque}`))
  if (odeurs.length) ajouter({ id: 'organoleptique', colonne: 'source', titre: 'Indices organoleptiques', preuves: odeurs.slice(0, 4), retenu: true })

  const base = d.base
  let eauxImpactees = false
  let volatilsEaux = false
  if (base?.campagnes.length) {
    const derniere = base.campagnes[base.campagnes.length - 1]
    for (const c of base.composes) {
      if (c.terrain || c.calcule) continue
      const ref = e.referenceEau(c.cle)
      if (ref === null) continue
      const rs = base.resultats.filter((r) => r.compose === c.cle && r.campagne === derniere.id && !r.inferieur && !r.exclu && r.valeur > ref)
      if (!rs.length) continue
      eauxImpactees = true
      if (VOLATILS.test(c.nom) || VOLATILS.test(c.famille)) volatilsEaux = true
      const max = rs.reduce((a, b) => (b.valeur > a.valeur ? b : a))
      const nomMax = m.points.find((p) => p.cle === max.ouvrage)?.nom ?? max.ouvrage
      ajouter({
        id: `eau:${c.cle}`,
        colonne: 'source',
        titre: `Eaux souterraines : ${c.nom}`,
        preuves: [`${rs.length} ouvrage${rs.length > 1 ? 's' : ''} au-dessus de la valeur de comparaison (${fr(ref)} ${c.unite}) le ${derniere.date.split('-').reverse().join('/')}`, `jusqu’à ${fr(max.valeur)} ${c.unite} (${nomMax})`],
        retenu: true,
      })
    }
  }

  let gazImpactes = false
  for (const p of d.parametresGaz) {
    const ref = e.referenceGaz(p.cle)
    const rs = d.gaz.flatMap((g) => (g.resultats[p.cle] && !g.resultats[p.cle].inferieur && g.resultats[p.cle].valeur !== null ? [{ g, v: g.resultats[p.cle].valeur! }] : []))
    const au = ref !== null ? rs.filter((r) => r.v > ref) : rs
    if (!au.length) continue
    gazImpactes = true
    const max = au.reduce((a, b) => (b.v > a.v ? b : a))
    ajouter({
      id: `gaz:${p.cle}`,
      colonne: 'source',
      titre: `Gaz du sol : ${p.nom}`,
      preuves: [ref !== null ? `${au.length} point${au.length > 1 ? 's' : ''} au-dessus de la valeur repère air intérieur (${fr(ref)} ${p.unite}), à titre de repère` : `${au.length} point${au.length > 1 ? 's' : ''} quantifié${au.length > 1 ? 's' : ''}`, `jusqu’à ${fr(max.v)} ${p.unite} (${max.g.nom})`],
      retenu: true,
    })
  }

  // ---- Transfer pathways ----------------------------------------------------------------------
  const ecoulement = e.nappe?.ecoulement ?? null
  const profEau = e.nappe?.charges.length ? e.nappe.charges.map((c) => c.profondeur ?? 0).sort((a, b) => a - b)[Math.floor(e.nappe.charges.length / 2)] : null
  if (solsSurface)
    ajouter({ id: 'contact', colonne: 'transfert', titre: 'Contact direct, ingestion de sol, envol de poussières', preuves: ['dépassements dans les sols à moins de 1 m de profondeur'], retenu: true })
  if (volatilsSols || volatilsEaux || gazImpactes)
    ajouter({
      id: 'volatilisation',
      colonne: 'transfert',
      titre: 'Volatilisation et transfert vers l’air intérieur et extérieur',
      preuves: [[volatilsSols && 'composés volatils dans les sols', volatilsEaux && 'dans les eaux souterraines', gazImpactes && 'dans les gaz du sol'].filter(Boolean).join(', ')],
      retenu: true,
    })
  if (elements.some((x) => x.id.startsWith('sol:')) && (e.nappe?.charges.length || eauxImpactees))
    ajouter({
      id: 'lixiviation',
      colonne: 'transfert',
      titre: 'Lixiviation des sols et migration vers la nappe',
      preuves: [profEau !== null ? `nappe à ${fr(profEau)} m de profondeur environ ; sols impactés jusqu’à ${fr(solsProfonds)} m` : `sols impactés jusqu’à ${fr(solsProfonds)} m`],
      retenu: true,
    })
  if (eauxImpactees)
    ajouter({
      id: 'migration',
      colonne: 'transfert',
      titre: ecoulement ? `Migration dans la nappe vers ${direction(ecoulement.azimut)}` : 'Migration dans la nappe',
      preuves: ecoulement ? [`écoulement vers ${direction(ecoulement.azimut)} (${Math.round(ecoulement.azimut)}°), gradient ${fr(ecoulement.gradient * 1000)} ‰`] : ['sens d’écoulement à établir (3 ouvrages nivelés au moins)'],
      retenu: true,
    })

  // ---- Targets ----------------------------------------------------------------------------------
  ajouter({ id: 'usagers', colonne: 'cible', titre: 'Usagers du site (travailleurs, futurs occupants)', preuves: ['usage actuel et futur du site à préciser'], retenu: true })
  const c = e.cibles
  const centre = m.points.filter((p) => p.place)
  const cx = centre.reduce((a, p) => a + p.x, 0) / Math.max(1, centre.length)
  const cy = centre.reduce((a, p) => a + p.y, 0) / Math.max(1, centre.length)
  if (c) {
    const dansSite = predicatEmprise({ ...m, etendre: false })
    const surSite = c.batiments.filter((b) => b.anneau.some(([x, y]) => dansSite(x, y)))
    if (surSite.length)
      ajouter({
        id: 'batiments-site',
        colonne: 'cible',
        titre: 'Occupants des bâtiments du site',
        preuves: [`${surSite.length} bâtiment${surSite.length > 1 ? 's' : ''} sur les parcelles (BD TOPO) : ${[...new Set(surSite.map((b) => b.usage))].slice(0, 3).join(' ; ')}`],
        retenu: true,
      })
    const voisins = c.batiments.filter((b) => !surSite.includes(b))
    if (voisins.length)
      ajouter({
        id: 'riverains',
        colonne: 'cible',
        titre: 'Riverains (bâtiments voisins)',
        preuves: [`${voisins.length} bâtiment${voisins.length > 1 ? 's' : ''} dans l’emprise du modèle hors site${ecoulement ? `, dont ${voisins.filter((b) => positionHydraulique(ecoulement.azimut, b.anneau[0][0] - cx, b.anneau[0][1] - cy) === 'aval').length} en aval` : ''}`],
        retenu: eauxImpactees || volatilsSols || gazImpactes,
      })
    if (ecoulement) {
      const aval = c.prelevements.filter((p) => positionHydraulique(ecoulement.azimut, p.x - cx, p.y - cy) === 'aval')
      if (aval.length) {
        const aep = aval.filter((p) => /potable|aep/i.test(p.usage))
        ajouter({
          id: 'captages',
          colonne: 'cible',
          titre: aep.length ? 'Captages d’eau potable en aval' : 'Prélèvements d’eau souterraine en aval',
          preuves: [...new Set(aval.map((p) => `${p.nom} (${p.usage}) à ${Math.round(p.distanceM)} m`))].slice(0, 3),
          retenu: eauxImpactees,
        })
      }
      const coursAval = c.coursDEau.filter((w) => w.lignes.some((l) => l.some(([x, y]) => Math.hypot(x - cx, y - cy) < 1000 && positionHydraulique(ecoulement.azimut, x - cx, y - cy) === 'aval')))
      if (coursAval.length)
        ajouter({
          id: 'cours-eau',
          colonne: 'cible',
          titre: 'Cours d’eau en aval (drainage de la nappe)',
          preuves: [
            `${[...new Set(coursAval.map((w) => w.nom).filter((n): n is string => !!n))].slice(0, 3).join(', ') || `${coursAval.length} tronçon${coursAval.length > 1 ? 's' : ''} sans nom`}, à moins de 1 km`,
          ],
          retenu: eauxImpactees,
        })
    }
  }
  if (eauxImpactees && !elements.some((x) => x.id === 'captages'))
    ajouter({ id: 'usages-nappe', colonne: 'cible', titre: 'Usages de la nappe en aval (puits privés, arrosage)', preuves: ['à rechercher (enquête de voisinage, BSS, BNPE)'], retenu: false })

  // ---- Links ------------------------------------------------------------------------------------
  const ids = new Set(elements.map((x) => x.id))
  const liens: Lien[] = []
  const lier = (de: string, vers: string) => ids.has(de) && ids.has(vers) && liens.push({ de, vers })
  for (const s of elements.filter((x) => x.colonne === 'source')) {
    if (s.id.startsWith('sol:') || s.id === 'organoleptique') {
      lier(s.id, 'contact')
      lier(s.id, 'lixiviation')
      if (VOLATILS.test(s.titre) || s.id === 'organoleptique') lier(s.id, 'volatilisation')
    }
    if (s.id.startsWith('eau:')) {
      lier(s.id, 'migration')
      if (VOLATILS.test(s.titre)) lier(s.id, 'volatilisation')
    }
    if (s.id.startsWith('gaz:')) lier(s.id, 'volatilisation')
  }
  lier('lixiviation', 'migration')
  for (const t of ['usagers', 'batiments-site']) {
    lier('contact', t)
    lier('volatilisation', t)
  }
  lier('volatilisation', 'riverains')
  for (const t of ['captages', 'cours-eau', 'usages-nappe', 'riverains']) lier('migration', t)
  return { elements, liens }
}

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Wraps a text to lines of about `n` characters. */
function couper(t: string, n: number): string[] {
  const mots = t.split(/\s+/)
  const lignes: string[] = []
  let l = ''
  for (const w of mots) {
    if ((l + ' ' + w).trim().length > n && l) {
      lignes.push(l)
      l = w
    } else l = (l + ' ' + w).trim()
  }
  if (l) lignes.push(l)
  return lignes
}

/** The retained items as a three-column diagram (SVG), for the report. */
export function schemaSvg(s: Schema, titre: string): string {
  const retenus = s.elements.filter((x) => x.retenu)
  const colonnes: Colonne[] = ['source', 'transfert', 'cible']
  const TITRES: Record<Colonne, string> = { source: 'Sources de pollution', transfert: 'Voies de transfert et milieux d’exposition', cible: 'Cibles' }
  const COULEURS: Record<Colonne, string> = { source: '#b3261e', transfert: '#3a5a78', cible: '#2f6b45' }
  const L = 1100
  const larg = 300
  const xs = [30, 400, 770]
  const pos = new Map<string, { x: number; y: number; h: number }>()
  const blocs: string[] = []
  let hauteur = 0
  colonnes.forEach((c, k) => {
    let y = 90
    for (const el of retenus.filter((x) => x.colonne === c)) {
      const lignesTitre = couper(el.titre, 38)
      const lignesPreuves = el.preuves.flatMap((p) => couper(p, 48))
      const h = 16 + lignesTitre.length * 17 + lignesPreuves.length * 14 + 8
      pos.set(el.id, { x: xs[k], y, h })
      blocs.push(
        `<rect x="${xs[k]}" y="${y}" width="${larg}" height="${h}" rx="6" fill="#ffffff" stroke="${COULEURS[c]}" stroke-width="1.5"/>` +
          lignesTitre.map((t, i) => `<text x="${xs[k] + 12}" y="${y + 22 + i * 17}" font-size="13.5" font-weight="700" fill="#0d2421">${echapper(t)}</text>`).join('') +
          lignesPreuves.map((t, i) => `<text x="${xs[k] + 12}" y="${y + 24 + lignesTitre.length * 17 + i * 14}" font-size="11" fill="#4f625f">${echapper(t)}</text>`).join(''),
      )
      y += h + 16
    }
    hauteur = Math.max(hauteur, y)
  })
  const fleches = s.liens
    .filter((l) => pos.has(l.de) && pos.has(l.vers))
    .map((l) => {
      const a = pos.get(l.de)!
      const b = pos.get(l.vers)!
      const memeColonne = a.x === b.x
      const x1 = memeColonne ? a.x + larg - 20 : a.x + larg
      const y1 = memeColonne ? a.y + a.h : a.y + a.h / 2
      const x2 = memeColonne ? b.x + larg - 20 : b.x
      const y2 = memeColonne ? b.y : b.y + b.h / 2
      return `<path d="M${x1},${y1} C${x1 + 35},${y1} ${x2 - 35},${y2} ${x2},${y2}" fill="none" stroke="#7a8a88" stroke-width="1.3" marker-end="url(#fl)"/>`
    })
  const H = Math.max(260, hauteur + 40)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" font-family="Arial, Helvetica, sans-serif">
<defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7a8a88"/></marker></defs>
<rect width="${L}" height="${H}" fill="#ffffff"/>
<text x="30" y="32" font-size="18" font-weight="700" fill="#0d2421">${echapper(titre)}</text>
${colonnes.map((c, k) => `<text x="${xs[k]}" y="70" font-size="12" font-weight="700" fill="${COULEURS[c]}" letter-spacing="0.5">${echapper(TITRES[c].toUpperCase())}</text>`).join('\n')}
${fleches.join('\n')}
${blocs.join('\n')}
<text x="30" y="${H - 14}" font-size="10" fill="#4f625f">Schéma proposé d’après les données du modèle (SIR Toolbox), à valider par l’ingénieur — méthodologie nationale SSP, avril 2017.</text>
</svg>`
}
