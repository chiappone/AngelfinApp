import type { SubtitleCue } from '../subtitle-parser'
import type { FilterEntry } from './wordlist'

const LLM_SYSTEM = `You classify subtitle cues for a family content filter.
For each cue that contains objectionable content, output an object. Rules:
- Spoken profanity/blasphemy/slurs -> action "mute", category "language".
- A sound cue like [gunshots], [screaming], [moaning], or dialogue that clearly
  indicates on-screen violence or sexual activity -> action "skip" and set "review": true
  (timing is approximate; a human should confirm).
- Categories: language, sexNudity, violence, substances, misc.
- severity is 1 (mild) to 5 (severe).
- "label" is the trigger word or a 3-5 word scene description.
Return ONLY a JSON array of objects: {"i": <cue index>, "category", "subcategory",
"action", "severity", "label", "review"}. Omit cues with nothing objectionable. No prose.`

interface LLMFlag {
  i: number
  category: string
  subcategory?: string
  action: string
  severity: number
  label: string
  review?: boolean
}

async function llmCall(
  model: string,
  cuesChunk: [number, SubtitleCue][],
  apiKey: string,
  baseUrl: string,
): Promise<LLMFlag[]> {
  const payload = {
    model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: LLM_SYSTEM },
      {
        role: 'user',
        content:
          'Classify these cues:\n' +
          JSON.stringify(
            cuesChunk.map(([i, c]) => ({ i, t: c.text })),
            // no ensure_ascii to allow unicode
          ),
      },
    ],
  }

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error')
    throw new Error(`LLM API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    return JSON.parse(m[0])
  } catch {
    return []
  }
}

export async function classifyLLM(
  cues: SubtitleCue[],
  categories: string[],
  pad = 120,
  chunkSize = 120,
  onProgress?: (msg: string) => void,
): Promise<FilterEntry[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  const indexed: [number, SubtitleCue][] = cues.map((c, i) => [i, c])
  const entries: FilterEntry[] = []
  let n = 0

  for (let start = 0; start < indexed.length; start += chunkSize) {
    const part = indexed.slice(start, start + chunkSize)
    const chunkNum = Math.floor(start / chunkSize) + 1
    const totalChunks = Math.ceil(indexed.length / chunkSize)
    onProgress?.(`LLM classifying chunk ${chunkNum}/${totalChunks}...`)

    try {
      const flags = await llmCall(model, part, apiKey, baseUrl)
      for (const f of flags) {
        const idx = f.i
        if (typeof idx !== 'number' || idx >= cues.length) continue

        const cue = cues[idx]
        const action = f.action || 'mute'
        const review = f.review ?? action === 'skip'
        const label = f.label || ''

        n++
        entries.push({
          id: `llm-${n.toString().padStart(4, '0')}`,
          startMs: Math.max(0, cue.start - (action === 'mute' ? pad : 0)),
          endMs: cue.end + (action === 'mute' ? pad : 0),
          action,
          category: f.category || 'misc',
          subcategory: f.subcategory || '',
          severity: Math.min(5, Math.max(1, Math.round(f.severity || 3))),
          label: review ? `[REVIEW] ${label}` : label,
          fadeMs: action === 'mute' ? 40 : 0,
        })
      }
    } catch (err) {
      console.error(`LLM chunk ${chunkNum} failed:`, err)
      onProgress?.(`Chunk ${chunkNum} failed, skipping...`)
    }
  }

  return entries
}
