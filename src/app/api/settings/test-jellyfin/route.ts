import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { baseUrl, apiKey } = await req.json()

  if (!baseUrl || !apiKey) {
    return NextResponse.json({ success: false, error: "Base URL and API Key are required" }, { status: 400 })
  }

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/System/Info`
    const res = await fetch(url, {
      headers: {
        "X-Emby-Token": apiKey,
        "Authorization": `MediaBrowser Token="${apiKey}"`,
      },
    })

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: `Jellyfin returned ${res.status}: ${res.statusText}`,
      })
    }

    const data = await res.json()
    return NextResponse.json({
      success: true,
      serverName: data.ServerName,
      version: data.Version,
    })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    })
  }
}
