import type { Mix, MixSetting, Space } from 'plainscore'
import { convolveStereo } from './dsp/convolve.ts'
import { impulse } from './dsp/impulse.ts'
import { dbToGain, panStereo } from './dsp/pan.ts'
import type { Stem } from './stems.ts'

export const settingOf = (mix: Mix, stem: Pick<Stem, 'target' | 'kind'>): MixSetting =>
  (stem.kind === 'part' ? mix.parts[stem.target] : mix.instruments[stem.target]) ?? { gain: 0, pan: 0, send: 0 }

export const mixdown = (stems: Stem[], mix: Mix, space: Space, rate: number, muted: Set<string> = new Set()) => {
  const n = stems[0]?.channels[0].length ?? 0
  const dry = [new Float32Array(n), new Float32Array(n)]
  const send = [new Float32Array(n), new Float32Array(n)]
  let sends = false
  for (const stem of stems) {
    if (muted.has(stem.target)) continue
    const s = settingOf(mix, stem)
    const g = dbToGain(s.gain)
    const { ll, rl, lr, rr } = panStereo(s.pan)
    const [inL, inR] = stem.channels
    const amount = s.send === null ? 0 : dbToGain(s.send)
    if (amount) sends = true
    for (let i = 0; i < n; i++) {
      const l = g * (inL[i] * ll + inR[i] * rl)
      const r = g * (inL[i] * lr + inR[i] * rr)
      dry[0][i] += l
      dry[1][i] += r
      if (amount) {
        send[0][i] += l * amount
        send[1][i] += r * amount
      }
    }
  }
  if (!sends) return dry
  const [irL, irR] = impulse(space, rate)
  const wet = convolveStereo(send[0], send[1], irL, irR)
  const level = dbToGain(space.wet)
  for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) dry[c][i] += wet[c][i] * level
  return dry
}
