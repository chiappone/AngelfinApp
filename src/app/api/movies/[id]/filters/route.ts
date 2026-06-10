import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const filters = await db.filter.findMany({
      where: { movieId: id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(filters)
  } catch (error) {
    console.error('Filters fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch filters' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const movie = await db.movie.findUnique({ where: { id } })
    if (!movie) {
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 })
    }

    const body = await request.json()
    const { label, description, filtersJson } = body

    if (!label || !filtersJson) {
      return NextResponse.json(
        { error: 'label and filtersJson are required' },
        { status: 400 }
      )
    }

    // Validate that filtersJson is valid JSON with expected structure
    let parsed: unknown
    try {
      parsed = JSON.parse(filtersJson)
    } catch {
      return NextResponse.json(
        { error: 'filtersJson must be valid JSON' },
        { status: 400 }
      )
    }

    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json(
        { error: 'filtersJson must be a JSON object' },
        { status: 400 }
      )
    }

    const filterObj = parsed as Record<string, unknown>
    if (!filterObj.title && !filterObj.filters && !Array.isArray(filterObj.filters)) {
      return NextResponse.json(
        { error: 'filtersJson must have a title and filters array' },
        { status: 400 }
      )
    }

    const filter = await db.filter.create({
      data: {
        movieId: id,
        label,
        description: description || null,
        filtersJson,
        source: body.source || 'user',
        isVerified: body.isVerified || false,
      },
    })

    return NextResponse.json(filter, { status: 201 })
  } catch (error) {
    console.error('Filter create error:', error)
    return NextResponse.json({ error: 'Failed to create filter' }, { status: 500 })
  }
}
