import { Slider } from '@lobehub/ui'
import { useEffect, useState } from 'react'
import { panLabel, signed } from '../lib/format.ts'
import { settingOf, writeStrip } from '../lib/mix.ts'
import type { MixSetting, StemInfo } from '../lib/types.ts'
import type { Mixer } from '../useMixer.ts'

const dbLabel = (v: number) => `${signed(v)} dB`

const Meter = ({ m, target }: { m: Mixer; target: string }) => {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    let id = 0
    const frame = () => {
      setLevel(m.player?.level(target) ?? 0)
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [m.player, target])
  return (
    <span className="meter">
      <i style={{ transform: `scaleX(${level})` }} />
    </span>
  )
}

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

export const Strip = ({ m, stem, open, onToggle }: { m: Mixer; stem: StemInfo; open: boolean; onToggle: () => void }) => {
  const s = settingOf(m.state!, m.edits!, stem.target, stem.kind)
  const change = (patch: Partial<MixSetting>) => m.edit(writeStrip(m.state!, m.edits!, stem.target, stem.kind, { ...s, ...patch }))
  const changed = m.rail?.lines.some((l) => l.target === stem.target && l.changed) ?? false
  return (
    <div className={`strip${open ? ' open' : ''}${changed ? ' chg' : ''}`}>
      <button className="strip-name" onClick={onToggle} aria-expanded={open} title={stem.kind === 'part' ? `part · ${stem.insts.join(', ')}` : stem.target}>
        <span>{stem.target}</span>
        {stem.kind === 'part' && <small>{stem.insts.join(', ')}</small>}
      </button>
      <Audition m={m} target={stem.target} />
      <span className="fader">
        <Slider min={-30} max={12} step={0.5} value={s.gain} onChange={(gain) => change({ gain })} aria-label={`${stem.target} level`} />
        <Meter m={m} target={stem.target} />
      </span>
      <em className="mono">{dbLabel(s.gain)}</em>
      {open && (
        <>
          <span className="sub">Pan</span>
          <Slider min={-1} max={1} step={0.05} value={s.pan} onChange={(pan) => change({ pan })} aria-label={`${stem.target} pan`} />
          <em className="mono">{panLabel(s.pan)}</em>
          <span className="sub">Send</span>
          <Slider min={-40} max={6} step={0.5} value={s.send ?? -40} onChange={(v) => change({ send: v <= -40 ? null : v })} aria-label={`${stem.target} send`} />
          <em className="mono">{s.send === null || s.send <= -40 ? 'off' : dbLabel(s.send)}</em>
        </>
      )}
    </div>
  )
}
