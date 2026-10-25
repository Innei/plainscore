# plainscore

A plain-text score format that a musician can read without docs and an AI can edit line by line. One file holds the music; plainscore turns it into timed note events, MIDI and ABC notation.

```
score 0.1

title   Small Waltz in 4
by      You

instruments
  piano  piano
  cello  cello

piece waltz  Small Waltz
  tempo  q = 72
  key    G major

  chords verse  — bass | voicing
    G      G2 | B3 D4 G4
    D/F#   F#2 | A3 D4 F#4
    Em     E2 | B3 E4 G4
    C      C3 | C4 E4 G4

  part tune  piano  mf  overlap e  lead
    | B4 h   A4 q   G4 q | A4 w | G4 h   B4 h | C5 w |

  part comp  piano
    1    bass   w   >
    2    upper  q   soft
    3&   upper  e   softer

  part pad  cello  mp
    1    bass+8va  w

  part pedal
    1    Ped.

  form  loop
    A  verse
      tune, comp p, pad 80%, pedal
```

## What it can say

- **Pitches as written**, durations `w h q e s` with dots and ties, bars separated by `|`.
- **Chord-relative patterns**: write a figure once with `bass`, `t1`–`t4`, `top`, `upper`, and it follows the chords.
- **Form as an orchestration table**: each section row names the parts that play and how loud (`85%`, `92%-75%`, `bars 3-4`, `on 1 and 3`, `8va`, `in E`).
- **Loop**: `form loop`, or `form loop from A1` for an intro that plays once.
- **Variants**: versions of one piece that share a timeline (`drop P`, `Q for P`, `P <options>`).
- **Doubles**: `part strings violins doubles tune 8vb` plays another part's notes on its own instrument.
- **Pedal, rolls, staggered entries, ad lib.** (seeded random notes), and a **mix** block for playback balance that notation and MIDI ignore.

The full reference is [docs/grammar.md](docs/grammar.md). Every score can carry the standard legend (`plainscore legend`) so a reader never needs this README.

## Use

```bash
pnpm add -D plainscore
```

```bash
plainscore check song.score
plainscore abc song.score --piece waltz > song.abc
plainscore midi song.score --piece waltz -o song.mid
plainscore events song.score --variant quiet --seed 7 --passes 2
plainscore legend
```

```ts
import { parseScore, render } from 'plainscore'
import { toAbc } from 'plainscore/abc'
import { toMidi } from 'plainscore/midi'

const score = parseScore(text, 'song.score')
const rendering = render(score, 'waltz', { variant: null, seed: 1 })
const abc = toAbc(rendering)
const midi = toMidi(rendering)
```

`render` returns plain data: metadata, sections, key changes, every note with its onset in eighths, offset, length, level and velocity, pedal changes, and the ad lib. rules. A player only needs that.

## Notation and MIDI

Staves come from the declared instruments, in declaration order:

- each instrument gets a staff, and `pizz.` parts get their own staff right after it;
- a `lead` part on a piano gets a Melody staff on top;
- pianos get a grand staff with pedal marks, and an `inner` part becomes a voice of its own;
- clefs, MIDI programs and pedal come from the instrument's family (`piano harp violins violas cello bass flute oboe clarinet bassoon horn trumpet voice synth`).

The ABC targets [abcjs](https://www.abcjs.net/) 6.x. plainscore has no runtime dependencies and does not render; pass the ABC to abcjs, or to any ABC tool.

## Limits of 0.1

4/4 only; the smallest grid is the eighth (with `late s` for sixteenth offsets); no tuplets, ties across barlines, tempo changes, hairpins, articulations beyond `pizz.`/`arco`, repeats with endings, imports or percussion.

## Develop

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

`fixtures/` holds the expected ABC, MIDI and events for `examples/`. After an intended output change, run `pnpm test -u` and review the fixture diff.

## License

MIT
