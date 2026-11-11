# The site plays the resume samples

Date: 2026-11-11. Builds on [2026-11-11-web-mixer-design.md](./2026-11-11-web-mixer-design.md).

## Intent

The site's bundled 来路 (`examples/road.score`) should sound like the same piece rendered for the resume site (`~/git/innei-repo/resume/tools/bgm-album/render.ts`). The score is byte-identical between the two repos; the difference is the sound source. The site plays every instrument from `MuseScore_General.sf3` (General MIDI), the resume from Salamander Grand Piano and VSCO 2 CE samples with per-note calibration. The GM strings are dull and slow, so they sound buried even where they measure louder than the resume's. No `mix` value fixes a timbre gap.

## What was measured before this design

Every number below comes from a session on 2026-11-11. The scratch scripts lived in `/tmp/ps-probe/` and may be gone; the method is restated here so it can be rerun.

- **Reference.** The resume master is `resume/.ryugi/artifacts/html/road-master-ab/source/来路.wav`, with `manifest.json` beside it: −15.5 LUFS, true peak −1.4 dBTP, 239.8 s. Its sections start 0.8 s later than plainscore's, because the resume adds a 0.8 s lead-in.
- **Per-instrument reference.** Take a copy of `resume/tools/bgm-album/render.ts`, have it write each `stems` entry to a WAV right after `album.notes.forEach(renderNote)`, and exit. This gives the dry piano, cello, violins, harp and pizz stems.
- **The plainscore side.** Render with `renderStems`, apply each stem's `mix` gain and pan (`settingOf` + `panStereo`), then sum by instrument, with pizz counted on its own. Measure integrated LUFS per section window with `ffmpeg -ss/-to … -af ebur128`.
- **Result with the GM sf3.** Measured against the piano, the sf3 violins sit 3–10 dB louder than the resume's and the sf3 cello about 10 dB louder. No single offset per instrument fits every section.
- **Spike with the baked samples.** Take the resume's `assets/bgm/{piano,cello,violins,harp,pizz}.wav` and `sprites.json`. Apply the resume's calibration (below) to each sprite region, write the result, and render through the existing plainscore sampler. Every instrument then lands within 1.1 dB of the resume in every section. The cello runs about +0.8 dB hot and the harp about +1.0 dB. The finished render measures −15.5 LUFS with LRA 6.8 LU.

## Goals

1. A site visitor opening any bundled example hears the resume's samples for `piano`, `violins`, `cello`, `harp` and `violins pizz.`.
2. `plainscore-render` on the command line can use the same files and the same envelope numbers. The CLI and the site render 来路 the same way.
3. The first visit downloads about 3.3 MB of sounds instead of 38 MB. The sf3 downloads only when a score uses an instrument the samples don't cover.
4. In `examples/road.score`, each instrument sits within 1.5 dB of the resume reference in every section where both sound (method above).

## Non-goals

- Changing the sampler (interpolation, release curve, piano pedal). The resume uses cubic interpolation and a release time constant of `release/3.5`; the plainscore sampler uses linear interpolation and `release/4`. The spike already met goal 4 with these differences.
- Matching what the score format can't say: the resume's bus compressor, M/S widening, wet level that changes over time, and its 110 Hz / 330 Hz EQ bands.
- Retuning `ma.score` or `bgm.score` for the new sounds. See "Check these".
- Loading a visitor's own sounds on the site.

## Anti-goals

- The site still requests only its own static files. No fetching from the resume's domain at runtime.
- The worker still does all rendering, measuring and encoding. The main thread may decode audio files, because `decodeAudioData` is not available in workers.
- No second sampler and no calibration code in the renderer. Calibration happens once, offline, and is written into the files.

## Constraints

- Every existing test keeps passing, `fixtures/*` included.
- Project rules: at most 500 lines per file, no comments unless something is unexpected.
- Licences: Salamander Grand Piano is CC BY 3.0 and needs attribution; VSCO 2 CE is CC0. Each sound's `credit` carries the attribution, so it appears in the report's `sounds:` lines and on the mixer's "Sounds:" credit (`Board.tsx:100`).

## The how, as decided

### The sound files

- **Source.** `resume/assets/bgm/{piano,cello,violins,harp,pizz}.wav` (44.1 kHz, 16-bit, stereo) plus `sprites.json`.
- **Baking.** A script in `packages/render/scripts/` takes the resume `assets/bgm` directory as an argument and writes the baked files. It is run once by hand; its output is committed. For each sprite region `[offset, offset + duration)`, it multiplies the samples by:
  - the instrument's trim: piano 0.62, cello 1.6, violins 2, harp 2.4, pizz 2;
  - for cello, violins and harp, a calibration gain of `clamp(target − rmsDb(region), ±clamp)`, where rmsDb averages over both channels. The targets: cello −32.5 dB ±3, violins −36 dB ±4, harp −41 dB ±6.

  If any baked sample would peak above 0.89, every instrument shares one gain that brings it back to 0.89, so the balance between instruments holds. In the spike the peak was 0.585, so no shared gain was needed. These numbers come from `resume/tools/bgm-album/render.ts` (`CALIBRATION`, `INST.trim`).
