import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Kameha_deploy/', // MUST match your GitHub repo name exactly
})