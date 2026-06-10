'use client'

import { useState, useCallback, useRef } from 'react'
import { useTheme } from 'next-themes'
import {
  Search, Download, Upload, Trash2, Edit3, ArrowLeft,
  ChevronRight, Eye, Moon, Sun, Filter, FileJson,
  CheckCircle2, Clock, Tag, Info, AlertCircle, Shield,
  Film, Tv, Layers, BarChart3, Plus, X
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FilterEntry {
  start?: string | number
  end?: string | number
  start_time?: string | number
  end_time?: string | number
  type?: string
  description?: string
  action?: string
  category?: string
  [key: string]: unknown
}

interface FilterRecord {
  id: string
  movieId: string
  version: number
  label: string
  description: string | null
  filtersJson: string
  source: string
  isVerified: boolean
  downloads: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
  movie?: MovieRecord
}

interface MovieRecord {
  id: string
  tmdbId: number | null
  imdbId: string | null
  title: string
  year: number | null
  posterPath: string | null
  overview: string | null
  mediaType: string
  filters: FilterRecord[]
  createdAt: string
  updatedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(t: string | number | undefined): number {
  if (!t) return 0
  if (typeof t === 'number') return t
  const parts = t.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function filterStats(entries: FilterEntry[]) {
  const categories: Record<string, number> = {}
  const actions: Record<string, number> = {}
  for (const e of entries) {
    const cat = e.category || e.type || 'Unknown'
    categories[cat] = (categories[cat] || 0) + 1
    const act = e.action || 'skip'
    actions[act] = (actions[act] || 0) + 1
  }
  return { total: entries.length, categories, actions }
}

function posterUrl(posterPath: string | null): string | null {
  if (!posterPath) return null
  if (posterPath.startsWith('http')) return posterPath
  return `https://image.tmdb.org/t/p/w342${posterPath}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const { theme, setTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MovieRecord[]>([])
  const [selectedMovie, setSelectedMovie] = useState<MovieRecord | null>(null)
  const [view, setView] = useState<'home' | 'detail'>('home')
  const [loading, setLoading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [viewerFilter, setViewerFilter] = useState<FilterRecord | null>(null)
  const [editFilter, setEditFilter] = useState<FilterRecord | null>(null)

  // Upload state
  const [uploadJson, setUploadJson] = useState('')
  const [uploadLabel, setUploadLabel] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadSubmitting, setUploadSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit state
  const [editJson, setEditJson] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const searchMovies = useCallback(async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/movies/search?q=${encodeURIComponent(searchQuery)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data)
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') searchMovies()
  }

  const selectMovie = async (movie: MovieRecord) => {
    try {
      const res = await fetch(`/api/movies/${movie.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedMovie(data)
      }
    } catch {
      setSelectedMovie(movie)
    }
    setView('detail')
  }

  const goBack = () => {
    setView('home')
    setSelectedMovie(null)
    setViewerFilter(null)
  }

  const refreshMovie = async () => {
    if (!selectedMovie) return
    try {
      const res = await fetch(`/api/movies/${selectedMovie.id}`)
      if (res.ok) setSelectedMovie(await res.json())
    } catch { /* noop */ }
  }

  const deleteFilter = async (filterId: string) => {
    try {
      const res = await fetch(`/api/filters/${filterId}`, { method: 'DELETE' })
      if (res.ok) await refreshMovie()
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const deleteMovie = async () => {
    if (!selectedMovie) return
    try {
      const res = await fetch(`/api/movies/${selectedMovie.id}`, { method: 'DELETE' })
      if (res.ok) goBack()
    } catch (err) {
      console.error('Delete movie error:', err)
    }
  }

  const downloadFilter = (filterId: string) => {
    window.open(`/api/filters/${filterId}/download`, '_blank')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      setUploadJson(reader.result as string)
    }
    reader.readAsText(file)
  }

  const submitUpload = async () => {
    if (!selectedMovie) return
    setUploadError('')
    if (!uploadLabel.trim()) { setUploadError('Label is required'); return }
    if (!uploadJson.trim()) { setUploadError('Filter JSON is required'); return }

    try {
      JSON.parse(uploadJson)
    } catch {
      setUploadError('Invalid JSON')
      return
    }

    setUploadSubmitting(true)
    try {
      const res = await fetch(`/api/movies/${selectedMovie.id}/filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: uploadLabel,
          description: uploadDescription,
          filtersJson: uploadJson,
          source: 'user',
        }),
      })
      if (res.ok) {
        await refreshMovie()
        setUploadOpen(false)
        setUploadJson('')
        setUploadLabel('')
        setUploadDescription('')
        setUploadFile(null)
      } else {
        const err = await res.json()
        setUploadError(err.error || 'Upload failed')
      }
    } catch {
      setUploadError('Network error')
    } finally {
      setUploadSubmitting(false)
    }
  }

  const openEdit = (filter: FilterRecord) => {
    setEditFilter(filter)
    setEditLabel(filter.label)
    setEditDescription(filter.description || '')
    setEditJson(filter.filtersJson)
  }

  const submitEdit = async () => {
    if (!editFilter) return
    setEditSubmitting(true)
    try {
      const res = await fetch(`/api/filters/${editFilter.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editLabel,
          description: editDescription,
          filtersJson: editJson,
        }),
      })
      if (res.ok) {
        await refreshMovie()
        setEditFilter(null)
      }
    } catch {
      // noop
    } finally {
      setEditSubmitting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-2">
                {view === 'detail' && (
                  <Button variant="ghost" size="icon" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <Film className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-bold text-lg tracking-tight">Angelfin</span>
                </div>
              </div>
              {view === 'home' && (
                <div className="flex-1 max-w-md mx-8">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search movies..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
          {view === 'home' ? (
            <HomePage
              loading={loading}
              searchResults={searchResults}
              searchQuery={searchQuery}
              onSearch={searchMovies}
              onSelectMovie={selectMovie}
            />
          ) : selectedMovie ? (
            <MovieDetailPage
              movie={selectedMovie}
              viewerFilter={viewerFilter}
              onBack={goBack}
              onDeleteFilter={deleteFilter}
              onDeleteMovie={deleteMovie}
              onDownload={downloadFilter}
              onViewFilter={setViewerFilter}
              onUploadOpen={() => setUploadOpen(true)}
              onEdit={openEdit}
            />
          ) : null}
        </main>

        {/* Upload Dialog */}
        <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) { setUploadJson(''); setUploadLabel(''); setUploadDescription(''); setUploadFile(null); setUploadError('') } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload Filter</DialogTitle>
              <DialogDescription>
                Upload a filter JSON file for {selectedMovie?.title}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="upload-label">Label *</Label>
                <Input
                  id="upload-label"
                  placeholder="e.g. Family Friendly, TV-14"
                  value={uploadLabel}
                  onChange={(e) => setUploadLabel(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="upload-desc">Description</Label>
                <Input
                  id="upload-desc"
                  placeholder="Optional description"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Filter JSON *</Label>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <FileJson className="h-3.5 w-3.5 mr-1" /> Upload File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
                <Textarea
                  placeholder='{"title": "Movie Title", "filters": [...]}'
                  className="min-h-[200px] font-mono text-sm"
                  value={uploadJson}
                  onChange={(e) => setUploadJson(e.target.value)}
                />
                {uploadFile && (
                  <p className="text-xs text-muted-foreground mt-1">File: {uploadFile.name}</p>
                )}
              </div>
              {uploadError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {uploadError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button onClick={submitUpload} disabled={uploadSubmitting}>
                {uploadSubmitting ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editFilter} onOpenChange={(open) => { if (!open) setEditFilter(null) }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Edit3 className="h-5 w-5" /> Edit Filter</DialogTitle>
              <DialogDescription>Edit filter: {editFilter?.label}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-label">Label</Label>
                <Input
                  id="edit-label"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-desc">Description</Label>
                <Input
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <div>
                <Label>Filter JSON</Label>
                <Textarea
                  className="min-h-[200px] font-mono text-sm"
                  value={editJson}
                  onChange={(e) => setEditJson(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFilter(null)}>Cancel</Button>
              <Button onClick={submitEdit} disabled={editSubmitting}>
                {editSubmitting ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Filter Viewer Dialog */}
        <Dialog open={!!viewerFilter} onOpenChange={(open) => { if (!open) setViewerFilter(null) }}>
          <DialogContent className="max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> {viewerFilter?.label}</DialogTitle>
              <DialogDescription>{viewerFilter?.description || 'Filter preview'}</DialogDescription>
            </DialogHeader>
            {viewerFilter && <FilterViewer filter={viewerFilter} />}
          </DialogContent>
        </Dialog>

        {/* Footer */}
        <footer className="border-t py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted-foreground">
            <span>Angelfin Content Filter Manager</span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" /> Manage. Share. Filter.
            </span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}

// ─── Home Page ───────────────────────────────────────────────────────────────

function HomePage({
  loading,
  searchResults,
  searchQuery,
  onSearch,
  onSelectMovie,
}: {
  loading: boolean
  searchResults: MovieRecord[]
  searchQuery: string
  onSearch: () => void
  onSelectMovie: (m: MovieRecord) => void
}) {
  return (
    <div>
      {/* Hero */}
      {!searchQuery && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Film className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Angelfin</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Manage content filter files for your movies and TV shows.
            Search, upload, and share Angelfin-compatible filters.
          </p>
        </div>
      )}

      {/* Results */}
      {searchQuery && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {loading
                ? 'Searching...'
                : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
            </h2>
            <Button variant="outline" size="sm" onClick={onSearch} disabled={loading}>
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Skeleton className="w-20 h-28 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : searchResults.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Film className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No movies found matching your search.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {searchResults.map((movie) => (
                <MovieCard key={movie.id} movie={movie} onSelect={() => onSelectMovie(movie)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Movie Card ─────────────────────────────────────────────────────────────

function MovieCard({ movie, onSelect }: { movie: MovieRecord; onSelect: () => void }) {
  const poster = posterUrl(movie.posterPath)
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow group"
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex gap-3">
          {poster ? (
            <img
              src={poster}
              alt={movie.title}
              className="w-20 h-28 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-28 rounded bg-muted flex items-center justify-center flex-shrink-0">
              {movie.mediaType === 'series' ? <Tv className="h-6 w-6 text-muted-foreground" /> : <Film className="h-6 w-6 text-muted-foreground" />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate group-hover:text-primary transition-colors">{movie.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              {movie.year && <span className="text-sm text-muted-foreground">{movie.year}</span>}
              {movie.imdbId && (
                <Badge variant="secondary" className="text-xs">IMDB</Badge>
              )}
              {movie.tmdbId && (
                <Badge variant="secondary" className="text-xs">TMDB</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {movie.filters.length} filter{movie.filters.length !== 1 ? 's' : ''}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Movie Detail Page ───────────────────────────────────────────────────────

function MovieDetailPage({
  movie,
  viewerFilter,
  onBack,
  onDeleteFilter,
  onDeleteMovie,
  onDownload,
  onViewFilter,
  onUploadOpen,
  onEdit,
}: {
  movie: MovieRecord
  viewerFilter: FilterRecord | null
  onBack: () => void
  onDeleteFilter: (id: string) => void
  onDeleteMovie: () => void
  onDownload: (id: string) => void
  onViewFilter: (f: FilterRecord) => void
  onUploadOpen: () => void
  onEdit: (f: FilterRecord) => void
}) {
  const poster = posterUrl(movie.posterPath)
  return (
    <div className="space-y-6">
      {/* Movie Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            {poster ? (
              <img
                src={poster}
                alt={movie.title}
                className="w-32 h-48 rounded-lg object-cover flex-shrink-0 shadow-md"
              />
            ) : (
              <div className="w-32 h-48 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                {movie.mediaType === 'series' ? <Tv className="h-12 w-12 text-muted-foreground" /> : <Film className="h-12 w-12 text-muted-foreground" />}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold">{movie.title}</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {movie.year && <span className="text-muted-foreground">{movie.year}</span>}
                    <Badge variant="secondary">{movie.mediaType}</Badge>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={onUploadOpen}>
                    <Plus className="h-4 w-4 mr-1" /> Add Filter
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Movie</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete &quot;{movie.title}&quot; and all its filters. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onDeleteMovie} className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {movie.overview && (
                <p className="text-sm text-muted-foreground mt-3">{movie.overview}</p>
              )}
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {movie.tmdbId && (
                  <div className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> TMDB: {movie.tmdbId}
                  </div>
                )}
                {movie.imdbId && (
                  <div className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> IMDB: {movie.imdbId}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3" /> {movie.filters.length} filter{movie.filters.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters List */}
      {movie.filters.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No Filters Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload a filter JSON file to get started.
            </p>
            <Button onClick={onUploadOpen}>
              <Upload className="h-4 w-4 mr-2" /> Upload Filter
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Filter className="h-5 w-5" /> Filters ({movie.filters.length})
          </h2>
          {movie.filters.map((filter) => (
            <FilterCard
              key={filter.id}
              filter={filter}
              onDownload={() => onDownload(filter.id)}
              onView={() => onViewFilter(filter)}
              onEdit={() => onEdit(filter)}
              onDelete={() => onDeleteFilter(filter.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Filter Card ─────────────────────────────────────────────────────────────

function FilterCard({
  filter,
  onDownload,
  onView,
  onEdit,
  onDelete,
}: {
  filter: FilterRecord
  onDownload: () => void
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  let entryCount = 0
  try {
    const parsed = JSON.parse(filter.filtersJson)
    const entries = parsed.filters || parsed.segments || parsed.items || []
    entryCount = Array.isArray(entries) ? entries.length : 0
  } catch { /* noop */ }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{filter.label}</h3>
              {filter.isVerified && (
                <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> Verified
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">{filter.source}</Badge>
              <Badge variant="outline" className="text-xs">v{filter.version}</Badge>
            </div>
            {filter.description && (
              <p className="text-sm text-muted-foreground mt-1">{filter.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {entryCount} entries</span>
              <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {filter.downloads} downloads</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(filter.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onView}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onDownload}>
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onEdit}>
                  <Edit3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Filter</AlertDialogTitle>
                  <AlertDialogDescription>
                    Delete &quot;{filter.label}&quot;? This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Filter Viewer ──────────────────────────────────────────────────────────

function FilterViewer({ filter }: { filter: FilterRecord }) {
  let parsed: Record<string, unknown> = {}
  let entries: FilterEntry[] = []

  try {
    parsed = JSON.parse(filter.filtersJson)
    const raw = parsed.filters || parsed.segments || parsed.items || parsed
    entries = Array.isArray(raw) ? raw : []
  } catch { /* noop */ }

  const stats = filterStats(entries)

  // Find total duration from entries
  let maxTime = 0
  for (const e of entries) {
    const end = parseTime(e.end ?? e.end_time)
    if (end > maxTime) maxTime = end
  }

  return (
    <Tabs defaultValue="timeline" className="max-h-[60vh] overflow-y-auto">
      <TabsList>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="stats">Stats</TabsTrigger>
        <TabsTrigger value="json">Raw JSON</TabsTrigger>
      </TabsList>

      <TabsContent value="timeline" className="mt-4">
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No filter entries to display.</p>
        ) : (
          <div className="space-y-3">
            {/* Timeline bar */}
            <div className="relative h-6 bg-muted rounded overflow-hidden">
              {entries.slice(0, 100).map((e, i) => {
                const start = parseTime(e.start ?? e.start_time)
                const end = parseTime(e.end ?? e.end_time)
                if (maxTime === 0) return null
                const left = (start / maxTime) * 100
                const width = Math.max(0.5, ((end - start) / maxTime) * 100)
                const action = e.action || 'skip'
                const color =
                  action === 'mute' ? 'bg-amber-500' :
                  action === 'blur' ? 'bg-purple-500' :
                  'bg-red-500'
                return (
                  <div
                    key={i}
                    className={`absolute top-0 h-full ${color} opacity-70 rounded-sm`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${e.type || action}: ${formatTime(start)} - ${formatTime(end)}${e.description ? ` — ${e.description}` : ''}`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0:00</span>
              <span>{formatTime(maxTime)}</span>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm" /> Skip</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded-sm" /> Mute</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-purple-500 rounded-sm" /> Blur</span>
            </div>

            {/* Entries list */}
            <ScrollArea className="h-48">
              <div className="space-y-1">
                {entries.slice(0, 200).map((e, i) => {
                  const start = parseTime(e.start ?? e.start_time)
                  const end = parseTime(e.end ?? e.end_time)
                  const action = e.action || 'skip'
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm py-1 px-2 rounded hover:bg-muted/50">
                      <span className="text-muted-foreground w-20 font-mono text-xs">
                        {formatTime(start)} - {formatTime(end)}
                      </span>
                      <Badge variant="outline" className="text-xs">{action}</Badge>
                      <span className="text-muted-foreground text-xs">{e.type || ''}</span>
                      <span className="truncate text-xs">{e.description || ''}</span>
                    </div>
                  )
                })}
                {entries.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing 200 of {entries.length} entries
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </TabsContent>

      <TabsContent value="stats" className="mt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total filter entries</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tag className="h-4 w-4" /> Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatTime(maxTime)}</div>
              <p className="text-xs text-muted-foreground">Total covered duration</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" /> By Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {Object.entries(stats.categories).map(([cat, count]) => (
                  <div key={cat} className="flex justify-between text-sm">
                    <span>{cat}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4" /> By Action
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {Object.entries(stats.actions).map(([act, count]) => (
                  <div key={act} className="flex justify-between text-sm">
                    <span className="capitalize">{act}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="json" className="mt-4">
        <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-auto max-h-96 text-wrap">
          {filter.filtersJson}
        </pre>
      </TabsContent>
    </Tabs>
  )
}
