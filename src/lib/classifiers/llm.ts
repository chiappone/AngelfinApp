import type { SubtitleCue } from '../subtitle-parser'
import type { FilterEntry } from './wordlist'

const LLM_SYSTEM = `You classify subtitle cues for a family content filter.
For each cue that contains objectionable content, output an object. Rules:
- Spoken profanity/blasphemy/slurs -> action "skip", category "language".
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

export interface LLMOptions {
  apiKey: string
  baseUrl?: string
  model?: string
}

export async function classifyLLM(
  cues: SubtitleCue[],
  categories: string[],
  options?: LLMOptions,
  pad = 120,
  chunkSize = 120,
  onProgress?: (msg: string) => void,
): Promise<FilterEntry[]> {
  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('No AI API key configured. Please add your OpenAI API key in Settings.')

  const baseUrl = options?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = options?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'

  const indexed: [number, SubtitleCue][] = cues.map((c, i) => [i, c])
  const allChunks: [number, SubtitleCue][][] = []
  for (let start = 0; start < indexed.length; start += chunkSize) {
    allChunks.push(indexed.slice(start, start + chunkSize))
  }
  const totalChunks = allChunks.length
  const concurrency = Math.min(4, totalChunks)
  onProgress?.(`LLM classifying ${totalChunks} chunks (parallel x${concurrency})...`)

  const entries: FilterEntry[] = []
  let n = 0

  // Process chunks in parallel batches
  for (let batchStart = 0; batchStart < totalChunks; batchStart += concurrency) {
    const batch = allChunks.slice(batchStart, batchStart + concurrency)
    const results = await Promise.allSettled(
      batch.map((part, bi) => {
        const chunkNum = batchStart + bi + 1
        onProgress?.(`LLM chunk ${chunkNum}/${totalChunks}...`)
        return llmCall(model, part, apiKey, baseUrl)
      })
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('LLM chunk failed:', result.reason)
        continue
      }
      const flags = result.value
      for (const f of flags) {
        const idx = f.i
        if (typeof idx !== 'number' || idx >= cues.length) continue

        const cue = cues[idx]
        const review = f.review ?? true
        const label = f.label || ''

        n++
        entries.push({
          id: `llm-${n.toString().padStart(4, '0')}`,
          startMs: Math.max(0, cue.start),
          endMs: cue.end,
          action: 'skip',
          category: f.category || 'misc',
          subcategory: f.subcategory || '',
          severity: Math.min(5, Math.max(1, Math.round(f.severity || 3))),
          label: review ? `[REVIEW] ${label}` : label,
          fadeMs: 0,
        })
      }
    }
  }

  return entries
}
