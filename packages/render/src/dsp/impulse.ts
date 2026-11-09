import type { Space } from 'plainscore'

export const IMPULSE_SEED = 1234

export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const impulse = (space: Pick<Space, 'decay' | 'predelay' | 'damp'>, rate: number) => {
  const pre = Math.round(space.predelay * rate)
  const n = pre + Math.ceil(space.decay * rate)
  const a = Math.exp((-2 * Math.PI * space.damp) / rate)
  return [0, 1].map((ch) => {
    const rng = mulberry32(IMPULSE_SEED + ch)
    const d = new Float32Array(n)
    let y = 0
    let e = 0
    for (let i = 0; i < n; i++) {
      const x = i < pre ? 0 : (rng() * 2 - 1) * Math.exp((-Math.log(1000) * (i - pre)) / rate / space.decay)
      y = (1 - a) * x + a * y
      d[i] = y
      e += y * y
    }
    const k = 1 / Math.sqrt(e || 1)
    for (let i = 0; i < n; i++) d[i] *= k
    return d
  }) as [Float32Array, Float32Array]
}
