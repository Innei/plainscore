import type { ScoreEvent } from './expand.ts'
import { ARTICULATION_PROGRAMS, type Clef, FAMILIES, RINGING_ARTICULATIONS } from './families.ts'
import type { Rendering } from './render.ts'

export interface Staff {
  id: string
  name: string
  inst: string
  articulation: string | null
  melody: boolean
  clef: Clef
  grand: boolean
  program: number
  pedal: boolean
  rings: boolean
}

const ident = (word: string) => word.replace(/[^A-Za-z0-9]/g, '')
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
const writtenArticulation = (e: Pick<ScoreEvent, 'articulation'>) => (e.articulation === 'arco' ? null : e.articulation)

export const layout = (r: Pick<Rendering, 'instruments' | 'events'>) => {
  const familyOf = (inst: string) => {
    const declared = r.instruments.find((i) => i.name === inst)
    if (!declared) throw new Error(`"${inst}" is not a declared instrument`)
    const family = FAMILIES[declared.family]
    if (!family) throw new Error(`no staff rules for the family "${declared.family}"`)
    return { name: declared.family, ...family }
  }
  const isMelody = (e: ScoreEvent) => e.lead && familyOf(e.inst).name === 'piano'
  const keyOf = (e: ScoreEvent) => (isMelody(e) ? 'melody' : `${e.inst}|${writtenArticulation(e) ?? ''}`)
  const used = new Set(r.events.map(keyOf))
  const sharing = (articulation: string) => r.instruments.filter((i) => used.has(`${i.name}|${articulation}`)).length
  const staves: (Staff & { key: string })[] = []
  const lead = r.events.find(isMelody)
  if (lead) {
    const family = familyOf(lead.inst)
    staves.push({ key: 'melody', id: 'melody', name: 'Melody', inst: lead.inst, articulation: null, melody: true, clef: 'treble', grand: false, program: family.program, pedal: family.pedal, rings: false })
  }
  for (const { name } of r.instruments) {
    const family = familyOf(name)
    if (used.has(`${name}|`)) staves.push({ key: `${name}|`, id: ident(name), name: capital(name), inst: name, articulation: null, melody: false, clef: family.clef, grand: family.grand, program: family.program, pedal: family.pedal, rings: family.rings })
    const articulations = [...new Set(r.events.filter((e) => e.inst === name && !isMelody(e)).flatMap((e) => writtenArticulation(e) ?? []))]
    for (const articulation of articulations) {
      const word = ident(articulation)
      staves.push({
        key: `${name}|${articulation}`,
        id: sharing(articulation) > 1 ? `${ident(name)}${capital(word)}` : word,
        name: `${capital(name)} ${articulation}`,
        inst: name,
        articulation,
        melody: false,
        clef: family.clef,
        grand: false,
        program: ARTICULATION_PROGRAMS[articulation] ?? family.program,
        pedal: false,
        rings: family.rings || RINGING_ARTICULATIONS.has(articulation),
      })
    }
  }
  const byKey = new Map(staves.map((s) => [s.key, s]))
  return { staves: staves.map(({ key: _, ...s }) => s as Staff), staffOf: (e: ScoreEvent) => byKey.get(keyOf(e))!.id }
}
