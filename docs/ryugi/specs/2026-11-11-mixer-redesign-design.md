# Mixer page redesign

Date: 2026-11-11. Scope: `packages/render/web` only (the page served by `plainscore-render mixer`).

Reference mockup of the chosen design: [2026-11-11-mixer-redesign.png](./2026-11-11-mixer-redesign.png). It is a static drawing; where it and this text disagree, the text wins.

## Intent

The mixer page was rebuilt on 2026-11-10 around a loudness map with a tabbed inspector. Using it showed four problems:

1. Section targets, the main thing the page exists to set, are typed into a side panel instead of set on the map that displays them.
2. Level sliders live in two tabs (Section and Mix), and mute/solo in two places (lane labels and Mix rows).
3. Pan and send hide behind an expand in the Mix tab, far from the lane they belong to.
4. Writing to the score, the only way anything is kept, hides in a Changes tab that appears only once something changed.

The redesign puts each control where its effect is shown, and shows the score's own lines as the place where room, master and target values are read and edited, so what will be written is always on screen.

## Direction

- **Product:** a composer balances a rendered `.score`: sets each section's loudness, the parts' levels, the room and the master, then writes those lines back to the file.
- **Character:** exact, quiet, text-native.
- **World:** a plain-text score and its rehearsal marks; metering instruments.
- **Moments:** the loudness map, and the score lines that will be written.
- **Signature:** the boxed rehearsal mark (`.mark`), already in the page. Keep it.

## Goals

- Drag a section's target on the map.
- One strip per stem, on its lane, holding level, pan, send, mute and solo.
- No tabs. Everything that can be edited is visible or one click away.
- The right rail shows the real score lines for `form`, `mix`, `space` and `master`, with their values as the controls.
- Pending changes and the Write button are always in one bar at the bottom.
- A top bar whose transport sits on the true centre line.
- IBM Plex Sans and IBM Plex Mono throughout, bundled with the page.

## Non-goals

- No change to the server (`src/node/mixer.ts`), its API, the DSP, or the score grammar. Everything needed is already in `/api/state`.
- No phone or tablet layout.
- No new features beyond what the current page does (measure, export, write, audition, seam warnings, credits, reload banner all stay).

## Anti-goals

- Do not show the same control twice.
- Do not invent score text. Every numbered line in the rail is what `rewriteScore` produces, never a hand-formatted approximation. Ghosts (below) are the one exception: they are placeholders for text that does not exist yet, carry no line number, and are formatted in the web code.

## Constraints

- React 19, Vite, `@lobehub/ui`, `lucide-react`, as now. Keep the `--ps-*` tokens in `styles.css` and both light and dark themes; the mockups drew dark only.
- Existing project rules: max 500 lines per file, React components under 300, no comments or JSDoc unless they explain something unexpected.
- `packages/render/test/mixer-page.test.ts` builds the page with Vite and must keep passing, as must the existing `web/src/lib/*.test.ts` and `store.test.ts` (updated where the store changes).
- The page must work offline: fonts are bundled, not loaded from a CDN.
- Nothing clipped or overlapping at 1280 px wide and at 1440 px wide.

## Layout

Three rows: top bar (52 px), body, bottom bar (52 px). The reload/error banner keeps its place between the top bar and the body and stays hidden when empty.

The body is two columns: the board (fluid) and the score rail (576 px at 1440; the builder may narrow it down to 480 px on smaller windows as long as the longest `space` line still fits or wraps cleanly).

### Top bar

A three-column grid, `1fr auto 1fr`, so the middle column is centred on the window whatever the side columns hold.

- Left: piece title (`pieceTitle`), then the file path as a mono tag, truncating with an ellipsis.
- Centre: play/pause (28 px filled circle), clock `current / total`, and a two-option segmented control: "Whole piece" and "Loop {mark}". The player keeps its current behaviour and loops the section under the playhead, so `{mark}` is that section, not the selected one; the label follows the playhead.
- Right, aligned to the end: the measure status, then the Export dropdown (unchanged behaviour).

The `score 0.3` tag is removed from the bar.

### Board

A grid with a 224 px gutter and a fluid lane column, used by every row so the ruler, map and lanes line up.

