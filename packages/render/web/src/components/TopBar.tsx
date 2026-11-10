import { Button, DropdownMenu, type DropdownItem, Segmented } from '@lobehub/ui'
import { Check, ChevronDown, Download, LoaderCircle, Pause, Play, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { clock, pieceTitle } from '../lib/format.ts'
import { usePlayhead, usePlayingSection } from '../usePlayhead.ts'
import type { Mixer } from '../useMixer.ts'

const FORMATS = [
  ['wav', 'WAV 24-bit'],
  ['flac', 'FLAC'],
  ['mp3', 'MP3 320k'],
] as const

const NO_SECTIONS: { start: number; mark: string }[] = []

const Clock = ({ m, length }: { m: Mixer; length: number }) => {
  const t = usePlayhead(m.player)
  return (
    <span className="clock mono">
      {clock(t)} <span className="faint">/ {clock(length)}</span>
    </span>
  )
}

const MeasureStatus = ({ m }: { m: Mixer }) => {
  if (m.status) return <span className="measure">{m.status}</span>
  const failed = m.measureState === 'failed'
  const waiting = m.stale && !m.capabilities.autoMeasure && m.measureState !== 'measuring'
  const busy = !failed && !waiting && (m.stale || m.measureState === 'measuring')
  const Icon = failed ? TriangleAlert : busy ? LoaderCircle : Check
  return (
    <button className="measure" title="Measure now" disabled={!m.edits} onClick={m.measure}>
      <Icon size={14} className={busy ? 'spin' : undefined} />
      {failed ? 'Not measured' : waiting ? 'Measure' : busy ? 'Measuring…' : 'Measured'}
    </button>
  )
}

export const TopBar = ({ m, length }: { m: Mixer; length: number }) => {
  const [formats, setFormats] = useState<string[]>(['wav'])
  const player = m.player
  const sections = m.state?.sections ?? NO_SECTIONS
  const playing = usePlayingSection(player, sections)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, button, [role="slider"], [role="menu"]')) return
      e.preventDefault()
      player?.toggle()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [player])

  const items: DropdownItem[] = [
    ...FORMATS.filter(([value]) => m.capabilities.formats.includes(value)).map(([value, label]) => ({
      type: 'checkbox' as const,
      key: value,
      label,
      checked: formats.includes(value),
      closeOnClick: false,
      onCheckedChange: (on: boolean) => setFormats((f) => (on ? [...f, value] : f.filter((x) => x !== value))),
    })),
    { type: 'divider' as const },
    { key: 'render', label: m.exported ?? 'Render files', disabled: !formats.length || !player, onClick: () => void m.exportFiles(formats) },
  ]
  const isPlaying = player?.isPlaying() ?? false
  return (
    <header className="top">
      <div className="top-side">
        <h1>{m.state ? pieceTitle(m.state) : 'Loading…'}</h1>
        {m.state && (
          <span className="tag mono path" title={m.state.file}>
            {m.state.file}
          </span>
        )}
      </div>
      <div className="top-mid">
        <button className="play" disabled={!player} aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => player?.toggle()}>
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <Clock m={m} length={length} />
        <Segmented
          size="small"
          value={player?.isLooping() ? 'loop' : 'whole'}
          disabled={!player}
          options={[
            { value: 'whole', label: 'Whole piece' },
            { value: 'loop', label: `Loop ${sections[playing]?.mark ?? 'section'}` },
          ]}
          onChange={(v) => player?.setLoop(v === 'loop')}
        />
      </div>
      <div className="top-side end">
        {m.capabilities.reopen && (
          <Button type="text" onClick={() => location.reload()}>
            Open another score
          </Button>
        )}
        <MeasureStatus m={m} />
        <DropdownMenu items={items}>
          <Button icon={Download}>
            Export
            <ChevronDown size={14} />
          </Button>
        </DropdownMenu>
      </div>
    </header>
  )
}
