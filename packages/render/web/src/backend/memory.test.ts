import { describe, expect, it } from 'vitest'
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

  it('refuses one stem more than that', () => {
    expect(estimateBytes(240, 9)).toBeGreaterThan(MEMORY_LIMIT)
  })
})
