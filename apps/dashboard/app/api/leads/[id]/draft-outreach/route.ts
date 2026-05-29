import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { createClient } from '@shaq-os/supabase-client/server'

export const maxDuration = 30

const OUTREACH_WRITER_SYSTEM_PROMPT = `You are writing an Instagram DM on behalf of Shaq, a Singapore-based commercial photographer (food, product, lifestyle, cinematic work). Shaq is doing cold outbound to mid-sized SG F&B and product brands he wants to land as $2k/mo retainer clients.

You're given a visual-brand diagnosis of the target business (their current weaknesses, gaps, an outreach_angle, and their opportunity_for_shaq notes). Your job: turn that into a ready-to-send IG DM.

**Hard rules for the DM:**
- 3–5 sentences, max ~80 words
- Plain text, no emoji-spam (max 1 emoji)
- Open with a SPECIFIC observation from the diagnosis — not "I love your brand" or "saw your IG"
- Reference at least one concrete gap or strength, by name (e.g., "your hero shots", "the lighting in your menu photos", "the cohesion across your last 6 posts")
- Land with a soft CTA — offer to send a quick teardown / share 2-3 ideas, NOT "let's hop on a call"
- Sound like a peer who happens to be a professional, not a salesman
- Singapore English is fine; avoid words: "elevate", "unlock", "level up", "stunning", "vibes", "amazing", "incredible"
- Never lead with credentials or client list — earn the right to mention those later
- Sign off with just "— Shaq" (no titles)

**Tone reference:** thoughtful, observational, low-pressure. The DM should feel like Shaq genuinely noticed something specific and had a useful thought, not like he's running a template.

Output JUST the DM body. No quotation marks, no preamble, no explanation.`

const Params = z.object({ id: z.uuid() })

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const paramsParsed = Params.safeParse(await ctx.params)
  if (!paramsParsed.success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', paramsParsed.data.id)
    .eq('owner_id', user.id)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'lead not found' }, { status: 404 })
  }

  const diagnosis = (lead.diagnosis ?? {}) as {
    outreach_angle?: string
    top_gaps?: string[]
    opportunity_for_shaq?: { score?: number; notes?: string }
    brand_consistency?: { score?: number; notes?: string }
    image_quality?: { score?: number; notes?: string }
    styling_composition?: { score?: number; notes?: string }
    visual_hierarchy?: { score?: number; notes?: string }
  }

  const userMessage = [
    `Business: ${lead.business_name}`,
    lead.ig_handle ? `IG handle: @${lead.ig_handle}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    `Opportunity score: ${lead.opportunity_score ?? '—'}/10`,
    '',
    diagnosis.outreach_angle
      ? `Outreach angle (use as the seed for the opener): ${diagnosis.outreach_angle}`
      : null,
    '',
    diagnosis.top_gaps?.length
      ? `Top gaps:\n${diagnosis.top_gaps.map((g) => `- ${g}`).join('\n')}`
      : null,
    '',
    diagnosis.opportunity_for_shaq?.notes
      ? `Opportunity notes: ${diagnosis.opportunity_for_shaq.notes}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = anthropic('claude-sonnet-4-6')

  try {
    const { text } = await generateText({
      model,
      system: OUTREACH_WRITER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
    return NextResponse.json({ draft: text.trim(), channel: 'instagram_dm' })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'draft generation failed', message },
      { status: 500 }
    )
  }
}
