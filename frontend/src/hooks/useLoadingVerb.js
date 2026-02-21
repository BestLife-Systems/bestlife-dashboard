import { useState, useEffect } from 'react'

const VERBS = [
  'pontificating',
  'bamboozling',
  'conjuring',
  'rummaging',
  'wrangling',
  'scheming',
  'calibrating',
  'noodling',
  'percolating',
  'manifesting',
  'triangulating',
  'deliberating',
]

let verbIndex = 0

export function useLoadingVerb(active = true, intervalMs = 800) {
  const [verb, setVerb] = useState(VERBS[verbIndex % VERBS.length])

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      verbIndex = (verbIndex + 1) % VERBS.length
      setVerb(VERBS[verbIndex])
    }, intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])

  return verb
}
