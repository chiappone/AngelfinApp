import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseSubtitles } from '@/lib/subtitle-parser'
import { classifyWordlist } from '@/lib/classifiers/wordlist'
import { classifyLLM } from '@/lib/classifiers/llm'
import type { FilterEntry } from '@/lib/classifiers/wordlist'

const JELLYFIN_BASE_URL = process.env.JELLYFIN_BASE_URL || 'http://192.168.69.210:8096'
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || ''

async function fetchJellyfin(path: string) {
  const url = `${JELLYFIN_BASE_URL.replace(/\/+$/, '')}${path}`
  const res = await fetch(url, {
    headers: { 'X-Emby-Token': JELLYFIN_API_KEY },
  })
  if (!res.ok) throw new Error(`Jellyfin error ${res.status} for ${path}`)
  return res.json()
}

async function getSubtitlesFromJellyfin(title: string): Promise<string | null> {
  try {
    // Search for the movie
    const results = await fetchJellyfin(`/Items?searchTerm=${encodeURIComponent(title)}&Recursive=true&IncludeItemTypes=Movie&Limit=5`)
    const items = results.Items || []
    if (!items.length) return null

    // Pick best match
    const item = items[0]

    // Get subtitle streams
    const mediaSources = await fetchJellyfin(`/Items/${item.Id}/PlaybackInfo`)
    const mediaSource = mediaSources.MediaSources?.[0]
    if (!mediaSource) return null

    const subtitleTracks = mediaSource.MediaStreams?.filter(
      (s: { Type: string }) => s.Type === 'Subtitle'
    ) || []

    // Prefer English, then first text subtitle
    const track = subtitleTracks.find(
      (s: { Language?: string; IsTextSubtitleStream?: boolean; DeliveryUrl?: string }) =>
        s.Language?.toLowerCase().startsWith('en') && s.IsTextSubtitleStream && s.DeliveryUrl
    ) || subtitleTracks.find(
      (s: { IsTextSubtitleStream?: boolean; DeliveryUrl?: string }) =>
        s.IsTextSubtitleStream && s.DeliveryUrl
    )

    if (!track?.DeliveryUrl) return null

    const subUrl = `${JELLYFIN_BASE_URL.replace(/\/+$/, '')}${track.DeliveryUrl}&api_key=${JELLYFIN_API_KEY}`
    const subRes = await fetch(subUrl)
    if (!subRes.ok) return null
    return subRes.text()
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

  // Get movie
  const movie = await db.movie.findUnique({ where: { id: movieId } })
  if (!movie) {
    return NextResponse.json({ error: 'Movie not found' }, { status: 404 })
  }

  let subText = subtitleText

  // Try Jellyfin if no subtitle provided
  if (!subText) {
    subText = await getSubtitlesFromJellyfin(movie.title) || undefined
  }

  if (!subText) {
    return NextResponse.json(
      { error: 'No subtitles available. Please upload a subtitle file.' },
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
    // We send all categories to LLM but it will filter; we include requested ones in prompt context
    const entries = await classifyLLM(cues, llmCategories)
    // Filter to only requested categories (plus language which LLM might catch)
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
