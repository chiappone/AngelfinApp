import type { SubtitleCue } from '../subtitle-parser'

export interface FilterEntry {
  id: string
  startMs: number
  endMs: number
  action: string
  category: string
  subcategory: string
  severity: number
  label: string
  fadeMs: number
}

const WORDLIST: Record<string, Record<number, string[]>> = {
  language: {
    5: ['fuck', 'motherfucker', 'cunt'],
    4: ['shit', 'bullshit', 'asshole', 'bitch', 'goddamn', 'jesus christ', 'god damn'],
    3: ['bastard', 'dick', 'piss', 'prick', 'douche'],
    2: ['damn', 'hell', 'crap', 'ass'],
  },
}

// Pre-compile regex patterns
const compiledPatterns: Map<string, { cat: string; sev: number; regex: RegExp }[]> = new Map()

function getCompiledPatterns(): { cat: string; sev: number; regex: RegExp }[] {
  if (compiledPatterns.size > 0) return Array.from(compiledPatterns.values()).flat()
  const result: { cat: string; sev: number; regex: RegExp }[] = []
  for (const [cat, bySev] of Object.entries(WORDLIST)) {
    for (const [sev, words] of Object.entries(bySev)) {
      for (const word of words) {
        const regex = new RegExp('\\b' + escapeRegex(word) + '\\b', 'i')
        result.push({ cat, sev: parseInt(sev, 10), regex })
      }
    }
  }
  compiledPatterns.set('compiled', result)
  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function classifyWordlist(cues: SubtitleCue[], pad = 120): FilterEntry[] {
  const patterns = getCompiledPatterns()
  const entries: FilterEntry[] = []
  let n = 0

  for (const cue of cues) {
    const lower = cue.text.toLowerCase()
    for (const { cat, sev, regex } of patterns) {
      if (regex.test(lower)) {
        n++
        entries.push({
          id: `lang-${n.toString().padStart(4, '0')}`,
          startMs: Math.max(0, cue.start - pad),
          endMs: cue.end + pad,
          action: 'skip',
          category: cat,
          subcategory: 'profanity',
          severity: sev,
          label: cue.text,
          fadeMs: 0,
        })
        break // one hit per cue is enough
      }
    }
  }

  return entries
}
