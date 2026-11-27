import { describe, expect, test } from 'vitest'
import { decoder, ecrireFiche, encoder, FichierIllisible, FORMAT, ilYa, lireEnveloppe, lireFiche, nomDeRepertoire, nomLibre, nouvelleFiche, quand } from './format'

describe('encodage des données des outils', () => {
  test('dates, ensembles, tables, tableaux typés, NaN et infinis reviennent tels quels', () => {
    const valeur = {
      date: new Date('2026-03-14T10:00:00Z'),
      invalide: new Date('n importe quoi'),
      ouverts: new Set(['faits', 'matrice']),
      parOuvrage: new Map([['Pz1', { n: 3 }]]),
      trace: new Float64Array([0.5, 1.25]),
      manquants: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null],
      imbrique: { liste: [new Set([1, 2])] },
    }
    const relu = decoder(encoder(valeur)) as typeof valeur
    expect(relu.date).toBeInstanceOf(Date)
    expect(relu.date.toISOString()).toBe('2026-03-14T10:00:00.000Z')
    expect(Number.isNaN(relu.invalide.getTime())).toBe(true)
    expect(relu.ouverts).toEqual(new Set(['faits', 'matrice']))
    expect(relu.parOuvrage.get('Pz1')).toEqual({ n: 3 })
    expect(relu.trace).toBeInstanceOf(Float64Array)
    expect([...relu.trace]).toEqual([0.5, 1.25])
    expect(relu.manquants[0]).toBeNaN()
    expect(relu.manquants.slice(1)).toEqual([Infinity, -Infinity, null])
    expect(relu.imbrique.liste[0]).toEqual(new Set([1, 2]))
  })

  test("l'ordre des clés ne change pas le texte : rouvrir sans rien modifier n'écrit rien", () => {
    expect(encoder({ b: 1, a: { d: 2, c: 3 } })).toBe(encoder({ a: { c: 3, d: 2 }, b: 1 }))
  })

  test('un objet ordinaire qui ressemble à une marque reste un objet', () => {
    const v = { $sir: 'set', v: [1], autre: true }
    expect(decoder(encoder(v))).toEqual(v)
  })
})

describe('fiche du dossier', () => {
  test('aller-retour', () => {
    const f = nouvelleFiche(' Usine X ', '0712345', 'M. Durand', new Date('2026-11-27T09:00:00Z'))
    const relue = lireFiche(ecrireFiche(f))
    expect(relue).toEqual({ ...f, nom: 'Usine X' })
    expect(relue.cree).toEqual({ le: '2026-11-27T09:00:00.000Z', par: 'M. Durand' })
  })

  test('une fiche incomplète (modifiée à la main) est complétée, le nom du dossier sur le disque à défaut', () => {
    const f = lireFiche(JSON.stringify({ application: 'SIR Toolbox France', type: 'dossier', format: 1, outils: { reseaux: { le: 'x', par: 'y' }, faux: 3 } }), 'Mon étude')
    expect(f.nom).toBe('Mon étude')
    expect(f.site).toBeNull()
    expect(f.outils).toEqual({ reseaux: { le: 'x', par: 'y' } })
    expect(f.id).toBeTruthy()
  })

  test("une fiche d'une version plus récente, un autre fichier, un JSON abîmé sont refusés", () => {
    expect(() => lireFiche(JSON.stringify({ application: 'SIR Toolbox France', type: 'dossier', format: FORMAT + 1 }))).toThrow(/plus récente/)
    expect(() => lireFiche(JSON.stringify({ name: 'package' }))).toThrow(FichierIllisible)
    expect(() => lireFiche('{"application": "SIR')).toThrow(/pas un fichier JSON lisible/)
  })
})

describe("fichier d'un outil", () => {
  const texte = (outil: string) => encoder({ application: 'SIR Toolbox France', format: 1, outil, version: 2, revision: 7, modifie: { le: 'l', par: 'p' }, donnees: { a: 1 } })

  test('lu avec sa version et sa révision', () => {
    const e = lireEnveloppe(texte('reseaux'), 'reseaux', 'reseaux.json')
    expect(e).toMatchObject({ version: 2, revision: 7, donnees: { a: 1 } })
  })

  test("le fichier d'un autre outil est refusé", () => {
    expect(() => lireEnveloppe(texte('maillage'), 'reseaux', 'reseaux.json')).toThrow(/autre outil/)
  })
})

describe('noms sur le disque', () => {
  test('caractères interdits par Windows et OneDrive retirés', () => {
    expect(nomDeRepertoire('0712345 Usine X: Lyon / Vénissieux?')).toBe('0712345 Usine X Lyon Vénissieux')
    expect(nomDeRepertoire('  Étude…  . ')).toBe('Étude…')
    expect(nomDeRepertoire('CON')).toBe('CON_')
  })

  test('nom libre : numéroté avant l’extension', () => {
    const pris = new Set(['rapport.xlsx', 'rapport (2).xlsx'])
    expect(nomLibre('rapport.xlsx', (n) => pris.has(n))).toBe('rapport (3).xlsx')
    expect(nomLibre('autre.xlsx', (n) => pris.has(n))).toBe('autre.xlsx')
    expect(nomLibre('Dossier', (n) => n === 'Dossier')).toBe('Dossier (2)')
  })
})

describe('dates affichées', () => {
  const maintenant = new Date(2026, 10, 27, 15, 0)
  test("aujourd'hui, hier, avant", () => {
    expect(quand(new Date(2026, 10, 27, 14, 32).toISOString(), maintenant)).toBe('à 14:32')
    expect(quand(new Date(2026, 10, 26, 9, 5).toISOString(), maintenant)).toBe('hier à 09:05')
    expect(quand(new Date(2026, 10, 2, 16, 5).toISOString(), maintenant)).toBe('le 02/11/2026 à 16:05')
  })
  test('il y a', () => {
    expect(ilYa(new Date(2026, 10, 27, 14, 57).toISOString(), maintenant)).toBe('il y a 3 min')
  })
})
