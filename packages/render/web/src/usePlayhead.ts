import { useEffect, useState } from 'react'
import { sectionAt } from './lib/position.ts'
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

export const usePlayingSection = (player: Player | null, sections: { start: number }[]) => {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!player) return
    let id = 0
    const frame = () => {
      setIndex(sectionAt(sections, player.position()))
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [player, sections])
  return index
}
