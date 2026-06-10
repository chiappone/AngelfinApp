"use client"

import { useSession } from "next-auth/react"
import { LoginButton } from "@/components/login-button"

export function ProtectedRoute({ children, message }: { children: React.ReactNode; message?: string }) {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground mb-4">{message || "Please sign in to continue."}</p>
        <LoginButton />
      </div>
    )
  }

  return <>{children}</>
}
