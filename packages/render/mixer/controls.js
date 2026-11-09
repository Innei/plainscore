export const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c)
  return node
}

export const fmt = (v, digits = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits))
export const signed = (v, digits = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}`)
export const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

export const slider = ({ label, min, max, step, value, show, oninput }) => {
  const out = el('b', {}, show(value))
  const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label })
  input.addEventListener('input', () => {
    const v = Number(input.value)
    out.textContent = show(v)
    oninput(v)
  })
  input.addEventListener('dblclick', () => {
    if (input.dataset.reset === undefined) return
    input.value = input.dataset.reset
    input.dispatchEvent(new Event('input'))
  })
  return { node: el('label', { class: 'control' }, el('span', {}, label, out), input), input, out }
}

const BLANK = { gain: 0, pan: 0, send: 0 }

export const resolveMix = (state, edits) => {
  const instruments = {}
  for (const name of Object.keys(state.mix.instruments)) {
    const row = edits.mix[name]
    instruments[name] = row
      ? { gain: row.gain, pan: row.pan ?? 0, send: row.send === undefined ? 0 : row.send, ...(row.attack === undefined ? {} : { attack: row.attack }) }
      : { ...BLANK }
  }
  const parts = {}
  for (const name of Object.keys(state.mix.parts)) {
    const base = instruments[state.partInst[name]] ?? BLANK
    const row = edits.mix[name] ?? { gain: 0 }
    parts[name] = { gain: base.gain + row.gain, pan: row.pan ?? base.pan, send: row.send === undefined ? base.send : row.send }
  }
  return { instruments, parts }
}

export const writeStrip = (state, edits, target, kind, resolved) => {
  const row = { ...(edits.mix[target] ?? { gain: 0 }) }
  const base = kind === 'part' ? (resolveMix(state, edits).instruments[state.partInst[target]] ?? BLANK) : BLANK
  row.gain = Math.round((resolved.gain - base.gain) * 10) / 10
  if (resolved.pan !== base.pan || row.pan !== undefined) row.pan = Math.round(resolved.pan * 100) / 100
  if (resolved.send !== base.send || row.send !== undefined) row.send = resolved.send === null ? null : Math.round(resolved.send * 10) / 10
  edits.mix[target] = row
}

export const buildStrips = (root, state, edits, { onchange, ontoggle }) => {
  root.replaceChildren()
  for (const stem of state.stems) {
    const kind = stem.kind
    const current = () => {
      const mix = resolveMix(state, edits)
      return kind === 'part' ? mix.parts[stem.target] : mix.instruments[stem.target]
    }
    const s = current()
    const change = (patch) => {
      writeStrip(state, edits, stem.target, kind, { ...current(), ...patch })
      onchange()
    }
    const gain = slider({ label: 'Level', min: -30, max: 12, step: 0.5, value: s.gain, show: (v) => `${signed(v)} dB`, oninput: (v) => change({ gain: v }) })
    gain.input.dataset.reset = s.gain
    const pan = slider({ label: 'Pan', min: -1, max: 1, step: 0.05, value: s.pan, show: (v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`), oninput: (v) => change({ pan: v }) })
    pan.input.dataset.reset = 0
    const off = s.send === null
    const send = slider({ label: 'Send', min: -40, max: 6, step: 0.5, value: off ? -40 : s.send, show: (v) => (v <= -40 ? 'off' : `${signed(v)} dB`), oninput: (v) => change({ send: v <= -40 ? null : v }) })
    const toggle = (label, set) =>
      el('button', {
        'aria-pressed': 'false',
        title: label === 'M' ? 'Mute (audition only)' : 'Solo (audition only)',
        onclick: (e) => {
          const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'
          e.currentTarget.setAttribute('aria-pressed', String(on))
          ontoggle(set, stem.target, on)
        },
      }, label)
    const who = el('div', { class: 'who' }, el('strong', {}, stem.target), el('small', {}, kind === 'part' ? `part · ${stem.insts.join(', ')}` : 'instrument'))
    root.append(el('div', { class: 'strip' }, who, gain.node, pan.node, send.node, el('div', { class: 'toggles' }, toggle('M', 'mute'), toggle('S', 'solo'))))
  }
}

