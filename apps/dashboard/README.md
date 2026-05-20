# AI Council

A production-ready Next.js app where you submit a question, idea, or business decision and receive responses from five expert AI advisors — Strategist, Creative Director, Technical Producer, Marketing Lead, and Critic — then the Chairperson synthesizes everything into a clear final recommendation.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Auth | Supabase Auth |
| Database | Supabase Postgres + pgvector |
| AI | Vercel AI SDK + Anthropic Claude |
| Hosting | Vercel |
| Tests | Vitest |

## Council Members

| Member | Focus |
|---|---|
| ♟️ Strategist | Competitive positioning, market timing, moats |
| 🎨 Creative Director | Narrative, brand identity, creative concepts |
| ⚙️ Technical Producer | Feasibility, stack, MVP scope, build effort |
| 📣 Marketing Lead | Audience, channels, GTM, 90-day plan |
| 🔍 Critic | Assumptions, failure modes, risks |
| 👑 Chairperson | Synthesizes all into a final recommendation |

---

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd ai-council
npm install
```

### 2. Create Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy your **Project URL**, **Anon key**, and **Service role key** from Settings → API

### 3. Run database migrations

In the Supabase SQL Editor, paste and run:

```
supabase/migrations/001_initial.sql
```

This creates the `sessions` and `messages` tables with Row Level Security, pgvector support, and auto-update triggers.

### 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI — choose one provider
ANTHROPIC_API_KEY=sk-ant-...
# or
# OPENAI_API_KEY=sk-...
# AI_PROVIDER=openai   (defaults to "anthropic")

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `ANTHROPIC_API_KEY` | If using Anthropic | Claude API key |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key |
| `AI_PROVIDER` | No | `"anthropic"` (default) or `"openai"` |
| `NEXT_PUBLIC_APP_URL` | Yes | Full app URL (used for auth redirects) |

---

## Deploying to Vercel

1. Push your repo to GitHub
2. Import it at [vercel.com/new](https://vercel.com/new)
3. Add all environment variables from `.env.local`
4. Deploy

Vercel will auto-detect Next.js and configure the build.

**Set `NEXT_PUBLIC_APP_URL`** to your production URL (e.g. `https://ai-council.vercel.app`).

In Supabase → Authentication → URL Configuration, add your Vercel domain to:
- Site URL
- Redirect URLs: `https://your-domain.vercel.app/auth/callback`

---

## Project Structure

```
ai-council/
├── app/
│   ├── (auth)/            # Login and signup pages
│   ├── (dashboard)/       # Protected dashboard and session pages
│   │   ├── dashboard/     # Session list
│   │   └── sessions/
│   │       ├── new/       # Create new session
│   │       └── [id]/      # View session + streaming council
│   ├── api/
│   │   ├── council/       # Streaming AI endpoint
│   │   ├── sessions/      # CRUD sessions
│   │   └── auth/logout/   # Sign out
│   └── auth/callback/     # Supabase OAuth callback
├── components/
│   ├── auth/              # LoginForm, SignupForm
│   ├── council/           # CouncilSession, CouncilMemberCard, ChairpersonSummary, PromptForm
│   ├── dashboard/         # SessionCard
│   └── ui/                # Button, Input, Textarea
├── lib/
│   ├── ai/
│   │   └── council-members.ts   # System prompts + council config
│   ├── supabase/
│   │   ├── client.ts            # Browser client
│   │   └── server.ts            # Server + service role clients
│   └── utils.ts
├── supabase/
│   └── migrations/001_initial.sql
├── tests/
│   ├── lib/               # Unit tests for utils + council members
│   └── api/               # Validation tests
└── types/
    └── database.ts         # Full Database generic type
```

---

## Database Schema

### `sessions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK → auth.users |
| title | text | Auto-generated from prompt |
| prompt | text | The user's question/idea |
| status | text | pending → processing → complete |
| created_at | timestamptz | |
| updated_at | timestamptz | Auto-updated |

### `messages`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| session_id | uuid | FK → sessions |
| role | text | One of the 6 council roles |
| content | text | AI response (streamed, saved on finish) |
| is_complete | boolean | Set true when stream finishes |
| embedding | vector(1536) | pgvector-ready for semantic search |

All tables use **Row Level Security** — users can only access their own data.

---

## Tests

```bash
npm test            # Run once
npm run test:watch  # Watch mode
```

22 tests covering:
- `lib/utils.ts` — cn, truncate, generateSessionTitle, formatDate
- `lib/ai/council-members.ts` — member config, prompts, getMemberConfig
- Session schema validation — zod schemas, title generation

---

## Switching AI Providers

Set `AI_PROVIDER=openai` in `.env.local` and provide `OPENAI_API_KEY`. The app uses `gpt-4o` instead of `claude-sonnet-4-6`. All council member system prompts work with either provider.

---

## pgvector / Semantic Search

The `messages.embedding` column is pre-wired for semantic search (1536 dimensions, compatible with OpenAI `text-embedding-ada-002` and Anthropic embeddings). The IVFFlat index is created in the migration. To enable search:

1. Generate embeddings when saving messages (add to the `onFinish` callback in `app/api/council/route.ts`)
2. Query with `<=>` cosine distance operator in a Supabase RPC function
