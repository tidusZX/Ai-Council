import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'

/**
 * DELETE /api/video-jobs/[id]
 * Removes a video_analyses row. RLS scopes by owner_id so users can only
 * delete their own. We do NOT delete the keyframes/video on disk (they
 * live in /tmp and get auto-reaped by the OS).
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { error } = await supabase.from('video_analyses').delete().eq('id', id)
  if (error) {
    return NextResponse.json(
      { error: 'delete failed', message: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, id })
}
