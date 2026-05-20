import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Required for Supabase SSR cookies in server components
  },
}

export default nextConfig
