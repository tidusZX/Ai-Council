import { redirect } from 'next/navigation'

export default function VoiceRedirectPage() {
  // /voice was unified into /compose (voice mode) on 2026-05-24.
  redirect('/compose')
}
