import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Served from the /crm subpath of palmcrestbuilders.com, so assets must resolve under /crm/.
  base: '/crm/',
  plugins: [react()],
})
