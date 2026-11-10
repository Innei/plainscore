import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

const tokens = (selector: string) => {
  const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0]
  return Object.fromEntries([...block.matchAll(/(--ps-[a-z0-9-]+):\s*(#[0-9a-f]{3,6})/g)].map((m) => [m[1], m[2]]))
}

const luminance = (hex: string) => {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('theme tokens', () => {
  it.each([
    ['dark', ":root, [data-theme='dark']"],
    ['light', "[data-theme='light']"],
  ])('keeps the pending text readable on chips and on the page in the %s theme', (_, selector) => {
    const t = tokens(selector)
    expect(contrast(t['--ps-pending-text'], t['--ps-fill'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['--ps-pending-text'], t['--ps-layout'])).toBeGreaterThanOrEqual(4.5)
  })
})
