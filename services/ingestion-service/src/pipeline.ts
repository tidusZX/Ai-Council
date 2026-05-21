import path from 'node:path'
import { loadEnv } from './env'
import { fetchMetadata, downloadVideo, inferPlatform } from './yt-dlp'
import { extractKeyframes } from './ffmpeg'
import { updateJob, failJob } from './db'

const MAX_DURATION_SECONDS = 300 // 5 minutes — MVP cap

/**
 * Drive a job through download + keyframe extraction, then hand off to
 * the analysis-service. Updates the DB row at every stage transition.
 *
 * Fire-and-forget from the HTTP route — never throws.
 */
export async function runPipeline(args: {
  job_id: string
  url: string
  owner_id: string
}): Promise<void> {
  const env = loadEnv()
  const jobDir = path.join(env.INGESTION_TMP_DIR, args.job_id)

  try {
    // ---- stage 1: download ----
    log(args.job_id, 'downloading')
    await updateJob(args.job_id, { status: 'downloading' })

    const metadata = await fetchMetadata(args.url)
    const duration = typeof metadata.duration === 'number' ? metadata.duration : null
    if (duration !== null && duration > MAX_DURATION_SECONDS) {
      throw new Error(
        `Video too long (${Math.round(duration)}s). MVP cap is ${MAX_DURATION_SECONDS}s.`
      )
    }

    const videoPath = await downloadVideo(args.url, jobDir)

    // ---- stage 2: extract keyframes ----
    log(args.job_id, 'extracting')
    await updateJob(args.job_id, {
      status: 'extracting',
      duration_seconds: duration,
      raw_metadata: metadata as unknown as import('@shaq-os/database-types').Json,
    })

    const keyframePaths = await extractKeyframes(
      videoPath,
      jobDir,
      duration ?? 60 // assume 60s if duration unknown — gives a usable fps
    )

    // ---- stage 3: hand off to analysis-service ----
    log(args.job_id, 'transcribing (handing off)')
    await updateJob(args.job_id, {
      status: 'transcribing',
      keyframe_paths: keyframePaths,
    })

    const res = await fetch(`${env.ANALYSIS_SERVICE_URL}/process`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: args.job_id,
        video_path: videoPath,
        keyframe_paths: keyframePaths,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`analysis-service /process returned ${res.status}: ${body.slice(0, 200)}`)
    }
    log(args.job_id, 'handed off to analysis-service')
    // From here, analysis-service owns the row lifecycle.
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error(`[ingestion-service] job ${args.job_id} failed:`, message)
    await failJob(args.job_id, message)
  }
}

function log(jobId: string, msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[ingestion-service] job=${jobId} ${msg}`)
}

export { inferPlatform }
