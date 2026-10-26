import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const cli = (...args: string[]) => spawnSync(process.execPath, ['src/cli.ts', ...args], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })

describe('plainscore cli', () => {
  it('checks a score', () => {
    const run = cli('check', 'examples/bgm.score')
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('ok, theme, stars')
  })

  it('prints ABC for a variant', () => {
    const run = cli('abc', 'examples/bgm.score', '--piece', 'theme', '--variant', 'read')
    expect(run.stdout).toBe(readFileSync(new URL('../fixtures/read.abc', import.meta.url), 'utf8'))
  })

  it('writes MIDI', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'plainscore-')), 'road.mid')
    execFileSync(process.execPath, ['src/cli.ts', 'midi', 'examples/road.score', '-o', out], { cwd: new URL('..', import.meta.url) })
    expect(readFileSync(out)).toEqual(readFileSync(new URL('../fixtures/road.mid', import.meta.url)))
  })

  it('accepts the README example', () => {
    const example = readFileSync(new URL('../README.md', import.meta.url), 'utf8').split('```')[1].trimStart()
    const file = join(mkdtempSync(join(tmpdir(), 'plainscore-')), 'readme.score')
    writeFileSync(file, example)
    expect(cli('check', file).status).toBe(0)
  })

  it('prints the legend', () => {
    expect(cli('legend').stdout).toMatch(/^# Legend \(score 0\.2\)/)
  })

  it('fails with the file and line', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'plainscore-')), 'bad.score')
    writeFileSync(file, 'score 0.9\n')
    const run = cli('check', file)
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('bad.score line 1: start the file with "score 0.2"')
  })
})
