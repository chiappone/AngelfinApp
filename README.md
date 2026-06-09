# AngelfinApp

Community filter database and web app for [Angelfin](https://github.com/chiappone/Angelfin) — a VidAngel-style content filter plugin for Jellyfin.

## Concept

AI-generated content filters with human review. Instead of manually timing every skip (like VideoSkip), AngelfinApp auto-generates filters from subtitles using wordlist matching + LLM contextual analysis, then lets the community verify and refine them.

## Architecture (Planned)

```
┌─────────────────────────────────────────────────┐
│                  Web Frontend                     │
│  Movie search · Filter viewer · Timeline editor │
│  Review queue · User preferences                │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                   API Server                      │
│  Filter CRUD · User auth · Search · Export      │
│  Batch processing · Webhook jobs                │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                  Database                        │
│  Movies (TMDB/IMDB) · Filters (JSON)           │
│  Users · Reviews · Revisions · Sync anchors    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Processing Pipeline                 │
│  Subtitle ingest → Wordlist → LLM analysis     │
│  → Filter generation → Confidence scoring      │
└─────────────────────────────────────────────────┘
```

## Pipeline

1. **Ingest** — subtitle files (SRT/VTT) from OpenSubtitles, local libraries, or user uploads
2. **Wordlist pass** — fast dictionary matching for profanity/language
3. **LLM analysis** — contextual scene understanding from SDH cues and dialogue
4. **Generate** — Angelfin filter JSON with confidence scores
5. **Review** — community flags `[REVIEW]` items, corrects timing, adds missed scenes
6. **Publish** — verified filters available for Angelfin plugin consumption

## Key Differentiators vs VideoSkip

- **AI-generated** — scale to thousands of movies in hours, not months
- **Confidence scoring** — AI filters start lower, human-verified filters rank higher
- **Sync anchors** — screenshot timestamps for timeline alignment across encodes
- **Subtitle-aware** — leverages SDH sound cues that manual timing misses
- **Revision history** — track changes and corrections over time

## Tech Stack (TBD)

- **Frontend**: React/Next.js or SvelteKit
- **Backend**: Node.js/Express or Python/FastAPI
- **Database**: PostgreSQL
- **Search**: TMDB API integration
- **Auth**: GitHub OAuth

## Status

🚧 **Planning phase** — architecture and design discussions in progress.

## Related

- [Angelfin Plugin](https://github.com/chiappone/Angelfin) — Jellyfin plugin that consumes these filters
- [VideoSkip Exchange](https://videoskip.herokuapp.com/exchange/) — inspiration and existing community source

## License

MIT
