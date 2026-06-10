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

    return NextResponse.json(filter)
  } catch (error) {
    console.error('Filter fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch filter' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const existing = await db.filter.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Filter not found' }, { status: 404 })
    }

    const body = await request.json()
    const { label, description, filtersJson, isVerified } = body

    const updateData: Record<string, unknown> = {}
    if (label !== undefined) updateData.label = label
    if (description !== undefined) updateData.description = description
    if (isVerified !== undefined) updateData.isVerified = isVerified

    if (filtersJson !== undefined) {
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
      updateData.filtersJson = filtersJson
    }

    const filter = await db.filter.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(filter)
  } catch (error) {
    console.error('Filter update error:', error)
    return NextResponse.json({ error: 'Failed to update filter' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await db.filter.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Filter delete error:', error)
    return NextResponse.json({ error: 'Failed to delete filter' }, { status: 500 })
  }
}
