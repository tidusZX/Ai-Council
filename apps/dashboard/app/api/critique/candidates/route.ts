/**
 * GET /api/critique/candidates — Plan 11
 *
 * Returns Notion Content DB rows with Status='Idea' (typically generated
 * by the Photo Qualifier CLI) shaped for the /critique page. Same Notion
 * read as the planner uses, with an extra `imageUrl` field constructed
 * from the row's Drive Link (public thumbnail URL Anthropic vision can
 * fetch directly).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'
import { fetchCandidatesFromNotion } from '@/lib/notion'

export const maxDuration = 30

export interface CritiqueCandidate {
  ideaId: string
  notionPageId: string
  title: string
  format: 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'
  client: string | null
  shootName: string | null
  hook: string
  draftCaption: string
  postabilityScore: number
  imageUrl: string | null // Drive thumbnail (public-shared files only)
  primaryImageId: string | null
}

function thumbnailUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  try {
    const rows = await fetchCandidatesFromNotion()
    const candidates: CritiqueCandidate[] = rows.map((r) => ({
      ideaId: r.ideaId,
      notionPageId: r.notionPageId,
      title: r.title,
      format: r.format,
      client: r.client,
      shootName: r.shootName,
      hook: r.hook,
      draftCaption: r.draftCaption,
      postabilityScore: r.postabilityScore,
      imageUrl: r.primaryImageId ? thumbnailUrl(r.primaryImageId) : null,
      primaryImageId: r.primaryImageId,
    }))

    // Sort by postability desc — strongest candidates first.
    candidates.sort((a, b) => b.postabilityScore - a.postabilityScore)

    return NextResponse.json({ candidates, count: candidates.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'failed to fetch notion candidates', message },
      { status: 502 }
    )
  }
}
