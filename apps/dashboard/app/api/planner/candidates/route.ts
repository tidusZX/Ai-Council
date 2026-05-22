import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'
import { fetchCandidatesFromNotion } from '@/lib/notion'

export const maxDuration = 30

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  try {
    const candidates = await fetchCandidatesFromNotion()
    return NextResponse.json({ candidates, count: candidates.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'failed to fetch notion candidates', message },
      { status: 502 }
    )
  }
}
