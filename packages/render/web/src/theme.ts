import { setLobeTheme } from '@lobehub/ui'

export const ACCENT = '#6cc3a8'

export const followSystemTheme = () => {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => setLobeTheme({ appearance: query.matches ? 'dark' : 'light', primaryColor: ACCENT })
  apply()
  query.addEventListener('change', apply)
  return () => query.removeEventListener('change', apply)
}
