'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

export function LeadForm() {
  const router = useRouter()
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [igHandle, setIgHandle] = useState('')
  const [website, setWebsite] = useState('')
  const [imageUrlsRaw, setImageUrlsRaw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const image_urls = imageUrlsRaw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s))
      .slice(0, 12)

    if (image_urls.length === 0) {
      setError('Paste at least 1 image URL (one per line).')
      return
    }

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        business_name: businessName.trim(),
        image_urls,
      }
      if (businessType.trim()) payload.business_type = businessType.trim()
      if (igHandle.trim()) payload.ig_handle = igHandle.trim()
      if (website.trim()) payload.website = website.trim()

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const msg =
          body?.message ||
          body?.error ||
          `Request failed with status ${res.status}`
        throw new Error(msg)
      }
      setBusinessName('')
      setBusinessType('')
      setIgHandle('')
      setWebsite('')
      setImageUrlsRaw('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          type="text"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Business name (required)"
          required
          disabled={submitting}
        />
        <Input
          type="text"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          placeholder="Business type (e.g. casual cafe, product brand)"
          disabled={submitting}
        />
        <Input
          type="text"
          value={igHandle}
          onChange={(e) => setIgHandle(e.target.value)}
          placeholder="IG handle (optional)"
          disabled={submitting}
        />
        <Input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="Website (optional)"
          disabled={submitting}
        />
      </div>
      <Textarea
        value={imageUrlsRaw}
        onChange={(e) => setImageUrlsRaw(e.target.value)}
        placeholder={'Paste 6–12 image URLs from their IG/website (one per line)\nhttps://...\nhttps://...'}
        required
        disabled={submitting}
        rows={5}
        className="font-mono text-xs"
      />
      <div className="flex justify-between items-center">
        <p className="text-xs text-zinc-400">
          Diagnosis takes ~20–30 seconds. Claude vision scores brand consistency,
          image quality, styling, and opportunity for Shaq.
        </p>
        <Button type="submit" disabled={submitting || !businessName}>
          {submitting ? 'Diagnosing…' : 'Diagnose lead'}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}
    </form>
  )
}
