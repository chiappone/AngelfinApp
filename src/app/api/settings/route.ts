import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let settings = await db.settings.findUnique({
    where: { userId: session.user.id },
  })

  if (!settings) {
    settings = await db.settings.create({
      data: { userId: session.user.id },
    })
  }

  return NextResponse.json(settings)
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()

  const settings = await db.settings.upsert({
    where: { userId: session.user.id },
    update: {
      jellyfinBaseUrl: body.jellyfinBaseUrl,
      jellyfinApiKey: body.jellyfinApiKey,
      openaiApiKey: body.openaiApiKey,
      openaiBaseUrl: body.openaiBaseUrl,
      openaiModel: body.openaiModel,
    },
    create: {
      userId: session.user.id,
      jellyfinBaseUrl: body.jellyfinBaseUrl,
      jellyfinApiKey: body.jellyfinApiKey,
      openaiApiKey: body.openaiApiKey,
      openaiBaseUrl: body.openaiBaseUrl,
      openaiModel: body.openaiModel,
    },
  })

  return NextResponse.json(settings)
}