export const buildSpace = (root, edits, onchange) => {
  const sp = edits.space
  const set = (key, v) => {
    edits.space = { ...edits.space, [key]: v }
    onchange('space')
  }
  root.replaceChildren(
    slider({ label: 'Decay', min: 0.4, max: 6, step: 0.1, value: sp.decay, show: (v) => `${v.toFixed(1)} s`, oninput: (v) => set('decay', v) }).node,
    slider({ label: 'Predelay', min: 0, max: 120, step: 1, value: sp.predelay * 1000, show: (v) => `${v} ms`, oninput: (v) => set('predelay', v / 1000) }).node,
    slider({ label: 'Damp', min: 1500, max: 16000, step: 100, value: sp.damp, show: (v) => `${v} Hz`, oninput: (v) => set('damp', v) }).node,
    slider({ label: 'Wet', min: -40, max: 0, step: 0.5, value: sp.wet, show: (v) => `${signed(v)} dB`, oninput: (v) => set('wet', v) }).node,
  )
}

export const buildMaster = (root, edits, onchange) => {
  const m = edits.master
  const set = (patch) => {
    edits.master = { ...edits.master, ...patch }
    onchange('master')
  }
  const lowcut = slider({ label: 'Lowcut', min: 20, max: 150, step: 1, value: m.lowcut ?? 35, show: (v) => `${v} Hz`, oninput: (v) => set({ lowcut: v }) })
  lowcut.input.disabled = m.lowcut === null
  const lowOn = el('input', { type: 'checkbox', checked: m.lowcut !== null })
  lowOn.addEventListener('change', () => {
    lowcut.input.disabled = !lowOn.checked
    set({ lowcut: lowOn.checked ? Number(lowcut.input.value) : null })
  })
  const air = m.air ?? { gain: 0, freq: 9000 }
  const airGain = slider({ label: 'Air', min: -6, max: 6, step: 0.5, value: air.gain, show: (v) => `${signed(v)} dB`, oninput: (v) => set({ air: v ? { gain: v, freq: edits.master.air?.freq ?? air.freq } : null }) })
  const airFreq = slider({ label: 'Air at', min: 4000, max: 16000, step: 250, value: air.freq, show: (v) => `${v} Hz`, oninput: (v) => edits.master.air && set({ air: { ...edits.master.air, freq: v } }) })
  root.replaceChildren(
    slider({ label: 'Loudness', min: -24, max: -8, step: 0.5, value: m.loudness, show: (v) => `${v.toFixed(1)} LUFS`, oninput: (v) => set({ loudness: v }) }).node,
    slider({ label: 'Ceiling', min: -3, max: -0.1, step: 0.1, value: m.ceiling, show: (v) => `${v.toFixed(1)} dBTP`, oninput: (v) => set({ ceiling: v }) }).node,
    lowcut.node,
    el('label', { class: 'check' }, lowOn, 'Lowcut on'),
    slider({ label: 'Presence 3 kHz', min: -6, max: 6, step: 0.5, value: m.presence, show: (v) => `${signed(v)} dB`, oninput: (v) => set({ presence: v }) }).node,
    slider({ label: 'Fade', min: 0, max: 10, step: 0.5, value: m.fade, show: (v) => (v ? `${v.toFixed(1)} s` : 'ring out'), oninput: (v) => set({ fade: v }) }).node,
    airGain.node,
    airFreq.node,
  )
}

const SCALE = [-30, -6]
const pos = (v) => `${Math.max(0, Math.min(100, ((v - SCALE[0]) / (SCALE[1] - SCALE[0])) * 100))}%`

export const buildSections = (root, state, edits, view, { onseek, ontarget }) => {
  root.replaceChildren()
  state.sections.forEach((s, i) => {
    const rep = view.report.sections[i]
    const input = el('input', { type: 'number', step: 0.5, value: edits.loudness[s.mark] ?? '', placeholder: 'inherit', 'aria-label': `${s.mark} target` })
    input.addEventListener('change', () => ontarget(s.mark, input.value === '' ? null : Number(input.value)))
    const target = edits.loudness[s.mark]
    const chart = el('div', { class: 'chart' }, rep.measured === null ? null : el('div', { class: 'fill', style: `width:${pos(rep.measured)}` }), target === null || target === undefined ? null : el('div', { class: 'tick', style: `left:${pos(target)}` }))
    root.append(
      el(
        'tr',
        { class: s.keyChange ? 'key' : '' },
        el('td', {}, el('button', { onclick: () => onseek(s.start), title: s.label }, s.mark)),
        el('td', {}, clock(s.start)),
        el('td', {}, input),
        el('td', {}, `${signed(view.comp[i])} dB`),
        el('td', {}, fmt(rep.measured)),
        el('td', {}, signed(rep.diff)),
        el('td', {}, chart),
      ),
    )
  })
}
