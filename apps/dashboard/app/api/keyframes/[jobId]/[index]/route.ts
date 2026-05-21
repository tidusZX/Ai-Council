import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@shaq-os/supabase-client/server'

/**
 * Serves a single keyframe image from the local /tmp directory where
 * ingestion-service dropped it. Works only when dashboard and services
 * are on the same machine (local dev). When Plan 03 (Zo) moves
 * keyframes to Supabase Storage, this endpoint goes away in favor of
 * signed Storage URLs.
 *
 * URL: /api/keyframes/<jobId>/<index>  (index is 0-based into keyframe_paths)
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string; index: string }> }
) {
  const { jobId, index } = await ctx.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data: row, error } = await supabase
    .from('video_analyses')
    .select('keyframe_paths')
    .eq('id', jobId)
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const paths = (row.keyframe_paths ?? []) as string[]
  const idx = Number(index)
  if (!Number.isInteger(idx) || idx < 0 || idx >= paths.length) {
    return NextResponse.json({ error: 'index out of range' }, { status: 404 })
  }

  const filePath = paths[idx]
  // Sanity check: must be inside the ingestion tmp dir
  if (!filePath || !path.resolve(filePath).startsWith('/tmp/')) {
    return NextResponse.json({ error: 'invalid path' }, { status: 404 })
  }

  try {
    const bytes = await readFile(filePath)
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'file not found on disk', hint: 'Keyframes only exist on the machine that ran ingestion-service.' },
      { status: 404 }
    )
  }
}
