import { readFileSync, readdirSync } from 'node:fs'
import { checkScore } from 'plainscore'
import { describe, expect, it } from 'vitest'
import { planScore } from '../../../src/session.ts'
import { MEMORY_LIMIT, estimateBytes } from './memory.ts'

describe('estimateBytes', () => {
  it('puts four minutes of four stems near 750 MB', () => {
    const mb = estimateBytes(240, 4) / 1e6
    expect(mb).toBeGreaterThan(700)
    expect(mb).toBeLessThan(800)
  })

  it('allows four minutes of eight stems and eight minutes of four', () => {
    expect(estimateBytes(240, 8)).toBeLessThanOrEqual(MEMORY_LIMIT)
    expect(estimateBytes(480, 4)).toBeLessThanOrEqual(MEMORY_LIMIT)
  })

  it('refuses four minutes of fourteen stems', () => {
    expect(estimateBytes(240, 13)).toBeLessThanOrEqual(MEMORY_LIMIT)
    expect(estimateBytes(240, 14)).toBeGreaterThan(MEMORY_LIMIT)
  })
})

describe('the bundled examples', () => {
  const dir = new URL('../../../../../examples/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.score'))

  it.each(files)('%s fits under the limit, every piece and variant', (file) => {
    const text = readFileSync(new URL(file, dir), 'utf8')
    for (const piece of checkScore(text, file).pieces) {
      for (const variant of [null, ...piece.variants.map((v) => v.name)]) {
        const plan = planScore(text, file, piece.id, variant)
        expect(estimateBytes(plan.seconds, plan.stems), `${file} ${piece.id} ${variant ?? ''}`).toBeLessThanOrEqual(MEMORY_LIMIT)
      }
    }
  })
})
