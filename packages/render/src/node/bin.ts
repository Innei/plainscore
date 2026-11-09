#!/usr/bin/env node
import { main } from './cli.ts'

main(process.argv.slice(2)).catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
