export type FilterKind = 'highpass' | 'lowpass' | 'peaking' | 'highshelf' | 'lowshelf'

export interface Coeffs {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

export const biquad = (kind: FilterKind, freq: number, q: number, gainDb: number, rate: number): Coeffs => {
  const w = (2 * Math.PI * freq) / rate
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const A = 10 ** (gainDb / 40)
  const shelf = 2 * Math.sqrt(A) * alpha
  const raw: Record<FilterKind, number[]> = {
    highpass: [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha],
    lowpass: [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha],
    peaking: [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A],
    highshelf: [
      A * (A + 1 + (A - 1) * cos + shelf),
      -2 * A * (A - 1 + (A + 1) * cos),
      A * (A + 1 + (A - 1) * cos - shelf),
      A + 1 - (A - 1) * cos + shelf,
      2 * (A - 1 - (A + 1) * cos),
      A + 1 - (A - 1) * cos - shelf,
    ],
    lowshelf: [
      A * (A + 1 - (A - 1) * cos + shelf),
      2 * A * (A - 1 - (A + 1) * cos),
      A * (A + 1 - (A - 1) * cos - shelf),
      A + 1 + (A - 1) * cos + shelf,
      -2 * (A - 1 + (A + 1) * cos),
      A + 1 + (A - 1) * cos - shelf,
    ],
  }
  const [b0, b1, b2, a0, a1, a2] = raw[kind]
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

export const filter = (c: Coeffs, x: Float32Array, out = new Float32Array(x.length)) => {
  let z1 = 0
  let z2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = x[i]
    const y = c.b0 * v + z1
    z1 = c.b1 * v - c.a1 * y + z2
    z2 = c.b2 * v - c.a2 * y
    out[i] = y
  }
  return out
}
