import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Required for Supabase SSR cookies in server components
  },
  // Workspace packages consumed directly from their TypeScript source.
  transpilePackages: [
    '@shaq-os/database-types',
    '@shaq-os/supabase-client',
    '@shaq-os/council-config',
  ],
}

export default nextConfig
