import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { parseSubtitles } from '@/lib/subtitle-parser'
import { classifyWordlist } from '@/lib/classifiers/wordlist'
import { classifyLLM } from '@/lib/classifiers/llm'
import type { FilterEntry } from '@/lib/classifiers/wordlist'

async function fetchJellyfin(baseUrl: string, apiKey: string, path: string) {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`
  const res = await fetch(url, {
    headers: { 'X-Emby-Token': apiKey },
  })
  if (!res.ok) throw new Error(`Jellyfin error ${res.status} for ${path}`)
  return res.json()
}

async function getSubtitlesFromJellyfin(baseUrl: string, apiKey: string, title: string): Promise<string | null> {
  try {
    const base = baseUrl.replace(/\/+$/, '')

    // Search for the movie
    const results = await fetchJellyfin(baseUrl, apiKey, `/Items?searchTerm=${encodeURIComponent(title)}&Recursive=true&IncludeItemTypes=Movie&Limit=5&Fields=Path,MediaStreams`)
    const items = results.Items || []
    if (!items.length) return null
    const item = items[0]

    const subtitleTracks = (item.MediaStreams || []).filter(
      (s: { Type: string }) => s.Type === 'Subtitle'
    )
    if (!subtitleTracks.length) return null

    // Prefer English SDH/CC, then English, then first text subtitle
    const track = subtitleTracks.find(
      (s: { Language?: string; IsTextSubtitleStream?: boolean; Title?: string }) =>
        s.Language?.toLowerCase().startsWith('en') && s.IsTextSubtitleStream && (s.Title?.toLowerCase().includes('sdh') || s.Title?.toLowerCase().includes('cc'))
    ) || subtitleTracks.find(
      (s: { Language?: string; IsTextSubtitleStream?: boolean }) =>
        s.Language?.toLowerCase().startsWith('en') && s.IsTextSubtitleStream
    ) || subtitleTracks.find(
      (s: { IsTextSubtitleStream?: boolean }) => s.IsTextSubtitleStream
    )

    if (!track?.Index) {
      console.error('[gen-filter] No subtitle track found. Tracks:', subtitleTracks.map((s: any) => ({ idx: s.Index, lang: s.Language, title: s.Title, isText: s.IsTextSubtitleStream })))
      return null
    }

    console.error(`[gen-filter] Selected track: index=${track.Index}, title=${track.Title}, lang=${track.Language}`)

    // Try 1: External subtitle via DeliveryUrl (sidecar subs)
    if (track.DeliveryUrl) {
      const subUrl = `${base}${track.DeliveryUrl}&api_key=${apiKey}`
      const subRes = await fetch(subUrl)
      if (subRes.ok) return subRes.text()
    }

    // Try 2: Jellyfin subtitle API for embedded subs
    // Jellyfin subtitle streaming API: /Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/Stream.srt
    const subPaths = [
      `/Videos/${item.Id}/${item.Id}/Subtitles/${track.Index}/Stream.srt`,
    ]
    for (const subPath of subPaths) {
      const subUrl = `${base}${subPath}`
      console.error(`[gen-filter] Trying subtitle URL: ${subUrl}`)
      const subRes = await fetch(subUrl, { headers: { 'X-Emby-Token': apiKey } })
      console.error(`[gen-filter] Subtitle response: ${subRes.status} ${subRes.statusText}`)
      if (subRes.ok) {
        const text = await subRes.text()
        console.error(`[gen-filter] Subtitle text length: ${text.length}, first 100 chars: ${text.substring(0, 100)}`)
        if (text.trim().length > 10) return text
      }
    }

    return null
  } catch (err) {
    console.error('Jellyfin subtitle fetch failed:', err)
    return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: movieId } = await params
  const body = await req.json()
  const categories: string[] = body.categories || []
  const subtitleText: string | undefined = body.subtitleText

  if (!categories.length) {
    return NextResponse.json({ error: 'At least one category is required' }, { status: 400 })
  }

  // Get session and settings
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id

  let jellyfinBaseUrl = process.env.JELLYFIN_BASE_URL
  let jellyfinApiKey = process.env.JELLYFIN_API_KEY
  let openaiApiKey = process.env.OPENAI_API_KEY
  let openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  let openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  // Use user settings if available
  console.error(`[gen-filter] userId=${userId}, session exists=${!!session}`)
  if (userId) {
    const settings = await db.settings.findUnique({ where: { userId } })
    console.error(`[gen-filter] settings found=${!!settings}, aiKey=${settings?.openaiApiKey?.substring(0, 10) || 'NONE'}`)
    if (settings) {
      if (settings.jellyfinBaseUrl) jellyfinBaseUrl = settings.jellyfinBaseUrl
      if (settings.jellyfinApiKey) jellyfinApiKey = settings.jellyfinApiKey
      if (settings.openaiApiKey) openaiApiKey = settings.openaiApiKey
      if (settings.openaiBaseUrl) openaiBaseUrl = settings.openaiBaseUrl
      if (settings.openaiModel) openaiModel = settings.openaiModel
    }
  }

  // Get movie
  const movie = await db.movie.findUnique({ where: { id: movieId } })
  if (!movie) {
    return NextResponse.json({ error: 'Movie not found' }, { status: 404 })
  }

  let subText = subtitleText

  // Try Jellyfin if no subtitle provided
  if (!subText && jellyfinBaseUrl && jellyfinApiKey) {
    subText = await getSubtitlesFromJellyfin(jellyfinBaseUrl, jellyfinApiKey, movie.title) || undefined
  }

  if (!subText) {
    return NextResponse.json(
      { error: 'No subtitles available. Please configure Jellyfin in Settings or upload a subtitle file.' },
      { status: 400 }
    )
  }

  // Parse subtitles
  const cues = parseSubtitles(subText)
  if (!cues.length) {
    return NextResponse.json({ error: 'Could not parse any subtitle cues.' }, { status: 400 })
  }

  // Run classifiers
  const allEntries: FilterEntry[] = []
  const stats: Record<string, number> = {}

  const needsWordlist = categories.includes('profanity')
  const needsLLM = categories.some(c => ['violence', 'sexNudity', 'hate'].includes(c))

  if (needsWordlist) {
    const entries = classifyWordlist(cues)
    allEntries.push(...entries)
    stats['language'] = entries.length
  }

  if (needsLLM) {
    const llmCategories = categories.filter(c => ['violence', 'sexNudity', 'hate'].includes(c))
    const entries = await classifyLLM(cues, llmCategories, {
      apiKey: openaiApiKey || '',
      baseUrl: openaiBaseUrl,
      model: openaiModel,
    })
    for (const entry of entries) {
      const cat = entry.category
      if (llmCategories.includes(cat) || cat === 'language') {
        allEntries.push(entry)
        stats[cat] = (stats[cat] || 0) + 1
      }
    }
  }

  // Sort by startMs
  allEntries.sort((a, b) => a.startMs - b.startMs)

  // Build filter JSON in Angelfin format
  const filterSet = {
    schemaVersion: '1.0',
    title: movie.title,
    mediaType: movie.mediaType || 'movie',
    source: { author: 'angelfin-generator/ai' },
    filters: allEntries,
  }

  if (movie.year) filterSet.year = movie.year

  const filtersJson = JSON.stringify(filterSet, null, 2)

  // Save to DB
  const filter = await db.filter.create({
    data: {
      movieId,
      label: 'Auto-generated',
      description: `AI-generated filter (${categories.join(', ')}). ${allEntries.length} entries.`,
      filtersJson,
      source: 'ai-generated',
    },
  })

  return NextResponse.json({
    filter,
    stats,
    totalEntries: allEntries.length,
    cuesProcessed: cues.length,
  })
}
