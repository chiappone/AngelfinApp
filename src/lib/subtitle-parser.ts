export interface SubtitleCue {
  start: number // ms
  end: number // ms
  text: string
}

function srtTimeToMs(t: string): number | null {
  if (!t || typeof t !== 'string') return null
  t = t.trim().replace('.', ',')
  const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mn = parseInt(m[2], 10)
  const s = parseInt(m[3], 10)
  const ms = parseInt(m[4].padEnd(3, '0').slice(0, 3), 10)
  return ((h * 60 + mn) * 60 + s) * 1000 + ms
}

function vttTimeToMs(t: string): number | null {
  if (!t || typeof t !== 'string') return null
  t = t.trim()
  const m = t.match(/(\d+):(\d+):(\d+)[.](\d+)/)
  if (m) {
    const h = parseInt(m[1], 10)
    const mn = parseInt(m[2], 10)
    const s = parseInt(m[3], 10)
    const ms = parseInt(m[4].padEnd(3, '0').slice(0, 3), 10)
    return ((h * 60 + mn) * 60 + s) * 1000 + ms
  }
  // VTT allows MM:SS.mmm
  const m2 = t.match(/(\d+):(\d+)[.](\d+)/)
  if (m2) {
    const mn = parseInt(m2[1], 10)
    const s = parseInt(m2[2], 10)
    const ms = parseInt(m2[3].padEnd(3, '0').slice(0, 3), 10)
    return (mn * 60 + s) * 1000 + ms
  }
  return null
}

function timeToMs(t: string, format: 'srt' | 'vtt'): number | null {
  if (format === 'srt') return srtTimeToMs(t)
  return vttTimeToMs(t)
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '')
}

export function parseSubtitles(text: string, format?: 'srt' | 'vtt'): SubtitleCue[] {
  const fmt = format || (text.trim().startsWith('WEBVTT') ? 'vtt' : 'srt')
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\uFEFF/, '')
  const cues: SubtitleCue[] = []

  // Split into blocks by double newline
  const blocks = cleaned.split(/\n\s*\n/)

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim())
    if (!lines.length) continue

    // Find timing line
    const timingIdx = lines.findIndex(l => l.includes('-->'))
    if (timingIdx === -1) continue

    const timingLine = lines[timingIdx]
    const [startStr, endStr] = timingLine.split('-->')

    if (!startStr || !endStr) continue

    const start = timeToMs(startStr, fmt)
    const end = timeToMs(endStr, fmt)
    if (start === null || end === null) continue

    // Collect text lines (skip timing line and sequence numbers)
    const body = lines
      .filter((_, i) => i !== timingIdx && !/^\d+$/.test(lines[i].trim()))
      .join(' ')
      .trim()

    const cleanedText = stripHtml(body)
    if (cleanedText) {
      cues.push({ start, end, text: cleanedText })
    }
  }

  return cues
}
