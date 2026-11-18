/**
 * The standard figures of a quadrennial review, built from the analysis:
 * one compound on every well, the compounds of one well, one series in
 * detail, water levels, dechlorination, plan of the wells. The page and the
 * exports draw the same figures.
 */

import { CLASSES, direction, fr, pTexte, type Analyse, type AnalyseSerie } from './analyse.ts'
import { formatDate } from './dates.ts'
import { chronique, degradationSvg, PALETTE, planSvg, type OptionsChronique, type Rendu, type SerieGraphique } from './graphique.ts'
import type { Compose, Ouvrage } from './modele.ts'
import { anneeDecimale } from './stats.ts'

export interface OptionsFigure {
  log?: boolean | 'auto'
  sen?: boolean
  lissage?: boolean
  niveaux?: boolean
  largeur?: number
  hauteur?: number
  /** Only the window, not the whole history. */
  fenetreSeule?: boolean
}

export function serieGraphique(s: AnalyseSerie, nom: string, couleur: string): SerieGraphique {
  const points = s.points.map((p) => ({
    t: p.t,
    valeur: p.valeur,
    inferieur: p.inferieur,
    exclu: p.exclu,
    atypique: p.atypique,
    regime: p.regime,
    libelle: p.resultat.brut,
    id: p.resultat.id,
  }))
  const t0 = s.retenus[0]?.t
  const t1 = s.retenus[s.retenus.length - 1]?.t
  return {
    nom,
    couleur,
    points,
    sen: s.sen && t0 !== undefined && t1 !== undefined && s.statut === 'teste' ? { pente: s.sen.pente, ordonnee: s.sen.ordonnee, t0, t1 } : null,
    lissage: s.lissage,
    classe: s.statut === 'teste' ? s.classe : undefined,
  }
}

function fenetre(a: Analyse): [number, number] | null {
  const base = a.base.campagnes
  if (!base.length || !a.campagnes.length) return null
  const t0 = a.campagnes[0].t
  const t1 = a.campagnes[a.campagnes.length - 1].t
  const debut = t0 <= base[0].t
  const fin = t1 >= base[base.length - 1].t
  if (debut && fin) return null
  return [debut ? -Infinity : t0 - 0.02, fin ? Infinity : t1 + 0.02]
}

function bornes(a: Analyse, o: OptionsFigure): { tMin?: number; tMax?: number; fenetre: [number, number] | null } {
  const f = fenetre(a)
  if (o.fenetreSeule && a.campagnes.length) return { tMin: a.campagnes[0].t, tMax: a.campagnes[a.campagnes.length - 1].t, fenetre: null }
  const base = a.base.campagnes
  return { tMin: base[0]?.t, tMax: base[base.length - 1]?.t, fenetre: f }
}

/**
 * Water level on the second axis of a concentration chart: the head (m NGF)
 * when every well shown has one, else the depth to water below the
 * measuring point on an inverted axis (high water at the top) — depths of
 * different wells are drawn together but are not comparable with one
 * another.
 */
function niveauxPour(a: Analyse, ouvrages: Ouvrage[]): OptionsChronique['niveaux'] {
  const ps = a.piezo.filter((p) => ouvrages.includes(p.ouvrage))
  if (!ps.length) return null
  const enCharge = ps.every((p) => p.enCharge)
  return {
    libelle: enCharge ? 'niveau de la nappe (m NGF)' : "profondeur de l'eau sous le repère (m)",
    inverse: !enCharge,
    // Depths and heads are never drawn on one axis: with depths, the wells known only by a head are left out.
    series: ps
      .filter((p) => enCharge || !p.enCharge)
      .map((p) => ({
        nom: `niveau ${p.ouvrage.nom}`,
        couleur: ouvrages.length > 1 ? PALETTE[ouvrages.indexOf(p.ouvrage) % PALETTE.length] : '#5f7d95',
        points: p.serie.map((x) => ({ t: x.t, v: enCharge ? x.v : -x.v })),
      })),
  }
}

const libelleRef = (a: AnalyseSerie | undefined, c: Compose) => {
  const r = a?.reference
  return r ? `valeur de référence ${fr(r.valeur)} ${c.unite}${r.saisie ? '' : ` ${r.source}`}` : ''
}

/** One series (a well, a compound), with its statistics in the subtitle. */
export function figureSerie(a: Analyse, s: AnalyseSerie, o: OptionsFigure = {}): Rendu {
  const b = bornes(a, o)
  const stats =
    s.statut === 'teste'
      ? `${CLASSES[s.classe].libelle}${s.mk ? ` (Mann-Kendall ${pTexte(s.mk.pBilateral)}` : ''}${s.sen ? `, Sen ${s.sen.pente > 0 ? '+' : ''}${fr(s.sen.pente)} ${s.compose.unite}/an)` : ')'} — n = ${s.n}, ${s.nQ} quantifié${s.nQ > 1 ? 's' : ''}`
      : `${CLASSES[s.classe].libelle} — n = ${s.n}`
  return chronique({
    titre: `${s.compose.nom} — ${s.ouvrage.nom}`,
    sousTitre: stats,
    unite: s.compose.unite,
    series: [serieGraphique(s, s.ouvrage.nom, PALETTE[0])],
    reference: s.reference ? { valeur: s.reference.valeur, libelle: libelleRef(s, s.compose) } : null,
    vigilance: s.reference ? a.reglages.vigilance : null,
    log: o.log ?? 'auto',
    afficherSen: o.sen ?? true,
    afficherLissage: o.lissage ?? false,
    niveaux: o.niveaux ? niveauxPour(a, [s.ouvrage]) : null,
    ruptures: s.rupture ? [{ t: s.rupture.t, libelle: `rupture (Pettitt) ${formatDate(s.rupture.entre[1]).slice(3)}` }] : [],
    fenetre: b.fenetre,
    tMin: b.tMin,
    tMax: b.tMax,
    largeur: o.largeur,
    hauteur: o.hauteur,
  })
}

