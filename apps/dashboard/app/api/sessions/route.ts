import { createClient } from '@shaq-os/supabase-client/server'
import { generateSessionTitle } from '@/lib/utils'
import { z } from 'zod'
import { NextResponse } from 'next/server'

const CreateSessionSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(4000),
  title: z.string().max(200).optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = CreateSessionSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { prompt, title } = parsed.data

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      title: title ?? generateSessionTitle(prompt),
      prompt,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(session, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(sessions)
}
