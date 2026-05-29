/**
 * Instagram reel download via Apify's instagram-scraper actor.
 *
 * yt-dlp can't download Instagram content without browser cookies.
 * Apify handles auth on their side — we just call the actor and
 * download the video from the returned URL.
 *
 * Actor: apify/instagram-scraper
 * Input: { directUrls: [url], resultsType: 'posts', resultsLimit: 1 }
 * Output includes: videoUrl, caption, ownerUsername, timestamp, etc.
 */
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pipeline as streamPipeline } from 'node:stream/promises'
import { ApifyClient } from 'apify-client'
import type { VideoMetadata } from './yt-dlp'

const INSTAGRAM_ACTOR = 'apify/instagram-scraper'

interface ApifyPost {
  id?: string
  url?: string
  shortCode?: string
  caption?: string
  videoUrl?: string
  videoViewCount?: number
  likesCount?: number
  timestamp?: string
  ownerUsername?: string
  ownerFullName?: string
  duration?: number
  type?: string
  displayUrl?: string
}

/**
 * Download an Instagram reel via Apify.
 * Returns the local video file path + metadata matching the VideoMetadata shape.
 */
export async function downloadInstagramReel(
  url: string,
  jobDir: string,
  apifyToken: string
): Promise<{ videoPath: string; metadata: VideoMetadata }> {
  await mkdir(jobDir, { recursive: true })

  const client = new ApifyClient({ token: apifyToken })

  // Run the actor synchronously (waits for completion)
  const run = await client.actor(INSTAGRAM_ACTOR).call({
    directUrls: [url],
    resultsType: 'posts',
    resultsLimit: 1,
    addParentData: false,
  })

  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  if (!items || items.length === 0) {
    throw new Error('Apify instagram-scraper returned no results for this URL')
  }

  const post = items[0] as ApifyPost

  if (!post.videoUrl) {
    throw new Error(
      `No videoUrl in Apify result — post type is "${post.type ?? 'unknown'}". ` +
        'Only video posts (reels) can be analysed.'
    )
  }

  // Download the video file from Apify's CDN
  const videoPath = path.join(jobDir, 'video.mp4')
  const res = await fetch(post.videoUrl)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download video from Apify CDN: ${res.status}`)
  }

  await streamPipeline(
    res.body as unknown as NodeJS.ReadableStream,
    createWriteStream(videoPath)
  )

  const metadata: VideoMetadata = {
    title: post.caption?.slice(0, 120) ?? null,
    uploader: post.ownerUsername ?? null,
    duration: post.duration ?? null,
    view_count: post.videoViewCount ?? null,
    like_count: post.likesCount ?? null,
    description: post.caption ?? null,
    upload_date: post.timestamp ?? null,
    webpage_url: url,
    extractor: 'instagram',
    thumbnail: post.displayUrl ?? null,
    // Raw Apify post for the analysis-service context
    apify_post: post,
  }

  return { videoPath, metadata }
}

/**
 * Returns true if the URL is an Instagram reel/post that needs Apify.
 */
export function isInstagramUrl(url: string): boolean {
  try {
    return /instagram\.com/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}
