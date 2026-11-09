export const panGains = (pan: number): [number, number] => {
  const angle = ((Math.min(1, Math.max(-1, pan)) + 1) * Math.PI) / 4
  return [Math.abs(Math.cos(angle)) < 1e-12 ? 0 : Math.cos(angle), Math.abs(Math.sin(angle)) < 1e-12 ? 0 : Math.sin(angle)]
}

export const dbToGain = (db: number) => 10 ** (db / 20)
export const gainToDb = (gain: number) => 20 * Math.log10(gain)

export const panStereo = (pan: number) => {
  const p = Math.min(1, Math.max(-1, pan))
  const x = p <= 0 ? p + 1 : p
  const [cos, sin] = [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)]
  return p <= 0 ? { ll: 1, rl: cos, lr: 0, rr: sin } : { ll: cos, rl: 0, lr: sin, rr: 1 }
}