- **Format.** MP3, 160 kbps, stereo, encoded with ffmpeg: about 3.3 MB in total. `sprites.json` is copied unchanged. The pizz sprite keys map to the sound `violins pizz.`.
- **Matching.** The site's manifest is keyed by instrument family (`piano`, `violins`, `cello`, `harp`, and `violins pizz.` for the violins family with the `pizz.` articulation). The site loader maps each of a score's instruments to the entry for its family, and builds `Sounds` keyed by the score's own instrument names, so `resolveSound` stays unchanged. A score that writes `strings  violins` gets the violin samples. When a score uses an articulation the manifest lacks for that family (for example `cello pizz.`), the loader adds an sf3 entry under that exact key (`cello pizz.`). The sf3 then plays it through `ARTICULATION_PROGRAMS`, because `resolveSound` only swaps presets when the base sound is a soundfont. Any sf3 entry means the sf3 gets downloaded. The CLI keeps its name-keyed `sounds.json`; the bundled examples use family names as instrument names, so both resolve the same way. *(my call, from the builder check)*
- **Where.** Committed under `packages/render/sounds/` (not in the npm `files`), together with a `sounds.json` in the existing CLI format (`samples`, `sprite`, `attack`, `release`, `sustain`, `credit`). The envelope values:

  | sound | attack | release | sustain |
  |---|---|---|---|
  | piano | 0.003 | 1.6 | no |
  | cello | 0.35 | 2.4 | yes |
  | violins | 0.55 | 2.8 | yes |
  | harp | 0.003 | 2.6 | no |
  | violins pizz. | 0.003 | 0.8 | no |

  This `sounds.json` is the single source of truth for these numbers. The CLI reads it directly (`--sounds packages/render/sounds/sounds.json`); the site reads the copy that `scripts/fetch-sounds.mjs` places in `site-public/sounds/`.

### The site

- `scripts/fetch-sounds.mjs` copies `packages/render/sounds/*` into `site-public/sounds/`, next to the sf3 it already fetches. The Pages workflow is unchanged apart from the cache key, which must also cover the new files.
- **Loading** (the boundary is decided; the code shape is left to the builder):
  - The main thread reads `sounds/sounds.json`.
  - It fetches the MP3s the score's instruments need, through the Cache API (new cache name), and reports progress as the existing `{ stage: 'sounds' }`, with bytes summed over the files.
  - It decodes them with an `OfflineAudioContext` at 48 kHz (`RATE`), so the sampler needs no resampling ratio beyond pitch.
  - It hands the decoded channels and envelope values to the worker in the `open` request, as transferables.
  - The worker builds `SampleSource`s from them. It fetches the sf3 only for instruments the manifest doesn't cover.
- The landing page's "about 40 MB" text and `packages/render/README.md:27` (which names MuseScore_General) follow the new sizes and sound names.

### The score

`examples/road.score` keeps the 0.3 blocks added in this session: section `loudness` targets measured from the resume master, instrument `mix` rows (`cello −8`, `violins −13`, `harp −6`, `pizz +19` over the violins), `space`, `master` and `perform off`. These instrument rows are the resume's `SITE_DB`, and they are only right because the trim and calibration are baked into the files. After the new sounds land, the builder reruns the per-instrument measurement. If cello or harp still runs about 1 dB hot, the builder trims that row by the measured median. Then `fixtures/road.events.json` is refreshed (only `gain` changes).

`examples/sounds.json` points at the baked files, so the README's `--sounds examples/sounds.json` example uses the same sounds as the site. Whether it duplicates the manifest or the README points straight at `packages/render/sounds/sounds.json` is the builder's call, as long as there is one source of truth for the envelope numbers.

## Pitch range (decided by Innei)

The samples cover narrow ranges: violins and pizz A4–B5, cello G2–A3, harp G3–D6, piano A1–A6. Several bundled pieces go outside them:

- `ma`: violins down to B3, cello up to F#4.
- `bgm` `stars`: harp up to G#7, violins up to G#6, piano down to D1.

These notes play as the nearest sample shifted in pitch, with no limit. **Accepted as is.** The resume site already plays `bgm.score` with these samples and sounds the same way. There is no range field and no fallback by range.

## Left to the builder

- The bake script's language: `.mjs`, or `.ts` run by node's type stripping, following the existing scripts.
- The `open` request's exact shape and how the engine test doubles change.
- Whether decoding shows its own progress line.
- Test design. At minimum:
  - a test that the bundled manifest covers every instrument in every bundled example;
  - a test that a score using an uncovered instrument still falls back to the sf3;
  - the existing memory-limit test still holding every bundled example under the limit.

## Check these (my calls)

- **One sound set for the whole site.** `ma.score` and `bgm.score` will also switch to the samples. `ma.score` has section loudness targets, so its sections stay at their levels, but its balance between instruments was set by ear on the sf3 and will move. `bgm.score` has no targets.
- **The samples are committed** to plainscore (about 3.3 MB of MP3), not fetched from the resume's site.
- **MP3 at 160 kbps** rather than WAV (29 MB).
- **`perform off`** in `road.score`, to match the resume's un-performed 0.1 rendering.
