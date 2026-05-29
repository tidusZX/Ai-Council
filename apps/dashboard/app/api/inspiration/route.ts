/**
 * POST /api/inspiration — save a viral video for analysis.
 *
 * Called by the Telegram bot (source: 'telegram') or the dashboard form
 * (source: 'dashboard'). Creates an inspiration_log row immediately,
 * kicks off the video analysis pipeline in the background, and returns
 * the row ID so the caller can poll GET /api/inspiration/[id] for status.
 *
 * Bot flow:
 *   1. Bot POSTs { url, source:'telegram', telegram_chat_id }
 *   2. We return { id, status:'processing' } immediately
 *   3. Bot replies "Got it! Analyzing…" to user
 *   4. Bot polls GET /api/inspiration/[id] every 15s
 *   5. When status='complete', bot sends summary back to user
 *
 * GET /api/inspiration — list all entries, newest first.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { createServiceNodeClient } from '@shaq-os/supabase-client/service-node'

const INGESTION_SERVICE_URL =
  process.env.INGESTION_SERVICE_URL ?? 'http://localhost:3001'
const INGESTION_API_KEY = process.env.INGESTION_API_KEY ?? ''

const PLATFORM_PATTERNS: [RegExp, string][] = [
  [/instagram\.com/i, 'instagram'],
  [/tiktok\.com/i, 'tiktok'],
  [/youtube\.com|youtu\.be/i, 'youtube'],
]

function detectPlatform(url: string): string {
  for (const [re, name] of PLATFORM_PATTERNS) {
    if (re.test(url)) return name
  }
  return 'other'
}

function extractHandle(url: string): string | null {
  // instagram.com/reel/xxx or /p/xxx → no handle easily extractable
  // tiktok.com/@handle/video/xxx
  const tiktok = url.match(/tiktok\.com\/@([^/?]+)/i)
  if (tiktok) return `@${tiktok[1]}`
  return null
}

// Accept all three naming conventions so it works with both Codex's bot
// (BOT_API_KEY / INSPIRATION_BOT_API_KEY) and any existing env (TELEGRAM_BOT_API_KEY).
const BOT_API_KEY =
  process.env.BOT_API_KEY ??
  process.env.INSPIRATION_BOT_API_KEY ??
  process.env.TELEGRAM_BOT_API_KEY ??
  ''

const PostBody = z.object({
  url: z.url(),
  source: z.enum(['telegram', 'dashboard']).default('dashboard'),
  telegram_chat_id: z.coerce.string().optional(), // bot sends as number, coerce to string
  telegram_access: z.string().optional(),
})

export async function POST(req: Request) {
  // Two auth paths:
  //  1. Telegram bot — uses x-bot-api-key header → service role client (bypasses RLS)
  //  2. Dashboard — uses Supabase session cookie → regular client (RLS scoped to user)
  const botKey = req.headers.get('x-bot-api-key')
  const isBotRequest = Boolean(BOT_API_KEY && botKey === BOT_API_KEY)

  let userId: string
  // db is the client used for ALL database operations in this request
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any

  if (isBotRequest) {
    const ownerEmail = process.env.OWNER_EMAIL ?? ''
    if (!ownerEmail) {
      return NextResponse.json(
        { error: 'OWNER_EMAIL not set — cannot attribute bot request to a user' },
        { status: 503 }
      )
    }
    // Service client bypasses RLS — safe because this is a server-to-server path
    db = createServiceNodeClient()
    const { data: users } = await db.auth.admin.listUsers()
    const owner = (users?.users ?? []).find(
      (u: { email?: string }) => u.email === ownerEmail
    )
    if (!owner) {
      return NextResponse.json(
        { error: `No user found with email ${ownerEmail}` },
        { status: 404 }
      )
    }
    userId = owner.id
  } else {
    db = await createClient()
    const { data: { user } } = await db.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }
    userId = user.id
  }

  const parsed = PostBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  const { url, source, telegram_chat_id } = parsed.data
  const platform = detectPlatform(url)
  const creator_handle = extractHandle(url)

  // 1. Create the inspiration_log row immediately so the bot has an ID to poll.
  const { data: logRow, error: insertErr } = await db
    .from('inspiration_log')
    .insert({
      owner_id: userId,
      url,
      platform,
      creator_handle,
      source,
      telegram_chat_id: telegram_chat_id ?? null,
      status: 'processing',
    })
    .select('id')
    .single()

  if (insertErr || !logRow) {
    return NextResponse.json(
      { error: 'failed to create log entry', message: insertErr?.message },
      { status: 500 }
    )
  }

  // 2. Kick off the video pipeline via the ingestion-service.
  //    Pass the inspiration_log ID as metadata so the analysis-service can
  //    write back to the row when it's done.
  if (!INGESTION_API_KEY) {
    // No service configured — mark as failed with a helpful message.
    await db
      .from('inspiration_log')
      .update({
        status: 'failed',
        error_message:
          'INGESTION_API_KEY not configured. Run pnpm --filter ingestion-service dev locally, or deploy the service.',
      })
      .eq('id', logRow.id)

    return NextResponse.json(
      {
        id: logRow.id,
        status: 'failed',
        error:
          'ingestion service not configured',
      },
      { status: 503 }
    )
  }

  try {
    const res = await fetch(`${INGESTION_SERVICE_URL}/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': INGESTION_API_KEY,
      },
      body: JSON.stringify({
        url,
        owner_id: userId,
        // Passed through to analysis-service so it can write to inspiration_log
        inspiration_log_id: logRow.id,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      const msg = body?.message || body?.error || `ingestion-service returned ${res.status}`
      await db
        .from('inspiration_log')
        .update({ status: 'failed', error_message: msg })
        .eq('id', logRow.id)
      return NextResponse.json(
        { id: logRow.id, status: 'failed', error: msg },
        { status: 502 }
      )
    }

    const job = await res.json().catch(() => ({}))

    // Store the video_analysis_id if the ingestion-service returns it.
    if (job?.job_id) {
      await db
        .from('inspiration_log')
        .update({ video_analysis_id: job.job_id })
        .eq('id', logRow.id)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db
      .from('inspiration_log')
      .update({ status: 'failed', error_message: message })
      .eq('id', logRow.id)
    return NextResponse.json(
      {
        id: logRow.id,
        status: 'failed',
        error: 'ingestion-service unreachable',
        message,
        hint: 'Run pnpm --filter ingestion-service dev to start the service locally.',
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ id: logRow.id, status: 'processing' })
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 100)

  const { data: { user: listUser } } = await supabase.auth.getUser()
  if (!listUser) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { data, error } = await supabase
    .from('inspiration_log')
    .select(
      'id, url, platform, creator_handle, video_title, source, status, summary, analysis, keyframe_urls, error_message, created_at'
    )
    .eq('owner_id', listUser.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json(
      { error: 'fetch failed', message: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ entries: data ?? [] })
}
