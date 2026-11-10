import { useMemo, useRef, useState } from 'react'
import { clock, fmt, signed } from '../lib/format.ts'
import { areaPath, curvePath, lufsAt, stepPath, stepTarget, valueAt, yOf } from '../lib/geometry.ts'
import { sectionAt } from '../lib/position.ts'
import { usePlayhead } from '../usePlayhead.ts'
import type { Mixer } from '../useMixer.ts'

export const MAP_HEIGHT = 360
const H = MAP_HEIGHT
const W = 1000
const GRID = [-10, -14, -18, -22]

const pct = (t: number, length: number) => `${(t / (length || 1)) * 100}%`

export const Playhead = ({ m, length }: { m: Mixer; length: number }) => {
  const t = usePlayhead(m.player)
  return <div className="head" style={{ left: pct(t, length) }} />
}

export const LoudnessMap = ({ m, length }: { m: Mixer; length: number }) => {
  const [hover, setHover] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const state = m.state!
  const edits = m.edits!
  const curve = m.curve!
  const targets = state.sections.map((s) => edits.loudness[s.mark] ?? null)
  const was = state.sections.map((s) => ((state.edits.loudness[s.mark] ?? null) === (edits.loudness[s.mark] ?? null) ? null : (state.edits.loudness[s.mark] ?? null)))
  const paths = useMemo(() => ({ line: curvePath(curve, length, W, H), area: areaPath(curve, length, W, H) }), [curve, length])
  const steps = stepPath(state.sections, targets, length, W, H)
  const oldSteps = stepPath(state.sections, was, length, W, H)

  const timeAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(length, ((e.clientX - rect.left) / rect.width) * length))
  }
  const setTarget = (i: number, value: number) => {
    const mark = state.sections[i].mark
    if (value !== edits.loudness[mark]) m.edit({ ...edits, loudness: { ...edits.loudness, [mark]: value } })
  }
  const dragTo = (i: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (rect) setTarget(i, lufsAt(((clientY - rect.top) / rect.height) * H, H))
  }

  const probe = hover === null || dragging !== null ? null : valueAt(curve, hover)
  return (
    <div
      ref={box}
      className="map"
      onMouseMove={(e) => setHover(timeAt(e))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        const t = timeAt(e)
        m.select(sectionAt(state.sections, t))
        m.player?.seek(t)
      }}
    >
      {state.sections.map((s, i) => (
        <div key={s.mark} className={`col${s.keyChange ? ' key' : ''}${i === m.selected ? ' sel' : ''}`} style={{ left: pct(s.start, length), width: pct(s.end - s.start, length) }}>
          <div className="comp mono">{signed(m.view!.comp[i])}</div>
        </div>
      ))}
      {GRID.map((v) => (
        <div key={v} className="grid-line" style={{ top: yOf(v, H) }}>
          <span>{v}</span>
        </div>
      ))}
      <div className="master-line" style={{ top: yOf(edits.master.loudness, H) }}>
        <span>master {fmt(edits.master.loudness)} LUFS</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={m.stale ? 'stale' : ''} aria-label="Short-term loudness and section targets">
        <defs>
          <linearGradient id="ps-curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ps-accent)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--ps-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path className="curve" d={paths.area} fill="url(#ps-curve-fill)" />
        <path className="curve" d={paths.line} fill="none" stroke="var(--ps-accent)" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={oldSteps} fill="none" stroke="var(--ps-text)" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={steps} fill="none" stroke="var(--ps-text)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {state.sections.map((s, i) => {
        const target = targets[i]
        if (target === null) return null
        return (
          <div
            key={s.mark}
            className={`grip-zone${i === m.selected || i === dragging ? ' on' : ''}`}
            style={{ left: pct(s.start, length), width: pct(s.end - s.start, length), top: yOf(target, H) }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDragging(i)
              m.select(i)
            }}
            onPointerMove={(e) => dragging === i && dragTo(i, e.clientY)}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
          >
            <button
              className="grip mono"
              aria-label={`${s.mark} target, ${fmt(target)} LUFS`}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                e.preventDefault()
                setTarget(i, stepTarget(target, e.key === 'ArrowUp' ? 1 : -1))
              }}
            >
              ↕ {fmt(target)}
            </button>
          </div>
        )
      })}
      <Playhead m={m} length={length} />
      {hover !== null && probe !== null && (
        <>
          <div className="probe-dot" style={{ left: pct(hover, length), top: yOf(probe, H) }} />
          <div className="probe mono" style={{ left: pct(hover, length), top: yOf(probe, H) }}>
            {clock(hover).replace(/\.\d$/, '')} · {fmt(probe)} <span>short-term</span>
          </div>
        </>
      )}
    </div>
  )
}
