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

From code: `renderOffline(text, sounds)` in Node or the browser (in Node, `loadSounds` from `plainscore-render/node` reads `sounds.json`), and `liveGraph(ctx, rendering)` from `plainscore-render/live` for a WebAudio graph that matches the offline mix.
