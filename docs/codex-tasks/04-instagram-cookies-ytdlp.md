# Brief 04 — Instagram cookies for yt-dlp on Fly ingestion-service

## Context

The Analyzer (Plan 03) pipeline downloads videos via `yt-dlp` in the
`ingestion-service` (Fly app `shaq-os-ingestion`). TikTok and YouTube work.
Instagram Reels frequently fail with:

```
yt-dlp exited 1: ERROR: [Instagram] <id>: Requested content is not available,
rate-limit reached or login required. Use --cookies-from-browser or --cookies
for the authentication. See https://github.com/yt-dlp/yt-dlp/wiki/FAQ
```

Solution: pass a Netscape-format cookies file via `yt-dlp --cookies`. The
file contains a logged-in IG session's cookies, exported once and stored
as a Fly secret.

## Goal

Add Instagram-cookies support to the ingestion-service so IG URLs download
successfully when a `IG_COOKIES_BASE64` secret is set, and continue to
work for non-IG URLs unchanged.

## Files to touch

- `services/ingestion-service/src/env.ts` — add optional
  `IG_COOKIES_BASE64: z.string().optional()` to the env schema.
- `services/ingestion-service/src/index.ts` — at startup, if
  `IG_COOKIES_BASE64` is set, decode it and write to `/tmp/ig_cookies.txt`.
  Log `[ingestion] IG cookies loaded (N bytes)`.
- `services/ingestion-service/src/pipeline.ts` (or wherever `yt-dlp` is
  invoked — search for `yt-dlp` to find the right file):
  - Detect IG URLs (host matches `instagram.com` or `instagr.am`).
  - If IG and `/tmp/ig_cookies.txt` exists, append
    `['--cookies', '/tmp/ig_cookies.txt']` to the yt-dlp args.
  - If IG and no cookies file, return a clear error explaining how to set
    it (don't silently fail).
  - Non-IG URLs are unchanged.

## How Shaq will generate the cookies file

This is OUT OF SCOPE for the brief — but document it briefly in
`services/ingestion-service/README.md` (create if absent) so the workflow
is reproducible:

1. Install `Get cookies.txt LOCALLY` Chrome extension.
2. Log into instagram.com in Chrome.
3. Click the extension → Export → `cookies.txt` (Netscape format).
4. `base64 -i cookies.txt -o cookies.b64` → copy contents.
5. `flyctl secrets set IG_COOKIES_BASE64="$(cat cookies.b64)" -a shaq-os-ingestion`

## Acceptance criteria

1. IG URL that previously returned the "login required" error, when
   submitted with `IG_COOKIES_BASE64` set, downloads successfully.
2. TikTok and YouTube URLs continue to work without `IG_COOKIES_BASE64`
   set.
3. IG URL submitted with no `IG_COOKIES_BASE64` set returns a 4xx with a
   clear message: "Instagram URL requires IG_COOKIES_BASE64 — see ingestion-service README".
4. The cookies file is decoded on every cold start (not cached across
   deploys, since Fly machines are ephemeral).
5. The README addition explains the cookie-export workflow in <30 lines.
6. `pnpm --filter ingestion-service typecheck` passes.

## Constraints

- Cookies are sensitive — never log the cookies content. Only log the byte
  size on load.
- Don't add the cookies-export tooling as a dependency. It's a one-time
  Shaq workflow with an existing Chrome extension.
- Re-deploy via `flyctl deploy --config services/ingestion-service/fly.toml
  --dockerfile services/ingestion-service/Dockerfile` from the monorepo
  root (the Dockerfile expects monorepo as build context).

## How to test (in PR description)

```
# After Shaq sets IG_COOKIES_BASE64:
curl -sS -X POST https://shaq-os-ingestion.fly.dev/jobs \
  -H "content-type: application/json" \
  -H "x-api-key: $INGESTION_API_KEY" \
  -d '{"url":"https://www.instagram.com/p/DYk-qfqtsB7/","owner_id":"<uuid>"}'
# Should return 200 with a job_id and proceed through the pipeline.
```
