import { useEffect, useState } from 'react'
import type { Player } from './player.ts'

export const usePlayhead = (player: Player | null) => {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!player) return
    let id = 0
    const frame = () => {
      setT(player.position())
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [player])
  return t
}
