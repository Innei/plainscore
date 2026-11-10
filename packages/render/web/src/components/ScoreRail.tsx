import { ActionIcon } from '@lobehub/ui'
import { Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Field, RailLine, Token } from '../lib/scoreRail.ts'
import type { Mixer } from '../useMixer.ts'
import { ControlEditor, SectionEditor, defaultTarget } from './RailEditor.tsx'

const keyOf = (field: Field) => JSON.stringify(field)

const wasText = (line: RailLine) => (line.fresh ? 'new' : line.was ? `was ${line.was}` : line.changed ? 'changed' : '')

export const ScoreRail = ({ m, onOpenStrip }: { m: Mixer; onOpenStrip: (target: string) => void }) => {
  const [open, setOpen] = useState<Field | null>(null)
  const rows = useRef(new Map<number, HTMLDivElement>())
  const state = m.state!
  const edits = m.edits!
  const rail = m.rail
  const stems = new Set(state.stems.map((s) => s.target))
  const indexOf = (mark: string | undefined) => state.sections.findIndex((s) => s.mark === mark)

  useEffect(() => {
    rows.current.get(m.selected)?.scrollIntoView({ block: 'nearest' })
  }, [m.selected])

  if (!rail) return <aside className="rail muted">The score lines could not be read.</aside>

  const selectSection = (index: number) => {
    m.select(index)
    m.player?.seek(state.sections[index].start)
  }

  const press = (field: Field) => {
    if (field.kind === 'mix') return onOpenStrip(field.target)
    if (field.kind === 'loudness') {
      const index = indexOf(field.mark)
      m.select(index)
      if ((edits.loudness[field.mark] ?? null) === null) m.edit({ ...edits, loudness: { ...edits.loudness, [field.mark]: defaultTarget(m, index) } })
      return
    }
    setOpen(open && keyOf(open) === keyOf(field) ? null : field)
  }

  const token = (t: Token, i: number) => {
    if (!t.field || (t.field.kind === 'mix' && !stems.has(t.field.target))) return <span key={i} className={t.faint ? 'faint' : undefined}>{t.text}</span>
    const on = open !== null && keyOf(open) === keyOf(t.field)
    return (
      <button
        key={i}
        className={`chip${t.faint ? ' ghost' : ''}${t.changed ? ' chg' : ''}${on ? ' on' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          press(t.field!)
        }}
      >
        {t.text}
      </button>
    )
  }

  return (
    <aside className="rail mono">
      {rail.also.length > 0 && (
        <div className="also">
          <div className="also-title">Also changes</div>
          {rail.also.map((a) => (
            <div key={a.at} className="ln chg">
              <span className="no">{a.at}</span>
              <span className="txt">{a.text}</span>
            </div>
          ))}
        </div>
      )}
      {rail.lines.map((line, i) => {
        const section = line.block === 'form' && !line.head ? indexOf(line.mark) : -1
        const selected = section >= 0 && section === m.selected
        const editing = open !== null && line.tokens.some((t) => t.field && keyOf(t.field) === keyOf(open))
        const start = i > 0 && rail.lines[i - 1].block !== line.block
        return (
          <div key={line.key} className={start ? 'block-start' : undefined}>
            <div
              ref={(el) => {
                if (section < 0) return
                if (el) rows.current.set(section, el)
                else rows.current.delete(section)
              }}
              className={`ln${line.head ? ' hd' : ''}${line.changed ? ' chg' : ''}${selected || editing ? ' sel' : ''}${section >= 0 ? ' pick' : ''}`}
              onClick={section >= 0 ? () => selectSection(section) : undefined}
            >
              <span className="no">{line.at ?? ''}</span>
              <span className="txt">{line.tokens.map(token)}</span>
              {line.changed && (
                <span className="was">
                  {wasText(line)}
                  {line.changeId && (
                    <ActionIcon
                      icon={Undo2}
                      size="small"
                      title="Revert this line"
                      onClick={(e) => {
                        e.stopPropagation()
                        m.revert(line.changeId!)
                      }}
                    />
                  )}
                </span>
              )}
            </div>
            {selected && <SectionEditor m={m} index={section} />}
            {editing && open && <ControlEditor m={m} field={open} />}
          </div>
        )
      })}
    </aside>
  )
}
