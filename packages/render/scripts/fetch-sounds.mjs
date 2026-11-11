import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL_SF3 = 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3'
const SHA256 = '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../site-public')
const sf3 = join(out, 'sounds', 'MuseScore_General.sf3')
const examples = resolve(here, '../../../examples')
const samples = resolve(here, '../sounds')

const USAGE = `usage: node scripts/fetch-sounds.mjs [--print-hash]

Fills packages/render/site-public for the site build:
  sounds/MuseScore_General.sf3   downloaded from ${URL_SF3}
                                 and checked against the pinned SHA-256
  sounds/*                       copied from packages/render/sounds (the baked samples)
  examples/*.score               copied from the repository's examples

--print-hash   download if needed, print the file's SHA-256 and skip the check`

const hashOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const main = async () => {
  if (process.argv.includes('--help')) return console.log(USAGE)
  const printOnly = process.argv.includes('--print-hash')
  mkdirSync(dirname(sf3), { recursive: true })
  if (!existsSync(sf3)) {
    const res = await fetch(URL_SF3)
    if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)
    writeFileSync(sf3, Buffer.from(await res.arrayBuffer()))
  }
  const hash = hashOf(sf3)
  if (printOnly) return console.log(hash)
  if (hash !== SHA256) throw new Error(`MuseScore_General.sf3 has SHA-256 ${hash}, expected ${SHA256}; delete ${sf3} and run again, or update the pinned hash if the file was republished`)
  for (const file of readdirSync(samples)) copyFileSync(join(samples, file), join(out, 'sounds', file))
  mkdirSync(join(out, 'examples'), { recursive: true })
  for (const file of readdirSync(examples).filter((f) => f.endsWith('.score'))) copyFileSync(join(examples, file), join(out, 'examples', file))
  console.log(`site-public is ready: ${sf3}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
