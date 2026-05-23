/**
 * scripts/import-30-prospects.ts — Codex task 01
 *
 * One-off importer: parses Shaq's 30-prospect Obsidian markdown and inserts
 * each row into the Supabase `leads` table. Idempotent — running it twice
 * SKIPs rows that already exist by (owner_id, business_name).
 *
 * Run:
 *   cd ~/ai-council
 *   pnpm --filter ingestion-service exec tsx ../../scripts/import-30-prospects.ts
 *
 * Env: reads apps/dashboard/.env.local for SUPABASE_SERVICE_ROLE_KEY +
 * NEXT_PUBLIC_SUPABASE_URL. Override per-run via shell env if you want.
 *
 * Exit codes: 0 on success, 1 on any unrecoverable error.
 */
import { readFile } from 'node:fs/promises'
import { config as dotenvConfig } from 'dotenv'
import { createServiceNodeClient } from '@shaq-os/supabase-client/service-node'

dotenvConfig({
  path: '/Users/shaq/ai-council/apps/dashboard/.env.local',
  quiet: true,
})

const MARKDOWN_PATH =
  '/Users/shaq/Documents/Claude/Projects/Get Archived/Business/30_brands_outreach_list.md'
const OWNER_EMAIL = 'limshaquille@gmail.com'

const PRIORITY_SCORE: Record<string, number> = {
  '🔴': 85.0,
  '🟡': 65.0,
  '🟢': 45.0,
}

interface ParsedRow {
  business_name: string
  ig_handle: string | null
  priority: '🔴' | '🟡' | '🟢' | null
  why_they_fit: string
  human_outreach_angle: string
  category: string
}

function parseMarkdown(md: string): ParsedRow[] {
  const lines = md.split('\n')
  const rows: ParsedRow[] = []
  let currentCategory = '(uncategorised)'

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const heading = line.match(/^##\s+Category\s+\d+\s*[—-]\s*(.+)$/)
    if (heading) {
      currentCategory = heading[1].trim()
      continue
    }

    if (line.startsWith('| # |')) continue
    if (line.startsWith('|---')) continue
    if (!/^\|\s*\d+\s*\|/.test(line)) continue

    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i !== 0 && i !== arr.length - 1)

    if (cells.length < 6) continue

    const brandCell = cells[1]
    const igCell = cells[2]
    const priorityCell = cells[3]
    const whyCell = cells[4]
    const angleCell = cells[5]

    const businessName = brandCell.replace(/\*\*/g, '').trim()
    if (!businessName) continue

    const igMatch = igCell.match(/@([\w.\-]+)/)
    const igHandle = igMatch ? igMatch[1] : null

    let priority: ParsedRow['priority'] = null
    if (priorityCell.includes('🔴')) priority = '🔴'
    else if (priorityCell.includes('🟡')) priority = '🟡'
    else if (priorityCell.includes('🟢')) priority = '🟢'

    rows.push({
      business_name: businessName,
      ig_handle: igHandle,
      priority,
      why_they_fit: whyCell.replace(/^["“]|["”]$/g, '').trim(),
      human_outreach_angle: angleCell.replace(/^["“]|["”]$/g, '').trim(),
      category: currentCategory,
    })
  }

  return rows
}

async function main() {
  const supabase = createServiceNodeClient()

  const { data: usersPage, error: usersErr } = await supabase.auth.admin.listUsers(
    { page: 1, perPage: 200 }
  )
  if (usersErr) {
    throw new Error(`listUsers failed: ${usersErr.message}`)
  }
  const owner = usersPage.users.find((u) => u.email === OWNER_EMAIL)
  if (!owner) {
    throw new Error(`No auth.users row for ${OWNER_EMAIL}`)
  }
  console.log(`[import] resolved owner_id ${owner.id} for ${OWNER_EMAIL}`)

  const md = await readFile(MARKDOWN_PATH, 'utf8')
  const rows = parseMarkdown(md)
  console.log(`[import] parsed ${rows.length} rows from markdown`)
  if (rows.length === 0) {
    throw new Error('No rows parsed — check the markdown format')
  }

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('owner_id', owner.id)
      .eq('business_name', row.business_name)
      .maybeSingle()

    if (existing) {
      console.log(`SKIP existing: ${row.business_name}`)
      skipped += 1
      continue
    }

    const score = row.priority ? PRIORITY_SCORE[row.priority] : 50.0
    const diagnosis = {
      source: 'obsidian_30_prospects_2026_05',
      why_they_fit: row.why_they_fit,
      human_outreach_angle: row.human_outreach_angle,
      category: row.category,
    }

    const { error: insertErr } = await supabase.from('leads').insert({
      owner_id: owner.id,
      business_name: row.business_name,
      ig_handle: row.ig_handle,
      location: 'Singapore',
      status: 'new',
      opportunity_score: score,
      diagnosis,
    })

    if (insertErr) {
      console.error(
        `ERROR inserting ${row.business_name}: ${insertErr.message}`
      )
      continue
    }
    console.log(
      `INSERT: ${row.business_name} · @${row.ig_handle ?? '(no-handle)'} · score ${score} · ${row.category}`
    )
    inserted += 1
  }

  console.log(`\n[import] done — ${inserted} inserted, ${skipped} skipped`)
}

main().catch((e) => {
  console.error('[import] fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
