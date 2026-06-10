'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  ArrowLeft, Settings as SettingsIcon, Film, Loader2,
  CheckCircle2, XCircle, Server, Sparkles, Save
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

interface SettingsData {
  id: string
  userId: string | null
  jellyfinBaseUrl: string | null
  jellyfinApiKey: string | null
  openaiApiKey: string | null
  openaiBaseUrl: string | null
  openaiModel: string | null
  updatedAt: string
}

const DEFAULTS: Omit<SettingsData, 'id' | 'userId' | 'updatedAt'> = {
  jellyfinBaseUrl: '',
  jellyfinApiKey: '',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini',
}

export default function SettingsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; serverName?: string; version?: string; error?: string } | null>(null)

  const [jellyfinBaseUrl, setJellyfinBaseUrl] = useState('')
  const [jellyfinApiKey, setJellyfinApiKey] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(DEFAULTS.openaiBaseUrl)
  const [openaiModel, setOpenaiModel] = useState(DEFAULTS.openaiModel)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/')
      return
    }
    fetchSettings()
  }, [session, status, router])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data: SettingsData = await res.json()
        setJellyfinBaseUrl(data.jellyfinBaseUrl || '')
        setJellyfinApiKey(data.jellyfinApiKey || '')
        setOpenaiApiKey(data.openaiApiKey || '')
        setOpenaiBaseUrl(data.openaiBaseUrl || DEFAULTS.openaiBaseUrl)
        setOpenaiModel(data.openaiModel || DEFAULTS.openaiModel)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async (section: 'jellyfin' | 'ai') => {
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (section === 'jellyfin') {
        body.jellyfinBaseUrl = jellyfinBaseUrl
        body.jellyfinApiKey = jellyfinApiKey
      } else {
        body.openaiApiKey = openaiApiKey
        body.openaiBaseUrl = openaiBaseUrl
        body.openaiModel = openaiModel
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        toast({ title: 'Settings saved', description: `${section === 'jellyfin' ? 'Jellyfin' : 'AI'} configuration updated.` })
      } else {
        toast({ title: 'Save failed', description: 'Could not save settings.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Save failed', description: 'Network error.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const testJellyfin = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/settings/test-jellyfin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: jellyfinBaseUrl, apiKey: jellyfinApiKey }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch {
      setTestResult({ success: false, error: 'Network error' })
    } finally {
      setTesting(false)
    }
  }, [jellyfinBaseUrl, jellyfinApiKey])

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <SettingsIcon className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-lg tracking-tight">Settings</span>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              <Film className="h-3 w-3 mr-1" /> Angelfin
            </Badge>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Jellyfin Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-amber-500" />
              Jellyfin Connection
            </CardTitle>
            <CardDescription>
              Configure your Jellyfin server to enable subtitle fetching and media integration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="jf-url">Server URL</Label>
              <Input
                id="jf-url"
                placeholder="https://jellyfin.example.com"
                value={jellyfinBaseUrl}
                onChange={(e) => setJellyfinBaseUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jf-key">API Key</Label>
              <Input
                id="jf-key"
                type="password"
                placeholder="Your Jellyfin API key"
                value={jellyfinApiKey}
                onChange={(e) => setJellyfinApiKey(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={testJellyfin}
                disabled={testing || !jellyfinBaseUrl || !jellyfinApiKey}
              >
                {testing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Test Connection
              </Button>
              {testResult && (
                <div className="flex items-center gap-2 text-sm">
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">
                        {testResult.serverName} v{testResult.version}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-red-600 dark:text-red-400">{testResult.error}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button onClick={() => saveSettings('jellyfin')} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save Jellyfin Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              AI Configuration
            </CardTitle>
            <CardDescription>
              Configure the AI provider for filter generation. Supports OpenAI-compatible APIs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-key">OpenAI API Key</Label>
              <Input
                id="ai-key"
                type="password"
                placeholder="sk-..."
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-url">Base URL</Label>
              <Input
                id="ai-url"
                placeholder="https://api.openai.com/v1"
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Change this if using an OpenAI-compatible provider (e.g. Azure, local LLM).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-model">Model</Label>
              <Input
                id="ai-model"
                placeholder="gpt-4o-mini"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
              />
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button onClick={() => saveSettings('ai')} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save AI Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted-foreground">
          <span>Angelfin Settings</span>
          <span>Configuration saved per-user</span>
        </div>
      </footer>
    </div>
  )
}
