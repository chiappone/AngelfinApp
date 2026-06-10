import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const TMDB_KEY = process.env.TMDB_API_KEY

interface TMDbMovie {
  id: number
  title: string
  release_date?: string
  poster_path?: string | null
  overview?: string
  media_type?: string
  first_air_date?: string
  name?: string
}

async function searchTMDb(query: string): Promise<TMDbMovie[]> {
  if (!TMDB_KEY) return []
  const res = await fetch(
    `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${TMDB_KEY}&include_adult=false`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.results || []).filter(
    (r: TMDbMovie) => r.media_type === 'movie' || r.media_type === 'tv'
  )
}

async function getTMDbDetails(tmdbId: number) {
  if (!TMDB_KEY) return null
  const typeRes = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}`,
    { next: { revalidate: 86400 } }
  )
  if (typeRes.ok) {
    const data = await typeRes.json()
    return { ...data, media_type: 'movie' }
  }
  const tvRes = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}`,
    { next: { revalidate: 86400 } }
  )
  if (tvRes.ok) {
    const data = await tvRes.json()
    return { ...data, media_type: 'series', title: data.name, release_date: data.first_air_date }
  }
  return null
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const q = searchParams.get('q')?.trim()
  const tmdbId = searchParams.get('tmdbId')
  const imdbId = searchParams.get('imdbId')

  if (!q && !tmdbId && !imdbId) {
    return NextResponse.json(
      { error: 'Provide a search query (q), tmdbId, or imdbId' },
      { status: 400 }
    )
  }

  try {
    // Direct lookup by tmdbId
    if (tmdbId) {
      const movie = await db.movie.findUnique({
        where: { tmdbId: parseInt(tmdbId, 10) },
        include: { filters: { orderBy: { createdAt: 'desc' } } },
      })
      if (movie) return NextResponse.json([movie])
      return NextResponse.json([])
    }

    // Direct lookup by imdbId
    if (imdbId) {
      const movie = await db.movie.findFirst({
        where: { imdbId },
        include: { filters: { orderBy: { createdAt: 'desc' } } },
      })
      if (movie) return NextResponse.json([movie])
      return NextResponse.json([])
    }

    // Text search — local DB + TMDb, merged
    if (q) {
      // Search local DB
      const localMovies = await db.movie.findMany({
        where: {
          title: { contains: q },
        },
        include: { filters: { orderBy: { createdAt: 'desc' } } },
        orderBy: { title: 'asc' },
        take: 20,
      })

      const localTmdbIds = new Set(localMovies.filter(m => m.tmdbId).map(m => m.tmdbId))

      // Always search TMDb for more results
      const tmdbResults = await searchTMDb(q)
      const tmdbEnriched = await Promise.all(
        (tmdbResults || []).slice(0, 10).map(async (r) => {
          // Skip if already in local DB
          if (localTmdbIds.has(r.id)) return null
          const details = await getTMDbDetails(r.id)
          return {
            tmdbId: r.id,
            title: r.title || r.name || '',
            year: r.release_date
              ? parseInt(r.release_date.substring(0, 4), 10) || null
              : r.first_air_date
              ? parseInt(r.first_air_date.substring(0, 4), 10) || null
              : null,
            posterPath: r.poster_path,
            overview: r.overview || null,
            mediaType: r.media_type === 'tv' ? 'series' : 'movie',
            imdbId: details?.imdb_id || null,
            _source: 'tmdb' as const,
            filters: [],
          }
        })
      )

      const tmdbFiltered = tmdbEnriched.filter(Boolean)
      return NextResponse.json([...localMovies, ...tmdbFiltered])
    }

    return NextResponse.json([])
  } catch (error) {
    console.error('Movie search error:', error)
    return NextResponse.json(
      { error: 'Failed to search movies' },
      { status: 500 }
    )
  }
}
