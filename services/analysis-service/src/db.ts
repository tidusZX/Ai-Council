import { createServiceNodeClient } from '@shaq-os/supabase-client/service-node'
import type { Json, VideoAnalysisStatus } from '@shaq-os/database-types'

let _supabase: ReturnType<typeof createServiceNodeClient> | null = null
function supabase() {
  if (!_supabase) _supabase = createServiceNodeClient()
  return _supabase
}

export type AnalysisJobUpdate = {
  status?: VideoAnalysisStatus
  transcript?: string
  analysis?: Json
  error_message?: string | null
}

export async function updateJob(jobId: string, patch: AnalysisJobUpdate): Promise<void> {
  const { error } = await supabase()
    .from('video_analyses')
    .update(patch)
    .eq('id', jobId)
  if (error) throw new Error(`updateJob(${jobId}) failed: ${error.message}`)
}

export async function failJob(jobId: string, message: string): Promise<void> {
  try {
    await updateJob(jobId, { status: 'error', error_message: message })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[analysis-service] failJob also failed:', e)
  }
}
