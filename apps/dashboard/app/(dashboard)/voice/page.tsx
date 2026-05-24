import { VoiceSharpener } from '@/components/voice/VoiceSharpener'

export const metadata = { title: 'Voice — AI Council' }
export const dynamic = 'force-dynamic'

export default function VoicePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Voice</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste any caption — yours, a draft, something from Notion — and Ember
          sharpens it to match your voice profile. Optional: generate hashtags
          and compose the full Instagram-ready post.
        </p>
      </div>
      <VoiceSharpener />
    </div>
  )
}
