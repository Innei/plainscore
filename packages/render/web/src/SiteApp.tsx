import { useState } from 'react'
import { Mixer } from './App.tsx'
import type { MixerBackend } from './backend/types.ts'
import { Landing } from './components/Landing.tsx'

const SiteApp = () => {
  const [backend, setBackend] = useState<MixerBackend | null>(null)
  return backend ? <Mixer backend={backend} /> : <Landing onReady={setBackend} />
}

export default SiteApp