/** One compound on several wells. */
export function figureCompose(a: Analyse, c: Compose, ouvrages: Ouvrage[], o: OptionsFigure = {}): Rendu | null {
  const ss = ouvrages.map((ov) => a.parCle.get(`${ov.cle}|${c.cle}`)).filter((s): s is AnalyseSerie => !!s && s.points.length > 0)
  if (!ss.length) return null
  const b = bornes(a, o)
  const ref = ss.find((s) => s.reference)
  return chronique({
    titre: c.nom,
    sousTitre: ss.map((s) => `${s.ouvrage.nom} ${CLASSES[s.classe].symbole}`).join('   ') + `   (${CLASSES.hausse.symbole} hausse, ${CLASSES.baisse.symbole} baisse, ${CLASSES.stable.symbole} stable)`,
    unite: c.unite,
    series: ss.map((s) => serieGraphique(s, s.ouvrage.nom, PALETTE[ouvrages.indexOf(s.ouvrage) % PALETTE.length])),
    reference: ref?.reference ? { valeur: ref.reference.valeur, libelle: libelleRef(ref, c) } : null,
    vigilance: ref?.reference ? a.reglages.vigilance : null,
    log: o.log ?? 'auto',
    afficherSen: o.sen ?? false,
    afficherLissage: o.lissage ?? false,
    niveaux: o.niveaux ? niveauxPour(a, ss.map((s) => s.ouvrage)) : null,
    fenetre: b.fenetre,
    tMin: b.tMin,
    tMax: b.tMax,
    largeur: o.largeur,
    hauteur: o.hauteur,
  })
}

/** Several compounds on one well (in a common unit). */
export function figureOuvrage(a: Analyse, ov: Ouvrage, composes: Compose[], o: OptionsFigure & { titre?: string } = {}): Rendu | null {
  const ss = composes.map((c) => a.parCle.get(`${ov.cle}|${c.cle}`)).filter((s): s is AnalyseSerie => !!s && s.points.length > 0)
  if (!ss.length) return null
  const b = bornes(a, o)
  const unites = new Set(ss.map((s) => s.compose.unite))
  const seule = ss.length === 1 ? ss[0] : null
  return chronique({
    titre: o.titre ?? `${ov.nom}`,
    sousTitre: ss.map((s) => `${s.compose.nom} ${CLASSES[s.classe].symbole}`).join('   '),
    unite: [...unites].join(' / '),
    series: ss.map((s, i) => serieGraphique(s, s.compose.nom, PALETTE[i % PALETTE.length])),
    reference: seule?.reference ? { valeur: seule.reference.valeur, libelle: libelleRef(seule, seule.compose) } : null,
    vigilance: seule?.reference ? a.reglages.vigilance : null,
    log: o.log ?? 'auto',
    afficherSen: o.sen ?? false,
    afficherLissage: o.lissage ?? false,
    niveaux: o.niveaux ? niveauxPour(a, [ov]) : null,
    fenetre: b.fenetre,
    tMin: b.tMin,
    tMax: b.tMax,
    largeur: o.largeur,
    hauteur: o.hauteur,
  })
}

export type ModeNiveaux = 'niveau' | 'ecart'

/**
 * Water levels of every well. In m NGF when every well has a head; with
 * depths only (sheets without the elevation of the measuring point), each
 * well's depth below its own measuring point on an inverted axis — the
 * wells cannot be compared with one another, only each with itself.
 * `ecart`: each well's level minus its median level, which compares the
 * seasonal swings of the wells whatever their reference.
 */
