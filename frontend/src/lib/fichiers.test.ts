import { describe, expect, test } from 'vitest'
import { decoderTexte, lireFeuilles } from './fichiers.ts'

const enc = (t: string) => new TextEncoder().encode(t)

describe('lecture des CSV', () => {
  test('CSV français (point-virgule, virgule décimale, UTF-8 sans BOM) : accents et décimales conservés', async () => {
    const f = new File([enc('Paramètre;Unité;S3\nNaphtalène;mg/kg;0,4\nAcénaphtène;mg/kg;1,2\n')], 'labo.csv', { type: 'text/csv' })
    const [feuille] = await lireFeuilles(f)
    expect(feuille.grille[1][0]).toBe('Naphtalène')
    // Kept as text, not read as 4 or 12: the tools convert "0,4" themselves.
    expect(feuille.grille[1][2]).toBe('0,4')
    expect(feuille.grille[2][2]).toBe('1,2')
  })

  test('CSV Windows-1252 (Excel français) : accents décodés', async () => {
    // "é" = 0xE9 in Windows-1252, invalid alone in UTF-8.
    const octets = new Uint8Array([...enc('Unit'), 0xe9, ...enc(';x\n')])
    expect(decoderTexte(octets.buffer)).toBe('Unité;x\n')
  })

  test('CSV anglais (virgule, point décimal) : nombres lus', async () => {
    const f = new File([enc('Name,Value\nToluene,0.5\nBenzene,12\n')], 'lab.csv', { type: 'text/csv' })
    const [feuille] = await lireFeuilles(f)
    expect(feuille.grille[1][1]).toBe(0.5)
    expect(feuille.grille[2][0]).toBe('Benzene')
  })
})