1. **Ruler** (gutter empty): one cell per section with its mark, key-change tint, seam ticks. Click selects the section and seeks to its start. Unchanged.
2. **Map** (360 px tall at 900 px window height; may flex). In the gutter, top to bottom: the label "Loudness, LUFS"; the meter block; the legend ("target — drag to set", "measured, 3 s", "as written").
   - Meter block: five rows, label left and value right in mono: Whole piece (LUFS), Range (LU), True peak (dBTP), Limited (dB), Master gain (dB). These replace the readout that was in the transport bar.
   - Map contents as now: section columns with compensation at the top, grid lines, master line, the measured curve, the target steps, the dashed "as written" step for any section whose target changed, playhead, hover probe.
   - **Dragging a target:** each section that has a target gets a drag handle on its step. The handle is a chip showing the value (`↕ −13.0`), visible on the selected section and on hover of any other. The hit area is the step line ±8 px across the section's width. Dragging moves the target in 0.5 LUFS steps, clamped to the map's visible range; pointer capture, so the drag survives leaving the map. A press that starts on a handle never seeks; a click anywhere else on the map selects the section under it and seeks, as now. The handle is focusable; Up and Down move it by 0.5.
   - A section with no target has no handle. Its target is added from its line in the rail.
3. **Lanes:** one row per stem. The gutter holds the strip; the lane column holds the sounding spans and the playhead.
   - Strip, collapsed (40 px): stem name (for a part, its instruments in small faint text), M and S, the level slider, the value in dB. A thin live meter belongs in the strip; where exactly is the builder's call.
   - Clicking the name expands the strip to show Pan and Send sliders under the level. One strip open at a time. The lane row grows with it and its spans stay level with the first row.
   - Ranges and formatting as in the current `MixTab` (level −30…12 dB step 0.5; pan −1…1 step 0.05 shown as `L24`/`C`/`R40`; send −40…6 dB step 0.5, −40 shown as "off" and stored as `null`). A changed slider is drawn in the pending colour.
   - Mute and solo remain listening-only and are never written.
4. **Foot:** seam warnings (clickable, seek to two seconds before) or "No holes at the seams · N sections", then the sound credits. Unchanged.

### Score rail

The rail is the piece's mixing text, in IBM Plex Mono, with real line numbers in a gutter.

**Source of truth.** Compute `rewriteScore(state.text, state.piece.id, edits)` in the browser (`plainscore` is already aliased to the source in `vite.config.ts`). The rail renders lines of that result, so it shows exactly what Write will produce. A line that differs from `state.text` is a changed line.

**Which lines.** From the piece's blocks only:

- `form`: the header and each section row (indent 4). The part lists under each row are not shown.
- `mix`: the header and every row.
- `space`: its line.
- `master`: its head line and its rows (`lowcut`, `presence`, `air`).

Reader notes after ` — ` are shown faint and are not editable.

