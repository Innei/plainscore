# Mixer on the web

Date: 2026-11-11. Approved in the document artifact `document/web-mixer` (`.ryugi/artifacts/document/web-mixer/`, link https://ryugi.innei.dev/a/qFp6erI4Y5co3U0QQDByJ). This file restates everything decided there.

Builds on the redesigned mixer page: [2026-11-11-mixer-redesign-design.md](./2026-11-11-mixer-redesign-design.md), artboard `artboard/mixer-redesign`.

## Intent

Someone without plainscore installed opens a URL, drops in a `.score`, hears the finished piece and adjusts the mix. The local mixer and the web mixer stay one codebase.

## Goals

- A static site: upload a `.score`, or open a bundled example, then the same mixer page as the local command.
- A hosted default sound set, so a score plays without any setup.
- One page, two data sources: the local command talks to its server; the site computes in the browser.
- Save the edited score: download everywhere, in place where the browser allows.
- Export WAV.

## Non-goals

Share links, a user's own SoundFont, a phone layout, offline use, MP3 and FLAC on the site.

## Anti-goals

- The score and the rendered audio never leave the browser. The site requests only its own static files and the sound file.
- The main thread never renders, measures or encodes.
- No second copy of the mixing logic: Node and the browser run the same session module.

## Constraints

- Existing tests keep passing: `packages/render/test/mixer*.test.ts` and everything under `web/src`.
- Project rules: max 500 lines per file, React components under 300, no comments unless they explain something unexpected.
- The local command's behaviour does not change.

## What the visitor sees

1. **Landing.** Drop or choose a `.score`. Below it, three examples: 間 Ma, 来路 The Road Behind, bgm. A short line says the score is processed in the browser and never uploaded.
2. **Choosing.** One piece: go straight in. Several: choose one. A piece with variants (bgm has `overview`, `browse`, `read`): choose a variant after the piece; the default is the piece without a variant. A score that does not parse shows the parser's line and reason on the landing page.
3. **Preparing.** Progress in order: downloading sounds (about 40 MB the first time, cached after), rendering each stem, measuring. Then the mixer.
4. **Mixing.** Identical to the local page.
5. **Saving.** In Chrome and Edge, when the file was opened by choosing or dropping it, the bottom-bar button reads `Save N lines to <file>` and writes in place. Otherwise it reads `Download <file>`. Examples can only be downloaded.
6. **Exporting.** The Export menu has WAV only; the file downloads when rendered.
7. **Leaving.** The top bar has "Open another score", which returns to the landing page by reloading; the browser's unsaved-changes prompt guards it.

## Decisions

| Decision | Whose |
| --- | --- |
| Upload-a-score web version | theirs |
| Hosted default sounds | theirs |
| One page, two data sources | accepted recommendation |
| GitHub Pages, published by Actions | theirs |
| MuseScore_General.sf3 (39.9 MB, MIT) | accepted recommendation |
| Download, plus in-place save on Chromium | accepted recommendation |
| WAV only | accepted recommendation |
| Three bundled examples | accepted recommendation |
| Audience: people trying it without the tool, and the author on another machine; no share links | designer's guess, question left unanswered |
| URL `plainscore.innei.dev`, served from the root path | theirs, after the first deploy |
| The sound file is not committed; the deploy workflow downloads it, verifies a pinned SHA-256 and caches it | designer |
| After Download, the downloaded text is the new baseline and the change count returns to zero | designer |
| Before an in-place save, re-read the file through its handle; if it changed since it was loaded, refuse and offer to reload it | designer |
| Variants are selectable on the landing page | designer |
| "Open another score" reloads the page | designer |
| A piece whose estimated memory exceeds 2.5 GB is refused before rendering, with the reason. First set at 1.5 GB, which refused the bundled `road.score` (4 minutes, 9 stems, about 1.66 GB) | designer |
| Speed floor, on `ma.score`: if one measure takes over 30 s in the browser, the site turns automatic measuring off and measures on click; if preparing (excluding the sound download) takes over 2 minutes, stop and ask | designer |

## Structure

```
Mixer page + landing ──> MixerBackend
                           ├─ httpBackend ──> Node server (mixer.ts) ──┐
                           └─ workerBackend ─postMessage─> Worker ─────┤
                                                                       v
                                                                    session
                                                  (renderStems / masterStems / rewriteScore)
```

### session (`packages/render/src/session.ts`)

No Node imports. Created from the score text, file name, piece id, variant and `Sounds`. The logic moves as-is from `src/node/mixer.ts` (`load`, `overridesOf`, `describe`).

- `describe()`: the object `/api/state` returns today, minus `file` (the host adds it).
- `measure(edits)`: `{ report, curve }`.
- `rewrite(edits)`: the new score text, checked with `checkScore`.
- `apply(text)`: reload from new text and bump the version, keeping the rendered stems when asked (as `load(text, version, keepStems)` does after a write).
- `master(edits)`: `{ audio, report, curve }` for export.
- `stems`, `version`, `text`.

### Node server (`src/node/mixer.ts`)

Keeps HTTP, reading and writing the file, the 409 check, the file watcher, SSE, ffmpeg and stem WAV encoding. Everything else calls the session. Its routes and responses are unchanged.

### MixerBackend (`web/src/backend/`)

Replaces `web/src/api.ts`. The page depends only on this interface.

- `state()`, `measure(edits)`, `save(edits, version)` returning the new state, `exportAudio(edits, formats)` returning what to show in the menu, `stemAudio(index, ctx)` returning an `AudioBuffer`, `onEvent(listener)` for changed/ready/failed.
- `capabilities`: `formats` (which export formats to offer), `save` (`'write' | 'file-handle' | 'download'`), `autoMeasure` (boolean), `reopen` (boolean, shows "Open another score").

The backend is chosen by build mode and is a singleton for the page's lifetime: one page, one score. Switching scores reloads.

- **httpBackend**: today's fetch calls and EventSource. `save: 'write'`, all three formats, `autoMeasure: true`, `reopen: false`.
- **workerBackend**: talks to the Worker. Stems arrive as Float32 channel data and become `AudioBuffer`s directly, with no WAV round trip. Saving and downloading happen on the main thread (File System Access API, Blob download). `formats: ['wav']`, `reopen: true`.

### Worker

Holds the session. Fetches the sound file with progress and keeps it in Cache Storage. Every instrument the score uses maps to that one SoundFont; the program comes from `FAMILIES` in the core package, as it does today when `sounds.json` names a SoundFont. Credits come from the SoundFont's own info, as today.

Before rendering it estimates memory from duration × stems and refuses above 2.5 GB. Reference points: 4 minutes × 4 stems is about 750 MB; 4 minutes × 13 stems is the most that passes. Every bundled example must pass, and a test holds that.

### Landing (`web/src/components/Landing.tsx`)

Only in the site build. Drop zone, file picker (using `showOpenFilePicker` when present so a handle is kept; a dropped file's handle via `getAsFileSystemHandle` when present), examples, piece and variant choice, parse errors, preparation progress. Uses the page's tokens, IBM Plex and the boxed rehearsal mark.

## Build and deploy

- One source, two outputs. `vite build` still writes `mixer/` with the httpBackend. `vite build --mode site` writes `site/` with the workerBackend, served from the root of `plainscore.innei.dev`.
- `.github/workflows/pages.yml`: on push to `main`, build `site/`, copy `examples/*.score` in, download the sound file, verify its SHA-256, cache it, and deploy with the official Pages actions.
- The repository's Pages source must be set to "GitHub Actions" once, by the owner, in the repository settings.

## Left to the builder

- The Worker message protocol and the granularity of progress events.
- How the session module is split internally.
- The landing page's exact layout.
- The memory estimate's formula, within the reference points above.
- Test organisation. Required: the session has unit tests under Node; both backends pass one shared contract suite (the worker backend may be tested through its handler functions without a real Worker).

## Sources

- MuseScore_General.sf3: MIT-licensed per the MuseScore handbook. The file at https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3 is 39,900,972 bytes (the handbook's 35.9 MB describes an older build).
- GitHub Pages limits: soft bandwidth limit of 100 GB per month (about 2,500 first visits at 40 MB), sites up to 1 GB.
