import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Extract `count` keyframes evenly distributed across the video's duration.
 * Outputs frame-01.jpg ... frame-NN.jpg in jobDir. Returns absolute paths
 * in order.
 */
export async function extractKeyframes(
  videoPath: string,
  jobDir: string,
  durationSeconds: number,
  count = 12
): Promise<string[]> {
  // Use ffmpeg's fps filter to drop the desired number of frames evenly.
  // fps = count / duration  gives `count` frames over the full video.
  const fps = count / Math.max(durationSeconds, 1)
  const outPattern = path.join(jobDir, 'frame-%02d.jpg')

  await runFfmpeg([
    '-y',
    '-i',
    videoPath,
    '-vf',
    `fps=${fps}`,
    '-q:v',
    '3', // JPEG quality 1-31 (1=best, 31=worst)
    outPattern,
  ])

  const files = await readdir(jobDir)
  return files
    .filter((f) => /^frame-\d+\.jpg$/.test(f))
    .sort()
    .slice(0, count)
    .map((f) => path.join(jobDir, f))
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1000)}`))
    })
  })
}
