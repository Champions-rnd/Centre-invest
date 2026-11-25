import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const { HR_API_PORT = '3001' } = loadEnv(mode, process.cwd(), 'HR_API_')
  return {
    root: 'web',
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${HR_API_PORT}` },
    },
    build: { outDir: '../dist', emptyOutDir: true },
  }
})
