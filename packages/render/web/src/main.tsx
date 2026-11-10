import '@lobehub/ui/theme.css'
import '@lobehub/ui/style.css'
import './styles.css'
import { ConfigProvider } from '@lobehub/ui'
import { motion } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { followSystemTheme } from './theme.ts'

followSystemTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider motion={motion}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)
