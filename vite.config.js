import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // 상대 경로로 빌드 → GitHub Pages 하위 경로(/ox/)에 그대로 올려도 동작
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist' },
})
