"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Github, Chrome } from "lucide-react"

export function LoginButton() {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => signIn("github", { callbackUrl: "/" })}
      >
        <Github className="h-4 w-4 mr-1.5" />
        GitHub
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => signIn("google", { callbackUrl: "/" })}
      >
        <Chrome className="h-4 w-4 mr-1.5" />
        Google
      </Button>
    </div>
  )
}
