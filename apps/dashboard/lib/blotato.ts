/**
 * Thin HTTP wrapper over the Blotato API.
 * Docs: https://help.blotato.com/api
 *
 * Used by /api/posts/[id]/push-to-blotato to schedule Instagram posts
 * from Notion rows. Auth is a static API key in the `blotato-api-key`
 * header. Account IDs are env-configured for the Singapore market
 * (one IG handle, @getarchivedsg).
 */

const BLOTATO_BASE_URL = 'https://backend.blotato.com/v2'

const BLOTATO_API_KEY = process.env.BLOTATO_API_KEY ?? ''
const BLOTATO_INSTAGRAM_ACCOUNT_ID =
  process.env.BLOTATO_INSTAGRAM_ACCOUNT_ID ?? ''

function headers() {
  if (!BLOTATO_API_KEY) {
    throw new Error('BLOTATO_API_KEY not set')
  }
  return {
    'blotato-api-key': BLOTATO_API_KEY,
    'content-type': 'application/json',
  }
}

export interface BlotatoAccount {
  id: string
  platform: string
  username: string
  fullname?: string
}

export async function listAccounts(platform?: string): Promise<BlotatoAccount[]> {
  const url = new URL(`${BLOTATO_BASE_URL}/accounts`)
  if (platform) url.searchParams.set('platform', platform)
  const res = await fetch(url.toString(), { headers: headers() })
  if (!res.ok) {
    throw new Error(`blotato list accounts failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as BlotatoAccount[]
}

export interface CreatePostInput {
  /** ISO 8601 timestamp; omit to publish immediately. */
  scheduledTime?: string
  /** Use the next available slot in Blotato's schedule. */
  useNextFreeSlot?: boolean
  /** Caption text. */
  text: string
  /** Public image / video URLs Blotato will fetch. */
  mediaUrls: string[]
  /** Override the default IG account; otherwise uses BLOTATO_INSTAGRAM_ACCOUNT_ID. */
  accountId?: string
}

export interface CreatePostResponse {
  postSubmissionId: string
  status: 'in-progress' | 'published' | 'scheduled' | 'failed' | string
  publicUrl?: string
  errorMessage?: string
  scheduledTime?: string
}

export async function createInstagramPost(
  input: CreatePostInput
): Promise<CreatePostResponse> {
  const accountId = input.accountId ?? BLOTATO_INSTAGRAM_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      'BLOTATO_INSTAGRAM_ACCOUNT_ID not set and no accountId provided'
    )
  }
  if (input.mediaUrls.length === 0) {
    throw new Error('mediaUrls must not be empty for an Instagram post')
  }

  const body: Record<string, unknown> = {
    accountId,
    platform: 'instagram',
    text: input.text,
    mediaUrls: input.mediaUrls,
  }
  if (input.scheduledTime) body.scheduledTime = input.scheduledTime
  if (input.useNextFreeSlot) body.useNextFreeSlot = true

  const res = await fetch(`${BLOTATO_BASE_URL}/posts`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`blotato create post failed: ${res.status} ${text}`)
  }
  return JSON.parse(text) as CreatePostResponse
}

export async function getPostStatus(
  postSubmissionId: string
): Promise<CreatePostResponse> {
  const res = await fetch(
    `${BLOTATO_BASE_URL}/posts/${encodeURIComponent(postSubmissionId)}/status`,
    { headers: headers() }
  )
  if (!res.ok) {
    throw new Error(
      `blotato get status failed: ${res.status} ${await res.text()}`
    )
  }
  return (await res.json()) as CreatePostResponse
}
