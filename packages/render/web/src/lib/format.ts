const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

export const fmt = (v: number | null | undefined, digits = 1) => (finite(v) ? v.toFixed(digits) : '—')

export const signed = (v: number | null | undefined, digits = 1) => {
  if (!finite(v)) return '—'
  const text = v.toFixed(digits)
  return Number(text) > 0 ? `+${text}` : Number(text) === 0 ? (0).toFixed(digits) : text
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

export const panLabel = (v: number) => (Math.abs(v) < 0.005 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)

const squash = (s: string | null | undefined) => s?.replace(/\s+/g, '') ?? ''

export const pieceTitle = (s: { title: string; piece: { title: string }; variant: string | null }) =>
  [s.title, squash(s.piece.title) === squash(s.title) ? null : s.piece.title, s.variant].filter(Boolean).join(' · ')

export const sectionLabel = (s: { mark: string; label: string }) => (s.label && s.label !== s.mark ? s.label : null)

export const axisLength = (stems: number, master: number, lastSection: number) => Math.max(stems, master, lastSection)
