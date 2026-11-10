import type { Curve } from './types.ts'

export const LO = -24
export const HI = -8

const round = (v: number) => Math.round(v * 10) / 10

export const yOf = (lufs: number, height: number) => round(height - ((Math.max(LO, Math.min(HI, lufs)) - LO) / (HI - LO)) * height)

export const lufsAt = (y: number, height: number) => Math.max(LO, Math.min(HI, Math.round((LO + ((height - y) / (height || 1)) * (HI - LO)) * 2) / 2))

export const stepTarget = (target: number, direction: 1 | -1) => Math.max(-40, Math.min(0, Math.round((target + direction * 0.5) * 100) / 100))

export const xOf = (t: number, length: number, width: number) => round((t / (length || 1)) * width)

const points = (curve: Curve, length: number, width: number, height: number) =>
  curve.values.map((v, i) => [xOf(i * curve.step + curve.window / 2, length, width), yOf(v, height)] as const)

export const curvePath = (curve: Curve, length: number, width: number, height: number) => {
  const p = points(curve, length, width, height)
  return p.length ? `M${p.map(([x, y]) => `${x},${y}`).join('L')}` : ''
}

export const areaPath = (curve: Curve, length: number, width: number, height: number) => {
  const p = points(curve, length, width, height)
  if (!p.length) return ''
  return `${curvePath(curve, length, width, height)}L${p.at(-1)![0]},${height}L${p[0][0]},${height}Z`
}

export const stepPath = (sections: { start: number; end: number }[], targets: (number | null)[], length: number, width: number, height: number) =>
  sections
    .map((s, i) => (targets[i] === null || targets[i] === undefined ? '' : `M${xOf(s.start, length, width)},${yOf(targets[i]!, height)}H${xOf(s.end, length, width)}`))
    .join('')

export const valueAt = (curve: Curve, t: number) => {
  if (!curve.values.length) return null
  const i = Math.round((t - curve.window / 2) / curve.step)
  return curve.values[Math.max(0, Math.min(curve.values.length - 1, i))]
}
