# مبادرة كلنا معاً — Kulluna Maaan

Arabic educational platform for Grade 5 mathematics students in Oman (Wusta Governorate).

## Stack

- **Frontend**: React 18 + Vite 6 + TanStack Router + TanStack Query
- **Styling**: Tailwind CSS v4 + Radix UI components
- **Backend**: Supabase (Auth, PostgreSQL, Realtime, Storage, Edge Functions)
- **AI Tutor**: Supabase Edge Function (`supabase/functions/ai-tutor/`) calling Lovable AI Gateway (Gemini 2.5 Flash)
- **Language**: Arabic (RTL), targets Omani Grade 5 students

## Running the App

```bash
npm install
npm run dev
```

The dev server runs on port 5000.

## Environment Variables

Set in `.replit` `[userenv.shared]` and `.env`:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (public) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (public) |
| `SUPABASE_URL` | Same URL for server-side use |
| `SUPABASE_PUBLISHABLE_KEY` | Same anon key for server-side use |

Secrets (set via Replit Secrets, never commit):
- `SUPABASE_SERVICE_ROLE_KEY` — used only in `client.server.ts` for admin operations
- `LOVABLE_API_KEY` — used only in the Supabase Edge Function (set in Supabase dashboard secrets)

## Project Structure

```
src/
  routes/          # TanStack Router file-based routes
  components/      # Shared UI components
  integrations/
    supabase/      # Supabase client (client.ts) and types (types.ts)
    lovable/       # Stub (OAuth not used)
  lib/             # Utility functions
  assets/          # Images and icons
supabase/
  functions/       # Deno Edge Functions (ai-tutor)
  migrations/      # 30+ SQL migration files
```

## Key Features

- Chat room (realtime via Supabase Realtime)
- Activities bank, assignments, quizzes
- Gallery & gallery contests with voting
- Competitions with answer-scrubbing security
- Badges, certificates, leaderboard
- Direct messages
- Notifications (realtime + polling fallback)
- AI Math Tutor (text, vision, image generation)
- Role system: student / teacher / supervisor / admin
- PWA support (manifest + service worker)

## Supabase Setup

The Supabase project ID is `qysyunyewjvggazhukmm`. All schema migrations are in `supabase/migrations/`. Run them in order in the Supabase SQL editor if starting fresh.

Role claim codes (hashed SHA-256 in `role_claim_codes` table):
- Admin: `WUSTA-A-2026`
- Supervisor: `WUSTA-S-2026`
- Teacher: `WUSTA-T-2026`

## User Preferences

- Keep Arabic RTL layout throughout
- Do not modify `supabase/migrations/` files — they define the production schema
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` or `LOVABLE_API_KEY` to the client bundle
- Prefer Supabase RLS policies over application-level access checks
