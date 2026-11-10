import { clock, fmt, signed } from '../lib/format.ts'
import type { Mixer } from '../useMixer.ts'
import { LoudnessMap, Playhead } from './LoudnessMap.tsx'
import { Strip } from './Strip.tsx'

const pct = (t: number, length: number) => `${(t / (length || 1)) * 100}%`

const shortMark = (mark: string, seconds: number) => (seconds < 12 && mark.length > 3 ? mark.slice(0, 2) : mark)

const Meters = ({ m }: { m: Mixer }) => {
  const r = m.view!.report
  const rows: [string, string, string][] = [
    ['Whole piece', fmt(r.integrated), 'LUFS'],
    ['Range', fmt(r.range), 'LU'],
    ['True peak', fmt(r.truePeak), 'dBTP'],
    ['Limited', fmt(r.limiter.maxReduction), 'dB'],
    ['Master gain', signed(m.view!.gain), 'dB'],
  ]
  return (
    <div className={`meters${m.stale ? ' stale' : ''}`}>
      {rows.map(([label, value, unit]) => (
        <div key={label}>
          <span>{label}</span>
          <span className="mono">
            <b>{value}</b>
            <small>{unit}</small>
          </span>
        </div>
      ))}
    </div>
  )
}

export const Board = ({ m, length, openStrip, onOpenStrip }: { m: Mixer; length: number; openStrip: string | null; onOpenStrip: (target: string | null) => void }) => {
  const state = m.state!
  const seams = m.view!.report.seams
  return (
    <main className="board">
      <div className="g">
        <div />
        <div className="ruler">
          {state.sections.map((s, i) => (
            <button
              key={s.mark}
              className={`${s.keyChange ? 'key' : ''}${i === m.selected ? ' sel' : ''}`}
              style={{ width: pct(s.end - s.start, length) }}
              title={`${s.mark} · ${s.label} · ${clock(s.start)}`}
              onClick={() => {
                m.select(i)
                m.player?.seek(s.start)
              }}
            >
              <span className="mark">{shortMark(s.mark, s.end - s.start)}</span>
            </button>
          ))}
          {seams.map((w) => (
            <span key={w.time} className="seam" style={{ left: pct(w.time, length) }} title={`${w.from} → ${w.to}: ${w.dip} dB dip`} />
          ))}
        </div>
      </div>
      <div className="g">
        <div className="gutter">
          <span>Loudness, LUFS</span>
          <Meters m={m} />
          <span className="legend">
            <span><i style={{ borderColor: 'var(--ps-text)' }} />target — drag to set</span>
            <span><i style={{ borderColor: 'var(--ps-accent)' }} />measured, 3 s</span>
            <span><i style={{ borderColor: 'var(--ps-text-3)', borderTopStyle: 'dashed' }} />as written</span>
          </span>
        </div>
        <LoudnessMap m={m} length={length} />
      </div>
      <div className="g lanes">
        {state.lanes.map((lane) => {
          const stem = state.stems.find((s) => s.target === lane.target)
          const open = openStrip === lane.target
          return (
            <div key={lane.target} style={{ display: 'contents' }}>
              {stem ? <Strip m={m} stem={stem} open={open} onToggle={() => onOpenStrip(open ? null : lane.target)} /> : <div className="strip">{lane.target}</div>}
              <div className={`row${open ? ' open' : ''}`}>
                {lane.spans.map(([a, b]) => (
                  <div key={a} className="block" style={{ left: `calc(${pct(a, length)} + 1px)`, width: `max(2px, calc(${pct(b - a, length)} - 2px))` }} />
                ))}
                <Playhead m={m} length={length} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="foot">
        <span className="seams">
          {seams.length
            ? seams.map((w) => (
                <button key={w.time} onClick={() => m.player?.seek(Math.max(0, w.time - 2))}>
                  {w.from} → {w.to} at {clock(w.time)}: {w.dip} dB dip ·{' '}
                </button>
              ))
            : `No holes at the seams · ${state.sections.length} sections · mute and solo are for listening only`}
        </span>
        <span className="credits" title={m.view!.report.credits.map((c) => `${c.sound}: ${c.credit || 'no credit given'}`).join('\n')}>
          Sounds: {[...new Set(m.view!.report.credits.map((c) => c.credit.split(/[:(]/)[0].trim() || c.sound))].join(', ')}
        </span>
      </div>
    </main>
  )
}
