import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // Cloudflare Pages serve da raiz — sem prefixo
  // GitHub Pages precisa de '/bomba-vr/' — comente/descomente conforme deploy
  base: command === 'build' ? '/' : '/',
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
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core', '@babylonjs/loaders', '@babylonjs/gui']
        }
      }
    }
  }
}))
