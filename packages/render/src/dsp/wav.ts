export const encodeWav = (channels: Float32Array[], rate: number, bits: 16 | 24 | 32 = 24) => {
  const n = channels[0].length
  const k = channels.length
  const width = bits / 8
  const bytes = new Uint8Array(44 + n * k * width)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + n * k * width, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, bits === 32 ? 3 : 1, true)
  view.setUint16(22, k, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * k * width, true)
  view.setUint16(32, k * width, true)
  view.setUint16(34, bits, true)
  ascii(36, 'data')
  view.setUint32(40, n * k * width, true)
  const full = 2 ** (bits - 1)
  let at = 44
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k; c++) {
      const v = channels[c][i]
      if (bits === 32) view.setFloat32(at, v, true)
      else {
        const q = Math.max(-full, Math.min(full - 1, Math.round(v * full)))
        if (bits === 16) view.setInt16(at, q, true)
        else {
          view.setUint8(at, q & 0xff)
          view.setUint8(at + 1, (q >> 8) & 0xff)
          view.setUint8(at + 2, (q >> 16) & 0xff)
        }
      }
      at += width
    }
  }
  return bytes
}

export const decodeWav = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file')
  let format = 0
  let k = 0
  let rate = 0
  let bits = 0
  let at = 12
  while (at + 8 <= bytes.length) {
    const id = tag(at)
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ') {
      format = view.getUint16(body, true)
      k = view.getUint16(body + 2, true)
      rate = view.getUint32(body + 4, true)
      bits = view.getUint16(body + 14, true)
      if (format === 0xfffe) format = view.getUint16(body + 24, true)
    } else if (id === 'data') {
      const width = bits / 8
      const n = Math.floor(Math.min(size, bytes.length - body) / (width * k))
      const channels = Array.from({ length: k }, () => new Float32Array(n))
      let p = body
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < k; c++) {
          let v: number
          if (format === 3 && bits === 32) v = view.getFloat32(p, true)
          else if (format === 3 && bits === 64) v = view.getFloat64(p, true)
          else if (bits === 16) v = view.getInt16(p, true) / 32768
          else if (bits === 24) v = ((view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16)) / 8388608)
          else if (bits === 32) v = view.getInt32(p, true) / 2147483648
          else if (bits === 8) v = (view.getUint8(p) - 128) / 128
          else throw new Error(`unsupported WAV: ${bits}-bit format ${format}`)
          channels[c][i] = v
          p += width
        }
      }
      return { rate, channels }
    }
    at = body + size + (size & 1)
  }
  throw new Error('WAV has no data chunk')
}
