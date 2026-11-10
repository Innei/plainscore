export const elide = (before: string, after: string, max = 40): [string, string] => {
  const a = before.trim()
  const b = after.trim()
  if (a.length <= max && b.length <= max) return [a, b]
  const ta = a.split(/\s+/)
  const tb = b.split(/\s+/)
  let p = 0
  while (p < ta.length && p < tb.length && ta[p] === tb[p]) p++
  const from = p - 4
  if (from <= 1) return [a, b]
  return [[ta[0], '…', ...ta.slice(from)].join(' '), [tb[0], '…', ...tb.slice(from)].join(' ')]
}
