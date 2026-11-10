const RATE = 48000
const CHANNELS = 2
const BYTES_PER_SAMPLE = 4
const COPIES = 2

export const MEMORY_LIMIT = 1.5e9

export const estimateBytes = (seconds: number, stems: number) => seconds * RATE * CHANNELS * BYTES_PER_SAMPLE * stems * COPIES
