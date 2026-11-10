export const sectionAt = (sections: { start: number }[], t: number) => Math.max(0, sections.findLastIndex((s) => s.start <= t + 1e-6))

export const playPosition = ({ elapsed, loop, length }: { elapsed: number; loop: { start: number; end: number } | null; length: number }) => {
  if (!loop) return Math.min(elapsed, length)
  const span = loop.end - loop.start
  return elapsed < loop.end || span <= 0 ? elapsed : loop.start + ((elapsed - loop.start) % span)
}
