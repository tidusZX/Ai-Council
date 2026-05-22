import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createServiceNodeClient } from '@shaq-os/supabase-client/service-node'

let _supabase: ReturnType<typeof createServiceNodeClient> | null = null
function supabase() {
  if (!_supabase) _supabase = createServiceNodeClient()
  return _supabase
}

export interface UploadedKeyframe {
  /** Bucket-relative path: `<owner_id>/<job_id>/frame-XX.jpg`. */
  storagePath: string
  /** Public URL for browser/Claude vision fetch. */
  publicUrl: string
}

/**
 * Upload local keyframe files to Supabase Storage. Returns the storage
 * paths + public URLs in the same order as the input.
 */
export async function uploadKeyframes(args: {
  ownerId: string
  jobId: string
  localPaths: string[]
  bucket: string
}): Promise<UploadedKeyframe[]> {
  const client = supabase()
  const results: UploadedKeyframe[] = []

  for (const localPath of args.localPaths) {
    const filename = path.basename(localPath) // frame-XX.jpg
    const storagePath = `${args.ownerId}/${args.jobId}/${filename}`
    const buffer = await readFile(localPath)

    const { error } = await client.storage
      .from(args.bucket)
      .upload(storagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })
    if (error) {
      throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`)
    }

    const { data: publicData } = client.storage
      .from(args.bucket)
      .getPublicUrl(storagePath)

    results.push({ storagePath, publicUrl: publicData.publicUrl })
  }

  return results
}
