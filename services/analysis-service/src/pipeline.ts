import type { Json } from '@shaq-os/database-types'
import { createServiceNodeClient } from '@shaq-os/supabase-client/service-node'
import { analyzeVideo } from './claude-analyze'
import { updateJob, failJob } from './db'

/**
 * Run the Claude vision analysis given a transcript and keyframe URLs.
 * Writes the structured analysis back into the video_analyses row.
 *
 * If an inspiration_log_id is provided, also writes the analysis +
 * generated summary back into the inspiration_log row and marks it
 * complete — this is what the Telegram bot polls for.
 *
 * Throws on failure so the HTTP route returns 5xx.
 */
export async function runAnalysis(args: {
  job_id: string
  transcript: string
  keyframe_urls: string[]
  inspiration_log_id?: string  // set when triggered via /api/inspiration
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

    // Write back to inspiration_log if this job was triggered from there.
    if (args.inspiration_log_id) {
      await writeInspirationLog({
        inspiration_log_id: args.inspiration_log_id,
        job_id: args.job_id,
        analysis,
        keyframe_urls: args.keyframe_urls,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failJob(args.job_id, `analysis failed: ${message}`)

    // Also mark the inspiration_log as failed
    if (args.inspiration_log_id) {
      try {
        const supabase = createServiceNodeClient()
        await supabase
          .from('inspiration_log')
          .update({ status: 'failed', error_message: message.slice(0, 500) })
          .eq('id', args.inspiration_log_id)
      } catch { /* best-effort */ }
    }

    throw err
  }
}

/**
 * Build a concise Telegram-friendly summary from the Claude analysis.
 * No extra LLM call — formats the key fields into 3 punchy lines.
 */
function buildSummary(analysis: Record<string, unknown>): string {
  const parts: string[] = []

  const hook = typeof analysis.hook === 'string' ? analysis.hook.trim() : null
  if (hook) parts.push(`📌 Hook: ${hook}`)

  const hypotheses = Array.isArray(analysis.hypothesized_why_it_works)
    ? (analysis.hypothesized_why_it_works as string[]).slice(0, 2).join(' ')
    : null
  if (hypotheses) parts.push(`💡 Why it works: ${hypotheses}`)

  const risk = Array.isArray(analysis.risks_if_replicated)
    ? (analysis.risks_if_replicated as string[])[0]
    : null
  if (risk) parts.push(`⚠️ Watch out: ${risk}`)

  return parts.join('\n\n')
}

async function writeInspirationLog(args: {
  inspiration_log_id: string
  job_id: string
  analysis: Record<string, unknown>
  keyframe_urls: string[]
}): Promise<void> {
  try {
    const supabase = createServiceNodeClient()
    const summary = buildSummary(args.analysis)
    const { error } = await supabase
      .from('inspiration_log')
      .update({
        status: 'complete',
        analysis: args.analysis as Json,
        summary,
        keyframe_urls: args.keyframe_urls,
        video_analysis_id: args.job_id,
      })
      .eq('id', args.inspiration_log_id)
    if (error) {
      log(args.job_id, `inspiration_log writeback failed: ${error.message}`)
    } else {
      log(args.job_id, `inspiration_log ${args.inspiration_log_id} marked complete`)
    }
  } catch (e) {
    // Don't throw — the video_analyses write already succeeded, this is
    // best-effort writeback.
    log(args.job_id, `inspiration_log writeback threw: ${String(e)}`)
  }
}

function log(jobId: string, msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[analysis-service] job=${jobId} ${msg}`)
}
