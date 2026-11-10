import { describe, expect, it } from 'vitest'
import { evaluerConformite, type Donnees, type LigneEvaluee, type Resultat } from './conformite.ts'
import { volumeColonne, facteurNormal } from './grille.ts'
import { PAR_ID } from './substances.ts'
import { conversionAir, conversionEau } from './unites.ts'

const r = (valeur: number, inferieur = false): Resultat => ({ valeur, inferieur })
const ligne = (id: string, valeurs: (Resultat | null)[]): LigneEvaluee => ({ libelle: id, substance: PAR_ID.get(id)!, valeurs })

function air(lignes: LigneEvaluee[], options: Partial<Donnees['air']> & { permanente?: boolean } = {}): Donnees {
  const { permanente = false, ...ctx } = options
  return {
    milieu: 'air',
    air: { debit: null, oxydation: false, rendement: null, o2Mesure: null, o2Reference: null, ...ctx },
    eau: { destination: 'milieu', debit: null, d21110: false, zoneSensible: false, lagunage: false, neutralisationAlcaline: false, temperature50: false },
    lignes,
    mesures: lignes[0].valeurs.map((_, i) => `M${i + 1}`),
    permanente,
    fluxAutorises: {},
  }
}

const controle = (d: Donnees, id: string) => evaluerConformite(d).find((c) => c.id === id)!

describe('arrêté du 2 février 1998, article 27 (air)', () => {
  it('applique la VLE du HCl (50 mg/m³) au-delà de 1 kg/h', () => {
    // 60 mg/m³ × 20 000 Nm³/h = 1 200 g/h > 1 000 g/h.
    const c = controle(air([ligne('hcl', [r(60)])], { debit: 20000 }), 'hcl')
    expect(c.mesures[0].flux).toEqual({ bas: 1200, haut: 1200 })
    expect(c.mesures[0].vle).toBe(50)
    expect(c.mesures[0].statut).toBe('depassement')
  })

  it('ne soumet pas le HCl sous le seuil de flux', () => {
    // 60 mg/m³ × 10 000 Nm³/h = 600 g/h ≤ 1 000 g/h.
    const c = controle(air([ligne('hcl', [r(60)])], { debit: 10000 }), 'hcl')
    expect(c.mesures[0].statut).toBe('non-soumis')
  })

  it('reste indéterminé quand seule la LQ dépasse la VLE, et applique le seuil par prudence', () => {
    const c = controle(air([ligne('hcl', [r(60, true)])], { debit: 20000 }), 'hcl')
    expect(c.mesures[0].concentration).toEqual({ bas: 0, haut: 60 })
    expect(c.mesures[0].statut).toBe('indetermine')
    expect(c.mesures[0].notes.join(' ')).toMatch(/LQ/)
  })

  it("ramène la concentration à l'oxygène de référence (article 24)", () => {
    // 30 mg/m³ à 15 % d'O2, référence 3 % : × (21 − 3) / (21 − 15) = × 3 → 90 mg/m³.
    // Flux 30 g/h ≤ 1 kg/h : VLE des poussières 100 mg/m³.
    const c = controle(air([ligne('poussieres', [r(30)])], { debit: 1000, o2Mesure: 15, o2Reference: 3 }), 'poussieres')
    expect(c.mesures[0].concentration!.bas).toBeCloseTo(90)
    expect(c.mesures[0].vle).toBe(100)
    expect(c.mesures[0].statut).toBe('conforme')
  })

  it('tolère 10 % de dépassements en autosurveillance permanente, jamais au-delà du double (article 21)', () => {
    const dix = (depasse: number[]) => Array.from({ length: 10 }, (_, i) => r(depasse.includes(i) ? 70 : 40))
    const un = controle(air([ligne('hcl', dix([0]))], { debit: 50000, permanente: true }), 'hcl')
    expect(un.synthese.statut).toBe('conforme')
    const deux = controle(air([ligne('hcl', dix([0, 1]))], { debit: 50000, permanente: true }), 'hcl')
    expect(deux.synthese.statut).toBe('depassement')
    const double = controle(air([ligne('hcl', [r(110), ...dix([]).slice(1)])], { debit: 50000, permanente: true }), 'hcl')
    expect(double.synthese.statut).toBe('depassement')
  })
})

describe('unités et volumes prélevés', () => {
  it('convertit les unités de l’air vers le mg/m³', () => {
    expect(conversionAir('µg/m³', null).facteur).toBe(1e-3)
    expect(conversionAir('mg/Nm3', null).facteur).toBe(1)
    expect(conversionAir('µg/tube', null)).toEqual({ facteur: 1e-3, support: true })
    // 1 ppm de HCl = 36,46 / 22,414 mg/m³.
    expect(conversionAir('ppm', PAR_ID.get('hcl')!).facteur).toBeCloseTo(36.46 / 22.414)
  })

  it('ramène les nitrates en azote', () => {
    expect(conversionEau('mg/l', PAR_ID.get('nitrates') ?? null).facteur).toBeCloseTo(14.007 / 62.004)
    expect(conversionEau('mg N/l', PAR_ID.get('nitrates') ?? null).facteur).toBe(1)
  })

  it('calcule le volume prélevé avec le débit moyen et les conditions normales', () => {
    // (1,0 + 1,2) / 2 L/min × 60 min = 66 L.
    const colonne = { nom: 'M1', date: '', duree: '60', debitDebut: '1,0', debitFin: '1,2' }
    expect(volumeColonne(colonne)).toBeCloseTo(66)
    // 20 °C, 101,325 kPa : × 273,15 / 293,15.
    expect(facteurNormal({ temperature: '20', pression: '101,325' })).toBeCloseTo(273.15 / 293.15)
    expect(facteurNormal({ temperature: '', pression: '' })).toBe(1)
  })
})
