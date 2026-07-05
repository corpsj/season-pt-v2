# Season PT v2

Korean PT/Pilates studio operations app for owners, trainers, and members. The mobile app supports daily class management, member records, chat, meal/workout/body tracking, schedule-change requests, and membership operations. The desktop console supports owner-level calendar, member, revenue, request, and operations views.

## Main Surfaces

- `/t`: trainer mobile app. Calendar, class detail, member detail, records, chat, settlement/performance, retention.
- `/m`: member mobile app. Schedule, requests, records, meals, body composition, chat.
- `/console`: owner desktop console. Studio overview, calendar, members, requests, revenue, finance, retention.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict
- Tailwind CSS v4 with project design tokens in `src/app/globals.css`
- Supabase Auth and Database
- Custom signed member session cookie for member login
- Bun for local commands and tests

## Required Environment

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MEMBER_SESSION_SECRET=
CREDENTIAL_ENC_KEY=
TRAINER_EMAIL_DOMAIN=trainer.seasonpt.local
CRON_SECRET=
```

`MEMBER_SESSION_SECRET` is required in production. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to client components.

## Local Development

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Validation

```bash
bunx tsc --noEmit
bun run lint
bun test
bun run build
```

For rendered UI changes, also validate with a browser screenshot or equivalent visual check. Project instructions require reading `AGENTS.md` and the local Next.js docs in `node_modules/next/dist/docs/` before changing Next.js behavior.

## Key Directories

- `src/app`: App Router pages, layouts, server actions, and API routes.
- `src/components`: shared shell, trainer tabs, console chrome, and reusable UI primitives.
- `src/lib/auth`: custom member sessions and credential encryption helpers.
- `src/lib/data`: Supabase clients, date utilities, domain queries, and mutations.
- `docs`: product/design specs and usability implementation plans.
