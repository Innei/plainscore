# score 0.2 grammar

A `score 0.1` file still reads and renders exactly as before. Everything marked **0.2** below needs `score 0.2` on the first line.

A score is a UTF-8 text file. Indentation carries structure: file-level lines start at column 0, a piece's blocks at 2 spaces, block rows at 4, and form entries deeper than 4. Lines starting with `#` are comments. Anything after ` — ` (an em dash between spaces) on a line is a note to the reader and is ignored.

## File

```
score 0.2                       the first line, always (or score 0.1)

title   Small Waltz             optional, file-wide
by      You                     optional; written as "Music by You"
after   A song I love           optional; written as "After A song I love"

instruments
  piano    piano                <name>  <family>
  strings  violins

piece waltz  Small Waltz        <id>  <title>; a file can hold several pieces
  …
```

- Families: `piano harp violins violas cello bass flute oboe clarinet bassoon horn trumpet voice synth`. The family sets the clef, MIDI program, pedal and how notes are engraved. The instrument name is yours.
- Instrument names and part names must differ.

## Piece header

```
  meter   4/4          only 4/4 in 0.1
  tempo   q = 80
  key     D major      major minor dorian lydian mixolydian
```

## Pitches, durations, counts

- Pitches sound as written: `C4` is middle C, `F#5`, `Bb3`.
- Durations: `w h q e s` (whole to sixteenth), `.` dotted (`q.`), `+` ties (`w+s`, `h+q`).
- `r` is a rest in bar lines.
- Counts are beats and ands: `1 1& 2 2& 3 3& 4 4&`. `2.3&` means bar 2, the and of 3.
- **0.2** Sixteenths: `1e 1& 1a`, so `2.3a` is the last sixteenth of beat 3 in bar 2.

## Chords

```
  chords theme  — bass | voicing
    D        D2  | D4 F#4 A4
    A/C#     C#2 | C#4 E4 A4
    D                              a symbol alone reuses its last voicing

  chords stars  two bars each      one … four, or a number
    Dmaj9(#11)  D2 | D3 A3 F#4 C#5 E5 G#5
```

A section is as long as the chord set it names.

