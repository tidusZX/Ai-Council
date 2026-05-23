# scripts/

One-off and operational scripts that don't belong to any specific app
or service. Run from the monorepo root.

## How to run

Most scripts are TypeScript and need `tsx`. `tsx` is already a dev dep of
`services/ingestion-service`, so the easiest way to run a script is:

```bash
cd ~/ai-council
pnpm --filter ingestion-service exec tsx ../../scripts/<script-name>.ts
```

Scripts read env from `apps/dashboard/.env.local` by default (each script
documents this in its top-of-file comment). Override via shell env when
needed:

```bash
SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… \
  pnpm --filter ingestion-service exec tsx ../../scripts/<name>.ts
```

## Conventions

- **Idempotent by default.** Re-running a script should be safe — skip
  what's already done, log clearly.
- **Logs to stdout, errors to stderr.** Exit non-zero on unrecoverable
  errors.
- **No new env vars without good reason.** Reuse what `apps/dashboard/.env.local`
  already has.
- **Don't commit secrets.** Reference env var names, not values.

## Inventory

| Script | Purpose |
|---|---|
| [`import-30-prospects.ts`](import-30-prospects.ts) | One-time import of Shaq's 30-prospect Obsidian markdown into the `leads` table. Idempotent. See [Codex task 01](../docs/codex-tasks/01-bulk-import-prospects.md). |
