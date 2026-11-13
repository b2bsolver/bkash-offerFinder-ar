import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// Phones only allow camera / motion / GPS on HTTPS (or localhost).
// `npm run dev:https` serves a self-signed HTTPS dev server on your LAN.
const https = !!process.env.HTTPS

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: { host: true },
  preview: { host: true },
  build: { chunkSizeWarningLimit: 1600 },
})
