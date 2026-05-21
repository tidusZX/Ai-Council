import { createServiceNodeClient } from '@shaq-os/supabase-client/service-node'
import type { Json, VideoAnalysisStatus } from '@shaq-os/database-types'

// Lazy-init so dotenv has time to populate process.env before the first
// client is constructed. createServiceNodeClient validates env on call.
let _supabase: ReturnType<typeof createServiceNodeClient> | null = null
function supabase() {
  if (!_supabase) _supabase = createServiceNodeClient()
  return _supabase
}

/**
 * Insert a brand-new video_analyses row with the user's URL.
 * Returns the inserted row id.
 */
export async function createJob(args: {
  owner_id: string
  source_url: string
  source_platform: string
}): Promise<string> {
  const { data, error } = await supabase()
    .from('video_analyses')
    .insert({
      owner_id: args.owner_id,
      source_url: args.source_url,
      source_platform: args.source_platform,
      status: 'queued',
    })
    .select('id')
    .single()
  if (error) throw new Error(`createJob failed: ${error.message}`)
  return data.id
}

export type JobUpdate = {
  status?: VideoAnalysisStatus
  duration_seconds?: number | null
  keyframe_paths?: string[]
  raw_metadata?: Json
  error_message?: string | null
}

/**
 * Patch a job row. Pass any subset of mutable columns.
 */
export async function updateJob(jobId: string, patch: JobUpdate): Promise<void> {
  const { error } = await supabase()
    .from('video_analyses')
    .update(patch)
    .eq('id', jobId)
  if (error) throw new Error(`updateJob(${jobId}) failed: ${error.message}`)
}

/**
 * Mark a row as errored with a human-readable message. Best-effort —
 * swallows DB errors so we never throw from a cleanup path.
 */
export async function failJob(jobId: string, message: string): Promise<void> {
  try {
    await updateJob(jobId, { status: 'error', error_message: message })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[ingestion-service] failJob also failed:', e)
  }
}

/**
 * On boot: any rows owned by this service that are stuck in a non-terminal
 * state were almost certainly killed mid-pipeline. Mark them errored so
 * the user sees why.
 */
export async function reapStuckJobs(): Promise<number> {
  const stuckStates: VideoAnalysisStatus[] = [
    'queued',
    'downloading',
    'extracting',
    'transcribing',
    'analyzing',
  ]
  const { data, error } = await supabase()
    .from('video_analyses')
    .update({
      status: 'error',
      error_message: 'Service restarted while job was in progress.',
    })
    .in('status', stuckStates)
    .select('id')
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ingestion-service] reapStuckJobs failed:', error.message)
    return 0
  }
  return data?.length ?? 0
}
