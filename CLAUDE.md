# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server (default port 8080)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run tests once (vitest)
npm run test:watch   # Watch mode tests
```

No test runner config needed — vitest picks up `src/**/*.test.ts` automatically. Tests use `localStorage.clear()` in `beforeEach` and run against the real storage module (no mocks).

## Environment Variables

Create a `.env.local` for optional integrations:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_SHARED_TASKS=true   # optional: share data across all anonymous users
VITE_GOOGLE_CLIENT_ID=...
```

The app works fully without any env vars — all features degrade gracefully to localStorage-only.

## Architecture

### Data flow

All persistence goes through `src/lib/storage.ts`, which is the single source of truth. It manages:

- **localStorage** as the primary store (always available)
- **Supabase** as an optional cloud sync layer (anonymous auth, queued writes via `cloudWriteQueue`)
- A **module-level cache** (`tasksCache`, `highlightsCache`, `bucketConfigsCache`) to avoid repeated `JSON.parse` on hot paths — invalidated on every write via the `writeXxxLocal()` functions

When highlights are written, `writeHighlightsLocal` dispatches `window.dispatchEvent(new CustomEvent('mt:highlights-changed'))`. Components that display highlight state (e.g. `Highlight.tsx`) listen to this event to re-render immediately without needing shared state.

### Key data model

- **Task**: belongs to a `bucket` (string ID), has `orderIndex`, `status` (`todo`|`doing`|`done`|`archived`)
- **DailyHighlight**: the single focus item. Only one can be active (`completedAt` is undefined). `HIGHLIGHT_NOT_DONE_SENTINEL = '1970-01-01T...'` marks "sent to history as not done" vs a real completion timestamp.
- **BucketConfig** (`mt_bucket_configs`): ordered list of bucket IDs + icons. Core buckets are `stove_main`, `stove_secondary`, `sink`. Users can add custom ones (`custom_<uuid>`).
- **BucketNames** (`mt_bucket_names`): `Record<string, string>` mapping bucket ID → user-chosen label. Falls back to `BUCKET_LABELS` constants in the UI.

### localStorage keys

| Key | Content |
|---|---|
| `mt_tasks` | `Task[]` |
| `mt_highlights` | `DailyHighlight[]` |
| `mt_settings` | `AppSettings` |
| `mt_bucket_names` | `Record<string, string>` |
| `mt_bucket_configs` | `BucketConfig[]` |

### Pages and routing

- `/` → `Highlight.tsx` — shows the active highlight post-it, opens `HighlightModal` to set/change it
- `/fogons` → `Fogons.tsx` — three-column (or more) kanban with @dnd-kit drag-and-drop
- `/reflect` → `Reflect.tsx` — history of past highlights with done/not-done toggle
- `/settings` → `Settings.tsx` — timezone, durations, Google Calendar connect, Supabase status, data export/import/reset

`OverdueHighlightPrompt` is rendered globally in `AppShell` (not inside a route) and polls every 30 seconds for overdue highlights.

### Shared highlight logic

- `src/lib/highlightActions.ts` — `saveHighlightWithSync(data)`: upserts a highlight then syncs to Google Calendar. Used by both `Highlight.tsx` and `Fogons.tsx` to avoid duplication.
- `src/components/HighlightReviewDialog.tsx` — two-step (or three-step) dialog: "did you do it?" → "keep for tomorrow / send to history / return task to bucket". Used by both `Highlight.tsx` (dismissible) and `OverdueHighlightPrompt` (non-dismissible, `preventDismiss` prop).

### Highlight lifecycle

1. Created via `upsertHighlight()` — replaces any existing active highlight (at most one active at a time, enforced by `enforceSingleActiveHighlight`)
2. Task linked via `taskId` gets archived from its bucket while highlight is active
3. On completion → task stays archived; on "not done" → task is restored to its bucket; on "return to fogon" → task moves to a user-chosen bucket

### Google Calendar integration

`src/lib/googleCalendar.ts` uses Google Identity Services (GSI) implicit flow. Access tokens are stored in `localStorage` under `mt_google_calendar_auth` with expiry. `syncHighlightToGoogleCalendar()` creates or patches an event, retrying with a fresh token on 401/403.

### Supabase sync

`initializeCloudSync(force?)` runs on mount and on window focus/visibility change. On first run it merges remote data into local (remote wins for core data). Subsequent writes are queued via `enqueueCloudWrite()` which chains promises to avoid races. `suppressCloudWrites` is set during the initial sync and during `importAllData` to prevent redundant writes.

The Supabase schema has fixed columns only for the three core bucket names (`stove_main_name`, etc.). Custom bucket configs are localStorage-only.

## UI conventions

- shadcn/ui components live in `src/components/ui/` — don't edit these directly
- Tailwind with `cn()` (`clsx` + `tailwind-merge`) for conditional classes
- Toast notifications via `sonner`
- `font-display` class = Space Grotesk; body = Inter
- Custom CSS classes like `post-it`, `bucket-section`, `highlight-banner` are defined in `src/index.css`
