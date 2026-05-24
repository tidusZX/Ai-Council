/**
 * POST /api/uploads/council-attachment — Plan 8
 *
 * Accepts a multipart/form-data file upload, persists it to the
 * council-attachments Supabase Storage bucket (public read), returns
 * the public URL ready to drop into a session's image_urls array
 * (or /voice's context, or anywhere else Anthropic vision is called).
 *
 * Auth: requires a logged-in Supabase user. Path includes owner_id so
 * deletion / audit can be scoped later.
 * Bucket / limits: configured in migration 009.
 */
import { NextResponse } from 'next/server'
import { createClient as createSupabase } from '@shaq-os/supabase-client/server'
import { createServiceNodeClient } from '@shaq-os/supabase-client/service-node'
import crypto from 'node:crypto'

export const maxDuration = 30

const BUCKET = 'council-attachments'
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])
const MAX_BYTES = 10 * 1024 * 1024 // matches migration 009

function safeFilename(raw: string | undefined): string {
  const fallback = `upload-${Date.now()}`
  if (!raw) return fallback
  // Strip path separators, control chars, and weird unicode; keep ascii basics.
  const cleaned = raw
    .replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_')
    .slice(0, 80)
    .trim()
  return cleaned || fallback
}

export async function POST(req: Request) {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid multipart body' },
      { status: 400 }
    )
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'file field missing or not a File' },
      { status: 400 }
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `file too large (${(file.size / 1024 / 1024).toFixed(1)} MB); cap is 10 MB`,
      },
      { status: 413 }
    )
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      {
        error: `unsupported mime type ${file.type}; allowed: ${[...ALLOWED_MIME].join(', ')}`,
      },
      { status: 415 }
    )
  }

  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'jpg'
  const filename = safeFilename(file.name) || `upload.${ext}`
  const objectKey = `${user.id}/${crypto.randomUUID()}/${filename}`

  const service = createServiceNodeClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(objectKey, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadErr) {
    return NextResponse.json(
      { error: 'upload failed', message: uploadErr.message },
      { status: 500 }
    )
  }

  const { data: publicUrlData } = service.storage
    .from(BUCKET)
    .getPublicUrl(objectKey)

  return NextResponse.json({
    url: publicUrlData.publicUrl,
    objectKey,
    bytes: file.size,
    mime: file.type,
  })
}
