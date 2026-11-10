import { Button, DropdownMenu, type DropdownItem } from '@lobehub/ui'
import { ChevronDown, Download, FilePenLine, Gauge } from 'lucide-react'
import { useState } from 'react'
import { pieceTitle } from '../lib/format.ts'
import type { Mixer } from '../useMixer.ts'

const FORMATS = [
  ['wav', 'WAV 24-bit'],
  ['flac', 'FLAC'],
  ['mp3', 'MP3 320k'],
] as const

const statusOf = (m: Mixer) => {
  if (m.status) return m.status
  if (m.measuring) return 'measuring…'
  const n = m.changes.length
  if (!n) return m.stale ? 'not measured' : null
  const what = n === 1 ? m.changes[0].label + (m.changes[0].mark ? ` ${m.changes[0].mark}` : '') : `${n} changes`
  return m.stale ? `${what} · not measured` : `${what} · not written`
}

export const Header = ({ m }: { m: Mixer }) => {
  const [formats, setFormats] = useState<string[]>(['wav'])
  const status = statusOf(m)
  const items: DropdownItem[] = [
    ...FORMATS.map(([value, label]) => ({
      type: 'checkbox' as const,
      key: value,
      label,
      checked: formats.includes(value),
      closeOnClick: false,
      onCheckedChange: (on: boolean) => setFormats((f) => (on ? [...f, value] : f.filter((x) => x !== value))),
    })),
    { type: 'divider' as const },
    { key: 'render', label: m.exported ?? 'Render files', disabled: !formats.length || !m.player, onClick: () => void m.exportFiles(formats) },
  ]
  const title = m.state ? pieceTitle(m.state) : 'Loading…'
  return (
    <header className="top">
      <div className="brand">
        <h1>{title}</h1>
        <span className="tag">score 0.3</span>
        {m.state && <span className="tag mono path" title={m.state.file}>{m.state.file}</span>}
      </div>
      <div className="actions">
        {status && (
          <span className="tag">
            {(m.dirty || m.stale) && <span className="dot" />}
            {status}
          </span>
        )}
        <Button icon={Gauge} loading={m.measuring} disabled={!m.player} onClick={() => void m.measure()}>
          Measure
        </Button>
        <DropdownMenu items={items}>
          <Button icon={Download}>
            Export
            <ChevronDown size={14} />
          </Button>
        </DropdownMenu>
        <Button className="ps-primary" icon={FilePenLine} disabled={!m.dirty} onClick={() => m.setTab('changes')}>
          {m.dirty ? `Write ${m.changes.length} change${m.changes.length === 1 ? '' : 's'}…` : 'Write to score…'}
        </Button>
      </div>
    </header>
  )
}
