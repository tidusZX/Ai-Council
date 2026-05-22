import type { Json } from '@shaq-os/database-types'
import { analyzeVideo } from './claude-analyze'
import { updateJob, failJob } from './db'

/**
 * Run the Claude vision analysis given a transcript and keyframe URLs.
 * Writes the structured analysis back into the video_analyses row.
 * Throws on failure so the HTTP route returns 5xx.
 */
export async function runAnalysis(args: {
  job_id: string
  transcript: string
  keyframe_urls: string[]
}): Promise<void> {
  log(args.job_id, 'analyzing')
  try {
    await updateJob(args.job_id, { status: 'analyzing' })
    const analysis = await analyzeVideo({
      transcript: args.transcript,
      keyframeUrls: args.keyframe_urls,
    })
    await updateJob(args.job_id, {
      status: 'complete',
      analysis: analysis as Json,
    })
    log(args.job_id, 'complete')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failJob(args.job_id, `analysis failed: ${message}`)
    throw err
  }
}

function log(jobId: string, msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[analysis-service] job=${jobId} ${msg}`)
}
