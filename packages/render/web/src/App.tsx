import { Button } from '@lobehub/ui'
import { Board } from './components/Board.tsx'
import { Header } from './components/Header.tsx'
import { Inspector } from './components/Inspector.tsx'
import { Transport } from './components/Transport.tsx'
import { axisLength } from './lib/format.ts'
import { useMixer } from './useMixer.ts'

export const App = () => {
  const m = useMixer()
  const length = axisLength(m.player?.length() ?? 0, m.view?.report.seconds ?? 0, m.state?.sections.at(-1)?.end ?? 0)
  return (
    <div className="app">
      <Header m={m} />
      <Transport m={m} length={length} />
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
        {m.state && m.edits && m.view && m.curve ? <Board m={m} length={length} /> : <main className="board muted">{m.status}</main>}
        {m.state && m.edits && m.view ? <Inspector m={m} /> : <aside className="inspector" />}
      </div>
    </div>
  )
}
