# plainscore-render

Renders a [plainscore](https://github.com/Innei/plainscore) `.score` to a mastered WAV: one stem per mix target from SoundFonts or sample sprites, the score's `mix`, `space` and `master`, each section brought to its `loudness` target, and a true-peak limiter. The same mix runs live in the browser.

```bash
npx plainscore-render render song.score --sounds sounds.json -o out/song --mp3
npx plainscore-render mixer song.score --sounds sounds.json
```

`render` writes `out/song.wav` (48 kHz, 24-bit), `out/song.report.json` and, when asked, `.flac`, `.mp3` and `--stems`. It prints integrated loudness, true peak, each section's target, gain and measured loudness, and any hole at a section seam.

`mixer` serves a local page to audition stems, move faders, pan, sends, the room and the master, set section targets, measure, and write the changes back into the score. It shows the diff first and touches only those lines.

`sounds.json` maps each instrument (or `instrument articulation`) to a sound, with paths relative to the file:

```json
{
  "piano": { "soundfont": "./sounds/MuseScore_General.sf3", "credit": "MuseScore_General.sf3 (MIT) …" },
  "harp": { "samples": "./sounds/harp.mp3", "sprite": { "C4": [0, 3], "G4": [3, 3] }, "release": 0.4 }
}
```

[`sounds/sounds.json`](sounds/sounds.json) is a ready set: Salamander Grand Piano (CC BY 3.0) and VSCO 2 CE strings and harp (CC0), the sounds the site plays. `node scripts/bake-samples.ts <dir>` rebuilds it from the source WAVs and `sprites.json`.

From code: `renderOffline(text, sounds)` in Node or the browser (in Node, `loadSounds` from `plainscore-render/node` reads `sounds.json`), and `liveGraph(ctx, rendering)` from `plainscore-render/live` for a WebAudio graph that matches the offline mix.

## The mixer on the web

The same page also builds as a static site that renders in the browser: drop in a `.score`, or open an example, and mix it with the samples in [`sounds/`](sounds/); MuseScore_General.sf3 is fetched only for instruments they don't cover. Nothing is uploaded.

```bash
pnpm -C packages/render site:assets   # copies the samples and examples into site-public/ and downloads MuseScore_General.sf3 (40 MB)
pnpm -C packages/render dev:site      # or build:site, which writes site/
```

`.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main`. The site saves by download, or in place in Chrome and Edge, and exports WAV only.
