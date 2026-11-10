import { clock } from '../lib/format.ts'
import type { Mixer } from '../useMixer.ts'
import { LoudnessMap, Playhead } from './LoudnessMap.tsx'

const pct = (t: number, length: number) => `${(t / (length || 1)) * 100}%`

const shortMark = (mark: string, seconds: number) => (seconds < 12 && mark.length > 3 ? mark.slice(0, 2) : mark)

const Audition = ({ m, target }: { m: Mixer; target: string }) => (
  <span className="ms">
    {(['mute', 'solo'] as const).map((kind) => {
      const on = m.player?.auditioned(kind, target) ?? false
      return (
        <button key={kind} aria-pressed={on} title={kind === 'mute' ? 'Mute (listening only)' : 'Solo (listening only)'} onClick={() => m.player?.audition(kind, target, !on)}>
          {kind === 'mute' ? 'M' : 'S'}
        </button>
      )
    })}
  </span>
)

export const Board = ({ m, length }: { m: Mixer; length: number }) => {
  const state = m.state!
  const seams = m.view!.report.seams
  return (
    <main className="board">
      <div className="lane-grid">
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
      <div className="lane-grid">
        <div className="lane-label map-label">
          <span>LUFS</span>
          <span className="legend">
            <span><i style={{ borderColor: 'var(--ps-text)' }} />target</span>
            <span><i style={{ borderColor: 'var(--ps-accent)' }} />3 s</span>
          </span>
        </div>
        <LoudnessMap m={m} length={length} />
      </div>
      <div className="lane-grid lanes">
        {state.lanes.map((lane) => (
          <div key={lane.target} style={{ display: 'contents' }}>
            <div className="lane-label">
              <span>{lane.target}</span>
              <Audition m={m} target={lane.target} />
            </div>
            <div className="row">
              {lane.spans.map(([a, b]) => (
                <div key={a} className="block" style={{ left: `calc(${pct(a, length)} + 1px)`, width: `max(2px, calc(${pct(b - a, length)} - 2px))` }} />
              ))}
              <Playhead m={m} length={length} />
            </div>
          </div>
        ))}
      </div>
      <div className="foot">
        <span className="seams">
          {seams.length
            ? seams.map((w) => (
                <button key={w.time} onClick={() => m.player?.seek(Math.max(0, w.time - 2))}>
                  {w.from} → {w.to} at {clock(w.time)}: {w.dip} dB dip ·{' '}
                </button>
              ))
            : `No holes at the seams · ${state.sections.length} sections`}
        </span>
        <span className="credits" title={m.view!.report.credits.map((c) => `${c.sound}: ${c.credit || 'no credit given'}`).join('\n')}>
          Sounds: {[...new Set(m.view!.report.credits.map((c) => c.credit.split(/[:(]/)[0].trim() || c.sound))].join(', ')}
        </span>
      </div>
    </main>
  )
}
