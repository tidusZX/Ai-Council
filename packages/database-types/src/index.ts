/**
 * @shaq-os/database-types
 *
 * Re-exports the Supabase-generated `Database` type plus convenience
 * aliases and narrowed string-union types that the generated file
 * can't infer from CHECK constraints.
 *
 * To regenerate the underlying schema types after a migration:
 *
 *   supabase gen types typescript --linked > packages/database-types/src/database.ts
 *
 * Then verify the union types below still match the migration check
 * constraints — they will NOT auto-update.
 */

export * from './database'

import type { Database } from './database'

// ---------------------------------------------------------------------------
// Narrowed string unions (from migration CHECK constraints — kept in sync
// by hand because Supabase gen types only emits `string` for these columns)
// ---------------------------------------------------------------------------

export type CouncilRole =
  | 'strategist'
  | 'creative_director'
  | 'technical_producer'
  | 'marketing_lead'
  | 'critic'
  | 'chairperson'

export type SessionStatus = 'pending' | 'processing' | 'complete' | 'error'

export type ProjectType = 'reel' | 'photo' | 'campaign' | 'video' | 'other'
export type ProjectStatus = 'planning' | 'shooting' | 'editing' | 'delivered' | 'archived'

export type SourcePlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'pinterest'
  | 'vimeo'
  | 'web'
  | 'direct'
  | 'other'

export type PromptCategory = 'image' | 'video' | 'motion' | 'council' | 'copy' | 'other'

export type LeadStatus =
  | 'new'
  | 'qualified'
  | 'contacted'
  | 'responded'
  | 'won'
  | 'lost'
  | 'archived'

export type OutreachChannel =
  | 'email'
  | 'instagram_dm'
  | 'whatsapp'
  | 'sms'
  | 'call'
  | 'linkedin'
  | 'other'

export type OutreachOutcome =
  | 'no_response'
  | 'positive'
  | 'negative'
  | 'meeting_booked'
  | 'closed'

export type CouncilOutputKind =
  | 'shotlist'
  | 'critique'
  | 'strategy'
  | 'analysis'
  | 'image_prompt_pack'
  | 'motion_prompt_pack'
  | 'caption_pack'
  | 'posting_plan'
  | 'other'

export type ReportKind =
  | 'weekly_trends'
  | 'lead_pulse'
  | 'content_audit'
  | 'revenue_pulse'
  | 'other'

export type VideoAnalysisStatus =
  | 'queued'
  | 'downloading'
  | 'extracting'
  | 'transcribing'
  | 'analyzing'
  | 'complete'
  | 'error'

// ---------------------------------------------------------------------------
// Row / Insert / Update aliases for ergonomic imports
// ---------------------------------------------------------------------------

type T = Database['public']['Tables']

// Row aliases match what Supabase actually returns (CHECK constraints
// surface as `string` at the type level). Components narrow at usage
// via the string-union types above, e.g.:
//   const status = session.status as SessionStatus
//   if (status === 'complete') { ... }

// Migration 001
export type Session = T['sessions']['Row']
export type SessionInsert = T['sessions']['Insert']
export type Message = T['messages']['Row']
export type MessageInsert = T['messages']['Insert']

// Migration 002
export type Creator = T['creators']['Row']
export type Project = T['projects']['Row']
export type CreativeReference = T['creative_references']['Row']
export type Prompt = T['prompts']['Row']
export type Shotlist = T['shotlists']['Row']

// Migration 003
export type Client = T['clients']['Row']
export type Lead = T['leads']['Row']
export type OutreachLog = T['outreach_logs']['Row']

// Migration 004
export type CouncilOutput = T['council_outputs']['Row']
export type Report = T['reports']['Row']

// Migration 005
export type VideoAnalysis = T['video_analyses']['Row']
export type VideoAnalysisInsert = T['video_analyses']['Insert']
export type VideoAnalysisUpdate = T['video_analyses']['Update']
