import { liveGraph } from '/lib/live.js'
import { buildMaster, buildSections, buildSpace, buildStrips, clock, el, fmt, resolveMix, signed } from '/controls.js'

const $ = (id) => document.getElementById(id)

let state
let edits
let view
let ctx
let live
let buffers = []
let sources = []
let playing = false
let started = 0
let offset = 0
let dirty = false
const mute = new Set()
const solo = new Set()

const api = async (path, body) => {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? res.statusText)
  return json
}

const length = () => buffers[0]?.duration ?? 0
const sectionAt = (t) => state.sections.findLastIndex((s) => s.start <= t + 1e-6)

const estimate = () => {
  const r = view.report
  const own = state.sections.map((s, i) => {
    const target = edits.loudness[s.mark]
    const rep = r.sections[i]
    if (target === null || target === undefined || rep.measured === null) return null
    return target - (rep.measured - rep.compensation - r.gain + view.gain)
  })
  const first = own.find((v) => v !== null)
  if (first === undefined) return own.map(() => 0)
  let last = first
  return own.map((v) => (v === null ? last : (last = v)))
}

const setStatus = (text) => {
  $('status').hidden = !text
  $('status').textContent = text ?? ''
}

const markDirty = (stale = true) => {
  dirty = true
  $('write').disabled = false
  if (stale) setStatus('not measured since the last change')
}

const applyMute = () => {
  for (const s of state.stems) {
    const out = mute.has(s.target) || (solo.size && !solo.has(s.target))
    if (out) live.inputs[s.target].gain.value = 0
  }
}

const refreshLive = (what = 'mix') => {
  const mix = resolveMix(state, edits)
  live.update({ mix, ...(what === 'space' ? { space: edits.space } : {}), ...(what === 'master' ? { master: edits.master, gain: view.gain } : {}) })
  applyMute()
}

const reschedule = () => {
  if (!playing) return
  pause()
  play()
}

const schedule = (at) => {
  const loop = $('loop').checked
  const i = sectionAt(offset)
  if (loop) live.compensate([{ start: 0, gain: view.comp[i] }], at, 0)
  else live.compensate(state.sections.map((s, k) => ({ start: s.start, gain: view.comp[k] })), at, offset)
}

const play = async () => {
  if (!buffers.length) return
  await ctx.resume()
  if (offset >= length() - 0.05) offset = 0
  const at = ctx.currentTime + 0.05
  const loop = $('loop').checked
  const sec = state.sections[sectionAt(offset)]
  sources = buffers.map((buffer, i) => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    if (loop) {
      src.loop = true
      src.loopStart = sec.start
      src.loopEnd = Math.min(sec.end, buffer.duration)
    }
    src.connect(live.inputs[state.stems[i].target])
    src.start(at, offset)
    return src
  })
  schedule(at)
  started = at - offset
  playing = true
  $('play').textContent = '❚❚'
  $('play').setAttribute('aria-label', 'Pause')
}

const position = () => {
  if (!playing) return offset
  const t = ctx.currentTime - started
  if (!$('loop').checked) return Math.min(t, length())
  const sec = state.sections[sectionAt(offset)]
  const span = sec.end - sec.start
  return t < sec.end ? t : sec.start + ((t - sec.start) % span)
}

const pause = () => {
  offset = position()
  for (const s of sources) s.stop()
  sources = []
  playing = false
  $('play').textContent = '▶'
  $('play').setAttribute('aria-label', 'Play')
}

const seek = (t) => {
  const was = playing
  if (playing) pause()
  offset = Math.max(0, Math.min(t, length()))
  if (was) play()
  tick()
}

const tick = () => {
  const t = position()
  $('clock').textContent = `${clock(t)} / ${clock(length())}`
  $('head').style.left = `${(t / (length() || 1)) * 100}%`
  const i = sectionAt(t)
  document.querySelectorAll('.timeline .block').forEach((b, k) => b.classList.toggle('current', k === i))
  if (playing && !$('loop').checked && t >= length()) pause()
}

const frame = () => {
  tick()
  requestAnimationFrame(frame)
}

const drawTimeline = () => {
  const total = length() || state.sections.at(-1).end
  const line = $('timeline')
  line.replaceChildren($('head'))
  for (const s of state.sections) {
    line.append(el('div', { class: `block${s.keyChange ? ' key' : ''}`, style: `width:${((s.end - s.start) / total) * 100}%`, title: s.label, 'data-start': s.start }, s.mark))
  }
  for (const w of view.report.seams) line.append(el('div', { class: 'seam', style: `left:${(w.time / total) * 100}%`, title: `${w.from} → ${w.to}: ${w.dip} dB dip` }))
}

const drawSections = () => buildSections($('sections'), state, edits, view, { onseek: seek, ontarget })

const ontarget = (mark, value) => {
  edits.loudness[mark] = value
  view.comp = estimate()
  markDirty()
  drawSections()
  reschedule()
}

const drawReport = () => {
  const r = view.report
  const items = [
    ['Integrated', `${fmt(r.integrated)} LUFS`],
    ['Target', `${fmt(r.target)} LUFS`],
    ['Loudness range', `${fmt(r.range)} LU`],
    ['True peak', `${fmt(r.truePeak)} dBTP`],
    ['Master gain', `${signed(r.gain)} dB`],
    ['Limiter', `${fmt(r.limiter.maxReduction)} dB max · ${fmt(r.limiter.overOneDb)} s > 1 dB`],
  ]
  $('summary').replaceChildren(...items.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))))
  $('seams').replaceChildren(
    ...(r.seams.length
      ? r.seams.map((w) => el('li', {}, el('button', { onclick: () => seek(Math.max(0, w.time - 2)) }, `${w.from} → ${w.to} at ${clock(w.time)}`), ` ${w.dip} dB dip · sounding: ${w.sounding.join(', ') || 'nothing'}`))
      : [el('li', { class: 'muted' }, 'No holes at the seams.')]),
  )
  $('credits').replaceChildren(...r.credits.map((c) => el('li', {}, `${c.sound}: ${c.credit || 'no credit given'}`)))
}

