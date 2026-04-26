# IP Creator Agent

IP Creator Agent is a Next.js creator workspace for knowledge-first KOCs. It helps a creator move through a complete content loop: clarify a personal creator profile, write publishable scripts or graphic posts, diagnose content performance, turn comments into new topics, and save reusable insights back into a shared creator memory.

The current product is built around a Chinese creator scenario: a warm, method-driven postgraduate exam creator who publishes on Xiaohongshu and short-video platforms. The structure is generic enough to extend to other creator niches.

## What It Does

- **Creator dashboard**: summarizes current priorities, recent work, profile signals, and next best actions.
- **Director module**: turns a rough idea into a complete graphic post or video script through limited follow-up questions.
- **Doctor module**: reviews graphic posts or videos using uploaded materials, data notes, retention screenshots, and manual context.
- **Assistant module**: analyzes comments, identifies high-value replies, flags risks, and suggests next topics.
- **Profile module**: stores long-term creator positioning, audience traits, content style, platform preferences, and reusable memory.
- **History module**: lists prior sessions across creation, diagnosis, and comment handling so each result can be reopened.
- **Memory writeback**: converts stable insights into creator memory candidates, then writes confirmed learnings into the profile.
- **AI fallback mode**: runs usable deterministic outputs when no API key is configured, so the app can still be demoed locally.

## Product Flow

1. The user lands on `/dashboard` and sees recommended next actions.
2. The user opens `/director` to create a graphic post or video script.
3. The Director asks a small number of targeted questions, then returns a publishable draft.
4. The user can save reusable rules from the session back into the creator memory.
5. After publishing, the user opens `/doctor` to diagnose content performance with data screenshots or manual notes.
6. The user opens `/assistant` to turn comments into replies, risk controls, and future content ideas.
7. `/history` keeps all sessions connected, and `/profile` keeps the long-term creator identity up to date.

## Main Pages

| Route | Purpose |
| --- | --- |
| `/` | Redirects to `/dashboard`. |
| `/dashboard` | Main workspace with task cards, signals, recent sessions, and profile snapshot. |
| `/director` | Script and graphic-post generation workspace. |
| `/doctor` | Content diagnosis workspace for graphic posts and videos. |
| `/assistant` | Comment operations and reply strategy workspace. |
| `/history` | Session history across modules. |
| `/profile` | Creator profile and historical asset analysis interface. |
| `/onboarding` | Guided onboarding entry point. |

## Core Modules

### Director

The Director module supports two content modes:

- **Graphic post**: target word count, structure, platform, cover text, full body, tags, title options, and publishing checklist.
- **Video**: target duration, timeline, opening/middle/ending structure, subtitles, title options, final oral script, and publishing checklist.

It uses a limited follow-up budget instead of asking endless questions. The default budget is defined in `lib/agent/module-configs.ts`:

- Director: 5 follow-ups
- Doctor: 2 follow-ups
- Assistant: 1 follow-up
- Profile: 0 follow-ups

### Doctor

The Doctor module diagnoses two types of content:

- **Graphic posts**: title, cover, structure, collection/comment conversion, and reader action.
- **Videos**: opening retention, key time points, drop-off moments, recovery moments, and next-script changes.

The current implementation treats uploaded files as registered artifacts and relies on user-provided stats or notes for analysis. It intentionally does not claim to fully understand a raw video frame by frame.

### Assistant

The Assistant module handles comment operations:

- comment value layering
- high-value comments
- risky or sensitive comments
- reply suggestions
- comment-area strategy
- next-topic extraction
- memory candidates for recurring audience needs

### Profile And Memory

The profile stores:

- creator identity
- audience traits
- expression style
- platform preferences
- compact brain snapshot
- long-term memory entries

Memory writeback is conservative. A session can generate `writebackCandidates`, but only confirmed or sufficiently stable candidates should become long-term memory.

## Architecture

This is a Next.js App Router project.

```text
app/
  api/                         API routes for profile, sessions, artifacts, uploads, dashboard, and history
  assistant/                   Comment assistant page
  dashboard/                   Main workspace page
  director/                    Content generation page
  doctor/                      Content diagnosis page
  history/                     Session history page
  onboarding/                  Onboarding page
  profile/                     Creator profile page

components/
  *-studio.tsx                 Client-side workspaces for each module
  site-header.tsx              App navigation shell
  onboarding-overlay.tsx       Guided onboarding overlay
  memory-widget.tsx            Memory/profile UI support

lib/agent/
  brain.ts                     Loads profile memory and applies writeback candidates
  dashboard-data.ts            Builds dashboard tasks, signals, and recent items
  defaults.ts                  Default creator profile and brain snapshot
  history-data.ts              Builds session history records
  http.ts                      Shared JSON helpers for API routes
  identity.ts                  Anonymous cookie identity and profile lookup
  llm.ts                       OpenAI-compatible and Anthropic-compatible JSON model calls
  module-configs.ts            Prompts, fallback behavior, output normalization, follow-up budgets
  orchestrator.ts              Runs a session through the selected module
  store.ts                     File-backed local JSON store
  types.ts                     Shared TypeScript types

design-system/
  ip-creator-agent/            Product design rules and page-level design notes
```

