import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: '../../', // Point to the workspace root for .env files
  server: {
    allowedHosts: true,
  },
})