**Values are chips.** Each editable value in a line is drawn as a chip: a section's `loudness` number; a mix row's level, pan, send; `decay`, `predelay`, `damp`, `wet`; master loudness, `ceiling`, `fade`, `lowcut`, `presence`, `air` gain and frequency. Clicking a chip opens an editor directly under that line: a slider with the same range and step the current tabs use, and the value. One editor open at a time. Mix-row chips are an exception: clicking one opens that stem's strip on the board instead, so levels are edited in one place. A part's strip shows its resolved level (instrument plus the part's offset) while its chip shows the row's own value; that difference is accepted. A mix row whose target has no stem (an instrument whose parts all have rows of their own) is shown as plain text and is not editable, as today.

**Section rows.** Clicking a `form` row selects that section (and seeks, like the ruler). The selected row is highlighted and shows, under it, the section editor: Measured, Gain (the compensation), Off by (measured minus target), a number input for the target, and a "No target" switch whose label names the section whose gain it then keeps, as the current Section tab does.

**Unwritten values.** The score omits defaults, so some controls have no text. Show them as ghosts, faint and without a line number, and make them work like chips:

- a section with no target: a `+ loudness` ghost at the end of its row;
- no `space` line: a ghost line built from `DEFAULT_SPACE`;
- no `master` line: a ghost head line built from `DEFAULT_MASTER`;
- `fade` absent from the head line: a `fade off` ghost;
- `lowcut`, `presence`, `air` rows absent: ghost rows `lowcut off`, `presence 0 dB`, `air off`.

Once edited away from the default, `rewriteScore` emits the real line and the ghost is replaced by it. Stems with no `mix` row get no ghost; they are edited on their strip and their row appears once it differs from plain.

**Changed lines.** The line diff between `state.text` and the rewritten text is the authority for what is dirty: it drives the marks in the rail, the count in the bottom bar and the unload warning. `changeCards` alone is not enough, because it can report no change where `rewriteScore` still alters a line (pan moved and returned to 0 on a written row leaves `pan 0`).

A changed line gets a pending-colour bar on its left edge and a faint tint; its changed chips are drawn in the pending colour. On the right it shows "was " followed by the old values of those chips, comma-separated, and an undo button. A new line shows "new"; a value removed back to default shows its ghost with "was {old value}".

Undo reverts the piece of the edits that line is written from: one section's target, one mix row, the `space` line, the `master` head line (loudness, ceiling, fade), or one of the `lowcut`, `presence`, `air` rows. `lib/changes.ts` has a single `master` id today; split it into `master:head`, `master:lowcut`, `master:presence` and `master:air` so each line reverts on its own.

**Lines outside the four blocks.** On a score older than 0.3, `rewriteScore` also changes the `score` line and, for 0.1, inserts `perform off` under each piece. Show such lines at the top of the rail in a group labelled "Also changes", with their line numbers and the pending mark, not editable and without undo. They count in N.

The rail scrolls on its own when the lines exceed its height. Selecting a section on the board scrolls its row into view.

### Bottom bar

Always present, so the layout does not jump.

- Clean: faint "No changes", Write disabled.
- Dirty: a pending dot, "N lines changed · {line numbers}", then at the right "Revert all" and the primary button "Write N lines to {file name}". N and the numbers come from the changed lines in the rail.
- A failed write shows its error in the bar (or directly above it) until the next edit.

Write, the 409 conflict path, and the reset after a successful write behave as now.

## Measuring

Measuring becomes automatic. 800 ms after the last edit, call `/api/measure` with the current edits; ignore a response that is older than the latest edit. The curve dims while stale, as now.

The status in the top bar reads "Measuring…", "Measured", or "Not measured" after a failure, and clicking it measures now. The separate Measure button is removed.

## Type

- UI text: IBM Plex Sans 400/500/600. Score lines, numbers, clock, values: IBM Plex Mono 400/500/600.
- Bundle both with `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`, importing only those weights.
- CJK (piece titles such as 間) falls back to the system font: `'IBM Plex Sans', 'Hiragino Sans', 'PingFang SC', sans-serif`.
- Lobe UI components must use the same families; how (theme token or CSS variable) is the builder's to find in the Lobe UI docs.
- Keep tabular figures everywhere, one number format per quantity (`fmt` and `signed` in `lib/format.ts`).

## What goes away

`Inspector`, `SectionTab`, `MixTab`, `SpaceMasterTabs`, `ChangesTab`, `Transport` (folded into the top bar), the `tab` field and action in the store, the per-change diff cards and their `/api/diff` calls (the endpoint stays on the server), and the "Sounding in {mark}" tag list (the lanes show it).

## Left to the builder

- Component and file split, and the shape of the module that turns the rewritten text into rail lines with chips. It must be a pure function with unit tests covering: a score with all blocks written, one with no `mix`/`space`/`master`, a target added, a target removed, a mix row added, and CRLF text.
- How changed lines are found (a small line diff in the browser, or the line map implied by `rewriteScore`'s replacements), as long as the marks match what `/api/write` writes.
- Exact spacing, within the 4 px grid the mockup uses, and the light-theme rendering.
- The live meter's placement in the strip.
- Rail width below 1440 px.

## Decisions and where they came from

Artboard `artboard/mixer-redesign` (`.ryugi/artifacts/artboard/mixer-redesign/`, not committed; link https://ryugi.innei.dev/a/Q3z5wiZelkWJPsTlsFHwe):

| Round | Question | Chosen | What it means |
| --- | --- | --- | --- |
| 1 | Layout | `q1-a`, plus the score pane from `q1-c` | Map as the workspace, strips on the lanes, a bottom changes bar; score lines as controls |
| 2 | Where the score lines live | `q2-a` | They replace the slider rail on the right |
| 3 | Top bar | `q3-a` | Three equal zones, transport centred, readouts moved into the map gutter |
| 4 | Type | `q4-a` | IBM Plex Sans and IBM Plex Mono |

Calls made by the designer, not chosen on a board:

- Automatic measuring and its 800 ms delay.
- Mix-row chips open the strip instead of an editor in the rail.
- Ghost lines for unwritten values.
- Master gain kept as a fifth meter row (the mockup shows four).
- The bottom bar is always present.
- The `score 0.3` tag and the "Sounding in" list are dropped.
- CJK falls back to system fonts instead of bundling IBM Plex Sans JP.
- The line diff is the authority for what is dirty, and `master` reverts per line.
- Ghosts are formatted in the web code; `src/rewrite.ts` is not touched.
- The Loop label follows the section under the playhead; the player is unchanged.
- A mix row with no stem is read-only.
- Lines changed outside the four blocks are listed under "Also changes" and counted.
- The mockup writes mix levels as `80%`; the real page shows whatever `rewriteScore` emits (for a changed row, `-1.9 dB`).
