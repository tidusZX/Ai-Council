/**
 * Thin HTTP wrapper over the Blotato API.
 * Docs: https://help.blotato.com/api
 *
 * Used by /api/posts/[id]/push-to-blotato to schedule posts from Notion rows.
 * Auth is a static API key in the `blotato-api-key` header. Per-platform
 * account IDs are env-configured for the Singapore market — IG handle
 * @getarchivedsg + LinkedIn profile/company page "Get Archived!".
 */

const BLOTATO_BASE_URL = 'https://backend.blotato.com/v2'

const BLOTATO_API_KEY = process.env.BLOTATO_API_KEY ?? ''
const BLOTATO_INSTAGRAM_ACCOUNT_ID =
  process.env.BLOTATO_INSTAGRAM_ACCOUNT_ID ?? ''
const BLOTATO_LINKEDIN_ACCOUNT_ID =
  process.env.BLOTATO_LINKEDIN_ACCOUNT_ID ?? ''
// Optional. Without it, LinkedIn posts go to the personal profile. With it,
// posts go to the company page (recommended for the Get Archived brand).
const BLOTATO_LINKEDIN_PAGE_ID = process.env.BLOTATO_LINKEDIN_PAGE_ID ?? ''

export function linkedInConfigured(): boolean {
  return Boolean(BLOTATO_LINKEDIN_ACCOUNT_ID)
}

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
  /** Override the default account for this platform. */
  accountId?: string
}

export interface CreatePostResponse {
  postSubmissionId: string
  /**
   * Only the /status endpoint returns this. The create endpoint returns
   * just { postSubmissionId, message } — leaving the field optional so
   * callers don't NPE when reading it after create.
   */
  status?: 'in-progress' | 'published' | 'scheduled' | 'failed' | string
  publicUrl?: string
  errorMessage?: string
  scheduledTime?: string
  message?: string
}

interface PlatformConfig {
  platform: string
  /** Blotato's `target.targetType` value (same as platform for IG/LinkedIn). */
  targetType: string
  extraTargetFields?: Record<string, unknown>
}

async function createPost(
  config: PlatformConfig,
  accountId: string,
  input: CreatePostInput
): Promise<CreatePostResponse> {
  if (input.mediaUrls.length === 0) {
    throw new Error(`mediaUrls must not be empty for a ${config.platform} post`)
  }

  // Blotato schema:
  //   { post: { accountId, content: { platform, text, mediaUrls },
  //             target: { targetType, ...extra } },
  //     scheduledTime?, useNextFreeSlot? }
  const body: Record<string, unknown> = {
    post: {
      accountId,
      content: {
        platform: config.platform,
        text: input.text,
        mediaUrls: input.mediaUrls,
      },
      target: {
        targetType: config.targetType,
        ...(config.extraTargetFields ?? {}),
      },
    },
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
    throw new Error(
      `blotato create ${config.platform} post failed: ${res.status} ${text}`
    )
  }
  return JSON.parse(text) as CreatePostResponse
}

export async function createInstagramPost(
  input: CreatePostInput & {
    /**
     * Instagram surface. Omit for a regular feed post (single or carousel).
     * "reel" for a single-video reel; "story" for a story. Empirically a
     * multi-URL submission with no mediaType is interpreted as a carousel.
     */
    mediaType?: 'reel' | 'story'
  }
): Promise<CreatePostResponse> {
  const accountId = input.accountId ?? BLOTATO_INSTAGRAM_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      'BLOTATO_INSTAGRAM_ACCOUNT_ID not set and no accountId provided'
    )
  }
  const extraTargetFields = input.mediaType
    ? { mediaType: input.mediaType }
    : undefined
  return createPost(
    {
      platform: 'instagram',
      targetType: 'instagram',
      extraTargetFields,
    },
    accountId,
    input
  )
}

export async function createLinkedInPost(
  input: CreatePostInput & {
    /** Override the personal-vs-company page choice. Defaults to env. */
    pageId?: string
  }
): Promise<CreatePostResponse> {
  const accountId = input.accountId ?? BLOTATO_LINKEDIN_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      'BLOTATO_LINKEDIN_ACCOUNT_ID not set and no accountId provided'
    )
  }
  const pageId = input.pageId ?? BLOTATO_LINKEDIN_PAGE_ID
  const extraTargetFields = pageId ? { pageId } : undefined
  return createPost(
    {
      platform: 'linkedin',
      targetType: 'linkedin',
      extraTargetFields,
    },
    accountId,
    input
  )
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
