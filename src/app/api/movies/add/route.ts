import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tmdbId, title, year, posterPath, overview, mediaType, imdbId } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Check if movie already exists (by tmdbId or title+year)
    const existing = tmdbId
      ? await db.movie.findUnique({ where: { tmdbId: Number(tmdbId) } })
      : await db.movie.findFirst({
          where: { title, year: year || null },
        })

    if (existing) {
      return NextResponse.json(existing, { status: 200 })
    }

    const movie = await db.movie.create({
      data: {
        tmdbId: tmdbId ? Number(tmdbId) : null,
        imdbId: imdbId || null,
        title,
        year: year ? Number(year) : null,
        posterPath: posterPath || null,
        overview: overview || null,
        mediaType: mediaType || 'movie',
      },
      include: { filters: { orderBy: { createdAt: 'desc' } } },
    })

    return NextResponse.json(movie, { status: 201 })
  } catch (error) {
    console.error('Add movie error:', error)
    return NextResponse.json({ error: 'Failed to add movie' }, { status: 500 })
  }
}
