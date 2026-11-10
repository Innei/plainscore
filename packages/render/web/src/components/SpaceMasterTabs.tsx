import { Switch } from '@lobehub/ui'
import { AIR_FREQ } from 'plainscore'
import { fmt, signed } from '../lib/format.ts'
import type { Master, Space } from '../lib/types.ts'
import type { Mixer } from '../useMixer.ts'
import { SliderRow } from './SliderRow.tsx'

export const SpaceTab = ({ m }: { m: Mixer }) => {
  const sp = m.edits!.space
  const set = (patch: Partial<Space>) => m.edit({ ...m.edits!, space: { ...sp, ...patch } })
  return (
    <div className="controls">
      <SliderRow label="Decay" min={0.4} max={6} step={0.1} value={sp.decay} show={(v) => `${v.toFixed(1)} s`} onChange={(decay) => set({ decay })} />
      <SliderRow label="Predelay" min={0} max={120} step={1} value={Math.round(sp.predelay * 1000)} show={(v) => `${v} ms`} onChange={(v) => set({ predelay: v / 1000 })} />
      <SliderRow label="Damp" min={1500} max={16000} step={100} value={sp.damp} show={(v) => `${v} Hz`} onChange={(damp) => set({ damp })} />
      <SliderRow label="Wet" min={-40} max={0} step={0.5} value={sp.wet} show={(v) => `${signed(v)} dB`} onChange={(wet) => set({ wet })} />
    </div>
  )
}

export const MasterTab = ({ m }: { m: Mixer }) => {
  const ms = m.edits!.master
  const set = (patch: Partial<Master>) => m.edit({ ...m.edits!, master: { ...ms, ...patch } })
  const air = ms.air ?? { gain: 0, freq: AIR_FREQ }
  return (
    <div className="controls">
      <SliderRow label="Loudness" min={-24} max={-8} step={0.5} value={ms.loudness} show={(v) => `${fmt(v)} LUFS`} onChange={(loudness) => set({ loudness })} />
      <SliderRow label="Ceiling" min={-3} max={-0.1} step={0.1} value={ms.ceiling} show={(v) => `${fmt(v)} dBTP`} onChange={(ceiling) => set({ ceiling })} />
      <div className="switch">
        <span>Lowcut</span>
        <Switch size="small" checked={ms.lowcut !== null} onChange={(on) => set({ lowcut: on ? 35 : null })} />
      </div>
      <SliderRow label="Lowcut at" min={20} max={150} step={1} value={ms.lowcut ?? 35} disabled={ms.lowcut === null} show={(v) => `${v} Hz`} onChange={(lowcut) => set({ lowcut })} />
      <SliderRow label="Presence" min={-6} max={6} step={0.5} value={ms.presence} show={(v) => `${signed(v)} dB`} onChange={(presence) => set({ presence })} />
      <SliderRow label="Air" min={-6} max={6} step={0.5} value={air.gain} show={(v) => `${signed(v)} dB`} onChange={(gain) => set({ air: gain ? { gain, freq: air.freq } : null })} />
      <SliderRow label="Air at" min={4000} max={16000} step={250} value={air.freq} disabled={!ms.air} show={(v) => `${v} Hz`} onChange={(freq) => ms.air && set({ air: { ...ms.air, freq } })} />
      <SliderRow label="Fade" min={0} max={10} step={0.5} value={ms.fade} show={(v) => (v ? `${v.toFixed(1)} s` : 'ring out')} onChange={(fade) => set({ fade })} />
    </div>
  )
}