## API Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/bootstrap` | `GET` | Creates or returns the anonymous profile. |
| `/api/dashboard` | `GET` | Returns dashboard tasks, signals, and recent items. |
| `/api/history` | `GET` | Returns session history. |
| `/api/profile` | `GET` | Returns profile and memory entries. |
| `/api/profile` | `PATCH` | Updates profile fields and optional memory candidates. |
| `/api/sessions` | `POST` | Creates a new module session. |
| `/api/sessions/[id]` | `GET` | Returns one session and its artifacts. |
| `/api/sessions/[id]/respond` | `POST` | Adds a user answer or revision request. |
| `/api/sessions/[id]/run` | `POST` | Runs the session through the orchestrator. |
| `/api/sessions/[id]/writeback` | `POST` | Writes confirmed session memory candidates to the profile. |
| `/api/artifacts/register` | `POST` | Registers uploaded file metadata as an artifact. |
| `/api/uploads/token` | `POST` | Returns a storage key and reports whether Vercel Blob is configured. |

## Data Model

The app is centered around four persisted record types:

- `CreatorProfile`: creator identity, audience, style, platform, and brain snapshot.
- `BrainMemoryEntry`: reusable insight saved from sessions or profile updates.
- `AgentSession`: one Director, Doctor, Assistant, or Profile run.
- `ArtifactRecord`: uploaded or referenced file metadata.

The local store is file-backed JSON. By default it writes to:

```text
.data/agent-store.json
```

On Vercel, it falls back to `/tmp/ip-creator-agent` unless `AGENT_STORE_DIR` is configured. For production use, replace this file store with a durable database.

## AI Provider Configuration

The model call layer supports OpenAI-compatible chat completions and Anthropic-compatible messages.

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Available environment variables:

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | Set to `openai` or `anthropic`. |
| `OPENAI_BASE_URL` | Base URL for OpenAI-compatible providers or relays. |
| `OPENAI_API_KEY` | OpenAI-compatible API key. |
| `OPENAI_MODEL` | OpenAI-compatible model name. |
| `AI_BASE_URL` | Generic fallback base URL. |
| `AI_API_KEY` | Generic fallback API key. |
| `AI_MODEL` | Generic fallback model name. |
| `ANTHROPIC_BASE_URL` | Anthropic-compatible base URL. |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic-compatible API key. |
| `ANTHROPIC_MODEL` | Anthropic-compatible model name. |
| `AI_REQUEST_TIMEOUT_MS` | Request timeout in milliseconds. |
| `AGENT_STORE_DIR` | Optional directory for the JSON data store. |
| `BLOB_READ_WRITE_TOKEN` | Optional Vercel Blob token for future client-side uploads. |

If no API key is available, `lib/agent/llm.ts` returns module-specific fallback outputs from `lib/agent/module-configs.ts`.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Runs the Next.js development server. |
| `npm run build` | Creates a production build. |
| `npm run start` | Starts the production server. |

## Design System

The UI direction is documented in `design-system/ip-creator-agent/MASTER.md`.

The product is designed as a light-mode AI creator cockpit:

- clean SaaS dashboard surface
- Chinese-first readable typography
- bento-style panels and glass-like cards
- restrained blue, teal, orange, and neutral palette
- creator-friendly but still data-driven

Page-specific notes live under:

```text
design-system/ip-creator-agent/pages/
```

## Current Limitations

- File upload is currently metadata-first. Actual file storage and deep file analysis need a durable storage layer and parser/vision pipeline.
- The default JSON store is suitable for local demos, not multi-user production.
- The default profile and example copy are tuned for a postgraduate exam creator scenario.
- Authentication is anonymous-cookie based. There is no account login system yet.
- The Assistant and Doctor modules can use uploaded file names and user notes, but the current code does not OCR screenshots or inspect video frames.

## Recommended Next Steps

- Replace the local JSON store with Postgres, SQLite, or another durable database.
- Wire `BLOB_READ_WRITE_TOKEN` to real Vercel Blob uploads.
- Add screenshot OCR and video/keyframe analysis.
- Add user authentication and profile ownership.
- Add tests for session creation, run normalization, writeback behavior, and store mutation.
- Add export actions for scripts, reports, and comment plans.

## Tech Stack

- Next.js 15
- React 19
- TypeScript 5
- App Router
- File-backed JSON store for local state
- OpenAI-compatible and Anthropic-compatible model adapters
