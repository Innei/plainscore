const tables = new Map<number, { rev: Uint32Array; cos: Float64Array; sin: Float64Array }>()

const table = (n: number) => {
  let t = tables.get(n)
  if (t) return t
  const bits = Math.log2(n)
  const rev = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
    rev[i] = r
  }
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n)
    sin[i] = Math.sin((2 * Math.PI * i) / n)
  }
  t = { rev, cos, sin }
  tables.set(n, t)
  return t
}

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)))

export const fft = (re: Float64Array, im: Float64Array, inverse = false) => {
  const n = re.length
  const { rev, cos, sin } = table(n)
  for (let i = 0; i < n; i++) {
    const j = rev[i]
    if (j > i) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  const sign = inverse ? 1 : -1
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2
    const step = n / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step]
        const wi = sign * sin[k * step]
        const a = start + k
        const b = a + half
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n)
}
