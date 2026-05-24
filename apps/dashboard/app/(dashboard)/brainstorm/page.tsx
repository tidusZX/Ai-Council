import { redirect } from 'next/navigation'

export default function BrainstormRedirectPage() {
  // /brainstorm was unified into /compose (brainstorm + audience modes) on 2026-05-24.
  redirect('/compose')
}