export function figureNiveaux(a: Analyse, o: OptionsFigure & { mode?: ModeNiveaux } = {}): Rendu | null {
  if (!a.piezo.length) return null
  const b = bornes(a, o)
  const enCharge = a.piezo.every((p) => p.enCharge)
  const aucune = a.piezo.every((p) => !p.enCharge)
  const mode: ModeNiveaux = o.mode ?? (enCharge || aucune ? 'niveau' : 'ecart')
  const mediane = (vs: number[]) => {
    const s2 = [...vs].sort((x, y) => x - y)
    return s2.length % 2 ? s2[(s2.length - 1) / 2] : (s2[s2.length / 2 - 1] + s2[s2.length / 2]) / 2
  }
  const series = a.piezo.map((p, i) => {
    const med = mediane(p.serie.map((x) => x.v))
    return {
      nom: p.ouvrage.nom,
      couleur: PALETTE[a.ouvrages.indexOf(p.ouvrage) % PALETTE.length] ?? PALETTE[i % PALETTE.length],
      points: p.serie.map((x) => {
        const v = mode === 'ecart' ? x.v - med : enCharge ? x.v : -x.v
        return { t: x.t, valeur: v, inferieur: false, libelle: `${mode === 'ecart' && v > 0 ? '+' : ''}${fr(v, 3)}${mode === 'niveau' && !enCharge ? ' (profondeur)' : ''}` }
      }),
    }
  })
  return chronique({
    titre: mode === 'ecart' ? 'Battement de la nappe — écart au niveau médian de chaque ouvrage' : enCharge ? 'Niveaux de la nappe' : "Profondeur de l'eau sous le repère de chaque ouvrage",
    sousTitre:
      mode === 'niveau' && !enCharge
        ? 'Profondeurs mesurées sous des repères de cotes différentes : chaque ouvrage se lit seul, les ouvrages ne se comparent pas entre eux.'
        : a.piezo.map((p) => `${p.ouvrage.nom} : amplitude ${fr(p.amplitude, 2)} m`).join('   '),
    unite: mode === 'ecart' ? 'écart au niveau médian (m, + : nappe plus haute)' : enCharge ? 'cote piézométrique (m NGF)' : "profondeur de l'eau sous le repère (m)",
    series,
    log: false,
    axeLibre: true,
    inverse: mode === 'niveau' && !enCharge,
    fenetre: b.fenetre,
    tMin: b.tMin,
    tMax: b.tMax,
    largeur: o.largeur,
    hauteur: o.hauteur,
  })
}

export function figureDegradation(a: Analyse, i: number, largeur?: number): string | null {
  const d = a.degradation[i]
  if (!d) return null
  const presentes = d.especes.map((_, k) => d.campagnes.some((c) => c.moles[k] > 0))
  return degradationSvg({
    titre: `Chloroéthènes — ${d.ouvrage.nom} : parts molaires par campagne`,
    especes: d.especes.filter((_, k) => presentes[k]),
    campagnes: d.campagnes.map((c) => ({ libelle: formatDate(c.campagne.date).slice(3), moles: c.moles.filter((_, k) => presentes[k]), total: c.total, chlores: c.chlores })),
    chloresMax: 4,
    largeur,
  })
}

/** Wells at their coordinates for a compound: trend class, last result over the reference. */
export function figurePlan(a: Analyse, c: Compose, largeur?: number): { svg: string; cibles: { x: number; y: number; nom: string }[] } | null {
  const ovs = a.ouvrages.filter((o) => o.x !== null && o.y !== null)
  if (ovs.length < 2) return null
  return planSvg({
    titre: `${c.nom} — tendance et dernier résultat`,
    largeur,
    fleche: a.ecoulement ? { azimut: a.ecoulement.azimutMoyen, libelle: `écoulement ${direction(a.ecoulement.azimutMoyen)}` } : null,
    points: ovs.map((o) => {
      const s = a.parCle.get(`${o.cle}|${c.cle}`)
      const d = s?.derniere
      return {
        nom: o.nom,
        x: o.x!,
        y: o.y!,
        classe: s && s.n ? s.classe : null,
        ratio: s?.ratioDernier ?? null,
        position: o.position,
        libelle: d ? `${d.inferieur ? '<' : ''}${fr(d.valeur)} ${c.unite}` : 'non analysé',
      }
    }),
  })
}

export const tDate = (iso: string) => anneeDecimale(iso)

/** Wells at their coordinates with their median head, and the mean flow direction. */
export function figureEcoulement(a: Analyse, largeur?: number): { svg: string; cibles: { x: number; y: number; nom: string }[] } | null {
  const e = a.ecoulement
  if (!e) return null
  const ovs = a.ouvrages.filter((o) => o.x !== null && o.y !== null)
  return planSvg({
    titre: `Écoulement de la nappe — vers le ${direction(e.azimutMoyen)}, gradient médian ${fr(e.gradientMedian * 1000, 2)} ‰`,
    largeur,
    fleche: { azimut: e.azimutMoyen, libelle: `écart entre campagnes ${Math.round(e.dispersion)}°` },
    points: ovs.map((o) => {
      const p = a.piezo.find((x) => x.ouvrage === o && x.enCharge)
      const vs = p ? p.serie.map((x) => x.v).sort((u, v) => u - v) : []
      const med = vs.length ? vs[Math.floor(vs.length / 2)] : null
      const rang = e.ordre.find((x) => x.ouvrage === o)
      return {
        nom: o.nom,
        x: o.x!,
        y: o.y!,
        classe: null,
        ratio: null,
        position: o.position,
        libelle: `${med !== null ? `${fr(med, 4)} m NGF` : 'cote inconnue'}${rang ? ` · ${rang.attendue === 'droit' ? 'intermédiaire' : rang.attendue}` : ''}`,
      }
    }),
  })
}
