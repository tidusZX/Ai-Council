import path from 'node:path'
import type { Json } from '@shaq-os/database-types'
import { loadEnv } from './env'
import { fetchMetadata, downloadVideo, inferPlatform } from './yt-dlp'
import { extractKeyframes } from './ffmpeg'
import { transcribe } from './whisper'
import { uploadKeyframes } from './storage'
import { updateJob, failJob } from './db'

const MAX_DURATION_SECONDS = 300 // 5 minutes — MVP cap

/**
 * Drive a job through download → keyframe extraction → Storage upload →
 * Whisper transcription → hand off to analysis-service.
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
    // ---- 1. download ----
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

    // ---- 2. extract keyframes ----
    log(args.job_id, 'extracting')
    await updateJob(args.job_id, {
      status: 'extracting',
      duration_seconds: duration,
      raw_metadata: metadata as unknown as Json,
    })

    const localKeyframes = await extractKeyframes(
      videoPath,
      jobDir,
      duration ?? 60
    )

    // ---- 3. upload keyframes to Supabase Storage ----
    log(args.job_id, 'uploading keyframes')
    const uploaded = await uploadKeyframes({
      ownerId: args.owner_id,
      jobId: args.job_id,
      localPaths: localKeyframes,
      bucket: env.KEYFRAME_BUCKET,
    })

    // ---- 4. transcribe via Whisper ----
    log(args.job_id, 'transcribing')
    await updateJob(args.job_id, {
      status: 'transcribing',
      keyframe_paths: uploaded.map((u) => u.storagePath),
    })
    const transcript = await transcribe(videoPath)

    // ---- 5. hand off to analysis-service ----
    log(args.job_id, 'analyzing (handing off)')
    await updateJob(args.job_id, {
      status: 'analyzing',
      transcript,
    })

    const res = await fetch(`${env.ANALYSIS_SERVICE_URL}/process`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANALYSIS_API_KEY,
      },
      body: JSON.stringify({
        job_id: args.job_id,
        transcript,
        keyframe_urls: uploaded.map((u) => u.publicUrl),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        `analysis-service /process returned ${res.status}: ${body.slice(0, 200)}`
      )
    }
    log(args.job_id, 'handed off')
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
