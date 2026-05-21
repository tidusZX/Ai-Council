import type { Json } from '@shaq-os/database-types'
import { transcribe } from './whisper'
import { analyzeVideo } from './claude-analyze'
import { updateJob, failJob } from './db'

/**
 * Drive a job through Whisper transcription + Claude vision analysis.
 * Writes transcript + analysis back into the video_analyses row at each
 * stage. THROWS on failure so the caller (HTTP route) can return 5xx.
 */
export async function runAnalysis(args: {
  job_id: string
  video_path: string
  keyframe_paths: string[]
}): Promise<void> {
  log(args.job_id, 'transcribing')
  let transcript: string
  try {
    transcript = await transcribe(args.video_path)
    await updateJob(args.job_id, { status: 'analyzing', transcript })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failJob(args.job_id, `transcription failed: ${message}`)
    throw err
  }

  log(args.job_id, 'analyzing')
  let analysis: Record<string, unknown>
  try {
    analysis = await analyzeVideo({
      transcript,
      keyframePaths: args.keyframe_paths,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failJob(args.job_id, `analysis failed: ${message}`)
    throw err
  }

  await updateJob(args.job_id, {
    status: 'complete',
    analysis: analysis as Json,
  })
  log(args.job_id, 'complete')
}

function log(jobId: string, msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[analysis-service] job=${jobId} ${msg}`)
}