**0.2** A chord row may end with its length. Once any row in a set has one, rows without it last a bar (or the set's `two bars each`), the set must add up to whole bars, and cue parts repeat every bar, taking their chord tones from the chord sounding at each count.

```
  chords push
    G        h
    G/F#     F#2 | B3 D4 G4   h
    Em7      w
```

## Parts

Every part has a name and, unless each cue names one, an instrument. Header words, in any order:

| word | meaning |
|---|---|
| `piano`, `violins pizz.` | the instrument, optionally with `pizz.` or `arco` |
| `p`, `mf` … | the part's dynamic |
| `overlap e` | each note rings an eighth past its value |
| `ring w` | each note rings for a whole note |
| `once` | counts are within the section (`3.2&`), not repeated per chord |
| `lead` | the tune: breaths leave it ringing; on a piano it gets the Melody staff |
| `inner` | engraved as a voice of its own on its staff |
| `doubles P [8vb]` | plays part P's notes on this part's instrument |
| `ad lib.` | random notes from rules (below) |

### Bars

```
  part tune  piano  mf  overlap e  lead
    | F#5 h   E5 q   D5 q  | E5 h.   A4 q  |
    | mp D6 h   B5 q   D6 q | … |               a dynamic before a note applies from there
    | mp < C5 q  D5 q  E5 q  F5 q | mf G5 w |    0.2: "<" swells to the next dynamic, ">" fades
```

Each bar must add up to a whole note.

### Cues

One line per entry: `<count> [instrument] <pitches> <duration> [options]`. A cue part repeats with every chord.

```
  part flow  piano
    1     bass        w   >
    1&    fifth       q.  soft
    2&    t2          q.  soft  late s
    1     chord       h   soft  roll 30ms
    1     cello  bass+8va  w+s  f
```

- Chord tones:
  - `bass`; `t1`–`t4` / `v1`–`v6` are voicing tones from low to high; `top` is the highest.
  - `chord` is all of them; `upper` is all but the lowest.
  - `fifth` is the chord tone nearest a fifth above the bass.
- Shifts: `+5th` (a perfect fifth up, in the chord or not), `+8va`, `+15ma`, `+8vb`, `+15mb`.
- Options:
  - A dynamic, or a rising roll such as `ppp-mf`.
  - `>` accent, `soft`, `softer`.
  - `roll X`: the notes enter X apart.
  - `late X`: enters X after the count.
  - X is a duration or a time in ms (`30ms`).
- Pedal: `1  Ped.` presses or changes the sustain pedal; `4&  *` lifts it.

### Ad lib.

```
  part sparkle  harp  ad lib.
    chance   22%
    notes    D lydian, D6 to C#7, 8va 30% of the time
    dynamic  pppp-pp
    length   h.
    timing   anywhere within the eighth        or sixteenth, quarter
    avoid    quote                             optional: skip eighths where this part plays
```

## Dynamics

`pppp .10  ppp .16  pp .22  p .32  mp .42  mf .50  f .55`. Accent adds .08, `soft` takes away .07 and `softer` takes away .14.

## Form

```
  form  loop from A1
    Intro  prelude  — 序
      wash mp, stream p 85%, drone pp 85% bars 1-2, pedal, breath
    A1  theme
      flow p 85%, theme 85%, pedal
    A5  theme in E
      flow mp, theme f 8va, pedal
```

- Header:
  - `form`: plays once.
  - `form loop`: repeats from the top.
  - `form loop from A1`: plays through, then repeats from A1.
- Each row is `<mark> <chord set> [in <key>]`, then the parts that play, comma-separated.
- A part not named in a row is silent there. Every part must play somewhere.
- Part options:
  - A dynamic.
  - `85%` shades the part; `92%-75%` shades it bar by bar.
  - `bars 3-4`.
  - `on 1 and 3`: only notes that start on those beats.
  - A shift: `8va`, `8vb`.
- **0.2** Hairpins: `mp>p` fades a part across the row (or its `bars`), `p<mf` swells it; add `from 7.1` to hold the first dynamic until that count.
- **0.2** Tempo, as items of the row:
  - `rit. from 7.3 to q = 66` and `accel. from 5.1 to q = 96` ramp from the count to the end of the row; the new tempo holds after it.
  - `a tempo` goes back to the piece's tempo at the start of the row.
  - `fermata 8.3` holds that count until the next note starts, at half speed.
- `breath`: every part but `lead` and `once` parts stops for the last eighth.
- `cut`: whatever still rings stops at the downbeat.
- Both also lift the pedal.

## Variants

```
  variants
    overview
    browse   drop stream
    read     drop stream, sparse for flow, melody on 1 and 3
```

The first variant plays the form as written. The others edit every form row:

- `drop P`: P is silent everywhere.
- `Q for P`: Q plays wherever P was named, with P's options.
- `P <options>`: adds options to P wherever it plays.

All variants share one timeline.

## Mix

```
  mix  — playback only; notation and MIDI ignore it
    violin-theme   +13 dB  attack 200ms
    piano          75%
```

Rows name a part or an instrument.

## Perform

**0.2** How a pianist would play it: on by default in a `score 0.2` piece, used by `render(…, { perform: true })`, `plainscore midi --perform` and players that call `perform()`. The sheet and the plain MIDI ignore it.

```
  perform  — or "perform off"
    lead     ahead 18ms      the tune lands a little before the accompaniment
    phrase   2 bars          the span of each tempo and loudness arc, counted from each section
    rubato   4%              presses on through the phrase, broadens into its end
    accents  6%              beat 1 strongest, then 3; off-beats lighter
    swell    10%             each phrase grows toward its middle
    spread   8ms             notes struck together enter from the bass up
    jitter   5ms             a little unplanned looseness, the same on every render
```

Any row can be `off`.

## Errors

Every error names the file and line, and says what to write instead:

```
song.score line 18: "+3" is mixing; put it in the piece's mix block
```
