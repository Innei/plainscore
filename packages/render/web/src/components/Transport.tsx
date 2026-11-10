import { Segmented } from '@lobehub/ui'
import { Pause, Play } from 'lucide-react'
import { useEffect } from 'react'
import { clock, fmt, signed } from '../lib/format.ts'
import { usePlayhead } from '../usePlayhead.ts'
import type { Mixer } from '../useMixer.ts'

const Clock = ({ m, length }: { m: Mixer; length: number }) => {
  const t = usePlayhead(m.player)
  return (
    <span className="clock mono">
      {clock(t)} <span className="faint">/ {clock(length)}</span>
    </span>
  )
}

export const Transport = ({ m, length }: { m: Mixer; length: number }) => {
  const player = m.player
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, button, [role="slider"], [role="menu"]')) return
      e.preventDefault()
      player?.toggle()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [player])
  const r = m.view?.report
  const playing = player?.isPlaying() ?? false
  return (
    <div className="transport">
      <button className="play" disabled={!player} aria-label={playing ? 'Pause' : 'Play'} onClick={() => player?.toggle()}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <Clock m={m} length={length} />
      <Segmented
        size="small"
        value={player?.isLooping() ? 'loop' : 'whole'}
        disabled={!player}
        options={[
          { value: 'whole', label: 'Whole piece' },
          { value: 'loop', label: 'Loop section' },
        ]}
        onChange={(v) => player?.setLoop(v === 'loop')}
      />
      {r && (
        <div className="readout mono">
          <span><b>{fmt(r.integrated)}</b>LUFS</span>
          <span><b>{fmt(r.range)}</b>LU range</span>
          <span><b>{fmt(r.truePeak)}</b>dBTP peak</span>
          <span><b>{signed(m.view!.gain)}</b>dB master gain</span>
          <span><b>{fmt(r.limiter.maxReduction)}</b>dB limiter</span>
        </div>
      )}
    </div>
  )
}