const useReport = (report) => {
  view = { report, comp: report.sections.map((s) => s.compensation), gain: report.gain }
  live?.update({ gain: report.gain })
  drawSections()
  drawReport()
  drawTimeline()
  reschedule()
}

const measure = async () => {
  $('measure').disabled = true
  setStatus('measuring…')
  try {
    const { report } = await api('/api/measure', { edits })
    useReport(report)
    setStatus(dirty ? 'measured · not written' : null)
  } catch (error) {
    setStatus(error.message)
  } finally {
    $('measure').disabled = false
  }
}

const showDiff = async () => {
  const { lines } = await api('/api/diff', { edits })
  const keep = new Set()
  lines.forEach((l, i) => {
    if (l.kind !== 'same') for (let k = i - 2; k <= i + 2; k++) keep.add(k)
  })
  const shown = lines.flatMap((l, i) => (keep.has(i) ? [el('div', { class: l.kind }, `${l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '} ${String(l.at).padStart(4)}  ${l.line}`)] : i && keep.has(i - 1) ? [el('div', { class: 'muted' }, '  …')] : []))
  $('diff-lines').replaceChildren(...(shown.length ? shown : [el('div', { class: 'muted' }, 'Nothing to change.')]))
  $('confirm').disabled = !shown.length
  $('diff-error').hidden = true
  $('diff').showModal()
}

const write = async () => {
  try {
    state = await api('/api/write', { edits, version: state.version })
    edits = structuredClone(state.edits)
    dirty = false
    $('write').disabled = true
    setStatus('written')
    useReport(state.report)
    buildAll()
  } catch (error) {
    $('diff-error').textContent = error.message
    $('diff-error').hidden = false
    $('diff').showModal()
  }
}

const exportFiles = async () => {
  const formats = [...document.querySelectorAll('.export input:checked')].map((i) => i.value)
  $('exported').textContent = 'rendering…'
  try {
    const { files, report } = await api('/api/export', { edits, formats })
    $('exported').textContent = files.join('\n')
    useReport(report)
  } catch (error) {
    $('exported').textContent = error.message
  }
}

const banner = (text, action) => {
  $('banner').hidden = !text
  $('banner').replaceChildren(el('span', {}, text ?? ''), ...(action ? [el('button', { onclick: action[1] }, action[0])] : []))
}

const buildAll = () => {
  buildStrips($('strips'), state, edits, {
    onchange: () => {
      refreshLive('mix')
      markDirty()
    },
    ontoggle: (set, target, on) => {
      const group = set === 'mute' ? mute : solo
      if (on) group.add(target)
      else group.delete(target)
      refreshLive('mix')
    },
  })
  buildSpace($('space'), edits, () => {
    refreshLive('space')
    markDirty()
  })
  buildMaster($('master'), edits, () => {
    view.gain = view.report.gain + (edits.master.loudness - view.report.target)
    refreshLive('master')
    markDirty()
  })
}

const boot = async () => {
  state = await api('/api/state')
  edits = structuredClone(state.edits)
  const same = (a, b) => a?.replace(/\s+/g, '') === b?.replace(/\s+/g, '')
  $('title').textContent = [state.title, same(state.piece.title, state.title) ? null : state.piece.title, state.variant].filter(Boolean).join(' · ')
  $('file').textContent = state.file
  $('diff-file').textContent = state.file.split('/').pop()
  document.title = `${state.piece.title || state.title} — plainscore mixer`
  view = { report: state.report, comp: state.report.sections.map((s) => s.compensation), gain: state.report.gain }
  drawSections()
  drawReport()
  setStatus('loading stems…')
  ctx = new AudioContext({ sampleRate: 48000 })
  buffers = await Promise.all(state.stems.map(async (s) => ctx.decodeAudioData(await (await fetch(`/stems/${s.index}.wav`)).arrayBuffer())))
  live = liveGraph(ctx, { mix: resolveMix(state, edits), space: edits.space, master: edits.master }, { gain: view.gain })
  live.output.connect(ctx.destination)
  buildAll()
  drawTimeline()
  setStatus(null)
  for (const id of ['play', 'measure']) $(id).disabled = false
  requestAnimationFrame(frame)
}

$('play').addEventListener('click', () => (playing ? pause() : play()))
$('loop').addEventListener('change', reschedule)
$('measure').addEventListener('click', measure)
$('export').addEventListener('click', exportFiles)
$('write').addEventListener('click', () => showDiff().catch((e) => setStatus(e.message)))
$('diff').addEventListener('close', () => $('diff').returnValue === 'write' && write())
$('timeline').addEventListener('click', (e) => {
  const block = e.target.closest('.block')
  if (block) return seek(Number(block.dataset.start))
  const box = $('timeline').getBoundingClientRect()
  seek(((e.clientX - box.left) / box.width) * length())
})
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.closest('input, button, summary, dialog')) return
  e.preventDefault()
  playing ? pause() : play()
})
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault()
})

const events = new EventSource('/api/events')
events.addEventListener('changed', () => banner('The score changed on disk — rendering it again…'))
events.addEventListener('ready', () => banner('The score was rendered again.', ['Reload', () => ((dirty = false), location.reload())]))
events.addEventListener('failed', (e) => banner(`The score no longer reads: ${JSON.parse(e.data).error}`))

boot().catch((error) => {
  setStatus('failed')
  banner(error.message)
})
