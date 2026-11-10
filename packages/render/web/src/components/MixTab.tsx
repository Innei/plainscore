import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { panLabel, signed } from '../lib/format.ts'
import { settingOf, writeStrip } from '../lib/mix.ts'
import type { MixSetting, StemInfo } from '../lib/types.ts'
import type { Mixer } from '../useMixer.ts'
import { SliderRow } from './SliderRow.tsx'

const dbLabel = (v: number) => `${signed(v)} dB`

const scoreLine = (text: string, target: string) => {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^\s+mix\b/.test(l))
  if (start < 0) return null
  for (let i = start + 1; i < lines.length && (lines[i].trim() === '' || /^\s{4,}/.test(lines[i])); i++) {
    if (lines[i].trim().split(/\s+/)[0] === target) return { line: i + 1, text: lines[i].trim().split(/\s+—\s/)[0] }
  }
  return null
}

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
      <i style={{ width: `${level * 100}%` }} />
    </span>
  )
}

export const levelSlider = (m: Mixer, stem: StemInfo, label = 'Level') => {
  const s = settingOf(m.state!, m.edits!, stem.target, stem.kind)
  const change = (patch: Partial<MixSetting>) => m.edit(writeStrip(m.state!, m.edits!, stem.target, stem.kind, { ...settingOf(m.state!, m.edits!, stem.target, stem.kind), ...patch }))
  return { s, change, node: <SliderRow key={stem.target} label={label} min={-30} max={12} step={0.5} value={s.gain} show={dbLabel} onChange={(gain) => change({ gain })} /> }
}

const Row = ({ m, stem, open, onToggle }: { m: Mixer; stem: StemInfo; open: boolean; onToggle: () => void }) => {
  const { s, change, node } = levelSlider(m, stem)
  const line = open ? scoreLine(m.state!.text, stem.target) : null
  const on = (kind: 'mute' | 'solo') => m.player?.auditioned(kind, stem.target) ?? false
  return (
    <div className={`mrow${open ? ' open' : ''}`}>
      <div className="mrow-top">
        <button className="mrow-name" onClick={onToggle} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{stem.target}</span>
          {stem.kind === 'part' && <small className="faint">part · {stem.insts.join(', ')}</small>}
        </button>
        <Meter m={m} target={stem.target} />
        <span className="ms">
          {(['mute', 'solo'] as const).map((kind) => (
            <button key={kind} aria-pressed={on(kind)} title={kind === 'mute' ? 'Mute (listening only)' : 'Solo (listening only)'} onClick={() => m.player?.audition(kind, stem.target, !on(kind))}>
              {kind === 'mute' ? 'M' : 'S'}
            </button>
          ))}
        </span>
      </div>
      {node}
      {open && (
        <>
          <SliderRow label="Pan" min={-1} max={1} step={0.05} value={s.pan} show={panLabel} onChange={(pan) => change({ pan })} />
          <SliderRow label="Send" min={-40} max={6} step={0.5} value={s.send ?? -40} show={(v) => (v <= -40 ? 'off' : dbLabel(v))} onChange={(v) => change({ send: v <= -40 ? null : v })} />
          <div className="scoreline mono">
            <code>{line?.text ?? `${stem.target} — no row yet`}</code>
            {line && <span>line {line.line}</span>}
          </div>
        </>
      )}
    </div>
  )
}

export const MixTab = ({ m }: { m: Mixer }) => {
  const [open, setOpen] = useState<string | null>(m.state!.stems[0]?.target ?? null)
  return (
    <>
      <div className="h3">
        <span>Whole piece</span>
      </div>
      <div className="mrows">
        {m.state!.stems.map((stem) => (
          <Row key={stem.target} m={m} stem={stem} open={open === stem.target} onToggle={() => setOpen(open === stem.target ? null : stem.target)} />
        ))}
      </div>
      <div className="divider" />
      <p className="note">Muted and soloed parts are for listening only; they are never written.</p>
    </>
  )
}
