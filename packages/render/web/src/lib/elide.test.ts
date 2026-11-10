import { describe, expect, it } from 'vitest'
import { elide } from './elide.ts'

describe('elide', () => {
  it('keeps short lines as they are', () => {
    expect(elide('    violins  75%', '    violins  70%')).toEqual(['violins  75%', 'violins  70%'])
  })

  it('drops the unchanged middle of long lines so the change stays visible', () => {
    expect(elide('  space  decay 2.6s  predelay 20ms  damp 6500 Hz  wet -10 dB', '  space  decay 2.6s  predelay 20ms  damp 6500 Hz  wet -12 dB')).toEqual([
      'space … damp 6500 Hz wet -10 dB',
      'space … damp 6500 Hz wet -12 dB',
    ])
  })

  it('keeps a long line whole when the change is near its start', () => {
    const a = '    Turn  turn  loudness -15.2  — climbs to B7 so the last pages can sit a step higher'
    const b = '    Turn  turn  loudness -14.5  — climbs to B7 so the last pages can sit a step higher'
    expect(elide(a, b)).toEqual([a.trim(), b.trim()])
  })
})
