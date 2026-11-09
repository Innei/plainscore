import { interPeaks } from './loudness.ts'

export interface LimitResult {
  audio: Float32Array[]
  maxReduction: number
  overOneDb: number
}

export const LOOKAHEAD = 0.005
export const RELEASE = 0.08

export const limit = (channels: Float32Array[], ceilingDb: number, rate: number, lookahead = LOOKAHEAD, release = RELEASE): LimitResult => {
  const n = channels[0].length
  const ceiling = 10 ** (ceilingDb / 20)
  const peaks = new Float32Array(n)
  const scratch = new Float32Array(n)
  for (const channel of channels) {
    interPeaks(channel, scratch)
    for (let i = 0; i < n; i++) if (scratch[i] > peaks[i]) peaks[i] = scratch[i]
  }
  const req = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const p = Math.max(peaks[i], i ? peaks[i - 1] : 0)
    req[i] = p > ceiling ? ceiling / p : 1
  }
  const w = Math.max(1, Math.round(lookahead * rate))
  const target = new Float32Array(n + w)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  let next = 0
  for (let k = -w; k < n; k++) {
    const hi = Math.min(n - 1, k + w)
    while (next <= hi) {
      while (tail > head && req[queue[tail - 1]] >= req[next]) tail--
      queue[tail++] = next++
    }
    while (queue[head] < k) head++
    target[k + w] = req[queue[head]]
  }
  const gain = new Float32Array(n)
  const recover = 1 - Math.exp(-1 / (release * rate))
  let sum = 0
  for (let i = 0; i <= w; i++) sum += target[i]
  let last = 1
  let floor = 1
  let over = 0
  for (let i = 0; i < n; i++) {
    if (i) sum += target[i + w] - target[i - 1]
    const attack = Math.min(sum / (w + 1), req[i])
    last = attack < last ? attack : last + (attack - last) * recover
    gain[i] = last
    if (last < floor) floor = last
    if (last < 0.8912509381337456) over++
  }
  if (floor === 1) return { audio: channels, maxReduction: 0, overOneDb: 0 }
  return {
    audio: channels.map((x) => Float32Array.from(x, (v, i) => v * gain[i])),
    maxReduction: -20 * Math.log10(floor),
    overOneDb: over / rate,
  }
}
