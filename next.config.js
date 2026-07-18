/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The /api/support/sync-playbook route reads docs/support-playbook/*.md at
    // runtime. Next.js only bundles files it can statically see are imported, so
    // we tell the tracer to include the markdown in that function's deployment —
    // otherwise the read fails on Vercel with ENOENT.
    outputFileTracingIncludes: {
      '/api/support/sync-playbook': ['./docs/support-playbook/**/*'],
    },
  },
}

module.exports = nextConfig
