import { InputNumber, Switch } from '@lobehub/ui'
import { clock, fmt, sectionLabel, signed } from '../lib/format.ts'
import type { Mixer } from '../useMixer.ts'
import { levelSlider } from './MixTab.tsx'

export const SectionTab = ({ m }: { m: Mixer }) => {
  const state = m.state!
  const edits = m.edits!
  const i = m.selected
  const s = state.sections[i]
  const rep = m.view!.report.sections[i]
  const target = edits.loudness[s.mark] ?? null
  const written = state.edits.loudness[s.mark] ?? null
  const setTarget = (v: number | null) => m.edit({ ...edits, loudness: { ...edits.loudness, [s.mark]: v } })
  const previous = i > 0 ? state.sections[i - 1].mark : null
  return (
    <>
      <div className="sec-head">
        <span className="mark large">{s.mark}</span>
        <div>
          {sectionLabel(s) && <b>{sectionLabel(s)}</b>}
          <small className="mono">
            {clock(s.start)} – {clock(s.end)} · {fmt(s.end - s.start)} s{s.keyChange ? ` · in ${s.tonic}` : ''}
          </small>
        </div>
      </div>
      <div className="field">
        <label>
          <span>Target in the master</span>
          <span>LUFS</span>
        </label>
        <InputNumber
          className="mono"
          value={target}
          step={0.5}
          min={-40}
          max={0}
          disabled={target === null}
          placeholder={previous ? `keeps ${previous}'s gain` : 'no target'}
          onChange={(v) => v !== null && setTarget(v)}
          suffix={written !== target ? <em className="faint">was {written === null ? 'none' : fmt(written)}</em> : null}
        />
      </div>
      <div className="switch">
        <span>{previous ? `No target: keep ${previous}'s gain` : 'No target'}</span>
        <Switch size="small" checked={target === null} onChange={(on) => setTarget(on ? null : (written ?? Math.round((rep.measured ?? -14) * 2) / 2))} />
      </div>
      <div className="stats">
        <div className="stat">
          <small>Measured</small>
          <b className="mono">{fmt(rep.measured)}</b>
        </div>
        <div className="stat">
          <small>Comp.</small>
          <b className="mono">{signed(m.view!.comp[i])} dB</b>
        </div>
        <div className="stat">
          <small>Diff</small>
          <b className="mono">{signed(rep.diff)}</b>
        </div>
      </div>
      <div className="h3">
        <span>Sounding in {s.mark}</span>
      </div>
      <div className="sounding">
        {s.parts.length ? s.parts.map((p) => <span key={p} className="tag">{p}</span>) : <span className="faint">nothing</span>}
      </div>
      <div className="divider" />
      <div className="h3">
        <span>Mix</span>
        <span>whole piece</span>
      </div>
      <div className="compact">{state.stems.map((stem) => levelSlider(m, stem, stem.target).node)}</div>
    </>
  )
}
