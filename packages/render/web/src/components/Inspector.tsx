import { Segmented } from '@lobehub/ui'
import { useEffect } from 'react'
import type { Tab } from '../store.ts'
import type { Mixer } from '../useMixer.ts'
import { ChangesTab } from './ChangesTab.tsx'
import { MixTab } from './MixTab.tsx'
import { SectionTab } from './SectionTab.tsx'
import { MasterTab, SpaceTab } from './SpaceMasterTabs.tsx'

const TABS: [Tab, string][] = [
  ['section', 'Section'],
  ['mix', 'Mix'],
  ['space', 'Space'],
  ['master', 'Master'],
]

export const Inspector = ({ m }: { m: Mixer }) => {
  const n = m.changes.length
  const tab = m.tab === 'changes' && !n ? 'section' : m.tab
  useEffect(() => {
    if (m.tab === 'changes' && !n) m.setTab('section')
  }, [m, n])
  const options = [
    ...TABS.map(([value, label]) => ({ value, label })),
    ...(n ? [{ value: 'changes' as Tab, label: <span className="tab-changes">Changes<span className="badge">{n}</span></span> }] : []),
  ]
  return (
    <aside className="inspector">
      <Segmented block size="small" value={tab} options={options} onChange={(v) => m.setTab(v as Tab)} />
      {tab === 'section' && <SectionTab m={m} />}
      {tab === 'mix' && <MixTab m={m} />}
      {tab === 'space' && <SpaceTab m={m} />}
      {tab === 'master' && <MasterTab m={m} />}
      {tab === 'changes' && <ChangesTab m={m} />}
    </aside>
  )
}
