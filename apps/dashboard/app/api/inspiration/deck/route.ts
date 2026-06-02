import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'

const PostBody = z.object({
  entry_ids: z.array(z.string().uuid()).min(1).max(20),
  client_name: z.string().min(2).max(100),
})

export async function POST(req: Request) {
  const parsed = PostBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { entry_ids, client_name } = parsed.data
  const { data, error } = await supabase
    .from('inspiration_log')
    .select(
      'id, url, platform, creator_handle, video_title, summary, analysis, keyframe_urls'
    )
    .in('id', entry_ids)
    .eq('owner_id', user.id)
    .eq('status', 'complete')

  if (error) {
    return NextResponse.json(
      { error: 'fetch failed', message: error.message },
      { status: 500 }
    )
  }

  const entries = data ?? []
  if (entries.length < entry_ids.length) {
    return NextResponse.json(
      {
        error: 'some entries not found or not complete',
        found: entries.length,
        requested: entry_ids.length,
      },
      { status: 400 }
    )
  }

  console.log(
    '[deck-stub]',
    entries.map((entry) => ({
      id: entry.id,
      first_frame_url: entry.keyframe_urls?.[0] ?? null,
    }))
  )

  return NextResponse.json({
    design_url: 'https://www.canva.com/design/STUB/edit',
    client_name,
    entry_count: entries.length,
    stub: true,
  })
}
