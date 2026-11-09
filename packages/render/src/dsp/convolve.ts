import { fft, nextPow2 } from './fft.ts'

const spectrum = (ir: Float32Array, n: number) => {
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  re.set(ir)
  fft(re, im)
  return { re, im }
}

export const convolveStereo = (left: Float32Array, right: Float32Array, irLeft: Float32Array, irRight: Float32Array, block?: number) => {
  const m = Math.max(irLeft.length, irRight.length)
  const size = block ?? Math.max(4096, nextPow2(m))
  const n = nextPow2(size + m - 1)
  const hl = spectrum(irLeft, n)
  const hr = spectrum(irRight, n)
  const length = left.length + m - 1
  const outL = new Float32Array(length)
  const outR = new Float32Array(length)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let start = 0; start < left.length; start += size) {
    re.fill(0)
    im.fill(0)
    const end = Math.min(left.length, start + size)
    for (let i = start; i < end; i++) {
      re[i - start] = left[i]
      im[i - start] = right[i]
    }
    fft(re, im)
    for (let k = 0; k <= n / 2; k++) {
      const j = (n - k) % n
      const lr = (re[k] + re[j]) / 2
      const li = (im[k] - im[j]) / 2
      const rr = (im[k] + im[j]) / 2
      const ri = (re[j] - re[k]) / 2
      const yl = [lr * hl.re[k] - li * hl.im[k], lr * hl.im[k] + li * hl.re[k]]
      const yr = [rr * hr.re[k] - ri * hr.im[k], rr * hr.im[k] + ri * hr.re[k]]
      re[k] = yl[0] - yr[1]
      im[k] = yl[1] + yr[0]
      if (j !== k) {
        re[j] = yl[0] + yr[1]
        im[j] = -yl[1] + yr[0]
      }
    }
    fft(re, im, true)
    const span = Math.min(n, length - start)
    for (let i = 0; i < span; i++) {
      outL[start + i] += re[i]
      outR[start + i] += im[i]
    }
  }
  return [outL, outR] as const
}

export const convolve = (x: Float32Array, ir: Float32Array, block?: number) => convolveStereo(x, new Float32Array(x.length), ir, ir, block)[0]
