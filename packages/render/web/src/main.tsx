import '@lobehub/ui/theme.css'
import '@lobehub/ui/style.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './styles.css'
import { ConfigProvider } from '@lobehub/ui'
import { motion } from 'motion/react'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { followSystemTheme } from './theme.ts'

followSystemTheme()

const Root = import.meta.env.MODE === 'site' ? lazy(() => import('./SiteApp.tsx')) : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider motion={motion}>
      <Suspense>
        <Root />
      </Suspense>
    </ConfigProvider>
  </StrictMode>,
)
