import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { config } from './src/config.js'
import docApiPlugin from './vite-plugin-doc-api.js'

export default defineConfig({
  plugins: [vue(), docApiPlugin('public/docs')],
  server: {
    port: config.defaultPort
  },
  optimizeDeps: {
    include: [
      'vue',
      'marked',
      'mermaid',
    ],
  }
})
