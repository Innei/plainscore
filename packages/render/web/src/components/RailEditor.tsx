import { InputNumber, Slider, Switch } from '@lobehub/ui'
import { applyControl, controlOf, toggleControl } from '../lib/controls.ts'
import { fmt, signed } from '../lib/format.ts'
import type { Field } from '../lib/scoreRail.ts'
import type { Mixer } from '../useMixer.ts'

export const defaultTarget = (m: Mixer, index: number) => {
  const mark = m.state!.sections[index].mark
  return m.state!.edits.loudness[mark] ?? Math.round((m.view!.report.sections[index]?.measured ?? -14) * 2) / 2
}

export const SectionEditor = ({ m, index }: { m: Mixer; index: number }) => {
  const state = m.state!
  const edits = m.edits!
  const s = state.sections[index]
  const rep = m.view!.report.sections[index]
  const target = edits.loudness[s.mark] ?? null
  const previous = index > 0 ? state.sections[index - 1].mark : null
  const setTarget = (v: number | null) => m.edit({ ...edits, loudness: { ...edits.loudness, [s.mark]: v } })
  return (
    <div className="ed" onClick={(e) => e.stopPropagation()}>
      <span>
        Measured<b className="mono">{fmt(rep?.measured)}</b>
      </span>
      <span>
        Gain<b className="mono">{signed(m.view!.comp[index])} dB</b>
      </span>
      <span>
        Off by<b className="mono">{signed(rep?.diff)}</b>
      </span>
      <span className="grow" />
      <InputNumber
        className="mono ed-num"
        size="small"
        value={target}
        step={0.5}
        min={-40}
        max={0}
        disabled={target === null}
        placeholder="none"
        aria-label={`${s.mark} target in LUFS`}
        onChange={(v) => v !== null && setTarget(v)}
      />
      <label className="ed-switch" title={previous ? `No target: keep ${previous}'s gain` : 'No target'}>
        {previous ? `Keep ${previous}'s gain` : 'No target'}
        <Switch size="small" checked={target === null} onChange={(on) => setTarget(on ? null : defaultTarget(m, index))} />
      </label>
    </div>
  )
}

export const ControlEditor = ({ m, field }: { m: Mixer; field: Field }) => {
  const control = controlOf(field, m.edits!)
  if (!control) return null
  return (
    <div className="ed" onClick={(e) => e.stopPropagation()}>
      <span>{control.label}</span>
      {control.on !== undefined && <Switch size="small" checked={control.on} aria-label={`${control.label} on`} onChange={(on) => m.edit(toggleControl(field, m.edits!, on))} />}
      <Slider
        className="grow"
        min={control.min}
        max={control.max}
        step={control.step}
        value={control.value}
        disabled={control.disabled}
        aria-label={control.label}
        onChange={(v) => m.edit(applyControl(field, m.edits!, v))}
      />
      <b className="mono ed-value">{control.disabled ? 'off' : control.show(control.value)}</b>
    </div>
  )
}
