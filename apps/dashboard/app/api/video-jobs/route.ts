import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'

const INGESTION_SERVICE_URL =
  process.env.INGESTION_SERVICE_URL ?? 'http://localhost:3001'

const BodySchema = z.object({
  url: z.url(),
})

/**
 * Browser-safe proxy that authenticates the user, then forwards the URL
 * to the ingestion-service with the user's owner_id.
 *
 * Browser never talks to localhost:3001 directly — keeps the service
 * unreachable from the public internet.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  try {
    const res = await fetch(`${INGESTION_SERVICE_URL}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: parsed.data.url, owner_id: user.id }),
    })
    const body = await res.json().catch(() => null)
    return NextResponse.json(body, { status: res.status })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        error: 'ingestion-service unreachable',
        message,
        hint:
          'Make sure `pnpm --filter ingestion-service dev` is running locally.',
      },
      { status: 502 }
    )
  }
}
