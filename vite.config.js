import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [basicSsl()],
  base: './',         // relative paths — works at any subdirectory (GitHub Pages)
  publicDir: 'public',
  build: {
    outDir: 'docs',   // GitHub Pages reads from /docs on main branch
  },
  server: {
    fs: {
      allow: ['.'],   // serve 8thwall/ from project root in dev
    },
  },
})
