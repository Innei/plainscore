import { Button } from '@lobehub/ui'
import { useState } from 'react'
import { Board } from './components/Board.tsx'
import { BottomBar } from './components/BottomBar.tsx'
import { ScoreRail } from './components/ScoreRail.tsx'
import { TopBar } from './components/TopBar.tsx'
import { axisLength } from './lib/format.ts'
import { createHttpBackend } from './backend/http.ts'
import type { MixerBackend } from './backend/types.ts'
import { useMixer } from './useMixer.ts'

export const Mixer = ({ backend }: { backend: MixerBackend }) => {
  const m = useMixer(backend)
  const [openStrip, setOpenStrip] = useState<string | null>(null)
  const length = axisLength(m.player?.length() ?? 0, m.view?.report.seconds ?? 0, m.state?.sections.at(-1)?.end ?? 0)
  const ready = m.state && m.edits && m.view
  return (
    <div className="app">
      <TopBar m={m} length={length} />
      <div className="banner">
        {m.banner && (
          <>
            <span>{m.banner.text}</span>
            {m.banner.reload && (
              <Button size="small" onClick={() => location.reload()}>
                Reload
              </Button>
            )}
          </>
        )}
      </div>
      <div className="body">
        {ready && m.curve ? <Board m={m} length={length} openStrip={openStrip} onOpenStrip={setOpenStrip} /> : <main className="board muted">{m.status}</main>}
        {ready ? <ScoreRail m={m} onOpenStrip={setOpenStrip} /> : <aside className="rail" />}
      </div>
      <BottomBar m={m} />
    </div>
  )
}

const local = createHttpBackend()

export const App = () => <Mixer backend={local} />
