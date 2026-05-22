import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { applyPlanToNotion, type PlannerApprovePick } from '@/lib/notion'

export const maxDuration = 60

const Body = z.object({
  sessionId: z.uuid(),
  /**
   * Picks already enriched with notionPageId + scheduledDate.
   * The /planner UI looks each ideaId up against the candidates it
   * fetched from Notion to attach notionPageId; the date is computed
   * from weekNumber + slotInWeek + the month label.
   */
  picks: z
    .array(
      z.object({
        ideaId: z.string(),
        notionPageId: z.string().min(10),
        finalCaption: z.string().min(10).max(2200),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        scores: z.object({
          icp_signal: z.number(),
          proof_density: z.number(),
          format_leverage: z.number(),
          total: z.number(),
        }),
        arcPosition: z.string(),
        hasConversionHook: z.boolean(),
        isFirstPostCandidate: z.boolean(),
      })
    )
    .min(1)
    .max(10),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  // Verify the user owns the session before writing back
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', parsed.data.sessionId)
    .eq('user_id', user.id)
    .single()
  if (sessionErr || !session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }

  try {
    const result = await applyPlanToNotion(parsed.data.picks as PlannerApprovePick[])
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'failed to apply plan to notion', message },
      { status: 502 }
    )
  }
}
