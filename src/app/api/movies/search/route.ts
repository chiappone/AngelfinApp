import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    // Text search (case-insensitive)
    if (q) {
      const movies = await db.movie.findMany({
        where: {
          title: { contains: q, mode: 'insensitive' },
        },
        include: { filters: { orderBy: { createdAt: 'desc' } } },
        orderBy: { title: 'asc' },
        take: 20,
      })
      return NextResponse.json(movies)
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
