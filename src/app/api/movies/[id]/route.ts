import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const movie = await db.movie.findUnique({
      where: { id },
      include: { filters: { orderBy: { createdAt: 'desc' } } },
    })

    if (!movie) {
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 })
    }

    return NextResponse.json(movie)
  } catch (error) {
    console.error('Movie fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch movie' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await db.movie.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Movie delete error:', error)
    return NextResponse.json({ error: 'Failed to delete movie' }, { status: 500 })
  }
}
