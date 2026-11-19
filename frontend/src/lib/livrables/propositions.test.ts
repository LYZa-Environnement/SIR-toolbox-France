import { describe, expect, it } from 'vitest'
import { preparer } from './controles.ts'
import { lireFaits } from './faits.ts'
import { modeleDe, proposer, remplir } from './propositions.ts'
import { PAR_ID, REFERENTIELS } from './referentiels.ts'
import { lireSections } from './structure.ts'

const pages = [
  `Diagnostic de l'état des milieux
Ancienne usine Dupont — 12 rue des Forges, 69100 VILLEURBANNE
Client : Métropole de Lyon
Rapport n° ERM-2025-0412 — mars 2025
SOMMAIRE
1. Introduction ........ 3
2. Investigations réalisées ........ 5
3. Résultats 9
4. Conclusions et recommandations 12`,
  `1. INTRODUCTION
La présente étude a été réalisée pour le compte de la Métropole de Lyon sur le site situé à Villeurbanne.
1.1 Contexte et objectifs
L'usage futur de type résidentiel est envisagé. Les sols et les eaux souterraines sont étudiés.
2. INVESTIGATIONS RÉALISÉES
Les sondages S1 à S8 et S10 ont été réalisés le 4 février 2025. Les piézomètres Pz1, Pz2 et Pz3 ont été prélevés.
La nappe est rencontrée vers 8,5 m de profondeur. Les sols sont des remblais sur alluvions.
3 sondages ont été rebouchés.`,
  `3. RÉSULTATS
Les analyses de sols (laboratoire Eurofins) montrent des hydrocarbures C10-C40 et des HAP. Les hydrocarbures dépassent les valeurs ISDI.
Les HAP sont présents dans les eaux souterraines. Les sols sont remaniés.
4. CONCLUSIONS ET RECOMMANDATIONS
Les hydrocarbures sont présents au droit de S3.
ANNEXE 1 : Bulletins d'analyses`,
]

const texte = preparer({ nom: 'diag.pdf', pages, pagesSansTexte: 0 })

describe('faits du document', () => {
  const f = lireFaits(texte)
  it('reconnaît site, commune, adresse, client et date', () => {
    expect(f.site).toBe('l’ancienne usine Dupont')
    expect(f.commune).toBe('Villeurbanne')
    expect(f.adresse).toBe('12 rue des Forges')
    expect(f.client).toBe('Métropole de Lyon')
    expect(f.date).toBe('mars 2025')
    expect(f.reference).toBe('ERM-2025-0412')
  })
  it('reconnaît milieux, substances, ouvrages, laboratoire, usage et nappe', () => {
    expect(f.milieux.slice(0, 2)).toEqual(['sols', 'eaux souterraines'])
    expect(f.substances[0]).toMatch(/hydrocarbures/)
    expect(f.substances).toContain('HAP')
    expect(f.sondages).toBe('S1, S3, S8 et S10')
    expect(f.piezometres).toBe('Pz1 à Pz3')
    expect(f.labo).toBe('Eurofins')
    expect(f.usage).toBe('résidentiel')
    expect(f.nappe).toBe('8,5 m')
  })
})

describe('titres du document', () => {
  const s = lireSections(texte)
  it('lit les titres numérotés et les annexes, sans le sommaire', () => {
    expect(s.map((x) => x.numero)).toEqual(['1', '1.1', '2', '3', '4', 'Annexe 1'])
    expect(s[0].page).toBe(2)
    expect(s.find((x) => x.numero === '4')?.titre).toBe('CONCLUSIONS ET RECOMMANDATIONS')
  })
  it('ne prend pas une phrase commençant par un nombre pour un titre', () => {
    expect(s.some((x) => /rebouch/i.test(x.titre))).toBe(false)
  })
})

describe('propositions d’ajout', () => {
  const ref = PAR_ID.get('nf2-diag')!
  const ctx = { faits: lireFaits(texte), sections: lireSections(texte), referentiel: ref }
  const point = (id: string) => ref.points.find((p) => p.id === id)!

  it('place une préconisation manquante dans le chapitre des conclusions', () => {
    const p = proposer(point('preconisations'), ctx)
    expect(p.paragraphe).toBe('Compléter le § 4 « CONCLUSIONS ET RECOMMANDATIONS » (p. 3).')
    expect(p.phrase).toContain('Métropole de Lyon')
    expect(p.phrase).toContain('sur l’ancienne usine Dupont,')
  })

  it('propose de créer un résumé en tête, avant l’introduction', () => {
    const p = proposer(point('resumes'), ctx)
    expect(p.paragraphe).toMatch(/^Créer un paragraphe « Résumé technique et résumé non technique » en tête du rapport, avant le § 1 « INTRODUCTION » \(p\. 2\)\.$/)
    expect(p.phrase).toContain('a porté sur les sols et les eaux souterraines')
  })

  it('renvoie les bulletins à l’annexe qui les porte', () => {
    const p = proposer(point('prel-bulletins'), ctx)
    expect(p.paragraphe).toMatch(/^Compléter Annexe 1 « Bulletins d'analyses »/)
    expect(p.phrase).toBe('Les bulletins d’analyses complets du laboratoire Eurofins sont joints en annexe [n°].')
  })

  it('met entre crochets ce que le document ne dit pas', () => {
    const vide = lireFaits(preparer({ nom: 'x', pages: ['Rien.'], pagesSansTexte: 0 }))
    expect(remplir('Visite de {site} pour {client} à {commune}.', vide)).toBe('Visite du site [nom du site] pour [maître d’ouvrage] à [commune].')
  })

  it('reprend la formulation du modèle réglementaire pour une attestation', () => {
    const attes = PAR_ID.get('attes-alur')!
    const p = proposer(attes.points.find((x) => x.id === 'conclusion')!, { ...ctx, referentiel: attes })
    expect(p.modele).toBe(true)
    expect(p.phrase).toMatch(/^Atteste, sans réserve/)
  })

  it('a un exemple pour chaque point de chaque référentiel', () => {
    const sans: string[] = []
    for (const r of REFERENTIELS) for (const p of r.points) if (!modeleDe(p, r.id)) sans.push(`${r.id}/${p.id}`)
    expect(sans).toEqual([])
  })
})
