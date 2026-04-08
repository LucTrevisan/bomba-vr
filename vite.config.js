import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
  const isCloudflare = process.env.DEPLOY_TARGET === 'cloudflare'
  const base = command === 'build'
    ? (isCloudflare ? './' : '/bomba-vr/')
        : '/'

  return {
    base,
    plugins: [],
    server: {
      host:  '0.0.0.0',
      port:  5173,
      headers: {
        'Cross-Origin-Opener-Policy':   'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      }
    },
    build: {
      target:  'esnext',
      outDir:  'dist',
    }
  }
})
