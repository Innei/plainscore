import { ActionIcon, Alert, Button } from '@lobehub/ui'
import { FilePenLine, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type DiffLine, api } from '../api.ts'
import { onlyChange } from '../lib/changes.ts'
import { elide } from '../lib/elide.ts'
import { fmt } from '../lib/format.ts'
import type { Mixer } from '../useMixer.ts'

const useCardDiffs = (m: Mixer) => {
  const [diffs, setDiffs] = useState<Record<string, DiffLine[]>>({})
  const { state, edits, changes } = m
  useEffect(() => {
    if (!state || !edits) return
    let alive = true
    const timer = setTimeout(async () => {
      const entries = await Promise.all(
        changes.map(async (c) => [c.id, (await api.diff(onlyChange(state, edits, c.id))).lines.filter((l) => l.kind !== 'same')] as const),
      ).catch(() => null)
      if (alive && entries) setDiffs(Object.fromEntries(entries))
    }, 200)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [state, edits, changes])
  return diffs
}

const Lines = ({ lines }: { lines: DiffLine[] | undefined }) => {
  if (!lines) return <div className="diff mono faint">…</div>
  const del = lines.filter((l) => l.kind === 'del')
  const add = lines.filter((l) => l.kind === 'add')
  const rows = Array.from({ length: Math.max(del.length, add.length) }, (_, i) => {
    const [d, a] = elide(del[i]?.line ?? '', add[i]?.line ?? '')
    return { d: del[i] ? d : null, a: add[i] ? a : null }
  })
  return (
    <div className="diff mono">
      {rows.map((r, i) => (
        <div key={i}>
          {r.d !== null && <div className="del">− {r.d}</div>}
          {r.a !== null && <div className="add">+ {r.a}</div>}
        </div>
      ))}
    </div>
  )
}

export const ChangesTab = ({ m }: { m: Mixer }) => {
  const diffs = useCardDiffs(m)
  const n = m.changes.length
  const file = m.state!.file.split('/').pop()
  const r = m.view!.report
  return (
    <>
      <div className="h3">
        <span>
          {n} change{n === 1 ? '' : 's'} to {file}
        </span>
        <Button size="small" type="text" onClick={m.revertAll}>
          Revert all
        </Button>
      </div>
      {m.writeError && <Alert type="error" title={m.writeError} />}
      <div className="changes">
        {m.changes.map((c) => {
          const lines = diffs[c.id]
          const at = lines?.find((l) => l.kind === 'del' || l.kind === 'add')?.at
          return (
            <div key={c.id} className="change">
              <div className="change-head">
                {c.mark && <span className="mark">{c.mark}</span>}
                <span>{c.label}</span>
                {at !== undefined && <span className="where mono">line {at}</span>}
                <ActionIcon icon={Undo2} size="small" title="Revert this change" onClick={() => m.revert(c.id)} />
              </div>
              <Lines lines={lines} />
            </div>
          )
        })}
      </div>
      <div className="stats">
        <div className="stat">
          <small>Whole piece</small>
          <b className="mono">{fmt(r.integrated)}</b>
        </div>
        <div className="stat">
          <small>True peak</small>
          <b className="mono">{fmt(r.truePeak)}</b>
        </div>
        <div className="stat">
          <small>Measured</small>
          <b className="mono">{m.stale ? 'not yet' : 'up to date'}</b>
        </div>
      </div>
      <div className="aside-foot">
        <Button className="ps-primary" block icon={FilePenLine} loading={m.writing} onClick={() => void m.write()}>
          Write {n} change{n === 1 ? '' : 's'} to {file}
        </Button>
        <small>Only these lines change; comments and spacing stay.</small>
      </div>
    </>
  )
}
