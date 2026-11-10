import { Button } from '@lobehub/ui'
import { FilePenLine } from 'lucide-react'
import type { Mixer } from '../useMixer.ts'

const plural = (n: number) => `${n} line${n === 1 ? '' : 's'}`

export const BottomBar = ({ m }: { m: Mixer }) => {
  const n = m.rail?.count ?? 0
  const numbers = m.rail?.numbers ?? []
  const file = m.state?.file.split('/').pop() ?? 'the score'
  const verb = m.capabilities.save === 'file-handle' ? 'Save' : 'Write'
  return (
    <footer className="bar">
      {n > 0 ? (
        <>
          <span className="dot" />
          <span>
            {plural(n)} changed{numbers.length > 0 && <span className="mono faint"> · {numbers.join(', ')}</span>}
          </span>
        </>
      ) : (
        <span className="faint">No changes</span>
      )}
      {m.writeError && <span className="bar-error">{m.writeError}</span>}
      <span className="grow" />
      <Button type="text" disabled={!m.dirty} onClick={m.revertAll}>
        Revert all
      </Button>
      <Button className="ps-primary" icon={FilePenLine} disabled={!m.dirty} loading={m.writing} onClick={() => void m.write()}>
        {m.capabilities.save === 'download' ? `Download ${file}` : `${verb} ${n > 0 ? `${plural(n)} to` : 'to'} ${file}`}
      </Button>
    </footer>
  )
}
