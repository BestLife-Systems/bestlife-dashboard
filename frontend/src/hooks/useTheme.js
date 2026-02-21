import { useState, useEffect } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('bl-theme') || 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('bl-theme', theme)
    } catch {}
  }, [theme])

  // Also set on initial mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark')

  return { theme, toggleTheme }
}
