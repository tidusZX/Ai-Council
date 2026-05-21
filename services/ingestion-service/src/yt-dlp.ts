import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

export interface VideoMetadata {
  title: string | null
  uploader: string | null
  duration: number | null
  view_count: number | null
  like_count: number | null
  description: string | null
  upload_date: string | null
  webpage_url: string | null
  extractor: string | null
  thumbnail: string | null
  // Pass-through for anything else we want to keep raw
  [k: string]: unknown
}

/**
 * Fetch metadata without downloading. Fast — uses yt-dlp --dump-single-json.
 */
export function fetchMetadata(url: string): Promise<VideoMetadata> {
  return run(['--dump-single-json', '--no-warnings', '--no-playlist', url]).then(
    (stdout) => JSON.parse(stdout) as VideoMetadata
  )
}

/**
 * Download the video to <jobDir>/video.<ext> and return the local path.
 * Prefers mp4 + h264 for ffmpeg compatibility.
 */
export async function downloadVideo(url: string, jobDir: string): Promise<string> {
  await mkdir(jobDir, { recursive: true })
  const outTemplate = path.join(jobDir, 'video.%(ext)s')

  // -f: best mp4 if available, else best
  // --no-playlist: avoid accidental playlist downloads
  // --no-warnings: keep stderr clean
  // --no-mtime: don't preserve source mtime
  await run([
    '-f',
    'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format',
    'mp4',
    '--no-playlist',
    '--no-warnings',
    '--no-mtime',
    '-o',
    outTemplate,
    url,
  ])

  // After download, find what was actually written
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(jobDir)
  const video = files.find((f) => f.startsWith('video.'))
  if (!video) throw new Error('yt-dlp did not produce a video file')
  return path.join(jobDir, video)
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`yt-dlp exited ${code}: ${stderr.trim() || 'no stderr'}`))
    })
  })
}

/**
 * Infer the canonical platform from the URL hostname for storage.
 */
export function inferPlatform(url: string):
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'vimeo'
  | 'other' {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (host.includes('instagram.com')) return 'instagram'
    if (host.includes('tiktok.com')) return 'tiktok'
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube'
    if (host.includes('vimeo.com')) return 'vimeo'
    return 'other'
  } catch {
    return 'other'
  }
}
