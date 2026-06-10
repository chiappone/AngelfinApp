import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const filter = await db.filter.findUnique({
      where: { id },
      include: { movie: true },
    })

    if (!filter) {
      return NextResponse.json({ error: 'Filter not found' }, { status: 404 })
    }

    const filename = `${filter.movie.title.replace(/[^a-zA-Z0-9]/g, '_')}_${filter.label.replace(/[^a-zA-Z0-9]/g, '_')}.json`

    return new NextResponse(filter.filtersJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Filter download error:', error)
    return NextResponse.json({ error: 'Failed to download filter' }, { status: 500 })
  }
}
