export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CouncilRole =
  | 'strategist'
  | 'creative_director'
  | 'technical_producer'
  | 'marketing_lead'
  | 'critic'
  | 'chairperson'

export type SessionStatus = 'pending' | 'processing' | 'complete' | 'error'

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          user_id: string
          title: string
          prompt: string
          status: SessionStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          title: string
          prompt: string
          status?: SessionStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          prompt?: string
          status?: SessionStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          session_id: string
          role: CouncilRole
          content: string
          is_complete: boolean
          created_at: string
          updated_at: string
          embedding: number[] | null
        }
        Insert: {
          id?: string
          session_id: string
          role: CouncilRole
          content?: string
          is_complete?: boolean
          created_at?: string
          updated_at?: string
          embedding?: number[] | null
        }
        Update: {
          id?: string
          session_id?: string
          role?: CouncilRole
          content?: string
          is_complete?: boolean
          created_at?: string
          updated_at?: string
          embedding?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: 'messages_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Session = Database['public']['Tables']['sessions']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
